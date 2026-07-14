// Shared domain type for F046 (Security Readiness Assessment) and F047
// (Account Protection & MFA Checklist) -- both are "plain-language
// checklist, scored" tools per their objectives, so they share one
// engine (src/policy/readinessChecklist.js) rather than two near-
// identical implementations. Deliberately NO credential/code/secret
// fields anywhere: F047's objective is explicit ("without storing
// credentials") and this product is explicitly not a password manager
// (master instruction Product Definition).

/**
 * @typedef {Object} ChecklistItem
 * @property {string} key
 * @property {string} label - Plain-language prompt, e.g. "Does this account have multi-factor authentication enabled?"
 * @property {number} weight - Relative importance, caller-configured.
 */

/**
 * @typedef {Object} ChecklistResponse
 * @property {string} itemKey
 * @property {boolean} met - Whether this item is satisfied. Never a credential, code, or recovery detail -- just yes/no.
 */

/**
 * @typedef {Object} ChecklistDefinition
 * @property {string} id
 * @property {string} title
 * @property {ChecklistItem[]} items
 */

/**
 * @param {Partial<ChecklistDefinition>} candidate
 * @returns {asserts candidate is ChecklistDefinition}
 */
function assertValidChecklistDefinition(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("checklistDefinition: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("checklistDefinition: id is required");
  if (!Array.isArray(candidate.items) || candidate.items.length === 0) {
    throw new Error("checklistDefinition: items must be a non-empty array");
  }
  for (const item of candidate.items) {
    if (typeof item.key !== "string" || item.key.length === 0) throw new Error("checklistDefinition: every item needs a key");
    if (typeof item.weight !== "number" || item.weight <= 0) throw new Error(`checklistDefinition: item "${item.key}" weight must be a positive number`);
  }
}

/**
 * @param {Partial<ChecklistResponse>} candidate
 * @returns {asserts candidate is ChecklistResponse}
 */
function assertValidChecklistResponse(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("checklistResponse: expected an object");
  if (typeof candidate.itemKey !== "string" || candidate.itemKey.length === 0) throw new Error("checklistResponse: itemKey is required");
  if (typeof candidate.met !== "boolean") throw new Error("checklistResponse: met must be a boolean");
}

module.exports = { assertValidChecklistDefinition, assertValidChecklistResponse };
