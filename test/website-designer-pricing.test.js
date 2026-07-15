// Covers the pricing/discount math in netlify/functions/website-designer.js
// (F016) -- real money depends on recomputeEstimate/priceMismatchFlag being
// correct, and there were previously zero automated tests anywhere in this
// repository.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { recomputeEstimate, priceMismatchFlag } = require("../netlify/functions/website-designer");
const STARTER_CATALOG = require("../starter-catalog.json");
const BUSINESS_CATALOG = require("../business-catalog.json");

function findItem(catalog, title) {
  for (const cat of catalog.categories) {
    const item = cat.items.find((i) => i.title === title);
    if (item) return { ...item, category: cat.category };
  }
  throw new Error(`fixture item not found: ${title}`);
}

test("recomputeEstimate: base price alone matches the catalog, no selections", () => {
  const starter = recomputeEstimate("starter", [], [], false);
  assert.equal(starter.subtotal, STARTER_CATALOG.base_price);
  assert.equal(starter.total, STARTER_CATALOG.base_price);
  assert.equal(starter.bundleSavings, 0);

  const business = recomputeEstimate("business", [], [], false);
  assert.equal(business.subtotal, BUSINESS_CATALOG.base_price);
  assert.equal(business.total, BUSINESS_CATALOG.base_price);
});

test("recomputeEstimate: optional selections add their price on top of base", () => {
  const cat = STARTER_CATALOG.categories.find((c) => c.items.some((i) => i.priority === "C"));
  const item = cat.items.find((i) => i.priority === "C");
  const result = recomputeEstimate("starter", [{ title: item.title, price: item.price }], [], false);
  assert.equal(result.subtotal, STARTER_CATALOG.base_price + item.price);
});

test("recomputeEstimate: Heroes Discount takes 15% off the full subtotal", () => {
  const withoutDiscount = recomputeEstimate("starter", [], [], false);
  const withDiscount = recomputeEstimate("starter", [], [], true);
  assert.equal(withDiscount.total, Math.round(withoutDiscount.subtotal * 0.85));
});

test("recomputeEstimate: bundle discount only applies when every priority-C item in a category is selected", () => {
  const cat = STARTER_CATALOG.categories.find(
    (c) => c.items.filter((i) => i.priority === "C").length >= 2
  );
  const cItems = cat.items.filter((i) => i.priority === "C");
  const catSubtotal = cItems.reduce((sum, i) => sum + i.price, 0);

  const allSelected = cItems.map((i) => ({ title: i.title, price: i.price }));
  const full = recomputeEstimate("starter", allSelected, [cat.category], false);
  assert.equal(full.bundleSavings, Math.round(catSubtotal * 0.1));

  const partiallySelected = allSelected.slice(0, -1);
  const partial = recomputeEstimate("starter", partiallySelected, [cat.category], false);
  assert.equal(partial.bundleSavings, 0, "bundle savings must not apply when the category isn't fully selected");
});

test("recomputeEstimate: priority-S (custom-quote) items are never summed into the total", () => {
  const cat = STARTER_CATALOG.categories.find((c) => c.items.some((i) => i.priority === "S"));
  const sItem = cat.items.find((i) => i.priority === "S");
  const withoutS = recomputeEstimate("starter", [], [], false);
  const withS = recomputeEstimate("starter", [{ title: sItem.title, price: sItem.price }], [], false);
  assert.equal(withS.subtotal, withoutS.subtotal, "an item not tagged priority C must not affect the subtotal");
});

test("priceMismatchFlag: returns no flag when the client's numbers match the recompute", () => {
  const expected = recomputeEstimate("starter", [], [], false);
  const flag = priceMismatchFlag("starter", {
    optionalSelected: [], bundledCategories: [], heroesDiscount: false,
    subtotal: expected.subtotal, bundleSavings: expected.bundleSavings, estimateTotal: expected.total,
  });
  assert.deepEqual(flag, {});
});

test("priceMismatchFlag: flags a client total that doesn't match an independent recompute", () => {
  const expected = recomputeEstimate("starter", [], [], false);
  const flag = priceMismatchFlag("starter", {
    optionalSelected: [], bundledCategories: [], heroesDiscount: false,
    subtotal: expected.subtotal, bundleSavings: expected.bundleSavings,
    estimateTotal: expected.total + 500, // customer/JS bug claims $500 more than it should
  });
  assert.equal(flag.priceMismatch, true);
  assert.equal(flag.expectedEstimateTotal, expected.total);
});

test("priceMismatchFlag: small rounding drift within tolerance is not flagged", () => {
  const expected = recomputeEstimate("business", [], [], true);
  const flag = priceMismatchFlag("business", {
    optionalSelected: [], bundledCategories: [], heroesDiscount: true,
    subtotal: expected.subtotal, bundleSavings: expected.bundleSavings,
    estimateTotal: expected.total + 1, // $1 float/rounding slack, under PRICE_MISMATCH_TOLERANCE
  });
  assert.deepEqual(flag, {});
});
