# Shopping Cart Engine - API Reference & Setup Guide

Production-grade shopping cart microservice with multi-tenant support, tiered promotions, soft delete auditing, and transactional consistency.

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB 6.0+ (local or managed service)
- npm 9+

### Setup Instructions

1. **Clone and install dependencies**
   ```bash
   cd shoppingCartEngine
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your MongoDB connection string
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

   Server will start on `http://localhost:3000` and log ready state.

4. **Verify health**
   ```bash
   curl http://localhost:3000/health
   ```

---

## API Endpoints

All endpoints return JSON responses with consistent structure:

```json
{
  "status": 200,
  "message": "Operation description",
  "data": { /* response payload */ }
}
```

### Multi-Tenant User Strategy

**All requests require a `userId` identifier** passed as:
- **URL parameter** (e.g., `/api/cart/:userId`)
- **Request body** (in POST/PATCH/DELETE operations)

Each user maintains exactly one active cart at a time (enforced at database layer).

---

## Cart Management

### Create/Retrieve Cart

**GET** `/api/cart/:userId`

Retrieves user's active cart. Creates one automatically if not found.

**Query Parameters:**
- `userId` (URL param, required)

**Response (200):**
```json
{
  "status": 200,
  "data": {
    "cartId": "60d5ec49c1234567890abcde",
    "userId": "user_123",
    "status": "active",
    "itemCount": 2,
    "items": [
      {
        "sku": "PROD001",
        "name": "Widget",
        "price": 29.99,
        "quantity": 2,
        "addedAt": "2026-06-20T10:30:00Z"
      }
    ],
    "createdAt": "2026-06-20T10:00:00Z",
    "expiresAt": "2026-06-21T10:00:00Z"
  }
}
```

**Errors:**
- `500` - Database error

---

### Add Item to Cart

**POST** `/api/cart/items`

Adds item to cart. If SKU already exists, increments quantity and updates price.

**Request Body:**
```json
{
  "userId": "user_123",
  "sku": "PROD001",
  "name": "Widget - Premium",
  "price": 29.99,
  "quantity": 2
}
```

**Validation Rules:**
- `userId`: required, non-empty string
- `sku`: required, alphanumeric, max 50 chars, converted to uppercase
- `name`: required, 1-255 chars
- `price`: required, positive number (2 decimals)
- `quantity`: required, positive integer, max 1000

**Response (201):**
```json
{
  "status": 201,
  "message": "Item added to cart",
  "data": {
    "cartId": "60d5ec49c1234567890abcde",
    "userId": "user_123",
    "itemCount": 3,
    "items": [ /* all items */ ]
  }
}
```

**Errors:**
- `400` - Validation error (invalid price, quantity, etc.)
- `409` - Conflict (duplicate active cart, race condition - retried once)
- `500` - Database error

---

### Update Item in Cart

**PATCH** `/api/cart/items/:sku`

Updates item quantity and/or price. SKU must exist in cart.

**URL Parameters:**
- `sku` (required, alphanumeric)

**Request Body:**
```json
{
  "userId": "user_123",
  "quantity": 5,
  "price": 24.99
}
```

At least one of `quantity` or `price` must be provided.

**Response (200):**
```json
{
  "status": 200,
  "message": "Item updated",
  "data": {
    "cartId": "60d5ec49c1234567890abcde",
    "userId": "user_123",
    "itemCount": 3,
    "items": [ /* all items */ ]
  }
}
```

**Errors:**
- `400` - Validation error or no update fields provided
- `404` - Item (SKU) not found in cart
- `500` - Database error

---

### Remove Item from Cart

**DELETE** `/api/cart/items/:sku`

Removes specified item from cart. Hard-removes from items array.

**URL Parameters:**
- `sku` (required)

**Request Body:**
```json
{
  "userId": "user_123"
}
```

**Response (200):**
```json
{
  "status": 200,
  "message": "Item removed from cart",
  "data": {
    "cartId": "60d5ec49c1234567890abcde",
    "userId": "user_123",
    "itemCount": 2,
    "items": [ /* remaining items */ ]
  }
}
```

**Errors:**
- `400` - Validation error
- `404` - Item (SKU) not found
- `500` - Database error

---

### Clear Cart

**DELETE** `/api/cart`

Clears entire cart (soft delete). Sets status to `deleted` and records timestamp.

**Request Body:**
```json
{
  "userId": "user_123"
}
```

**Response (200):**
```json
{
  "status": 200,
  "message": "Cart cleared",
  "data": {
    "cartId": "60d5ec49c1234567890abcde",
    "userId": "user_123",
    "status": "deleted",
    "deleted_at": "2026-06-20T11:00:00Z"
  }
}
```

**Errors:**
- `400` - Validation error
- `500` - Database error

**Note:** Soft delete allows recovery via restore endpoint.

---

### Restore Deleted Cart (Feature X)

**PATCH** `/api/cart/restore/:userId`

Restores user's most recently deleted cart (if not TTL-expired).

**URL Parameters:**
- `userId` (required)

**Response (200):**
```json
{
  "status": 200,
  "message": "Cart restored",
  "data": {
    "cartId": "60d5ec49c1234567890abcde",
    "userId": "user_123",
    "status": "active",
    "itemCount": 2,
    "items": [ /* restored items */ ]
  }
}
```

**Errors:**
- `404` - No deleted cart found for user
- `410` - Deleted cart has expired (TTL exceeded)
- `500` - Database error

---

## Checkout Operations

### Get Checkout Summary

**GET** `/api/checkout/summary/:userId`

Calculates checkout totals with applied discounts. **Read-only operation** (no state change).

**URL Parameters:**
- `userId` (required)

**Response (200):**
```json
{
  "status": 200,
  "message": "Checkout summary calculated",
  "data": {
    "userId": "user_123",
    "cartId": "60d5ec49c1234567890abcde",
    "items": [ /* all items */ ],
    "subtotal": 1250.00,
    "appliedTier": {
      "id": "gold",
      "label": "10% off",
      "discountPercent": 10
    },
    "diversityBonus": {
      "applied": true,
      "extraDiscountPercent": 3
    },
    "totalDiscount": 162.50,
    "total": 1087.50,
    "breakdown": "10% tier discount + 3% diversity bonus applied additively"
  }
}
```

**Errors:**
- `400` - Empty cart
- `500` - Calculation error

---

### Confirm Checkout

**POST** `/api/checkout/confirm/:userId`

Confirms checkout and transitions cart to `checked_out` status. Atomic operation with audit logging.

**URL Parameters:**
- `userId` (required)

**Rate Limit:** 10 requests per hour per IP

**Response (200):**
```json
{
  "status": 200,
  "message": "Checkout confirmed",
  "data": {
    "userId": "user_123",
    "cartId": "60d5ec49c1234567890abcde",
    "items": [ /* all items */ ],
    "subtotal": 1250.00,
    "appliedTier": { /* tier info */ },
    "diversityBonus": { /* bonus info */ },
    "totalDiscount": 162.50,
    "total": 1087.50,
    "breakdown": "10% tier discount + 3% diversity bonus applied additively",
    "cartStatus": "checked_out",
    "confirmedAt": "2026-06-20T11:15:00Z"
  }
}
```

**Errors:**
- `400` - Empty cart or validation error
- `404` - No active cart found
- `429` - Rate limit exceeded (10 per hour per IP)
- `500` - Checkout failed

**Note:** On success, audit log entry created with full transaction. Safe to retry with idempotency.

---

## Promotional Tiers

Discounts applied based on cart subtotal and product diversity:

| Tier | Subtotal Range | Discount | Bonus Condition |
|------|---|---|---|
| **Bronze** | $0–$499 | 0% | — |
| **Silver** | $500–$999 | 5% | — |
| **Gold** | $1,000–$1,999 | 10% | — |
| **Platinum** | $2,000+ | 15% | + Free shipping |
| **Diversity** | Any | +3% | 5+ unique SKUs |

**Discount Application:** Additive (tier + diversity stacked, not multiplied)

**Example:**
- Cart value: $1,250
- Tier: Gold (10%)
- Unique products: 5 → Diversity bonus applies (+3%)
- Total discount: (1250 × 0.10) + (1250 × 0.03) = $162.50
- Final total: $1,087.50

---

## Rate Limiting

### Global Limit
- **Threshold:** 100 requests per 15 minutes
- **Applies to:** All endpoints except `/health`
- **Per:** IP address
- **Response (429):**
  ```json
  {
    "status": 429,
    "error": "TOO_MANY_REQUESTS",
    "message": "Too many requests, please try again later"
  }
  ```

### Checkout Confirm Limit
- **Threshold:** 10 requests per hour
- **Applies to:** `POST /api/checkout/confirm/:userId`
- **Per:** IP address
- **Rationale:** Prevents checkout spam and payment processing overload

---

## Error Handling

All errors return consistent JSON structure:

**Client Error (4xx):**
```json
{
  "status": 400,
  "error": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [
    "price: must be a positive number",
    "quantity: must be at least 1"
  ]
}
```

**Server Error (5xx):**
```json
{
  "status": 500,
  "error": "SERVER_ERROR",
  "message": "Internal server error"
}
```

**Development mode only:** Stack traces included in error responses.

### Common Error Codes

| Code | Scenario | Action |
|------|---|---|
| `400` | Validation failed | Check request format |
| `404` | Resource not found | Verify ID or create first |
| `409` | Conflict | Retry (race condition handled) |
| `410` | Resource expired | TTL exceeded, cannot recover |
| `429` | Rate limited | Back off and retry after delay |
| `500` | Server error | Retry with exponential backoff |

---

## MongoDB Schema Overview

### Cart Collection
```
{
  _id: ObjectId,
  userId: String (indexed),
  items: [
    {
      sku: String,
      name: String,
      price: Number,
      quantity: Number,
      addedAt: Date
    }
  ],
  status: 'active' | 'checked_out' | 'deleted' | 'expired',
  deleted_at: Date | null,
  expiresAt: Date (TTL index: auto-delete when < now),
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ userId: 1, status: 1 }` (unique, partial on status='active') ← One active cart per user
- `{ userId: 1, createdAt: -1 }` ← User cart history
- `{ userId: 1, status: 1, deleted_at: -1 }` (partial on status='deleted') ← Restore workflow

### AuditLog Collection
```
{
  _id: ObjectId,
  userId: String (indexed),
  cartId: ObjectId (indexed),
  action: 'ITEM_ADDED' | 'ITEM_UPDATED' | 'ITEM_REMOVED' | 'CART_CLEARED' | 'CART_CHECKED_OUT' | 'CART_DELETED' | 'CART_RESTORED',
  snapshot: Mixed (item or cart state at mutation time),
  timestamp: Date (indexed)
}
```

**Indexes:**
- `{ userId: 1, timestamp: -1 }` ← User audit timeline
- `{ cartId: 1, timestamp: 1 }` ← Cart action sequence

---

## Feature X: Soft Delete & Audit Trail

### Why Soft Delete?

**Production Safety:**
- Never lose data - customers can recover accidentally deleted carts
- Maintain complete audit trail for compliance and debugging
- Support customer service recovery workflows
- Enable analytics on user behavior patterns

### What Gets Logged?

Every mutation creates an audit log entry:
- **ITEM_ADDED:** New item data
- **ITEM_UPDATED:** Before/after snapshots
- **ITEM_REMOVED:** Removed item data
- **CART_CLEARED:** Items array snapshot
- **CART_CHECKED_OUT:** Full items + cart state
- **CART_DELETED:** Soft delete timestamp
- **CART_RESTORED:** Restoration confirmation

### Recovery Workflow

```
Customer deletes cart accidentally
         ↓
Call PATCH /api/cart/restore/:userId
         ↓
Most recent deleted cart restored (if not TTL-expired)
         ↓
24-hour window to restore (then auto-deleted)
```

---

## Handling Edge Cases

### Empty Cart Checkout
**Error:** `400 - Cannot checkout: cart is empty`
**Fix:** Add items before checkout

### Duplicate SKU on Add
**Behavior:** Existing quantity incremented, price updated
**Audit:** Logged as `ITEM_UPDATED`

### Zero Quantity
**Error:** `400 - quantity must be at least 1`
**Fix:** Use DELETE endpoint to remove item

### Price = $0
**Behavior:** Allowed (promotional or free items)
**Validation:** Price >= 0

### Concurrent Requests to Same Cart
**Handled by:** Mongoose atomic operations and findOneAndUpdate
**Race condition on cart creation:** Single retry with idempotent check

### Expired Cart + Restore Attempt
**Error:** `410 Gone - Deleted cart has expired`
**Cause:** Cart TTL exceeded (24 hours)
**Fix:** No recovery possible; create new cart

### Cart Item Quantity > 999
**Error:** `400 - quantity must be less than 1001`
**Validation:** Max 1000 per item to prevent abuse

---

## Development Workflow

### Logging

Production logs go to stdout (no console.log in hot paths):
```bash
# Development (colored, concise)
npm run dev

# Production (Apache combined format)
NODE_ENV=production npm start
```

### Linting

```bash
npm run lint        # Check for issues
npm run lint:fix    # Auto-fix formatting
```

### Testing

```bash
npm test            # Run test suite
```

---

## Deployment Checklist

- [ ] MongoDB connection string configured in `.env`
- [ ] `NODE_ENV=production` set
- [ ] All required env vars present (server validates on startup)
- [ ] Port accessible to reverse proxy/load balancer
- [ ] Health check route wired to orchestration tool
- [ ] Graceful shutdown configured (30-second timeout)
- [ ] Logs rotated/archived (host handles this)
- [ ] Rate limits appropriate for expected load
- [ ] Cart TTL (24h) aligns with business policy
- [ ] Promo tiers in `promoConfig.js` match current campaign

---

## Support & Architecture

See [DESIGN.md](DESIGN.md) for:
- Architectural principles and trade-offs
- Schema design rationale
- Session strategy explanation
- Edge case handling
- Feature X (soft delete) implementation

---

**Version:** 1.0.0  
**License:** MIT  
**Maintained by:** Backend Engineering Team
