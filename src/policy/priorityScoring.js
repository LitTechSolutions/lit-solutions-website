// F021 -- Priority, Impact & Urgency Assessment. Weighted scorer with
// caller-supplied weights/thresholds (config, not hardcoded business
// policy) -- the objective text ("Calculate... priority... from business
// impact, urgency, safety, security, and service entitlement") specifies
// the FACTORS but not the actual weights, so this module implements the
// factor structure and lets the numbers be configured, rather than
// inventing specific weight values as if they were approved policy.
//
// Safety/security-as-override is a direct reading of the objective text
// (safety and security are listed as priority factors, not just
// tiebreakers), not an invented rule -- a safety or security concern
// always forces "critical," regardless of the weighted impact/urgency
// score, since neither of those inputs alone can represent "someone
// could get hurt" or "there's an active security exposure."
//
// Entitlement (the fifth listed factor) is NOT implemented here -- it
// requires F049 (Service Plan, Entitlement & Usage Tracking), which is
// blocked (OWNER_DECISIONS.md #3). Callers should treat this scorer's
// output as provisional until entitlement can be factored in.

const { LEVELS, assertValidPriorityInputs } = require("../domain/priority");

const DEFAULT_WEIGHTS = { impact: 0.5, urgency: 0.5 };
const DEFAULT_THRESHOLDS = { critical: 0.75, high: 0.5, medium: 0.25 };

/**
 * @param {import("../domain/priority").PriorityInputs} inputs
 * @param {{ weights?: { impact: number, urgency: number }, thresholds?: { critical: number, high: number, medium: number } }} [config]
 * @returns {{ level: import("../domain/priority").PriorityLevel, score: number, reason: string }}
 */
function scorePriority(inputs, config = {}) {
  assertValidPriorityInputs(inputs);
  const weights = config.weights || DEFAULT_WEIGHTS;
  const thresholds = config.thresholds || DEFAULT_THRESHOLDS;

  if (inputs.safetyConcern || inputs.securityConcern) {
    return {
      level: "critical",
      score: 1,
      reason: inputs.safetyConcern ? "safety concern forces critical priority" : "security concern forces critical priority",
    };
  }

  const score = inputs.impact * weights.impact + inputs.urgency * weights.urgency;
  const level = score >= thresholds.critical ? "critical" : score >= thresholds.high ? "high" : score >= thresholds.medium ? "medium" : "low";

  return { level, score, reason: `weighted score ${score.toFixed(3)} maps to "${level}"` };
}

module.exports = { scorePriority, DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS, LEVELS };
