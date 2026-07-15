// F002 -- Customer Invitation & Account Activation. Pure state machine,
// same shape as approvalWorkflow.js's transitionApproval() -- an
// invitation past its expiry can only ever move to "expired", even if a
// client races to redeem it right as the window closes. Token
// generation/hashing lives here too since it's pure and deterministic
// given a random-bytes source, not persistence.
//
// Deliberately does not decide WHO may create/revoke an invitation --
// that's rbac.js's job (customer.administer, platform_admin-only). This
// module only enforces which transitions are legal and when.

const crypto = require("node:crypto");

const TOKEN_TTL_DAYS = 7;
const STATUSES = ["pending", "accepted", "expired", "revoked"];
const TERMINAL_STATUSES = new Set(["accepted", "expired", "revoked"]);

/**
 * @param {import("../domain/invitation").Invitation} invitation
 * @param {Date} now
 * @returns {boolean}
 */
function isExpired(invitation, now) {
  return invitation.status === "pending" && new Date(invitation.expiresAt).getTime() <= now.getTime();
}

/**
 * @typedef {"accept" | "revoke" | "expire"} InvitationAction
 */

/**
 * @typedef {Object} InvitationTransitionDecision
 * @property {boolean} allowed
 * @property {string} reason
 * @property {import("../domain/invitation").InvitationStatus} [nextStatus]
 */

/**
 * @param {import("../domain/invitation").Invitation} invitation
 * @param {InvitationAction} action
 * @param {{ now?: () => Date }} [deps]
 * @returns {InvitationTransitionDecision}
 */
function transitionInvitation(invitation, action, deps = {}) {
  const now = (deps.now || (() => new Date()))();

  if (!invitation || !STATUSES.includes(invitation.status)) {
    return { allowed: false, reason: "invalid invitation record" };
  }
  if (TERMINAL_STATUSES.has(invitation.status)) {
    return { allowed: false, reason: `invitation is already terminal (status: ${invitation.status}) -- no further transitions; issue a new invitation instead` };
  }
  // invitation.status === "pending" from here on.
  if (isExpired(invitation, now)) {
    if (action !== "expire") {
      // Same race-resolution rule as approvalWorkflow.js: a token
      // redeemed right as it expires must not silently succeed.
      return { allowed: false, reason: "invitation has expired -- must expire before any other transition" };
    }
    return { allowed: true, reason: "invitation window passed", nextStatus: "expired" };
  }

  switch (action) {
    case "accept":
      return { allowed: true, reason: "invitation accepted", nextStatus: "accepted" };
    case "revoke":
      return { allowed: true, reason: "invitation revoked", nextStatus: "revoked" };
    case "expire":
      return { allowed: false, reason: "invitation has not yet expired" };
    default:
      return { allowed: false, reason: `unknown action "${action}"` };
  }
}

/**
 * @param {{ now?: () => Date }} [deps]
 * @returns {string} ISO 8601 UTC timestamp TOKEN_TTL_DAYS from now.
 */
function computeExpiresAt(deps = {}) {
  const now = deps.now || (() => new Date());
  return new Date(now().getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Single-use invitation token. Only the SHA-256 hash is ever persisted
 * (see hashInvitationToken()) -- the raw value exists only in the
 * invitation email and the client request redeeming it, matching
 * auth_utils.js's password-reset token pattern.
 *
 * @param {{ randomBytes?: (size: number) => Buffer }} [deps]
 * @returns {string} 64-character hex string (32 random bytes).
 */
function generateInvitationToken(deps = {}) {
  const randomBytes = deps.randomBytes || crypto.randomBytes;
  return randomBytes(32).toString("hex");
}

/**
 * @param {string} token
 * @returns {string} 64-character hex SHA-256 digest.
 */
function hashInvitationToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  transitionInvitation,
  isExpired,
  computeExpiresAt,
  generateInvitationToken,
  hashInvitationToken,
  TOKEN_TTL_DAYS,
  TERMINAL_STATUSES,
};
