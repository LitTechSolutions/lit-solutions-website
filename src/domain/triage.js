// Domain type for F020 (Intelligent Ticket Triage & Service Routing).
// The RULE TABLE (which attribute values route to which queue) is
// business configuration, not hardcoded here -- see
// src/policy/triageEngine.js, which is a rule-table interpreter, not a
// source of invented business rules.

/**
 * @typedef {Object} TriageRule
 * @property {string} id
 * @property {Partial<Pick<import("./ticket").Ticket, "category">>} match - Attribute values this rule matches on. Extend as more matchable ticket attributes exist.
 * @property {string} queue - Destination queue name (business-configured, not enumerated here).
 * @property {number} priority - Rule evaluation order; lower runs first.
 */

/**
 * @typedef {Object} TriageResult
 * @property {string} ticketId
 * @property {string} queue
 * @property {string} matchedRuleId
 * @property {string} decidedAt
 */

/**
 * @param {Partial<TriageRule>} candidate
 * @returns {asserts candidate is TriageRule}
 */
function assertValidTriageRule(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("triageRule: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("triageRule: id is required");
  if (!candidate.match || typeof candidate.match !== "object") throw new Error("triageRule: match is required");
  if (typeof candidate.queue !== "string" || candidate.queue.length === 0) throw new Error("triageRule: queue is required");
  if (typeof candidate.priority !== "number") throw new Error("triageRule: priority (evaluation order) must be a number");
}

module.exports = { assertValidTriageRule };
