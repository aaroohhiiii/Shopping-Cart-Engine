/**
 * Cart Controller
 * 
 * Thin request/response handlers that:
 * - Parse request parameters
 * - Call service layer (no business logic here)
 * - Format and return responses
 * 
 * Architecture: Controllers are stateless and focused on HTTP concerns only.
 * All business logic is in services. This makes controllers easy to test
 * and understand at a glance.
 */

import cartService from '../services/cart.service.js';
import errorHandlerModule from '../middleware/errorHandler.js';
const { AppError  } = errorHandlerModule;

/**
 * POST /api/cart/items
 * Add item to cart (or increment if SKU exists)
 * 
 * Request body: { userId, sku, name, price, quantity }
 * Returns: updated cart with all items
 */
const addItem = async (req, res, next) => {
  try {
    const { userId, sku, name, price, quantity } = req.body;

    const updatedCart = await cartService.addOrUpdateItem(userId, {
      sku,
      name,
      price,
      quantity,
    });

    return res.status(201).json({
      status: 201,
      message: 'Item added to cart',
      data: {
        cartId: updatedCart._id,
        userId: updatedCart.userId,
        itemCount: updatedCart.items.length,
        items: updatedCart.items,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/cart/items/:sku
 * Update item quantity and/or price
 * 
 * URL param: sku
 * Request body: { userId, quantity?, price? }
 * Returns: updated cart
 */
const updateItem = async (req, res, next) => {
  try {
    const { userId } = req.body;
    const { sku } = req.params;

    // Extract only provided fields for update
    const updateData = {};
    if (req.body.quantity !== undefined) {
      updateData.quantity = req.body.quantity;
    }
    if (req.body.price !== undefined) {
      updateData.price = req.body.price;
    }

    if (Object.keys(updateData).length === 0) {
      throw new AppError('At least one field (quantity or price) must be provided', 400);
    }

    const updatedCart = await cartService.updateItem(userId, sku, updateData);

    return res.status(200).json({
      status: 200,
      message: 'Item updated',
      data: {
        cartId: updatedCart._id,
        userId: updatedCart.userId,
        itemCount: updatedCart.items.length,
        items: updatedCart.items,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/cart/items/:sku
 * Remove item from cart
 * 
 * URL param: sku
 * Request body: { userId }
 * Returns: updated cart
 */
const removeItem = async (req, res, next) => {
  try {
    const { userId } = req.body;
    const { sku } = req.params;

    const updatedCart = await cartService.removeItem(userId, sku);

    return res.status(200).json({
      status: 200,
      message: 'Item removed from cart',
      data: {
        cartId: updatedCart._id,
        userId: updatedCart.userId,
        itemCount: updatedCart.items.length,
        items: updatedCart.items,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/cart
 * Clear entire cart (soft delete)
 * 
 * Request body: { userId }
 * Returns: cleared cart (status: deleted)
 */
const clearCart = async (req, res, next) => {
  try {
    const { userId } = req.body;

    const clearedCart = await cartService.clearCart(userId);

    return res.status(200).json({
      status: 200,
      message: 'Cart cleared',
      data: {
        cartId: clearedCart._id,
        userId: clearedCart.userId,
        status: clearedCart.status,
        deleted_at: clearedCart.deleted_at,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/cart/restore/:userId
 * Restore most recent soft-deleted cart for user
 * 
 * URL param: userId
 * Returns: restored cart (status: active)
 * 
 * Feature X: Enables customer self-service recovery
 */
const restoreCart = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const restoredCart = await cartService.restoreCart(userId);

    return res.status(200).json({
      status: 200,
      message: 'Cart restored',
      data: {
        cartId: restoredCart._id,
        userId: restoredCart.userId,
        status: restoredCart.status,
        itemCount: restoredCart.items.length,
        items: restoredCart.items,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/cart/:userId
 * Retrieve current active cart for user (read-only)
 * 
 * URL param: userId
 * Returns: active cart or 404 if none
 */
const getCart = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const cart = await cartService.getOrCreateActiveCart(userId);

    return res.status(200).json({
      status: 200,
      data: {
        cartId: cart._id,
        userId: cart.userId,
        status: cart.status,
        itemCount: cart.items.length,
        items: cart.items,
        createdAt: cart.createdAt,
        expiresAt: cart.expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  addItem,
  updateItem,
  removeItem,
  clearCart,
  restoreCart,
  getCart,
};
