/**
 * Checkout Routes
 * 
 * Routes for checkout operations:
 * - GET /api/checkout/summary/:userId     - Calculate checkout summary (read-only)
 * - POST /api/checkout/confirm/:userId    - Confirm checkout (state mutation)
 * 
 * The POST route is rate-limited to prevent checkout spam:
 * Stricter limit: 10 requests per hour per IP
 */

import express from 'express';
const router = express.Router();

import validate from '../middleware/validate.js';
import rateLimiterModule from '../middleware/rateLimiter.js';
const { checkoutLimiter  } = rateLimiterModule;
import cartValidators from '../validators/cart.validators.js';
import checkoutController from '../controllers/checkout.controller.js';

/**
 * GET /api/checkout/summary/:userId
 * Calculate checkout summary without state mutation
 * 
 * Returns:
 * - Subtotal from cart items
 * - Applied promotional tier
 * - Diversity bonus (if applicable)
 * - Total discount amount
 * - Final total (subtotal - discount)
 * 
 * Read-only operation: safe to call multiple times
 */
router.get(
  '/summary/:userId',
  validate(cartValidators.getCheckoutSummary),
  checkoutController.getCheckoutSummary
);

/**
 * POST /api/checkout/confirm/:userId
 * Confirm checkout (atomic state mutation)
 * 
 * Operations:
 * 1. Move cart from status='active' to status='checked_out'
 * 2. Create audit log entry
 * 3. Calculate and return final summary
 * 
 * Rate limited to 10 per hour to prevent:
 * - Checkout spam
 * - Payment processing overload
 * 
 * Returns: final checkout summary with confirmed status
 */
router.post(
  '/confirm/:userId',
  checkoutLimiter,
  validate(cartValidators.confirmCheckout),
  checkoutController.confirmCheckout
);

export default router;
