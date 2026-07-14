// Domain type for F016 (Customer Approval Inbox). Generalized from the
// already-designed quote-acceptance and project-status specs (see
// ARCHITECTURE.md's overlap table) rather than invented from scratch.

/**
 * @typedef {"scope" | "change_order" | "deliverable" | "document"} ApprovalSubjectType
 */

/**
 * @typedef {"pending" | "approved" | "rejected" | "expired"} ApprovalStatus
 */

/**
 * @typedef {Object} ApprovalRequest
 * @property {string} id
 * @property {string} organizationId
 * @property {ApprovalSubjectType} subjectType
 * @property {string} subjectId - The scope/change-order/deliverable/document being approved.
 * @property {ApprovalStatus} status
 * @property {string} requestedAt
 * @property {string} requestedBy
 * @property {string} expiresAt
 * @property {string} [decidedAt]
 * @property {string} [decidedBy]
 * @property {string} [decisionNote]
 */

const SUBJECT_TYPES = ["scope", "change_order", "deliverable", "document"];
const STATUSES = ["pending", "approved", "rejected", "expired"];

/**
 * @param {Partial<ApprovalRequest>} candidate
 * @returns {asserts candidate is ApprovalRequest}
 */
function assertValidApprovalRequest(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("approvalRequest: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("approvalRequest: id is required");
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("approvalRequest: organizationId is required");
  }
  if (!SUBJECT_TYPES.includes(candidate.subjectType)) throw new Error(`approvalRequest: subjectType must be one of ${SUBJECT_TYPES.join(", ")}`);
  if (typeof candidate.subjectId !== "string" || candidate.subjectId.length === 0) throw new Error("approvalRequest: subjectId is required");
  if (!STATUSES.includes(candidate.status)) throw new Error(`approvalRequest: status must be one of ${STATUSES.join(", ")}`);
  if (typeof candidate.expiresAt !== "string") throw new Error("approvalRequest: expiresAt is required");
}

module.exports = { SUBJECT_TYPES, STATUSES, assertValidApprovalRequest };
