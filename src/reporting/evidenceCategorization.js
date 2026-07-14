// F040 (Performance & Accessibility Snapshot) / F042 (Monthly Website
// Care Report) -- shared evidence-categorization engine implementing a
// specific, explicit Global Requirements rule (Website Care session
// scope, master instruction §13 Session 6): "Every customer report must
// distinguish: Verified fact, Automated observation, Technician
// interpretation, Recommendation, Customer action," and must never claim
// "Guaranteed uptime, Guaranteed security, Full WCAG compliance from
// automated tools, Guaranteed SEO results, Guaranteed email delivery."
//
// This is a structural implementation of an explicit requirement, not an
// invented one -- automated check results can only ever become
// "automated_observation" items (never "verified_fact," since an
// automated tool cannot itself verify/guarantee anything); the other
// three categories require a human author, matching the master
// instruction's "AI cannot... approve... publish" boundary even though
// this module has nothing to do with AI specifically -- the same
// human-attribution discipline applies to any generated content.

/**
 * @typedef {"verified_fact" | "automated_observation" | "technician_interpretation" | "recommendation" | "customer_action"} EvidenceCategory
 */

/**
 * @typedef {Object} EvidenceItem
 * @property {EvidenceCategory} category
 * @property {string} text
 * @property {string} [authoredBy] - Required for technician_interpretation/recommendation/customer_action; absent for automated_observation.
 */

const FORBIDDEN_GUARANTEE_PATTERNS = [
  /\bguarantee(d|s)?\b/i,
  /\b100%\s*(secure|uptime|compliant|accessible)\b/i,
  /\bfully\s+(wcag[\s-]?compliant|accessible)\b/i,
  /\bcertified\s+(secure|compliant)\b/i,
];

/**
 * @param {string} text
 * @returns {asserts text is string}
 */
function assertNoGuaranteeLanguage(text) {
  const match = FORBIDDEN_GUARANTEE_PATTERNS.find((pattern) => pattern.test(text));
  if (match) {
    throw new Error(`evidenceItem: text contains prohibited guarantee language ("${text}") -- see Global Requirements' "do not claim" list`);
  }
}

/**
 * Automated check results can only become "automated_observation" items --
 * never "verified_fact." An automated tool observed something; it did not
 * verify or guarantee anything.
 * @param {import("../domain/websiteCheck").WebsiteCheckResult} checkResult
 * @returns {EvidenceItem[]}
 */
function categorizeCheckResult(checkResult) {
  return Object.entries(checkResult.evidence).map(([key, value]) => {
    const text = `${key}: ${value}`;
    assertNoGuaranteeLanguage(text);
    return { category: "automated_observation", text };
  });
}

/**
 * @param {EvidenceItem[]} items
 * @param {EvidenceCategory} category
 * @param {string} text
 * @param {string} authoredBy
 * @returns {EvidenceItem[]}
 */
function addHumanEvidence(items, category, text, authoredBy) {
  if (!["technician_interpretation", "recommendation", "customer_action"].includes(category)) {
    throw new Error(`addHumanEvidence: category must be technician_interpretation, recommendation, or customer_action (got "${category}")`);
  }
  if (typeof authoredBy !== "string" || authoredBy.length === 0) {
    throw new Error("addHumanEvidence: authoredBy is required -- these categories always need a human attribution");
  }
  assertNoGuaranteeLanguage(text);
  return [...items, { category, text, authoredBy }];
}

module.exports = { categorizeCheckResult, addHumanEvidence, assertNoGuaranteeLanguage, FORBIDDEN_GUARANTEE_PATTERNS };
