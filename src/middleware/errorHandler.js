/**
 * Global Error Handler Middleware
 * 
 * Centralized error handling for all layers of the application.
 * This ensures consistent error response formatting and prevents
 * accidental exposure of sensitive error details in production.
 * 
 * Architecture: All services and controllers throw AppError instances
 * which this handler catches and formats appropriately based on NODE_ENV.
 */

/**
 * Custom Application Error class
 * Allows services to throw errors with explicit HTTP status codes
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error handler middleware - must be registered last in Express
 * 
 * Handles three error categories:
 * 1. AppError (operational errors from business logic)
 * 2. Mongoose validation errors (formatted to structured response)
 * 3. Unexpected errors (logged but sanitized for client)
 */
const errorHandler = (err, req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';

  // Default error structure
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let details = [];

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    details = Object.values(err.errors).map(error => error.message);
  }

  // Handle Mongoose cast errors (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  }

  // Handle duplicate key errors (unique constraint violations)
  if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate entry - resource already exists';
    const field = Object.keys(err.keyValue)[0];
    details = [`${field} must be unique`];
  }

  // Log error with full context for debugging
  if (!isProduction) {
    console.error('Error:', {
      timestamp: new Date().toISOString(),
      statusCode,
      message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
    });
  } else {
    // Production: log minimal info only
    console.error(`[${statusCode}] ${message}`);
  }

  // Return structured error response
  return res.status(statusCode).json({
    status: statusCode,
    error: statusCode < 500 ? 'CLIENT_ERROR' : 'SERVER_ERROR',
    message,
    ...(details.length > 0 && { details }),
    // Never expose stack traces to client
    ...(process.env.NODE_ENV !== 'production' && {
      stack: err.stack,
      requestId: req.id,
    }),
  });
};

export default {
  AppError,
  errorHandler,
};
