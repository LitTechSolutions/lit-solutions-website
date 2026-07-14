// Domain type for F044 (IT Support Request & Remote/On-Site Classification).

/**
 * @typedef {"remote" | "on_site" | "safety_conscious"} HandlingClassification
 */

/**
 * @typedef {Object} ITSupportSignals
 * @property {boolean} requiresPhysicalAccess - e.g. hardware failure, cabling, printer jam.
 * @property {boolean} safetyRisk - e.g. electrical, ladder/height access, or any condition warranting extra care.
 * @property {import("./assignment").TechnicianCandidate[]} [availableTechnicians]
 */

/**
 * @param {Partial<ITSupportSignals>} candidate
 * @returns {asserts candidate is ITSupportSignals}
 */
function assertValidITSupportSignals(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("itSupportSignals: expected an object");
  if (typeof candidate.requiresPhysicalAccess !== "boolean") throw new Error("itSupportSignals: requiresPhysicalAccess must be a boolean");
  if (typeof candidate.safetyRisk !== "boolean") throw new Error("itSupportSignals: safetyRisk must be a boolean");
}

module.exports = { assertValidITSupportSignals };
