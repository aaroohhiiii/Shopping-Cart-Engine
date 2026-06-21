/**
 * Cart Service
 * 
 * Encapsulates all business logic for cart mutations and queries.
 * This is the only layer that directly interacts with Cart and AuditLog models.
 * 
 * Architecture principles:
 * - Controllers call this service, never touch models directly
 * - All database operations are here, centralized for consistency
 * - Transactions used for multi-document operations (atomicity)
 * - Errors thrown as AppError with meaningful status codes
 * - Every mutation logged to AuditLog
 */

import mongoose from 'mongoose';
import Cart from '../models/Cart.js';
import AuditLog from '../models/AuditLog.js';
import errorHandlerModule from '../middleware/errorHandler.js';
const { AppError  } = errorHandlerModule;

/**
 * Get or create user's active cart
 * 
 * Multi-tenant pattern: Users identified by userId header.
 * Enforces exactly one active cart per user via DB index.
 * 
 * @param {string} userId
 * @returns {Promise<object>} active cart document
 * @throws {AppError} on database errors
 */
const getOrCreateActiveCart = async (userId) => {
  try {
    let cart = await Cart.findOne({ userId, status: 'active' });

    if (!cart) {
      // Create new cart with automatic expiration in 24 hours
      cart = new Cart({
        userId,
        items: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      await cart.save();
    }

    return cart;
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error on unique index - another request created cart
      // Race condition: retry once
      const retryCart = await Cart.findOne({ userId, status: 'active' });
      if (retryCart) {
        return retryCart;
      }
    }
    throw new AppError(`Failed to get/create cart: ${error.message}`, 500);
  }
};

/**
 * Add or increment item in cart
 * 
 * If SKU exists: increment quantity, update price
 * If SKU new: append to items array
 * 
 * @param {string} userId
 * @param {object} itemData - { sku, name, price, quantity }
 * @returns {Promise<object>} updated cart
 */
const addOrUpdateItem = async (userId, itemData) => {
  try {
    const { sku, name, price, quantity } = itemData;
    const cart = await getOrCreateActiveCart(userId);

    // Check if item already in cart
    const existingItemIndex = cart.items.findIndex(item => item.sku === sku);

    if (existingItemIndex !== -1) {
      // Item exists: increment quantity, allow price update
      cart.items[existingItemIndex].quantity += quantity;
      cart.items[existingItemIndex].price = price;
    } else {
      // New item: add to cart
      cart.items.push({
        sku,
        name,
        price,
        quantity,
        addedAt: new Date(),
      });
    }

    // Mark document modified (important for array mutations in Mongoose)
    cart.markModified('items');

    // Save with atomic check for cart still being active
    const updatedCart = await cart.save();

    // Audit: log item addition/update
    await logAuditAction(userId, cart._id, existingItemIndex !== -1 ? 'ITEM_UPDATED' : 'ITEM_ADDED', {
      sku,
      name,
      price,
      quantity,
    });

    return updatedCart;
  } catch (error) {
    throw new AppError(`Failed to add/update item: ${error.message}`, 500);
  }
};

/**
 * Update item in cart (quantity and/or price)
 * 
 * @param {string} userId
 * @param {string} sku
 * @param {object} updateData - { quantity?, price? }
 * @returns {Promise<object>} updated cart
 */
const updateItem = async (userId, sku, updateData) => {
  try {
    const cart = await getOrCreateActiveCart(userId);

    const itemIndex = cart.items.findIndex(item => item.sku === sku);
    if (itemIndex === -1) {
      throw new AppError(`Item with SKU ${sku} not found in cart`, 404);
    }

    const originalItem = { ...cart.items[itemIndex] };

    // Update only provided fields
    if (updateData.quantity !== undefined) {
      cart.items[itemIndex].quantity = updateData.quantity;
    }
    if (updateData.price !== undefined) {
      cart.items[itemIndex].price = updateData.price;
    }

    cart.markModified('items');
    const updatedCart = await cart.save();

    // Audit: log update with changes
    await logAuditAction(userId, cart._id, 'ITEM_UPDATED', {
      sku,
      before: originalItem,
      after: cart.items[itemIndex],
    });

    return updatedCart;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Failed to update item: ${error.message}`, 500);
  }
};

/**
 * Remove item from cart (hard remove from array)
 * 
 * @param {string} userId
 * @param {string} sku
 * @returns {Promise<object>} updated cart
 */
const removeItem = async (userId, sku) => {
  try {
    const cart = await getOrCreateActiveCart(userId);

    const itemIndex = cart.items.findIndex(item => item.sku === sku);
    if (itemIndex === -1) {
      throw new AppError(`Item with SKU ${sku} not found in cart`, 404);
    }

    const removedItem = cart.items[itemIndex];

    // Remove from array
    cart.items.splice(itemIndex, 1);
    cart.markModified('items');

    const updatedCart = await cart.save();

    // Audit: log removal
    await logAuditAction(userId, cart._id, 'ITEM_REMOVED', removedItem);

    return updatedCart;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Failed to remove item: ${error.message}`, 500);
  }
};

/**
 * Clear cart (soft delete approach)
 * 
 * Sets status to 'deleted' and timestamps, but keeps document for audit trail
 * 
 * @param {string} userId
 * @returns {Promise<object>} cleared cart
 */
const clearCart = async (userId) => {
  try {
    const cart = await getOrCreateActiveCart(userId);

    // Capture snapshot of items before clear
    const snapshot = [...cart.items];

    // Soft delete
    cart.status = 'deleted';
    cart.deleted_at = new Date();
    cart.items = [];
    cart.markModified('items');

    const clearedCart = await cart.save();

    // Audit: log clear
    await logAuditAction(userId, cart._id, 'CART_CLEARED', {
      itemsRemoved: snapshot.length,
      snapshot,
    });

    return clearedCart;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Failed to clear cart: ${error.message}`, 500);
  }
};

/**
 * Move cart to checked_out status (checkout confirmation)
 * 
 * Uses MongoDB transaction for atomicity:
 * 1. Update cart status
 * 2. Write audit log
 * Ensures consistency: if either fails, both rollback
 * 
 * @param {string} userId
 * @returns {Promise<object>} checked-out cart
 */
const checkoutCart = async (userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find and update cart within transaction
    const updatedCart = await Cart.findOneAndUpdate(
      { userId, status: 'active' },
      {
        status: 'checked_out',
        $set: { updatedAt: new Date() },
      },
      { new: true, session }
    );

    if (!updatedCart) {
      throw new AppError('No active cart found for checkout', 404);
    }

    // Create audit log entry within transaction
    await AuditLog.create(
      [
        {
          userId,
          cartId: updatedCart._id,
          action: 'CART_CHECKED_OUT',
          snapshot: {
            itemsCount: updatedCart.items.length,
            items: updatedCart.items,
          },
          timestamp: new Date(),
        },
      ],
      { session }
    );

    await session.commitTransaction();
    return updatedCart;
  } catch (error) {
    await session.abortTransaction();
    if (error instanceof AppError) throw error;
    throw new AppError(`Checkout failed: ${error.message}`, 500);
  } finally {
    session.endSession();
  }
};

/**
 * Restore most recent deleted cart for user
 * 
 * Finds the most recently soft-deleted cart and reactivates it
 * (unless it has expired due to TTL)
 * 
 * @param {string} userId
 * @returns {Promise<object>} restored cart
 */
const restoreCart = async (userId) => {
  try {
    // Check if there is already an active cart
    const activeCart = await Cart.findOne({ userId, status: 'active' });

    // Find most recent deleted cart (ordered by deleted_at descending)
    const deletedCart = await Cart.findOne(
      { userId, status: 'deleted' },
      {},
      { sort: { deleted_at: -1 } }
    );

    if (!deletedCart) {
      throw new AppError('No deleted cart found to restore', 404);
    }

    // Check if cart has TTL-expired
    if (new Date() > deletedCart.expiresAt) {
      throw new AppError('Deleted cart has expired and cannot be restored', 410); // 410 Gone
    }

    if (activeCart) {
      // If there's an active cart but it's empty (auto-created by a GET request), delete it to make room.
      if (activeCart.items.length === 0) {
        await Cart.findByIdAndDelete(activeCart._id);
      } else {
        // If they started a new cart with items, prevent restore to avoid overwriting or confusion
        throw new AppError('Cannot restore cart because you already have a new active cart with items. Please clear it first.', 409);
      }
    }

    // Restore: set back to active, clear deleted_at
    deletedCart.status = 'active';
    deletedCart.deleted_at = null;
    deletedCart.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Extend TTL
    deletedCart.markModified('deleted_at');

    const restoredCart = await deletedCart.save();

    // Audit: log restoration
    await logAuditAction(userId, restoredCart._id, 'CART_RESTORED', {
      itemsRestored: restoredCart.items.length,
    });

    return restoredCart;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Failed to restore cart: ${error.message}`, 500);
  }
};

/**
 * Log audit trail entry
 * 
 * Helper function called on every mutation.
 * Writes snapshot of action payload for reconstruction/debugging.
 * 
 * @param {string} userId
 * @param {ObjectId} cartId
 * @param {string} action
 * @param {object} snapshot
 * @returns {Promise<void>}
 */
const logAuditAction = async (userId, cartId, action, snapshot) => {
  try {
    await AuditLog.create({
      userId,
      cartId,
      action,
      snapshot,
      timestamp: new Date(),
    });
  } catch (error) {
    // Audit log failure should not block cart operations
    // Log to console but don't throw
    console.error(`Audit log creation failed: ${error.message}`);
  }
};

/**
 * Get cart by ID (used by controllers for response)
 * 
 * @param {string} cartId
 * @returns {Promise<object>} cart document
 */
const getCartById = async (cartId) => {
  try {
    const cart = await Cart.findById(cartId);
    if (!cart) {
      throw new AppError('Cart not found', 404);
    }
    return cart;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Failed to fetch cart: ${error.message}`, 500);
  }
};

export default {
  getOrCreateActiveCart,
  addOrUpdateItem,
  updateItem,
  removeItem,
  clearCart,
  checkoutCart,
  restoreCart,
  getCartById,
  logAuditAction,
};
