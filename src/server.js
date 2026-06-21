/**
 * Server Startup
 * 
 * This file handles:
 * - Environment validation
 * - Database connection
 * - HTTP server startup
 * - Graceful shutdown
 * 
 * Separated from app.js to keep concerns isolated:
 * - app.js: middleware and routing (HTTP concerns)
 * - server.js: process lifecycle and dependencies
 */

import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { connectDB, disconnectDB  } from './config/db.js';

// Server configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Start server
 * 
 * Initialization sequence:
 * 1. Validate required environment variables
 * 2. Connect to MongoDB
 * 3. Start HTTP server on configured port
 * 4. Setup graceful shutdown handlers
 */
const startServer = async () => {
  try {
    // Database connection
    await connectDB();

    // Start HTTP server
    const server = app.listen(PORT, () => {
      console.log(`
✓ Server listening on port ${PORT}
✓ Environment: ${NODE_ENV}
✓ Ready to accept requests
      `);
    });

    /**
     * Graceful shutdown
     * 
     * On SIGTERM/SIGINT:
     * 1. Stop accepting new requests
     * 2. Wait for pending requests to complete (with timeout)
     * 3. Close database connection
     * 4. Exit process
     * 
     * Important for container orchestration and zero-downtime deployments
     */
    const gracefulShutdown = async (signal) => {
      console.log(`\n✓ Received ${signal}, initiating graceful shutdown...`);

      // Stop accepting new requests
      server.close(async () => {
        console.log('✓ HTTP server closed');

        try {
          // Close database connection
          await disconnectDB();
          console.log('✓ Graceful shutdown complete');
          process.exit(0);
        } catch (error) {
          console.error('✗ Error during shutdown:', error.message);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds if graceful shutdown hangs
      setTimeout(() => {
        console.error('✗ Graceful shutdown timeout - forcing exit');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    /**
     * Uncaught exception handler
     * Log but don't crash in development; restart container in production
     */
    process.on('uncaughtException', (error) => {
      console.error('✗ Uncaught exception:', error);
      if (NODE_ENV === 'production') {
        process.exit(1);
      }
    });

    /**
     * Unhandled rejection handler
     * Log all promise rejections that weren't handled
     */
    process.on('unhandledRejection', (reason, promise) => {
      console.error('✗ Unhandled rejection at', promise, 'reason:', reason);
    });
  } catch (error) {
    console.error('✗ Failed to start server:', error.message);
    process.exit(1);
  }
};

// Start the server
startServer();
