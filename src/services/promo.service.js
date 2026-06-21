/**
 * Promo Service
 * 
 * Tiered promotional discount engine. Calculates applicable discounts
 * based on cart value and product diversity.
 * 
 * Architecture:
 * - Config-driven: All tier definitions in promoConfig.js (not hardcoded)
 * - Functional: Pure functions for testability and reasoning about discount logic
 * - Composable: Tier lookup, bonus calculation, and final sum are separate steps
 * - Transparent: Returns detailed breakdown of all applied discounts
 * 
 * Discount Strategy: ADDITIVE
 * ├─ Tier discount: flat percentage based on subtotal range
 * └─ Diversity bonus: additional flat percentage if 5+ unique SKUs
 * Result: total_discount = (subtotal × tier%) + (subtotal × bonus%)
 * 
 * Rationale for additive:
 * 1. Simpler math (no floating-point precision issues from multiplied percentages)
 * 2. More transparent to customers (easier to explain)
 * 3. Easier to debug and audit
 * 4. Business visibility (can see tier vs bonus contribution separately)
 */

import promoConfig from '../config/promoConfig.js';
import errorHandlerModule from '../middleware/errorHandler.js';
const { AppError  } = errorHandlerModule;

/**
 * Calculates subtotal from cart items
 * 
 * @param {Array} items - Array of cart items with price and quantity
 * @returns {number} subtotal in cents (or dollars, depending on precision)
 */
const calculateSubtotal = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }

  return items.reduce((sum, item) => {
    // Ensure price and quantity are valid numbers
    const price = Number(item.price) || 0;
    const quantity = Number(item.quantity) || 0;
    return sum + price * quantity;
  }, 0);
};

/**
 * Finds the applicable tier based on cart value
 * 
 * @param {number} subtotal
 * @returns {object} tier object with id, label, discountPercent
 */
const findApplicableTier = (subtotal) => {
  const tier = promoConfig.tiers.find(
    t => subtotal >= t.minCartValue && subtotal < t.maxCartValue
  );

  if (!tier) {
    throw new AppError(
      'No promotional tier found for cart value. This should not happen.',
      500
    );
  }

  return {
    id: tier.id,
    label: tier.label,
    discountPercent: tier.discountPercent,
  };
};

/**
 * Checks if diversity bonus applies (5+ unique SKUs)
 * 
 * @param {Array} items - Cart items
 * @returns {object} bonus object with applied boolean and extraDiscountPercent
 */
const checkDiversityBonus = (items) => {
  const uniqueSkuCount = new Set(items.map(item => item.sku)).size;
  const applied = uniqueSkuCount >= promoConfig.diversityBonus.minUniqueSkus;

  return {
    applied,
    extraDiscountPercent: applied ? promoConfig.diversityBonus.extraDiscountPercent : 0,
    uniqueSkuCount, // Include for transparency in response
  };
};

/**
 * Calculates total discount amount
 * Uses ADDITIVE strategy: tier_discount + bonus_discount
 * 
 * @param {number} subtotal
 * @param {number} tierDiscountPercent
 * @param {number} bonusDiscountPercent
 * @returns {number} total discount in same units as subtotal
 */
const calculateTotalDiscount = (subtotal, tierDiscountPercent, bonusDiscountPercent) => {
  const totalDiscountPercent = tierDiscountPercent + bonusDiscountPercent;
  return (subtotal * totalDiscountPercent) / 100;
};

/**
 * Main checkout summary calculation
 * Orchestrates tier lookup, bonus check, and discount computation
 * 
 * @param {string} userId
 * @param {string} cartId
 * @param {Array} items - Cart items
 * @returns {object} detailed checkout summary
 */
const calculateCheckoutSummary = (userId, cartId, items) => {
  // Step 1: Calculate subtotal
  const subtotal = calculateSubtotal(items);

  // Step 2: Find applicable tier
  const appliedTier = findApplicableTier(subtotal);

  // Step 3: Check diversity bonus
  const diversityBonus = checkDiversityBonus(items);

  // Step 4: Calculate total discount
  const totalDiscount = calculateTotalDiscount(
    subtotal,
    appliedTier.discountPercent,
    diversityBonus.extraDiscountPercent
  );

  // Step 5: Calculate final total
  const total = subtotal - totalDiscount;

  // Return comprehensive breakdown
  return {
    userId,
    cartId,
    items,
    subtotal: parseFloat(subtotal.toFixed(2)),
    appliedTier,
    diversityBonus: {
      applied: diversityBonus.applied,
      extraDiscountPercent: diversityBonus.extraDiscountPercent,
    },
    totalDiscount: parseFloat(totalDiscount.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
    breakdown: buildBreakdownDescription(appliedTier, diversityBonus),
  };
};

/**
 * Builds human-readable discount breakdown
 * 
 * @param {object} tier
 * @param {object} bonus
 * @returns {string} description of applied discounts
 */
const buildBreakdownDescription = (tier, bonus) => {
  let description = `${tier.discountPercent}% tier discount applied`;

  if (bonus.applied) {
    description += ` + ${promoConfig.diversityBonus.extraDiscountPercent}% diversity bonus applied additively`;
  }

  return description;
};

export default {
  calculateCheckoutSummary,
  calculateSubtotal,
  findApplicableTier,
  checkDiversityBonus,
  calculateTotalDiscount,
};
