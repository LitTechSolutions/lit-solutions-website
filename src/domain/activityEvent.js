// Domain type for F017 (Unified Activity Timeline). Deliberately distinct
// from F008's AuditEvent: AuditEvent is a security/compliance record
// (immutable, includes denied/failure outcomes, staff-visible); an
// ActivityEvent is a customer-facing "here's what happened" summary
// (success-only narrative entries). F017's aggregation logic is expected
// to read from several sources (tickets, approvals, documents, payments)
// and project them into this common shape, not read AuditEvent directly.

/**
 * @typedef {"project" | "ticket" | "approval" | "document" | "payment" | "service_event"} ActivitySourceType
 */

/**
 * @typedef {Object} ActivityEvent
 * @property {string} id
 * @property {string} organizationId
 * @property {ActivitySourceType} sourceType
 * @property {string} sourceId
 * @property {string} occurredAt
 * @property {string} summary - Plain-language, customer-safe description. Never raw internal notes.
 * @property {boolean} customerVisible - False for staff-only entries that share this shape but must be filtered out of the customer's timeline.
 */

const SOURCE_TYPES = ["project", "ticket", "approval", "document", "payment", "service_event"];

/**
 * @param {Partial<ActivityEvent>} candidate
 * @returns {asserts candidate is ActivityEvent}
 */
function assertValidActivityEvent(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("activityEvent: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("activityEvent: id is required");
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("activityEvent: organizationId is required");
  }
  if (!SOURCE_TYPES.includes(candidate.sourceType)) throw new Error(`activityEvent: sourceType must be one of ${SOURCE_TYPES.join(", ")}`);
  if (typeof candidate.occurredAt !== "string") throw new Error("activityEvent: occurredAt is required");
  if (typeof candidate.summary !== "string" || candidate.summary.trim().length === 0) throw new Error("activityEvent: summary is required");
  if (typeof candidate.customerVisible !== "boolean") throw new Error("activityEvent: customerVisible must be a boolean");
}

module.exports = { SOURCE_TYPES, assertValidActivityEvent };
