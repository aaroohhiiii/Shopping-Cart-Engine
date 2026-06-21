/**
 * Request Logging Middleware
 * 
 * Uses Morgan for HTTP request logging with environment-aware format.
 * Production uses 'combined' format (Apache combined log format) for security
 * monitoring, while development uses 'dev' format for quick visual feedback.
 */

const morgan = require('morgan');

/**
 * Configure morgan based on environment
 * Development: short format with colors (dev)
 * Production: full Apache combined format (combined)
 */
const getFormat = () => {
  return process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
};

/**
 * Create custom morgan stream to ensure logs go to stdout
 * This allows container orchestration (Docker, K8s) to handle log routing
 */
const requestLogger = morgan(getFormat(), {
  // Skip health checks to reduce log noise
  skip: (req, res) => {
    return req.path === '/health' || req.path === '/metrics';
  },
});

module.exports = requestLogger;
