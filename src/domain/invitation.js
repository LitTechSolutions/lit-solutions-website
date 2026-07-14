// Domain type for F002 (Customer Invitation & Account Activation).
//
// F002's actual flow is blocked on the registration-model owner decision
// (open vs. invite-only -- see docs/development/OWNER_DECISIONS.md #4).
// This type is written to be neutral to that decision: an Invitation
// record is meaningful either way (invite-only: the only path to an
// account; open registration: an optional path alongside self-registration).

const { ROLE_NAMES } = require("./organization");

/**
 * @typedef {"pending" | "accepted" | "expired" | "revoked"} InvitationStatus
 */

/**
 * @typedef {Object} Invitation
 * @property {string} id
 * @property {string} organizationId
 * @property {string} email - Lowercased.
 * @property {import("./organization").RoleName} role - Role granted on acceptance.
 * @property {InvitationStatus} status
 * @property {string} invitedBy - User id.
 * @property {string} createdAt
 * @property {string} expiresAt
 * @property {string} [acceptedAt]
 */

/**
 * @param {Partial<Invitation>} candidate
 * @returns {asserts candidate is Invitation}
 */
function assertValidInvitation(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("invitation: expected an object");
  }
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    throw new Error("invitation: id is required");
  }
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("invitation: organizationId is required");
  }
  if (typeof candidate.email !== "string" || !candidate.email.includes("@")) {
    throw new Error("invitation: email is required and must look like an email address");
  }
  if (candidate.email !== candidate.email.toLowerCase()) {
    throw new Error("invitation: email must be lowercased before storage");
  }
  if (!ROLE_NAMES.includes(candidate.role)) {
    throw new Error(`invitation: role must be one of ${ROLE_NAMES.join(", ")}`);
  }
  // Platform Administrator and Automated Service are never granted via a
  // customer-facing invitation -- those are staff-provisioned out of band
  // per the Roles & Permissions sheet ("Organization Owner... cannot grant
  // platform or technician roles").
  if (candidate.role === "platform_admin" || candidate.role === "automated_service") {
    throw new Error("invitation: cannot invite a user directly into platform_admin or automated_service");
  }
  if (!["pending", "accepted", "expired", "revoked"].includes(candidate.status)) {
    throw new Error("invitation: status must be pending, accepted, expired, or revoked");
  }
  if (typeof candidate.expiresAt !== "string") {
    throw new Error("invitation: expiresAt is required");
  }
}

/**
 * Pure helper: is this invitation still usable right now?
 * @param {Invitation} invitation
 * @param {Date} now
 * @returns {boolean}
 */
function isInvitationUsable(invitation, now) {
  if (invitation.status !== "pending") return false;
  return new Date(invitation.expiresAt).getTime() > now.getTime();
}

module.exports = { assertValidInvitation, isInvitationUsable };
