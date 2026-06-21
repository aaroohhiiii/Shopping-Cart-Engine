/**
 * Request Validation Middleware
 * 
 * Wrapper around Joi validation to create a reusable middleware factory.
 * Applies schema validation to request body, params, and query.
 * Returns structured validation errors in consistent format.
 * 
 * Architecture: Validation happens at middleware layer (closest to HTTP layer)
 * before reaching controllers, providing early rejection of malformed requests.
 */

import Joi from 'joi';

/**
 * Validates request against a Joi schema
 * 
 * @param {object} schema - Joi schema with body, params, query properties
 * @returns {Function} Express middleware function
 * 
 * Usage in routes:
 *   router.post('/items', validate(cartValidators.addItem), controller.addItem)
 */
const validate = (schema) => {
  return (req, res, next) => {
    try {
      // Validate each part of the request separately
      const bodySchema = schema.body ? Joi.attempt(req.body, schema.body) : req.body;
      const paramsSchema = schema.params ? Joi.attempt(req.params, schema.params) : req.params;
      const querySchema = schema.query ? Joi.attempt(req.query, schema.query) : req.query;

      // Attach validated values back to request
      req.body = bodySchema;
      req.params = paramsSchema;
      req.query = querySchema;

      next();
    } catch (error) {
      if (error instanceof Joi.ValidationError) {
        // Extract all error messages in a structured format
        const details = error.details.map(detail => {
          const path = detail.path.join('.');
          return `${path}: ${detail.message}`;
        });

        return res.status(400).json({
          status: 400,
          error: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details,
        });
      }

      // Unexpected error during validation
      next(error);
    }
  };
};

export default validate;
