/**
 * Promotional Tier Configuration
 * 
 * This is the single source of truth for all tiered promotional campaigns.
 * Keeping promotions externalized (not hardcoded in service logic) allows:
 *  - Runtime configuration without code deployment
 *  - Easy A/B testing of different tier structures
 *  - Clear audit trail for business decisions
 * 
 * Architecture choice: Additive discount application (tier + diversity bonus)
 * rather than multiplicative, as this is more transparent and predictable
 * for customers and easier to debug.
 */

export default {
  tiers: [
    {
      id: 'bronze',
      minCartValue: 0,
      maxCartValue: 499,
      discountPercent: 0,
      label: 'No discount',
      description: 'Base tier - no promotional discount applied'
    },
    {
      id: 'silver',
      minCartValue: 500,
      maxCartValue: 999,
      discountPercent: 5,
      label: '5% off',
      description: 'Spend $500-$999 to unlock 5% discount'
    },
    {
      id: 'gold',
      minCartValue: 1000,
      maxCartValue: 1999,
      discountPercent: 10,
      label: '10% off',
      description: 'Spend $1000-$1999 to unlock 10% discount'
    },
    {
      id: 'platinum',
      minCartValue: 2000,
      maxCartValue: Infinity,
      discountPercent: 15,
      label: '15% off + free shipping',
      description: 'Spend $2000+ to unlock 15% discount and free shipping'
    }
  ],

  /**
   * Diversity bonus: incentivizes purchasing from multiple categories
   * Applies in addition to tier discount (additive model)
   */
  diversityBonus: {
    minUniqueSkus: 5,
    extraDiscountPercent: 3,
    label: '3% diversity bonus',
    description: 'Achieved when cart contains 5+ unique products'
  },

  /**
   * Discount application strategy:
   * ADDITIVE: total_discount = tier_discount + diversity_bonus (if applicable)
   * 
   * This is preferred because:
   * 1. More transparent to customers (easy mental math)
   * 2. Simpler to audit and debug discount calculations
   * 3. Easier to explain in marketing materials
   * 4. Reduces floating-point precision errors from multiplication chains
   */
  discountStrategy: 'ADDITIVE',
};
