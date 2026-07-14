const test = require("node:test");
const assert = require("node:assert/strict");
const { scorePriority, DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS } = require("./priorityScoring");

test("a safety concern always forces critical, regardless of low impact/urgency", () => {
  const result = scorePriority({ impact: 0.1, urgency: 0.1, safetyConcern: true, securityConcern: false });
  assert.equal(result.level, "critical");
  assert.match(result.reason, /safety concern/);
});

test("a security concern always forces critical, regardless of low impact/urgency", () => {
  const result = scorePriority({ impact: 0.1, urgency: 0.1, safetyConcern: false, securityConcern: true });
  assert.equal(result.level, "critical");
  assert.match(result.reason, /security concern/);
});

test("high impact + high urgency with default weights lands at critical", () => {
  const result = scorePriority({ impact: 1, urgency: 1, safetyConcern: false, securityConcern: false });
  assert.equal(result.level, "critical");
  assert.equal(result.score, 1);
});

test("low impact + low urgency lands at low", () => {
  const result = scorePriority({ impact: 0.1, urgency: 0.1, safetyConcern: false, securityConcern: false });
  assert.equal(result.level, "low");
});

test("weights and thresholds are configurable, not fixed", () => {
  // With urgency weighted to zero, only impact matters.
  const result = scorePriority(
    { impact: 1, urgency: 1, safetyConcern: false, securityConcern: false },
    { weights: { impact: 1, urgency: 0 }, thresholds: DEFAULT_THRESHOLDS }
  );
  assert.equal(result.score, 1);

  const result2 = scorePriority(
    { impact: 0, urgency: 1, safetyConcern: false, securityConcern: false },
    { weights: { impact: 1, urgency: 0 }, thresholds: DEFAULT_THRESHOLDS }
  );
  assert.equal(result2.score, 0);
});

test("default weights sum to 1 (documented as a neutral placeholder, not approved policy)", () => {
  assert.equal(DEFAULT_WEIGHTS.impact + DEFAULT_WEIGHTS.urgency, 1);
});

test("rejects invalid inputs (out-of-range impact/urgency)", () => {
  assert.throws(() => scorePriority({ impact: 1.5, urgency: 0.5, safetyConcern: false, securityConcern: false }));
});

test("rejects missing boolean concern flags", () => {
  assert.throws(() => scorePriority({ impact: 0.5, urgency: 0.5 }));
});
