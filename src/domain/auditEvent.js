// Domain type for F008 (Audit Trail & Security Event Logging).
//
// Not owner-blocked and foundational: per SYS-NFR-020, privileged,
// financial, contractual, security, deletion, and configuration actions
// need immutable structured events. Nothing built in later sessions can be
// verified as "audited" without this existing first.

/**
 * @typedef {"user" | "automated_service" | "system"} ActorType
 */

/**
 * @typedef {"success" | "failure" | "denied"} AuditOutcome
 */

/**
 * @typedef {Object} AuditEvent
 * @property {string} id
 * @property {string} correlationId - Ties this event to the request/job that produced it.
 * @property {string} occurredAt - ISO 8601 UTC.
 * @property {ActorType} actorType
 * @property {string} actorId - User id, automated-service id, or "system".
 * @property {import("./organization").RoleName} [actorRole]
 * @property {string | null} organizationId - null for platform-level events with no single org.
 * @property {string} action - e.g. "organization.create", "membership.role_change", "auth.session_revoke".
 * @property {string} [targetType]
 * @property {string} [targetId]
 * @property {AuditOutcome} outcome
 * @property {Record<string, string | number | boolean | null>} [metadata] - Typed, no secrets, no full payloads.
 */

const REQUIRED_STRING_FIELDS = ["id", "correlationId", "occurredAt", "actorType", "actorId", "action"];

/**
 * @param {Partial<AuditEvent>} candidate
 * @returns {asserts candidate is AuditEvent}
 */
function assertValidAuditEvent(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("auditEvent: expected an object");
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof candidate[field] !== "string" || candidate[field].length === 0) {
      throw new Error(`auditEvent: ${field} is required`);
    }
  }
  if (!["user", "automated_service", "system"].includes(candidate.actorType)) {
    throw new Error("auditEvent: actorType must be user, automated_service, or system");
  }
  if (!["success", "failure", "denied"].includes(candidate.outcome)) {
    throw new Error("auditEvent: outcome must be success, failure, or denied");
  }
  if (candidate.organizationId !== null && typeof candidate.organizationId !== "string") {
    throw new Error("auditEvent: organizationId must be a string or null");
  }
  if (candidate.metadata) {
    for (const [key, value] of Object.entries(candidate.metadata)) {
      const t = typeof value;
      if (value !== null && t !== "string" && t !== "number" && t !== "boolean") {
        throw new Error(`auditEvent: metadata.${key} must be a string, number, boolean, or null (per SYS-SEC-012 -- no arbitrary payloads in audit logs)`);
      }
    }
  }
}

module.exports = { assertValidAuditEvent };
