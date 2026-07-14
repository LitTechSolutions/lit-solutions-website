// Domain type for F021 (Priority, Impact & Urgency Assessment). Actual
// scoring weights are business configuration (src/policy/priorityScoring.js
// takes them as input), not hardcoded -- the specific weightings aren't in
// the Global Requirements or Master Function Index, and the individual
// F021 workbook doesn't exist yet (OWNER_DECISIONS.md #10), so inventing
// numbers here would violate "never invent... response times" etc.

/**
 * @typedef {"low" | "medium" | "high" | "critical"} PriorityLevel
 */

/**
 * @typedef {Object} PriorityInputs
 * @property {number} impact - 0-1, business impact.
 * @property {number} urgency - 0-1, time sensitivity.
 * @property {boolean} safetyConcern
 * @property {boolean} securityConcern
 */

/**
 * @typedef {Object} PriorityAssessment
 * @property {string} ticketId
 * @property {PriorityLevel} level
 * @property {number} score
 * @property {string} decidedAt
 */

const LEVELS = ["low", "medium", "high", "critical"];

/**
 * @param {Partial<PriorityInputs>} candidate
 * @returns {asserts candidate is PriorityInputs}
 */
function assertValidPriorityInputs(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("priorityInputs: expected an object");
  for (const field of ["impact", "urgency"]) {
    const value = candidate[field];
    if (typeof value !== "number" || value < 0 || value > 1) {
      throw new Error(`priorityInputs: ${field} must be a number between 0 and 1`);
    }
  }
  for (const field of ["safetyConcern", "securityConcern"]) {
    if (typeof candidate[field] !== "boolean") {
      throw new Error(`priorityInputs: ${field} must be a boolean`);
    }
  }
}

module.exports = { LEVELS, assertValidPriorityInputs };
