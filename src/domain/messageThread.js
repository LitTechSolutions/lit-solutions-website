// Domain type for F013's organization-scoping extension. The underlying
// two-way thread mechanics already exist and are reusable as-is (see
// netlify/functions/messages.js, ARCHITECTURE.md's reuse table) -- this
// just adds the organizationId the existing customerId-keyed store lacks.

/**
 * @typedef {Object} MessageThreadRef
 * @property {string} organizationId
 * @property {string} customerId - Existing messages.js key, preserved for compatibility.
 * @property {string} [serviceRecordId] - Optional link to the F010 record this thread concerns.
 */

/**
 * @param {Partial<MessageThreadRef>} candidate
 * @returns {asserts candidate is MessageThreadRef}
 */
function assertValidMessageThreadRef(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("messageThreadRef: expected an object");
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("messageThreadRef: organizationId is required");
  }
  if (typeof candidate.customerId !== "string" || candidate.customerId.length === 0) {
    throw new Error("messageThreadRef: customerId is required");
  }
}

module.exports = { assertValidMessageThreadRef };
