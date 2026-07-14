const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyHandling } = require("./itSupportClassification");

test("no physical access and no safety risk classifies as remote", () => {
  const result = classifyHandling({ requiresPhysicalAccess: false, safetyRisk: false });
  assert.equal(result.classification, "remote");
});

test("physical access required, no safety risk classifies as on_site", () => {
  const result = classifyHandling({ requiresPhysicalAccess: true, safetyRisk: false });
  assert.equal(result.classification, "on_site");
});

test("safety risk always classifies as safety_conscious, even without physical access", () => {
  const result = classifyHandling({ requiresPhysicalAccess: false, safetyRisk: true });
  assert.equal(result.classification, "safety_conscious");
});

test("safety risk overrides physical-access classification", () => {
  const result = classifyHandling({ requiresPhysicalAccess: true, safetyRisk: true });
  assert.equal(result.classification, "safety_conscious");
  assert.match(result.reason, /always routes/);
});

test("rejects invalid signals", () => {
  assert.throws(() => classifyHandling({ requiresPhysicalAccess: "yes", safetyRisk: false }));
});
