/**
 * Cart Model
 * 
 * Core domain model representing a shopping cart with:
 * - Multi-tenant support via userId
 * - Soft-delete semantics (status field + deleted_at timestamp)
 * - Automatic TTL expiration for inactive carts (24 hours)
 * - Unique active cart constraint per user (enforced via compound index)
 * 
 * Schema Design Rationale:
 * 1. Embedded items array: Denormalizes items into cart for atomic read/updates
 *    Alternative (referenced collection) rejected because:
 *    - Carts are accessed as complete units
 *    - Atomic transactions required on item mutations
 *    - Document size reasonable (~100KB for typical carts)
 * 
 * 2. Soft delete approach: Items kept in DB for audit/recovery, marked deleted
 *    Supports Feature X: audit trails and customer recovery workflows
 * 
 * 3. TTL index on expiresAt: Automatically removes stale carts without maintenance tasks
 * 
 * 4. Unique compound index on (userId, status) filtered to active:
 *    Enforces exactly one active cart per user at database layer
 */

const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      index: true, // For quick duplicate detection on same cart
    },
    name: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    addedAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    items: [itemSchema],
    status: {
      type: String,
      enum: ['active', 'checked_out', 'expired', 'deleted'],
      default: 'active',
      index: true,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from creation
      index: { expires: 0 }, // TTL index: auto-delete when current time >= expiresAt
    },
  },
  {
    timestamps: true, // createdAt and updatedAt managed automatically
  }
);

/**
 * Unique compound index enforcement:
 * Only one active cart per user at database level.
 * 
 * Using partial index (sparse constraint) so deleted carts don't conflict
 * with future active carts. Without this, the unique index would prevent
 * reactivation of a user's cart.
 * 
 * Index spec:
 *  - userId: 1 (ascending, user partition)
 *  - status: 1 (ascending, single value: 'active')
 * Applied only when status === 'active'
 */
cartSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    name: 'unique_active_cart_per_user',
    partialFilterExpression: { status: 'active' },
  }
);

/**
 * Additional compound index for common query patterns:
 * Finding all carts for a user sorted by creation time
 */
cartSchema.index(
  { userId: 1, createdAt: -1 },
  { name: 'user_carts_by_creation' }
);

/**
 * Index for recovery workflow:
 * Finding most recent deleted cart for a user (restore endpoint)
 */
cartSchema.index(
  { userId: 1, status: 1, deleted_at: -1 },
  {
    name: 'user_deleted_carts',
    partialFilterExpression: { status: 'deleted' },
  }
);

module.exports = mongoose.model('Cart', cartSchema, 'carts');
