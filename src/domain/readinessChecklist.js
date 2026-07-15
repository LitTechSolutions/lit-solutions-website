// Shared domain type for F046 (Security Readiness Assessment) and F047
// (Account Protection & MFA Checklist) -- both are "plain-language
// checklist, scored" tools per their objectives, so they share one
// engine (src/policy/readinessChecklist.js) rather than two near-
// identical implementations. Deliberately NO credential/code/secret
// fields anywhere: F047's objective is explicit ("without storing
// credentials") and this product is explicitly not a password manager
// (master instruction Product Definition).

/**
 * @typedef {"customer" | "staff"} ChecklistAudience
 */

/**
 * @typedef {Object} ChecklistItem
 * @property {string} key
 * @property {string} label - Plain-language prompt, e.g. "Does this account have multi-factor authentication enabled?"
 * @property {number} weight - Relative importance, caller-configured.
 * @property {ChecklistAudience} audience - Session 20 owner decision (#3): explicit per-item split between
 *   customer-editable questions ("customer") and staff-only assessment items ("staff") -- never inferred, always
 *   declared on the item itself, so the endpoint/store layer can enforce who may answer which item without guessing.
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
 * The full per-(organization, definition, item) answer record. Session 20's customer/staff data split lives here:
 * `met`/`comment` are customer-editable for "customer"-audience items, `staffNote`/`staffVerified` are staff-only
 * and never returned to a customer (see checklistStore.js's getChecklistForCustomer()).
 *
 * @typedef {Object} ChecklistItemAnswer
 * @property {string} itemKey
 * @property {boolean} met - The answer itself -- customer-supplied for a "customer"-audience item, staff-supplied for a "staff"-audience item.
 * @property {string} [comment] - Customer-editable comment, only meaningful for "customer"-audience items.
 * @property {string} [staffNote] - Staff-only internal note. NEVER exposed to a customer-facing read.
 * @property {boolean} staffVerified - Staff verification status for this specific item. Customers cannot set this (Session 20 directive: "Customers may not... edit staff verification").
 */

/**
 * @typedef {"draft" | "submitted" | "returned" | "verified"} ChecklistSubmissionStatus
 */

/**
 * One row per (organization, checklistDefinition) -- the submission-workflow state, distinct from the individual
 * item answers above. See src/policy/checklistSubmissionWorkflow.js for the legal-transition state machine.
 *
 * @typedef {Object} ChecklistSubmission
 * @property {string} organizationId
 * @property {string} checklistDefinitionId
 * @property {ChecklistSubmissionStatus} status
 * @property {string} [submittedAt]
 * @property {string} [submittedBy]
 * @property {string} [reviewedAt]
 * @property {string} [reviewedBy]
 * @property {string} [reviewNote] - Staff-supplied reason when returning a submission for changes.
 */

const CHECKLIST_AUDIENCES = ["customer", "staff"];
const CHECKLIST_SUBMISSION_STATUSES = ["draft", "submitted", "returned", "verified"];

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
    if (!CHECKLIST_AUDIENCES.includes(item.audience)) {
      throw new Error(`checklistDefinition: item "${item.key}" audience must be one of ${CHECKLIST_AUDIENCES.join(", ")}`);
    }
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

/**
 * @param {Partial<ChecklistItemAnswer>} candidate
 * @returns {asserts candidate is ChecklistItemAnswer}
 */
function assertValidChecklistItemAnswer(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("checklistItemAnswer: expected an object");
  if (typeof candidate.itemKey !== "string" || candidate.itemKey.length === 0) throw new Error("checklistItemAnswer: itemKey is required");
  if (typeof candidate.met !== "boolean") throw new Error("checklistItemAnswer: met must be a boolean");
  if (candidate.comment !== undefined && typeof candidate.comment !== "string") throw new Error("checklistItemAnswer: comment must be a string");
  if (candidate.staffNote !== undefined && typeof candidate.staffNote !== "string") throw new Error("checklistItemAnswer: staffNote must be a string");
  if (candidate.staffVerified !== undefined && typeof candidate.staffVerified !== "boolean") {
    throw new Error("checklistItemAnswer: staffVerified must be a boolean");
  }
}

/**
 * @param {string} status
 * @returns {asserts status is ChecklistSubmissionStatus}
 */
function assertValidChecklistSubmissionStatus(status) {
  if (!CHECKLIST_SUBMISSION_STATUSES.includes(status)) {
    throw new Error(`checklistSubmission: status must be one of ${CHECKLIST_SUBMISSION_STATUSES.join(", ")}`);
  }
}

module.exports = {
  assertValidChecklistDefinition,
  assertValidChecklistResponse,
  assertValidChecklistItemAnswer,
  assertValidChecklistSubmissionStatus,
  CHECKLIST_AUDIENCES,
  CHECKLIST_SUBMISSION_STATUSES,
};
