/**
 * Cart Routes
 * 
 * Routes for cart operations:
 * - GET  /api/cart/:userId                - Retrieve active cart
 * - POST /api/cart/items                  - Add item to cart
 * - PATCH /api/cart/items/:sku            - Update item quantity/price
 * - DELETE /api/cart/items/:sku           - Remove item from cart
 * - DELETE /api/cart                      - Clear cart (soft delete)
 * - PATCH /api/cart/restore/:userId       - Restore deleted cart
 * 
 * All routes are:
 * - Validated at middleware layer
 * - Rate-limited (global limiter)
 * - Multi-tenant (userId in header or param)
 */

import express from 'express';
const router = express.Router();

import validate from '../middleware/validate.js';
import cartValidators from '../validators/cart.validators.js';
import cartController from '../controllers/cart.controller.js';

/**
 * GET /api/cart/:userId
 * Retrieve user's active cart
 */
router.get('/:userId', (req, res, next) => {
  validate(cartValidators.getCheckoutSummary)(req, res, () => {
    cartController.getCart(req, res, next);
  });
});

/**
 * POST /api/cart/items
 * Add item to cart (create or increment)
 */
router.post('/items', validate(cartValidators.addItem), cartController.addItem);

/**
 * PATCH /api/cart/items/:sku
 * Update item quantity and/or price
 */
router.patch('/items/:sku', validate(cartValidators.updateItem), cartController.updateItem);

/**
 * DELETE /api/cart/items/:sku
 * Remove specific item from cart
 */
router.delete('/items/:sku', validate(cartValidators.removeItem), cartController.removeItem);

/**
 * DELETE /api/cart
 * Clear entire cart (soft delete: status='deleted', deleted_at=now)
 */
router.delete('/', validate(cartValidators.clearCart), cartController.clearCart);

/**
 * PATCH /api/cart/restore/:userId
 * Restore most recent deleted cart for user
 * 
 * Feature X: Enables customer self-service recovery
 * Checks cart hasn't TTL-expired before restoration
 */
router.patch('/restore/:userId', validate(cartValidators.restoreCart), cartController.restoreCart);

export default router;
