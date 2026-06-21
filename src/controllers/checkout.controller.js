/**
 * Checkout Controller
 * 
 * Handles checkout operations:
 * - Summary calculation (read-only, calls promo service)
 * - Checkout confirmation (state mutation, calls cart service)
 * 
 * Separation of concerns:
 * - Summary: Promo engine determines discounts
 * - Confirm: Cart service handles state transition with audit logging
 */

import cartService from '../services/cart.service.js';
import promoService from '../services/promo.service.js';
import errorHandlerModule from '../middleware/errorHandler.js';
const { AppError  } = errorHandlerModule;

/**
 * GET /api/checkout/summary/:userId
 * Calculate checkout summary without mutating state
 * 
 * Returns:
 * - Subtotal
 * - Applied tier and discounts
 * - Diversity bonus (if applicable)
 * - Final total
 * 
 * This is a read-only operation for clients to preview totals
 */
const getCheckoutSummary = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Get active cart
    const cart = await cartService.getOrCreateActiveCart(userId);

    // Check for empty cart
    if (!cart.items || cart.items.length === 0) {
      throw new AppError('Cannot checkout: cart is empty', 400);
    }

    // Calculate checkout summary using promo service
    const summary = promoService.calculateCheckoutSummary(userId, cart._id, cart.items);

    return res.status(200).json({
      status: 200,
      message: 'Checkout summary calculated',
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/checkout/confirm/:userId
 * Confirm checkout and move cart to checked_out status
 * 
 * Operations (atomic via transaction):
 * 1. Move cart status from active -> checked_out
 * 2. Write audit log entry
 * 3. Calculate final summary
 * 
 * Returns: final checkout summary with status confirmation
 * 
 * Rate limited to 10 per hour per IP (prevent checkout spam)
 */
const confirmCheckout = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Check cart exists and has items
    const cart = await cartService.getOrCreateActiveCart(userId);

    if (!cart.items || cart.items.length === 0) {
      throw new AppError('Cannot checkout: cart is empty', 400);
    }

    // Perform checkout (state mutation, creates audit log)
    const checkedOutCart = await cartService.checkoutCart(userId);

    // Calculate final summary for response
    const summary = promoService.calculateCheckoutSummary(userId, checkedOutCart._id, checkedOutCart.items);

    return res.status(200).json({
      status: 200,
      message: 'Checkout confirmed',
      data: {
        ...summary,
        cartStatus: checkedOutCart.status,
        confirmedAt: checkedOutCart.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getCheckoutSummary,
  confirmCheckout,
};
