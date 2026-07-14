const test = require("node:test");
const assert = require("node:assert/strict");
const { computeTotal } = require("./pricingEngine");

function priceSheet(overrides = {}) {
  return {
    id: "sheet-1",
    version: 1,
    effectiveAt: "2026-01-01T00:00:00.000Z",
    items: [
      { key: "starter-page", basePrice: 100 },
      { key: "premium-page", basePrice: 200 },
    ],
    discounts: [],
    ...overrides,
  };
}

test("computes a subtotal from selected items and quantities, no discounts", () => {
  const result = computeTotal(priceSheet(), [{ key: "starter-page", quantity: 2 }]);
  assert.equal(result.subtotal, 200);
  assert.equal(result.total, 200);
  assert.deepEqual(result.appliedDiscounts, []);
});

test("sums multiple distinct selected items", () => {
  const result = computeTotal(priceSheet(), [
    { key: "starter-page", quantity: 1 },
    { key: "premium-page", quantity: 1 },
  ]);
  assert.equal(result.subtotal, 300);
});

test("applies a percentage discount to the subtotal", () => {
  const sheet = priceSheet({ discounts: [{ key: "heroes", type: "percentage", amount: 0.15 }] });
  const result = computeTotal(sheet, [{ key: "premium-page", quantity: 1 }]);
  assert.equal(result.subtotal, 200);
  assert.equal(result.appliedDiscounts[0].amount, 30);
  assert.equal(result.total, 170);
});

test("applies a fixed discount", () => {
  const sheet = priceSheet({ discounts: [{ key: "promo", type: "fixed", amount: 50 }] });
  const result = computeTotal(sheet, [{ key: "premium-page", quantity: 1 }]);
  assert.equal(result.total, 150);
});

test("bundle discount only applies when minItems is met", () => {
  const sheet = priceSheet({ discounts: [{ key: "bundle", type: "percentage", amount: 0.1, minItems: 2 }] });
  const singleItem = computeTotal(sheet, [{ key: "starter-page", quantity: 1 }]);
  const twoItems = computeTotal(sheet, [
    { key: "starter-page", quantity: 1 },
    { key: "premium-page", quantity: 1 },
  ]);
  assert.deepEqual(singleItem.appliedDiscounts, []);
  assert.equal(twoItems.appliedDiscounts.length, 1);
});

test("multiple discounts stack additively", () => {
  const sheet = priceSheet({
    discounts: [
      { key: "heroes", type: "percentage", amount: 0.15 },
      { key: "promo", type: "fixed", amount: 20 },
    ],
  });
  const result = computeTotal(sheet, [{ key: "premium-page", quantity: 1 }]);
  // 200 - 30 (15%) - 20 (fixed) = 150
  assert.equal(result.total, 150);
});

test("total never goes negative even if discounts exceed the subtotal", () => {
  const sheet = priceSheet({ discounts: [{ key: "huge", type: "fixed", amount: 500 }] });
  const result = computeTotal(sheet, [{ key: "starter-page", quantity: 1 }]);
  assert.equal(result.total, 0);
});

test("throws rather than guessing a price for an item not on the sheet", () => {
  assert.throws(() => computeTotal(priceSheet(), [{ key: "not-a-real-item", quantity: 1 }]), /refusing to guess a price/);
});

test("rejects an empty selection", () => {
  assert.throws(() => computeTotal(priceSheet(), []));
});
