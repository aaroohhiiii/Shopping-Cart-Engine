# Shopping Cart Engine - Design Architecture & Rationale

This document explains the architectural decisions and engineering principles underlying the shopping cart microservice. It serves as a reference for understanding trade-offs and supporting future enhancements.

---

## Architecture Overview

### Layered Design

```
┌─────────────────────────────────────────────┐
│          HTTP Layer (Express)               │
│  ┌───────────────────────────────────────┐  │
│  │   Routes: /api/cart, /api/checkout    │  │
│  └───────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│     Middleware Layer (Validation, Auth)     │
│  ┌────────────────────────────────────────┐ │
│  │ • Validate.js (Joi schemas)            │ │
│  │ • Rate Limiter (express-rate-limit)    │ │
│  │ • Error Handler (structured responses) │ │
│  │ • Request Logger (Morgan)              │ │
│  └────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│        Controller Layer (Request/Response)  │
│  ┌────────────────────────────────────────┐ │
│  │ • Parse request                        │ │
│  │ • Call service (no business logic)     │ │
│  │ • Format response                      │ │
│  └────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│      Service Layer (Business Logic)         │
│  ┌────────────────────────────────────────┐ │
│  │ • cart.service.js (mutations + queries)│ │
│  │ • promo.service.js (discount engine)   │ │
│  │ • Audit logging                        │ │
│  └────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│    Model Layer (Mongoose + Database)        │
│  ┌────────────────────────────────────────┐ │
│  │ • Cart (embedded items)                │ │
│  │ • AuditLog (immutable events)          │ │
│  │ • User (reference)                     │ │
│  └────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│    Data Layer (MongoDB)                     │
└─────────────────────────────────────────────┘
```

### Key Principles

1. **Separation of Concerns:** Each layer has a single responsibility
   - Routes: HTTP mapping only
   - Controllers: Request/response handling
   - Services: Business logic
   - Models: Data persistence

2. **Dependency Inversion:** Controllers depend on services, services depend on models
   - Enables testing without full stack
   - Supports swapping implementations

3. **Explicit over Implicit:** Configuration is declarative
   - Promotions: defined in `promoConfig.js` (not hardcoded)
   - Validation: schemas in `validators/`
   - Middleware: ordered and visible in `app.js`

---

## Session Strategy: Header-Based Multi-Tenancy

### Choice: X-User-Id Header (No JWT/Cookies)

**Implementation:** User ID passed as string in request body or URL parameter

**Rationale:**

| Aspect | Header | JWT | Session Cookie |
|--------|--------|-----|---|
| **State** | Stateless per request | Stateless (signed) | Stateful (server) |
| **Multi-tenant** | Native (each request explicit) | Possible with claims | Per-session mapping |
| **Simple** | ✓ Very simple | ✗ Requires crypto | ✗ Requires session store |
| **Scope** | Intentional (test explicitly) | ✗ Hidden in token | ✗ Hidden in cookie |
| **Scalability** | ✓ No session storage | ✓ No session storage | ✗ Requires store |
| **Security** | ✓ No secrets to rotate | ✓ Cryptographically safe | ✓ HttpOnly, SameSite |
| **For This Task** | ✓✓✓ Best fit | × No auth scope | × Overkill |

### Design Pattern: Per-Request User Context

Every endpoint validates userId on arrival:

```
Request → Validate userId (non-empty string) → Get cart → Business logic → Response
```

**Advantages:**
- Clear and explicit at each layer
- No hidden context (no token to decode)
- Easy to trace in logs
- Every request is independently verified

**Tradeoffs:**
- Client must pass userId on every request (vs. cookie-based recall)
- No cross-domain single-sign-on (not required by assignment)
- No delegation pattern (no refresh tokens)

### Implementation in Code

```javascript
// Validators ensure userId is always present and valid
const schema = {
  params: Joi.object({
    userId: Joi.string().required().min(1).max(255)
  })
};

// Service enforces exactly one active cart per user (database-level)
const uniqueIndex = {
  userId: 1,
  status: 1  // Unique only for active carts
};
```

---

## Schema Design Rationale

### Cart Schema: Embedded vs. Referenced Items

**Design Chosen: Embedded subdocuments**

```javascript
{
  _id: ObjectId,
  userId: String,
  items: [
    { sku, name, price, quantity, addedAt }
  ],
  status: String,
  createdAt: Date,
  updatedAt: Date
}
```

**Rationale:**

| Aspect | Embedded | Referenced |
|--------|----------|-----------|
| **Atomic Updates** | ✓ Single document | ✗ Multi-doc transaction |
| **Consistency** | ✓ No orphan items | ✗ Requires cleanup |
| **Query Pattern** | ✓ Get full cart | ✗ Requires join |
| **Document Size** | ~ 50–100KB typical | ✓ Smaller |
| **Update Speed** | ✓ Fast (single write) | ✗ Slower (multiple writes) |
| **Typical Use** | Complete cart access | ? Partial item access |

**For this domain:** Carts are almost always accessed as complete units. Atomicity on mutations is critical. Document size remains manageable (even 1000 items × 100 bytes = 100KB).

### Item Schema Fields

```javascript
{
  sku: String,        // Product identifier (normalized to uppercase)
  name: String,       // Display name (allows price to update)
  price: Number,      // Unit price (mutable: allows promotions)
  quantity: Number,   // Count (mutable: update endpoint)
  addedAt: Date       // Timestamp for audit trail
}
```

**Design decisions:**

- **No Product Reference:** Sku + name + price form a denormalized product snapshot
  - Rationale: Product data changes independently; cart should preserve historical state
  - Example: Product price drops from $30→$20; old cart items keep original $30
  - Immutability aids auditability

- **Price Mutable:** PATCH endpoint allows price updates
  - Rationale: Enables discounts/adjustments before checkout
  - Alternative (rejected): Create discount field (more complex)

- **addedAt Immutable:** Cannot be changed after initial insertion
  - Rationale: Audit trail integrity

### TTL Index for Expiration

```javascript
{
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    index: { expires: 0 }  // TTL index
  }
}
```

**Why TTL?**

1. **No maintenance task required:** MongoDB daemon automatically deletes expired documents
2. **Cost-effective:** No background job to maintain
3. **Consistent:** Documents deleted atomically
4. **Configurable:** 24-hour window defined in schema

**Alternative (rejected):**
- Cleanup service: Added operational complexity, race conditions possible

### Unique Compound Index for Single Active Cart

```javascript
// Cart model
cartSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    name: 'unique_active_cart_per_user',
    partialFilterExpression: { status: 'active' }
  }
);
```

**Why compound index?**

1. **Partition by userId:** Multiple users can have carts simultaneously
2. **Filter by status:** Only "active" carts are constrained; deleted/checked_out allowed
3. **Database enforcement:** Cannot rely on application logic; race conditions possible

**Why partial index?**

```
Without: Duplicate key error when trying to restore second deleted cart
With:    Deleted carts exempt from uniqueness; only active carts constrained
```

**Example:**

```
User_1 has cart_A (active) ← Covered by unique index
User_1 deletes cart_A → cart_A.status = 'deleted' ← Removed from constraint
User_1 creates new cart_B (active) ← OK, constraint satisfied
User_1 wants to restore cart_A → Allowed, can have multiple deleted carts
```

### AuditLog Schema: Write-Once Collection

```javascript
{
  userId: String,
  cartId: ObjectId,
  action: String,  // Enum: ITEM_ADDED, ITEM_UPDATED, ...
  snapshot: Mixed, // Flexible: item, array, or object
  timestamp: Date
}
```

**Immutability by design:**

- No update operations allowed (application enforces)
- Only insert operations
- Enables compliance (cannot alter audit trail retroactively)
- Supports analytics (sequence of events is authoritative)

**Index strategy:**

```javascript
// Query 1: "Show all actions by user_123 in timeline"
{ userId: 1, timestamp: -1 }

// Query 2: "Reconstruct cart_A history"
{ cartId: 1, timestamp: 1 }
```

---

## Promotional Engine Design

### Config-Driven Tiers

**File: `src/config/promoConfig.js`**

```javascript
module.exports = {
  tiers: [
    { id: 'bronze', minCartValue: 0, maxCartValue: 499, discountPercent: 0 },
    { id: 'silver', minCartValue: 500, maxCartValue: 999, discountPercent: 5 },
    // ...
  ],
  diversityBonus: { minUniqueSkus: 5, extraDiscountPercent: 3 }
};
```

**Rationale:**

1. **Separation:** Promotions are business rules, not code
2. **A/B Testing:** Change tiers without deployment
3. **Audit Trail:** Version control tracks business changes
4. **Testability:** Mock promoConfig in unit tests

### Additive Discount Application

**Formula:**

```
total_discount = (subtotal × tier_discount%) + (subtotal × bonus_discount%)
final_total = subtotal - total_discount
```

**Why additive (not multiplicative)?**

| Aspect | Additive | Multiplicative |
|--------|----------|---|
| **Math** | 5% + 3% = 8% | (1 - 0.05) × (1 - 0.03) = 7.85% |
| **Transparency** | Easy to explain | Confusing to customers |
| **Debugging** | Straightforward | Compound rounding errors |
| **Predictability** | Deterministic | Sensitive to application order |
| **Audibility** | Clear breakdown | Hidden interaction |

**Example:**

```
Cart: $1000
Tier: Gold (10%)
Diversity: 5+ SKUs → +3%

Additive:  $1000 × (0.10 + 0.03) = $130 discount → $870 final
Multiplicative: $1000 × (1-0.05) × (1-0.03) = $918 final (different!)
```

Additive is more transparent and customer-friendly.

### Pure Functions for Testability

```javascript
// cart.service.js: Composition of pure functions
const summary = {
  subtotal: calculateSubtotal(items),
  tier: findApplicableTier(subtotal),
  bonus: checkDiversityBonus(items),
  discount: calculateTotalDiscount(subtotal, tier%, bonus%)
};
```

**Advantage:** Each function can be tested independently:

```javascript
// Test: Tier boundaries
expect(findApplicableTier(499)).toBe('bronze');
expect(findApplicableTier(500)).toBe('silver');

// Test: Diversity bonus
expect(checkDiversityBonus([{sku:'A'}, {sku:'B'}, {sku:'C'}, {sku:'D'}]).applied).toBe(false);
expect(checkDiversityBonus([...5 items...]).applied).toBe(true);

// Test: Discount calculation
expect(calculateTotalDiscount(1000, 10, 3)).toBe(130);
```

---

## Validation Strategy

### Middleware Layer Validation

**Location:** Joi schemas in `src/validators/`, applied in route middleware

**Flow:**

```
Request arrives
    ↓
Middleware: validate(schema) checks body/params/query
    ↓
[Pass] → Controller → Service → Model
    ↓
[Fail] → Return 400 with structured errors
```

**Rationale:**

1. **Early rejection:** Invalid requests rejected before business logic
2. **Consistent errors:** All endpoints return same format
3. **Centralized:** Single source of truth for each endpoint's schema
4. **Reusable:** Schemas defined once, applied consistently

### Joi Schema Design

```javascript
const addItem = {
  body: Joi.object({
    userId: Joi.string().required().min(1).max(255),
    sku: Joi.string().required().alphanum().uppercase(),
    price: Joi.number().required().positive().precision(2),
    quantity: Joi.number().required().integer().min(1).max(1000)
  }).strict() // Reject unknown fields
};
```

**Key constraints:**

- **Strict mode:** `{ strict() }` rejects extra fields (prevents API misuse)
- **Type coercion:** Limited (no implicit `"123" → 123`)
- **Range limits:** quantity max 1000 (prevent abuse)
- **Format validation:** alphanum, uppercase on sku (normalize data)

### Secondary Validation in Services

```javascript
// Example: Service layer double-checks despite middleware validation
if (price < 0 || !Number.isFinite(price)) {
  throw new AppError('Invalid price', 400);
}
```

**Rationale:** Defense in depth. Middleware validates HTTP format; service validates business rules.

---

## Error Handling Architecture

### AppError Class

```javascript
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}
```

**Benefits:**

1. **Explicit status codes:** Services throw AppError(msg, 400) or AppError(msg, 404)
2. **Handler knows type:** Error handler distinguishes operational vs. programming errors
3. **Structured responses:** All errors formatted consistently
4. **Safe:** Stack traces only in development

### Error Handler Middleware

```javascript
app.use((err, req, res, next) => {
  // Convert Mongoose errors to AppError
  if (err.name === 'ValidationError') {
    // Extract all validation messages
    const details = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ error: 'VALIDATION_ERROR', details });
  }

  // Return consistent response
  res.status(err.statusCode || 500).json({
    status: err.statusCode || 500,
    error: err.statusCode < 500 ? 'CLIENT_ERROR' : 'SERVER_ERROR',
    message: err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});
```

**Principles:**

1. **Last middleware:** Registered after all routes/handlers
2. **Catch-all:** Handles uncaught errors from async handlers
3. **Transform:** Converts Mongoose/validation errors to standard format
4. **Sanitize:** No stack traces in production
5. **Log:** Console logs for debugging/monitoring

---

## Feature X: Soft Delete + Audit Trail

### Why Soft Delete in Production?

**Problem:** Hard delete (`.deleteOne()`) loses data and audit trail

**Solution:** Soft delete with status field

```javascript
cart.status = 'deleted';
cart.deleted_at = new Date();
await cart.save();  // Document persists, marked as deleted
```

**Enables:**

1. **Recovery:** Restore endpoint can reactivate within 24-hour window
2. **Compliance:** Full audit trail for regulatory requirements
3. **Analytics:** Understand why users abandon carts
4. **Support:** Customer service can manually restore without database access
5. **Debugging:** Trace full lifecycle of cart through logs

### Audit Trail Implementation

**Every mutation creates a log entry:**

```javascript
await logAuditAction(userId, cartId, 'ITEM_ADDED', {
  sku: 'PROD001',
  name: 'Widget',
  price: 29.99,
  quantity: 2
});
```

**Snapshot contains:**
- For ITEM_ADDED/REMOVED: full item data
- For ITEM_UPDATED: before/after states
- For CART_CHECKED_OUT: items count + array snapshot
- For CART_CLEARED: items count + snapshot

**Queries enabled:**

```javascript
// "What happened to user_123's cart?"
AuditLog.find({ userId: 'user_123' }).sort({ timestamp: -1 })

// "Reconstruct cart_A at any point in time"
AuditLog.find({ cartId: '...' }).sort({ timestamp: 1 })

// "Find all items user_123 has added (sales intelligence)"
AuditLog.find({ userId: 'user_123', action: 'ITEM_ADDED' })
```

### Recovery Workflow

**User accidentally clears cart:**

```javascript
DELETE /api/cart → cart.status = 'deleted'

// Later...
PATCH /api/cart/restore/:userId
  ↓
Find most recent deleted cart (ordered by deleted_at desc)
  ↓
Check TTL hasn't expired (expiresAt > now)
  ↓
Restore: status = 'active', deleted_at = null, extend expiresAt
  ↓
Log: CART_RESTORED audit entry
```

---

## Edge Cases Considered

### 1. Empty Cart Checkout

**Scenario:** User calls `POST /api/checkout/confirm` with no items

**Handling:**
```javascript
if (!cart.items || cart.items.length === 0) {
  throw new AppError('Cannot checkout: cart is empty', 400);
}
```

**Response (400):** Clear error message

### 2. Duplicate SKU on Add

**Scenario:** User adds PROD001 twice (race condition safe)

**Handling:**
```javascript
const existingItemIndex = cart.items.findIndex(item => item.sku === sku);
if (existingItemIndex !== -1) {
  // Increment quantity, update price
  cart.items[existingItemIndex].quantity += quantity;
  cart.items[existingItemIndex].price = price;
}
```

**Idempotent:** Safe to retry requests

### 3. Zero Quantity Update

**Scenario:** User tries to set quantity to 0

**Validation:**
```javascript
quantity: Joi.number().integer().min(1).max(1000)
```

**Response (400):** Validation error. Delete endpoint for removal.

### 4. Price = $0

**Scenario:** Free item or promotional discount

**Validation:**
```javascript
price: Joi.number().positive() // >= 0.01
```

**Actually:** Current schema requires positive (> 0). Adjust if free items needed:
```javascript
price: Joi.number().min(0) // >= 0
```

### 5. Concurrent Requests to Same Cart

**Scenario:** Multiple requests modify cart simultaneously

**Handling:**
- Mongoose `findOneAndUpdate` with `upsert: true` is atomic
- Array modifications use `markModified()` to signal Mongoose of nested changes
- On race condition (duplicate key), single retry with idempotent check

**Example:**
```javascript
try {
  cart.save();
} catch (error) {
  if (error.code === 11000) {
    // Duplicate active cart created by another request; retry once
    const retryCart = await Cart.findOne({ userId, status: 'active' });
    if (retryCart) return retryCart;
  }
  throw error;
}
```

### 6. Expired Cart Recovery Attempt

**Scenario:** User tries to restore a cart after 24-hour TTL

**Handling:**
```javascript
if (new Date() > deletedCart.expiresAt) {
  throw new AppError('Deleted cart has expired and cannot be restored', 410);
}
```

**Response (410 Gone):** Standard HTTP status for permanently lost resource

### 7. Item Not Found on Update/Remove

**Scenario:** Delete non-existent SKU from cart

**Handling:**
```javascript
const itemIndex = cart.items.findIndex(item => item.sku === sku);
if (itemIndex === -1) {
  throw new AppError(`Item with SKU ${sku} not found in cart`, 404);
}
```

**Response (404):** Idempotent delete would return 200/204; here we're strict

### 8. Database Connection Failure

**Scenario:** MongoDB unavailable

**Handling:**
- Connection fails at startup → `process.exit(1)` (container restarts)
- Connection drops after startup → Mongoose automatically reconnects
- Request during reconnect → Service throws 500, handler returns structured error

**Health check:** `/health` endpoint for orchestration awareness

### 9. Invalid ObjectId Format

**Scenario:** Client passes invalid cart ID to restore

**Handling:**
```javascript
// Mongoose CastError automatically caught and converted
if (err.name === 'CastError') {
  statusCode = 400;
  message = 'Invalid ID format';
}
```

### 10. Promotion Tier Boundary Precision

**Scenario:** Cart value exactly at boundary ($500)

**Handling:**
```javascript
const tier = promoConfig.tiers.find(
  t => subtotal >= t.minCartValue && subtotal < t.maxCartValue
);
```

**Logic:**
- $499.99 → Bronze (0%)
- $500.00 → Silver (5%)
- Boundary is inclusive on lower, exclusive on upper

---

## Transaction & Atomicity

### Checkout Confirm Uses MongoDB Transaction

```javascript
const session = await mongoose.startSession();
session.startTransaction();

try {
  // Update cart status
  const updatedCart = await Cart.findOneAndUpdate(
    { userId, status: 'active' },
    { status: 'checked_out' },
    { session }
  );

  // Create audit log (within same transaction)
  await AuditLog.create([{ ...logEntry }], { session });

  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
}
```

**Ensures:**
- Cart and audit log are created or both fail (consistency)
- No orphaned audit entries
- No invalid cart state

**Why not for item operations?**
- Item mutations are embedded document changes (single document, inherently atomic)
- No need for multi-document transactions
- Performance: Avoid transaction overhead

---

## Rate Limiting Strategy

### Global Limit: 100 per 15 minutes

```javascript
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.ip // Per-IP by default
});
```

**Rationale:**
- 100 requests in 15 min = ~6-7 req/sec average
- Covers typical shopping workflows (browse, add items, checkout)
- Prevents accidental DoS from misbehaving clients

### Stricter Limit on Checkout: 10 per hour

```javascript
const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
});
```

**Rationale:**
- Checkout is high-value operation (payment processing downstream)
- 10 per hour = less than 1 per 6 minutes (normal user never hits this)
- Prevents checkout spam and payment processor overload

---

## Logging Strategy

### Development vs. Production

**Development:**
```
GET /api/cart/user_123 200 5.234 ms - 1240
POST /api/cart/items 201 8.112 ms - 892
```
Format: "dev" (concise, colored)

**Production:**
```
127.0.0.1 - - [20/Jun/2026:11:00:00 +0000] "GET /api/cart/user_123 HTTP/1.1" 200 1240
```
Format: "combined" (Apache standard, suitable for log aggregators)

### No console.log in Hot Paths

```javascript
// ✗ Avoid in production code
console.log('Cart items:', cart.items);

// ✓ Use structured logger if needed
logger.debug('Cart retrieved', { cartId: cart._id, itemCount: items.length });

// ✓ Error handling is logged by middleware
throw new AppError('Invalid request', 400);
```

**Rationale:**
- Uncontrolled console output breaks log parsing
- Error handler captures and formats errors consistently

---

## Scaling Considerations

### Database Scaling

**Read scaling:**
- Indexes on { userId, status }, { userId, timestamp } enable fast queries
- Read replicas can serve analytics queries

**Write scaling:**
- Embedded items avoid distributed transactions
- Audit log can be archived to separate collection (time-series DB pattern)

**Sharding:**
- Shard by userId for horizontal scale
- Cart documents naturally partition by user

### API Scaling

**Statelessness:** Each server instance is identical
- No session affinity needed
- Load balancer can route requests anywhere
- Horizontally scalable

**Rate limiting:**
- Currently per-IP (single server view)
- For distributed deployment: Use Redis-backed rate limiter (express-rate-limit adapter)

---

## Security Considerations

### Input Validation

- **Type checking:** Joi ensures types before reaching services
- **Length limits:** SKU max 50 chars, quantity max 1000
- **Format normalization:** SKU converted to uppercase (prevents case-sensitive dupes)

### Output Safety

- **No sensitive data:** Responses never include payment info, credentials
- **Stack traces hidden:** Only in development
- **Error messages generic:** "Internal Server Error" for 5xx, not implementation details

### Multi-Tenancy Isolation

- **userId validation:** Every request; enforced at HTTP layer
- **Database queries:** Always include userId filter (`{ userId: 'X' }`)
- **No cross-user data leaks:** Each service method takes userId parameter

### Rate Limiting

- **DoS protection:** Global and per-endpoint limits
- **Prevents brute force:** Checkout endpoint limited to 10/hour
- **User-friendly:** Errors include Retry-After header

---

## Testing Strategy

### Unit Tests

**Service layer** (pure functions, mockable):
```javascript
describe('PromoService', () => {
  it('applies tier discount', () => {
    const summary = calculateCheckoutSummary('user1', 'cart1', [
      { sku: 'A', price: 1000, quantity: 1 }
    ]);
    expect(summary.appliedTier.id).toBe('gold');
    expect(summary.totalDiscount).toBe(100);
  });

  it('applies diversity bonus for 5+ skus', () => {
    const items = Array.from({length: 5}, (_, i) => ({
      sku: `SKU${i}`,
      price: 100,
      quantity: 1
    }));
    const summary = calculateCheckoutSummary('user1', 'cart1', items);
    expect(summary.diversityBonus.applied).toBe(true);
  });
});
```

### Integration Tests

**Controllers + Services + Models**:
```javascript
describe('CartController', () => {
  beforeEach(async () => {
    await connectDB();
    await Cart.deleteMany({});
  });

  it('adds item to cart', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .send({
        userId: 'test_user',
        sku: 'PROD001',
        name: 'Widget',
        price: 29.99,
        quantity: 1
      });

    expect(res.status).toBe(201);
    expect(res.body.data.itemCount).toBe(1);
  });
});
```

### Manual Testing

```bash
# Add item
curl -X POST http://localhost:3000/api/cart/items \
  -H "Content-Type: application/json" \
  -d '{"userId":"user1","sku":"PROD001","name":"Widget","price":29.99,"quantity":1}'

# Get checkout summary
curl http://localhost:3000/api/checkout/summary/user1

# Confirm checkout
curl -X POST http://localhost:3000/api/checkout/confirm/user1
```

---

## Deployment Architecture

### Environment Variables

Required at startup (validation enforced):
- `MONGODB_URI` - MongoDB connection string
- `NODE_ENV` - "development" or "production"
- `PORT` - HTTP listening port

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY src ./src
EXPOSE 3000
CMD ["npm", "start"]
```

### Health Check

```yaml
healthCheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s
  timeout: 5s
  retryCount: 3
```

### Graceful Shutdown

Server waits up to 30 seconds for in-flight requests before force-exit:
```javascript
setTimeout(() => {
  console.error('Graceful shutdown timeout - forcing exit');
  process.exit(1);
}, 30000);
```

---

## Future Enhancements

### Potential Improvements

1. **Pagination:** List user's past carts, audit log entries
2. **Coupon codes:** Extend promo system with manual codes
3. **Wishlist:** Separate model for saved items
4. **Concurrency control:** Optimistic locking (version field)
5. **Analytics dashboards:** Query audit logs for user behavior
6. **Payment integration:** Pass checkout summary to payment processor
7. **Cache layer:** Redis for promo config and frequently accessed carts
8. **GraphQL gateway:** Alternative API layer alongside REST

---

## Conclusion

This architecture prioritizes:
- **Clarity:** Explicit layering and separation of concerns
- **Safety:** Validation, error handling, transactions
- **Auditability:** Complete audit trail of all mutations
- **Scalability:** Stateless services, optimized indexes
- **Production-readiness:** Graceful shutdown, health checks, structured logging

Every design decision is documented here to support future maintainers and architectural reviews.
