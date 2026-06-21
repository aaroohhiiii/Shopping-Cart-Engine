/**
 * Rate Limiting Configuration
 * 
 * Implements tiered rate limiting to protect API endpoints:
 *  - Global rate limit: 100 requests per 15 minutes (general protection)
 *  - Stricter limit on checkout confirm: 10 per hour (high-value operation)
 * 
 * This prevents:
 * 1. Brute force attacks
 * 2. Accidental DoS from misbehaving clients
 * 3. Cart checkout spam that could affect payment processing
 * 
 * Rate limiting is applied per IP address by express-rate-limit.
 * In production with load balancers, set trust proxy option.
 */

const rateLimit = require('express-rate-limit');

/**
 * Global rate limiter for general API endpoints
 * 100 requests per 15 minutes (6-7 requests per second average)
 * Suitable for typical shopping cart workflows
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    status: 429,
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many requests, please try again later',
  },
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  skip: (req, res) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
});

/**
 * Strict rate limiter for checkout confirm endpoint
 * 10 requests per hour - prevents checkout spam and payment processing overload
 */
const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    status: 429,
    error: 'CHECKOUT_RATE_LIMITED',
    message: 'Checkout requests limited to 10 per hour per IP',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests, successful or not
});

module.exports = {
  globalLimiter,
  checkoutLimiter,
};
