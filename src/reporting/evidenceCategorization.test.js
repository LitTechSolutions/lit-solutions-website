const test = require("node:test");
const assert = require("node:assert/strict");
const { categorizeCheckResult, addHumanEvidence, assertNoGuaranteeLanguage } = require("./evidenceCategorization");

function checkResult(overrides = {}) {
  return {
    id: "check-1",
    organizationId: "org-a",
    websiteProfileId: "site-1",
    checkType: "performance",
    outcome: "warning",
    checkedAt: "2026-07-01T00:00:00.000Z",
    evidence: { pageWeightBytes: 2400000, hasHttps: true },
    ...overrides,
  };
}

test("automated check results become automated_observation items, never verified_fact", () => {
  const items = categorizeCheckResult(checkResult());
  assert.ok(items.length > 0);
  for (const item of items) {
    assert.equal(item.category, "automated_observation");
  }
});

test("one evidence item per raw evidence field", () => {
  const items = categorizeCheckResult(checkResult({ evidence: { a: 1, b: 2, c: 3 } }));
  assert.equal(items.length, 3);
});

test("addHumanEvidence appends a technician_interpretation item with attribution", () => {
  const items = addHumanEvidence([], "technician_interpretation", "This is likely due to unoptimized images.", "user-tech-1");
  assert.equal(items[0].category, "technician_interpretation");
  assert.equal(items[0].authoredBy, "user-tech-1");
});

test("addHumanEvidence requires an author", () => {
  assert.throws(() => addHumanEvidence([], "recommendation", "Consider compressing images.", ""), /authoredBy is required/);
});

test("addHumanEvidence rejects verified_fact and automated_observation categories (those aren't human-authored)", () => {
  assert.throws(() => addHumanEvidence([], "verified_fact", "x", "user-1"), /category must be/);
  assert.throws(() => addHumanEvidence([], "automated_observation", "x", "user-1"), /category must be/);
});

test("rejects guarantee language: 'guaranteed'", () => {
  assert.throws(() => assertNoGuaranteeLanguage("This guarantees better performance."), /prohibited guarantee language/);
});

test("rejects guarantee language: '100% secure'", () => {
  assert.throws(() => assertNoGuaranteeLanguage("Your site is now 100% secure."));
});

test("rejects guarantee language: 'fully WCAG compliant'", () => {
  assert.throws(() => assertNoGuaranteeLanguage("The site is now fully WCAG compliant."));
});

test("rejects guarantee language: 'certified secure'", () => {
  assert.throws(() => assertNoGuaranteeLanguage("This is certified secure."));
});

test("accepts appropriately hedged language", () => {
  assert.doesNotThrow(() => assertNoGuaranteeLanguage("This appears to meet common accessibility guidelines based on an automated scan."));
});

test("categorizeCheckResult itself also rejects guarantee language if raw evidence contains it", () => {
  assert.throws(() => categorizeCheckResult(checkResult({ evidence: { summary: "guaranteed secure" } })));
});
