/**
 * Express Application Setup
 * 
 * This file configures Express middleware and routes.
 * Note: No listen() call here - that's in server.js
 * 
 * This separation enables:
 * - Testing the app without starting a server
 * - Flexible initialization (app ready before DB/server startup)
 * - Clear separation between app config and server lifecycle
 */

import express from 'express';
import requestLogger from './middleware/requestLogger.js';
import rateLimiterModule from './middleware/rateLimiter.js';
const { globalLimiter  } = rateLimiterModule;
import errorHandlerModule from './middleware/errorHandler.js';
const { errorHandler, AppError  } = errorHandlerModule;
import cartRoutes from './routes/cart.routes.js';
import checkoutRoutes from './routes/checkout.routes.js';

const app = express();

/**
 * Body parsing middleware
 * Limit set to 10MB for safety against large payloads
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

/**
 * Logging middleware
 * Logs all HTTP requests to stdout
 */
app.use(requestLogger);

/**
 * Rate limiting middleware
 * Global limit: 100 requests per 15 minutes per IP
 * Applied before routes to protect all endpoints
 */
app.use(globalLimiter);

/**
 * Health check endpoint
 * Used by container orchestration (Docker, K8s) for liveness probes
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * API Routes
 * Organized by domain:
 * /api/cart       - Cart operations (item management)
 * /api/checkout   - Checkout operations (summary, confirmation)
 */
app.use('/api/cart', cartRoutes);
app.use('/api/checkout', checkoutRoutes);

/**
 * 404 Handler
 * Return structured response for unknown routes
 */
app.use((req, res, next) => {
  const error = new AppError(
    `Route not found: ${req.method} ${req.path}`,
    404
  );
  next(error);
});

/**
 * Global Error Handler
 * Must be last middleware
 * Catches all errors from routes and controllers
 */
app.use(errorHandler);

export default app;
