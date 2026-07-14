// Domain type for F010 (Service & Project Record Management).
// Types only -- persistence blocked on the primary-data-store decision
// (OWNER_DECISIONS.md #1), same as F001/F002.

/**
 * @typedef {"website" | "it" | "security" | "recurring_service"} ServiceCategory
 */

/**
 * @typedef {"active" | "on_hold" | "completed" | "cancelled"} ServiceRecordStatus
 */

/**
 * @typedef {Object} ServiceRecord
 * @property {string} id
 * @property {string} organizationId
 * @property {ServiceCategory} category
 * @property {string} title
 * @property {ServiceRecordStatus} status
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} createdBy
 * @property {number} version
 */

const CATEGORIES = ["website", "it", "security", "recurring_service"];
const STATUSES = ["active", "on_hold", "completed", "cancelled"];

/**
 * @param {Partial<ServiceRecord>} candidate
 * @returns {asserts candidate is ServiceRecord}
 */
function assertValidServiceRecord(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("serviceRecord: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("serviceRecord: id is required");
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("serviceRecord: organizationId is required");
  }
  if (!CATEGORIES.includes(candidate.category)) throw new Error(`serviceRecord: category must be one of ${CATEGORIES.join(", ")}`);
  if (typeof candidate.title !== "string" || candidate.title.trim().length === 0) throw new Error("serviceRecord: title is required");
  if (!STATUSES.includes(candidate.status)) throw new Error(`serviceRecord: status must be one of ${STATUSES.join(", ")}`);
}

module.exports = { CATEGORIES, STATUSES, assertValidServiceRecord };
