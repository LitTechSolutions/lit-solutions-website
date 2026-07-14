// Domain type for F027 (Change Order Approval & Rejection). The approval
// mechanics themselves reuse F016's generic approval state machine
// (src/policy/approvalWorkflow.js already includes "change_order" as an
// ApprovalSubjectType) rather than duplicating a second workflow -- this
// module only adds the change-order-specific record the approval points at.

const { assertValidScopeOfWork } = require("./scopeOfWork");

/**
 * @typedef {Object} ChangeOrder
 * @property {string} id
 * @property {string} organizationId
 * @property {string} originalScopeId - The ScopeOfWork this change order modifies.
 * @property {string} description
 * @property {import("./scopeOfWork").ScopeLineItem[]} addedLineItems
 * @property {string} createdAt
 * @property {string} createdBy
 */

/**
 * @param {Partial<ChangeOrder>} candidate
 * @returns {asserts candidate is ChangeOrder}
 */
function assertValidChangeOrder(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("changeOrder: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("changeOrder: id is required");
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("changeOrder: organizationId is required");
  }
  if (typeof candidate.originalScopeId !== "string" || candidate.originalScopeId.length === 0) {
    throw new Error("changeOrder: originalScopeId is required");
  }
  if (typeof candidate.description !== "string" || candidate.description.trim().length === 0) {
    throw new Error("changeOrder: description is required");
  }
  if (!Array.isArray(candidate.addedLineItems) || candidate.addedLineItems.length === 0) {
    throw new Error("changeOrder: addedLineItems must be a non-empty array");
  }
  assertValidScopeOfWork({
    id: "validation-only",
    organizationId: candidate.organizationId,
    ticketId: "validation-only",
    version: 1,
    status: "draft",
    lineItems: candidate.addedLineItems,
  });
}

module.exports = { assertValidChangeOrder };
