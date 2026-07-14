// Domain types for F001 (Customer Organization Provisioning) and the
// membership relationship F005 (RBAC) authorizes against.
//
// Storage-agnostic on purpose: F001/F005 persistence is blocked on the
// primary-data-store owner decision (see docs/development/OWNER_DECISIONS.md
// #1). These types are the contract everything else in this session is
// written against, so persistence can be wired up later without reshaping
// the domain layer.

/**
 * @typedef {"active" | "suspended" | "archived"} OrganizationStatus
 */

/**
 * @typedef {Object} Organization
 * @property {string} id - Opaque server-generated UUID/ULID.
 * @property {string} name
 * @property {OrganizationStatus} status
 * @property {string} createdAt - ISO 8601 UTC.
 * @property {string} updatedAt - ISO 8601 UTC.
 * @property {string} createdBy - User or automated-service id.
 * @property {number} version - Optimistic concurrency counter.
 */

/**
 * @typedef {"platform_admin" | "technician" | "org_owner" | "org_member" | "read_only_customer" | "automated_service"} RoleName
 * Matches the Global Requirements "Roles & Permissions" sheet's six roles.
 */

/**
 * @typedef {"active" | "invited" | "suspended" | "revoked"} MembershipStatus
 */

/**
 * @typedef {Object} OrganizationMembership
 * @property {string} id
 * @property {string} organizationId
 * @property {string} userId
 * @property {RoleName} role
 * @property {MembershipStatus} status
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} [invitedBy] - User id, present when status originated as "invited".
 */

/**
 * Validate the minimal shape of an Organization record. Throws on the
 * first missing/invalid required field rather than collecting all errors --
 * callers (future persistence adapters) are expected to surface this as a
 * 400-class error with the message as-is.
 * @param {Partial<Organization>} candidate
 * @returns {asserts candidate is Organization}
 */
function assertValidOrganization(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("organization: expected an object");
  }
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    throw new Error("organization: id is required");
  }
  if (typeof candidate.name !== "string" || candidate.name.trim().length === 0) {
    throw new Error("organization: name is required");
  }
  if (!["active", "suspended", "archived"].includes(candidate.status)) {
    throw new Error("organization: status must be active, suspended, or archived");
  }
  if (typeof candidate.createdBy !== "string" || candidate.createdBy.length === 0) {
    throw new Error("organization: createdBy is required");
  }
  if (typeof candidate.version !== "number" || candidate.version < 1) {
    throw new Error("organization: version must be a positive number");
  }
}

const ROLE_NAMES = /** @type {const} */ ([
  "platform_admin",
  "technician",
  "org_owner",
  "org_member",
  "read_only_customer",
  "automated_service",
]);

/**
 * Validate the minimal shape of an OrganizationMembership record.
 * @param {Partial<OrganizationMembership>} candidate
 * @returns {asserts candidate is OrganizationMembership}
 */
function assertValidMembership(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("membership: expected an object");
  }
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    throw new Error("membership: id is required");
  }
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("membership: organizationId is required");
  }
  if (typeof candidate.userId !== "string" || candidate.userId.length === 0) {
    throw new Error("membership: userId is required");
  }
  if (!ROLE_NAMES.includes(candidate.role)) {
    throw new Error(`membership: role must be one of ${ROLE_NAMES.join(", ")}`);
  }
  if (!["active", "invited", "suspended", "revoked"].includes(candidate.status)) {
    throw new Error("membership: status must be active, invited, suspended, or revoked");
  }
}

module.exports = { ROLE_NAMES, assertValidOrganization, assertValidMembership };
