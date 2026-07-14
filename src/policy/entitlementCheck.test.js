const test = require("node:test");
const assert = require("node:assert/strict");
const { checkEntitlement } = require("./entitlementCheck");

function limit(overrides = {}) {
  return { planKey: "website_care", usageKey: "monthly_edits", limit: 5, resetPeriod: "monthly", ...overrides };
}

test("within limit when consumed is less than the limit", () => {
  const result = checkEntitlement(limit(), 2);
  assert.equal(result.withinLimit, true);
  assert.equal(result.remaining, 3);
});

test("not within limit when consumed equals the limit", () => {
  const result = checkEntitlement(limit(), 5);
  assert.equal(result.withinLimit, false);
  assert.equal(result.remaining, 0);
});

test("not within limit when consumed exceeds the limit", () => {
  const result = checkEntitlement(limit(), 8);
  assert.equal(result.withinLimit, false);
  assert.equal(result.remaining, 0, "remaining should floor at 0, not go negative");
});

test("unlimited plans are always within limit and report remaining: null", () => {
  const result = checkEntitlement(limit({ resetPeriod: "unlimited", limit: undefined }), 999999);
  assert.equal(result.withinLimit, true);
  assert.equal(result.remaining, null);
});

test("the limit value is caller-supplied, not hardcoded -- two different limits produce different results for the same usage", () => {
  const strict = checkEntitlement(limit({ limit: 1 }), 1);
  const generous = checkEntitlement(limit({ limit: 100 }), 1);
  assert.equal(strict.withinLimit, false);
  assert.equal(generous.withinLimit, true);
});

test("rejects a negative consumed value", () => {
  assert.throws(() => checkEntitlement(limit(), -1));
});

test("rejects an invalid limit record", () => {
  assert.throws(() => checkEntitlement({ planKey: "x" }, 1));
});
