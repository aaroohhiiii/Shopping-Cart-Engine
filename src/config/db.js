/**
 * MongoDB Connection Configuration
 * 
 * This module handles initialization and connection to MongoDB via Mongoose.
 * All connection options are sourced from environment variables, with no defaults
 * to enforce explicit configuration in production.
 * 
 * Architecture note: Connection is initialized separately from Express app to allow
 * flexible initialization timing and health checks before server startup.
 */

import mongoose from 'mongoose';

/**
 * Validates that required environment variables are present
 * @throws {Error} if required vars are missing
 */
const validateRequiredEnvVars = () => {
  const required = ['MONGODB_URI', 'NODE_ENV', 'PORT'];
  const missing = required.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

/**
 * Initializes MongoDB connection with optimized settings for production
 * 
 * @returns {Promise<mongoose.Connection>}
 * @throws {Error} if connection fails
 */
const connectDB = async () => {
  try {
    validateRequiredEnvVars();
    
    // Connection pool sizes tuned for microservice workloads
    // Production-grade timeouts and retries
    const mongooseOptions = {
      maxPoolSize: 10,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      retryReads: true,
      // Explicit connection timeout for faster failure detection in prod
      connectTimeoutMS: 10000,
    };

    await mongoose.connect(process.env.MONGODB_URI, mongooseOptions);
    
    console.log('✓ MongoDB connected successfully');
    return mongoose.connection;
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    throw error;
  }
};

/**
 * Graceful shutdown of MongoDB connection
 * 
 * @returns {Promise<void>}
 */
const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('✓ MongoDB disconnected');
  } catch (error) {
    console.error('✗ MongoDB disconnection error:', error.message);
    throw error;
  }
};

export {
  connectDB,
  disconnectDB,
  mongoose,
};
