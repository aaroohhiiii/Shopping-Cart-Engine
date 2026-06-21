/**
 * Audit Log Model
 * 
 * Immutable log of all mutations to carts.
 * Enables:
 * - Compliance and audit trails (what changed, when, by whom)
 * - Analytics (user behavior, checkout funnel)
 * - Debugging (trace request sequence leading to state)
 * - Customer support (recovery, disputed transactions)
 * 
 * Design: Write-once collection optimized for append-only access.
 * Action snapshots capture full state at mutation time, enabling
 * reconstruction of cart history without joins.
 */

import { Schema, model } from 'mongoose';

const auditLogSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    cartId: {
      type: Schema.Types.ObjectId,
      ref: 'Cart',
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: [
        'ITEM_ADDED',
        'ITEM_UPDATED',
        'ITEM_REMOVED',
        'CART_CLEARED',
        'CART_CHECKED_OUT',
        'CART_DELETED',
        'CART_RESTORED'
      ],
      required: true,
      index: true,
    },
    /**
     * Snapshot of state at time of action
     * For item operations: the item object (with sku, name, price, quantity)
     * For cart operations: the full items array or relevant cart state
     * 
     * Stored as Mixed type to allow flexible schema evolution
     */
    snapshot: {
      type: Schema.Types.Mixed,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      immutable: true,
      index: true,
    },
  },
  {
    timestamps: false, // Use only explicit timestamp field
    collection: 'audit_logs',
  }
);

/**
 * Compound index for efficient audit queries:
 * "Get all actions for user U during time range T"
 */
auditLogSchema.index(
  { userId: 1, timestamp: -1 },
  { name: 'user_audit_timeline' }
);

/**
 * Index for cart-level audit trails:
 * "Reconstruct cart history from audit logs"
 */
auditLogSchema.index(
  { cartId: 1, timestamp: 1 },
  { name: 'cart_action_sequence' }
);

/**
 * TTL index to automatically archive old audit logs (optional production consideration)
 * Set expiryDays in config if desired (e.g., 2 years for compliance)
 * Currently disabled to retain full audit history
 */
// auditLogSchema.index(
//   { timestamp: 1 },
//   { expireAfterSeconds: 63072000 } // 2 years in seconds
// );

export default model('AuditLog', auditLogSchema, 'audit_logs');
