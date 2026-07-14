// Domain type for F050 (Pricing, Discount & Bundle Rules Engine). No
// prices are declared here -- this is the SHAPE of a price sheet, sourced
// from F056 settings once Dylan approves actual base prices, add-ons, and
// discount rules (OWNER_DECISIONS.md #2). Mirrors the shape already
// established (and already approved, by virtue of being live) in
// netlify/functions/website-designer.js's catalog-driven pricing, rather
// than inventing a new structure.

/**
 * @typedef {Object} PriceSheetItem
 * @property {string} key
 * @property {number} basePrice
 */

/**
 * @typedef {Object} DiscountRule
 * @property {string} key
 * @property {"percentage" | "fixed"} type
 * @property {number} amount - Percentage as 0-1, or a fixed dollar amount, per `type`.
 * @property {number} [minItems] - For bundle-style discounts: minimum selected item count to qualify.
 */

/**
 * @typedef {Object} PriceSheet
 * @property {string} id
 * @property {PriceSheetItem[]} items
 * @property {DiscountRule[]} discounts
 * @property {string} effectiveAt
 * @property {number} version
 */

/**
 * @param {Partial<PriceSheet>} candidate
 * @returns {asserts candidate is PriceSheet}
 */
function assertValidPriceSheet(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("priceSheet: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("priceSheet: id is required");
  if (!Array.isArray(candidate.items)) throw new Error("priceSheet: items must be an array");
  for (const item of candidate.items) {
    if (typeof item.key !== "string" || item.key.length === 0) throw new Error("priceSheet: every item needs a key");
    if (typeof item.basePrice !== "number" || item.basePrice < 0) throw new Error(`priceSheet: item "${item.key}" basePrice must be a non-negative number`);
  }
  if (!Array.isArray(candidate.discounts)) throw new Error("priceSheet: discounts must be an array");
  for (const discount of candidate.discounts) {
    if (!["percentage", "fixed"].includes(discount.type)) throw new Error(`priceSheet: discount "${discount.key}" type must be percentage or fixed`);
    if (discount.type === "percentage" && (discount.amount < 0 || discount.amount > 1)) {
      throw new Error(`priceSheet: percentage discount "${discount.key}" amount must be between 0 and 1`);
    }
  }
  if (typeof candidate.version !== "number" || candidate.version < 1) throw new Error("priceSheet: version must be a positive number");
}

module.exports = { assertValidPriceSheet };
