// Shared domain type for F035 (Website Health Monitoring), F036 (Uptime &
// Incident Alerting), F038 (Contact Form Test), F039 (Broken Link Scan),
// and F040 (Performance & Accessibility Snapshot) -- all five are
// "run a check, record a customer-safe result" per their objectives, so
// they share one result shape rather than five near-identical ones. The
// actual check-execution logic (fetching a URL, parsing a DOM, SSRF
// protection) is NOT implemented here -- per the Session 0 discovery, the
// existing `website-audit` spec already designed that engine in detail
// (including SSRF protections) for a closely related use case, and it
// should be adapted/reused rather than re-implemented from scratch. This
// module is the result shape and evidence categorization those checks
// should report into.

/**
 * @typedef {"contact_form" | "broken_links" | "performance" | "accessibility" | "uptime"} WebsiteCheckType
 */

/**
 * @typedef {"pass" | "warning" | "fail"} WebsiteCheckOutcome
 */

/**
 * @typedef {Object} WebsiteCheckResult
 * @property {string} id
 * @property {string} organizationId
 * @property {string} websiteProfileId
 * @property {WebsiteCheckType} checkType
 * @property {WebsiteCheckOutcome} outcome
 * @property {string} checkedAt
 * @property {Record<string, string | number | boolean>} evidence - Raw automated findings, e.g. { pageWeightBytes: 2400000, hasHttps: true }.
 */

const CHECK_TYPES = ["contact_form", "broken_links", "performance", "accessibility", "uptime"];
const OUTCOMES = ["pass", "warning", "fail"];

/**
 * @param {Partial<WebsiteCheckResult>} candidate
 * @returns {asserts candidate is WebsiteCheckResult}
 */
function assertValidWebsiteCheckResult(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("websiteCheckResult: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("websiteCheckResult: id is required");
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("websiteCheckResult: organizationId is required");
  }
  if (typeof candidate.websiteProfileId !== "string" || candidate.websiteProfileId.length === 0) {
    throw new Error("websiteCheckResult: websiteProfileId is required");
  }
  if (!CHECK_TYPES.includes(candidate.checkType)) throw new Error(`websiteCheckResult: checkType must be one of ${CHECK_TYPES.join(", ")}`);
  if (!OUTCOMES.includes(candidate.outcome)) throw new Error(`websiteCheckResult: outcome must be one of ${OUTCOMES.join(", ")}`);
  if (typeof candidate.checkedAt !== "string") throw new Error("websiteCheckResult: checkedAt is required");
}

module.exports = { CHECK_TYPES, OUTCOMES, assertValidWebsiteCheckResult };
