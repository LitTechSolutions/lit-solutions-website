// F050 -- Pricing, Discount & Bundle Rules Engine. Computes a total from
// a caller-supplied PriceSheet (src/domain/priceSheet.js) -- no prices or
// discount percentages are declared in this file. Mirrors the additive
// subtotal-then-discounts pattern already live and working in
// netlify/functions/website-designer.js's `recomputeEstimate()`, rather
// than inventing a new calculation shape, so F050 can eventually become
// the one authoritative version of that logic (master instruction §9.3 --
// centralize prices/discounts, don't duplicate them) instead of a third,
// inconsistent implementation.

const { assertValidPriceSheet } = require("../domain/priceSheet");

/**
 * @typedef {Object} SelectionItem
 * @property {string} key
 * @property {number} quantity
 */

/**
 * @typedef {Object} AppliedDiscount
 * @property {string} key
 * @property {number} amount
 */

/**
 * @typedef {Object} PriceComputation
 * @property {number} subtotal
 * @property {AppliedDiscount[]} appliedDiscounts
 * @property {number} total
 */

/**
 * @param {import("../domain/priceSheet").PriceSheet} priceSheet
 * @param {SelectionItem[]} selection
 * @returns {PriceComputation}
 */
function computeTotal(priceSheet, selection) {
  assertValidPriceSheet(priceSheet);
  if (!Array.isArray(selection) || selection.length === 0) {
    throw new Error("computeTotal: selection must be a non-empty array");
  }

  const itemsByKey = new Map(priceSheet.items.map((item) => [item.key, item]));

  let subtotal = 0;
  for (const selected of selection) {
    const item = itemsByKey.get(selected.key);
    if (!item) {
      throw new Error(`computeTotal: no price sheet entry for "${selected.key}" -- refusing to guess a price`);
    }
    if (typeof selected.quantity !== "number" || selected.quantity <= 0) {
      throw new Error(`computeTotal: quantity for "${selected.key}" must be a positive number`);
    }
    subtotal += item.basePrice * selected.quantity;
  }

  const appliedDiscounts = [];
  let runningTotal = subtotal;

  for (const discount of priceSheet.discounts) {
    if (typeof discount.minItems === "number" && selection.length < discount.minItems) {
      continue; // bundle-style discount not qualified for -- selection too small
    }
    const amount = discount.type === "percentage" ? subtotal * discount.amount : discount.amount;
    appliedDiscounts.push({ key: discount.key, amount });
    runningTotal -= amount;
  }

  return { subtotal, appliedDiscounts, total: Math.max(runningTotal, 0) };
}

module.exports = { computeTotal };
