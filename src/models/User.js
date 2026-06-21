/**
 * User Model
 * 
 * Represents a user in the system with minimal data.
 * Used as a reference point for multi-tenant architecture.
 * 
 * Note: In this system, userId is passed as a header (X-User-Id) on each request,
 * so this model exists mainly for referential integrity and potential future expansion.
 */

import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  { _id: false, timestamps: false }
);

// Index for quick lookups (though userId is typically queried from carts directly)
userSchema.index({ _id: 1 });

module.exports = mongoose.model('User', userSchema, 'users');
