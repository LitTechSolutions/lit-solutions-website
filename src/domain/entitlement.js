// Domain type for F049 (Service Plan, Entitlement & Usage Tracking). The
// actual plan limits (how many included edits, hours, etc.) are owner
// decisions (OWNER_DECISIONS.md #3, blocked) -- this type and its
// comparator (src/policy/entitlementCheck.js) work with a `limit` value
// as input, never a hardcoded number.

/**
 * @typedef {Object} EntitlementLimit
 * @property {string} planKey - e.g. "website_care", "small_business_it" -- opaque plan identifier, not a hardcoded enum, since plan names/count are owner-decided.
 * @property {string} usageKey - e.g. "monthly_edits", "included_hours".
 * @property {number} limit - Owner-configured, sourced from F056 settings once plan terms are approved.
 * @property {"monthly" | "total" | "unlimited"} resetPeriod
 */

/**
 * @typedef {Object} UsageRecord
 * @property {string} organizationId
 * @property {string} planKey
 * @property {string} usageKey
 * @property {number} consumed
 * @property {string} periodStart
 */

/**
 * @param {Partial<EntitlementLimit>} candidate
 * @returns {asserts candidate is EntitlementLimit}
 */
function assertValidEntitlementLimit(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("entitlementLimit: expected an object");
  if (typeof candidate.planKey !== "string" || candidate.planKey.length === 0) throw new Error("entitlementLimit: planKey is required");
  if (typeof candidate.usageKey !== "string" || candidate.usageKey.length === 0) throw new Error("entitlementLimit: usageKey is required");
  if (!["monthly", "total", "unlimited"].includes(candidate.resetPeriod)) {
    throw new Error('entitlementLimit: resetPeriod must be "monthly", "total", or "unlimited"');
  }
  if (candidate.resetPeriod !== "unlimited" && (typeof candidate.limit !== "number" || candidate.limit < 0)) {
    throw new Error("entitlementLimit: limit must be a non-negative number unless resetPeriod is unlimited");
  }
}

module.exports = { assertValidEntitlementLimit };
