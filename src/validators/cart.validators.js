/**
 * Cart Request Validators
 * 
 * Joi schemas for all cart-related endpoints.
 * Schemas are organized by operation type for clarity.
 * 
 * Architecture: Validation at middleware layer ensures only well-formed
 * requests reach controllers. All schemas use strict() to reject unknown fields.
 */

import Joi from 'joi';

/**
 * Common field definitions for reusability and consistency
 */
const schemas = {
  // User ID validation - required on every request
  userId: Joi.string()
    .required()
    .min(1)
    .max(255)
    .trim()
    .description('User identifier'),

  // SKU validation - product code
  sku: Joi.string()
    .required()
    .min(1)
    .max(50)
    .pattern(/^[a-zA-Z0-9-]+$/)
    .message('sku must only contain alpha-numeric characters and hyphens')
    .trim()
    .uppercase()
    .description('Product SKU'),

  // Product name validation
  name: Joi.string()
    .required()
    .min(1)
    .max(255)
    .trim()
    .description('Product name'),

  // Price validation - must be positive
  price: Joi.number()
    .required()
    .positive()
    .precision(2)
    .description('Product price in USD'),

  // Quantity validation - must be positive integer
  quantity: Joi.number()
    .required()
    .integer()
    .min(1)
    .max(1000) // Reasonable upper bound per item
    .description('Quantity to add/update'),
};

/**
 * POST /api/cart/items
 * Add item to cart (or increment if SKU exists)
 */
const addItem = {
  body: Joi.object({
    userId: schemas.userId,
    sku: schemas.sku,
    name: schemas.name,
    price: schemas.price,
    quantity: schemas.quantity,
    category: Joi.string().trim().max(50).optional().description('Product category for diversity bonus'),
  })
    .strict()
    .required(),
};

/**
 * PATCH /api/cart/items/:sku
 * Update item quantity and/or price in cart
 */
const updateItem = {
  params: Joi.object({
    sku: schemas.sku,
  })
    .strict()
    .required(),

  body: Joi.object({
    userId: schemas.userId,
    quantity: Joi.number()
      .optional()
      .integer()
      .min(1)
      .max(1000),
    price: Joi.number()
      .optional()
      .positive()
      .precision(2),
  })
    .strict()
    .min(2) // Must have userId + at least one field to update
    .required(),
};

/**
 * DELETE /api/cart/items/:sku
 * Remove item from cart
 */
const removeItem = {
  params: Joi.object({
    sku: schemas.sku,
  })
    .strict()
    .required(),

  body: Joi.object({
    userId: schemas.userId,
  })
    .strict()
    .required(),
};

/**
 * DELETE /api/cart
 * Clear cart (soft delete)
 */
const clearCart = {
  body: Joi.object({
    userId: schemas.userId,
  })
    .strict()
    .required(),
};

/**
 * GET /api/checkout/summary/:userId
 * Get checkout summary without mutation
 */
const getCheckoutSummary = {
  params: Joi.object({
    userId: schemas.userId,
  })
    .strict()
    .required(),
};

/**
 * POST /api/checkout/confirm/:userId
 * Confirm checkout (move to checked_out status)
 */
const confirmCheckout = {
  params: Joi.object({
    userId: schemas.userId,
  })
    .strict()
    .required(),
};

/**
 * PATCH /api/cart/restore/:userId
 * Restore most recent deleted cart for user
 */
const restoreCart = {
  params: Joi.object({
    userId: schemas.userId,
  })
    .strict()
    .required(),
};

export default {
  addItem,
  updateItem,
  removeItem,
  clearCart,
  getCheckoutSummary,
  confirmCheckout,
  restoreCart,
};
