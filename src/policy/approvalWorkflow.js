// F016 -- Customer Approval Inbox. Pure state machine, generalized from
// the already-designed quote-acceptance and project-status specs (see
// ARCHITECTURE.md's overlap table) rather than invented from scratch.
// Deliberately does not decide WHO may approve/reject -- that's rbac.js's
// job (scope.approve / change_order.approve capabilities). This module
// only enforces which state transitions are legal and when, matching
// SYS-ARC-005's separation of pure domain rules from authorization.

const { STATUSES } = require("../domain/approval");

const TERMINAL_STATUSES = new Set(["approved", "rejected", "expired"]);

/**
 * @param {import("../domain/approval").ApprovalRequest} approval
 * @param {Date} now
 * @returns {boolean}
 */
function isExpired(approval, now) {
  return approval.status === "pending" && new Date(approval.expiresAt).getTime() <= now.getTime();
}

/**
 * @typedef {"approve" | "reject" | "expire"} ApprovalAction
 */

/**
 * @typedef {Object} ApprovalTransitionDecision
 * @property {boolean} allowed
 * @property {string} reason
 * @property {import("../domain/approval").ApprovalStatus} [nextStatus]
 */

/**
 * @param {import("../domain/approval").ApprovalRequest} approval
 * @param {ApprovalAction} action
 * @param {{ now?: () => Date }} [deps]
 * @returns {ApprovalTransitionDecision}
 */
function transitionApproval(approval, action, deps = {}) {
  const now = (deps.now || (() => new Date()))();

  if (!approval || !STATUSES.includes(approval.status)) {
    return { allowed: false, reason: "invalid approval record" };
  }
  if (TERMINAL_STATUSES.has(approval.status)) {
    return { allowed: false, reason: `approval is already terminal (status: ${approval.status}) -- no further transitions` };
  }
  // approval.status === "pending" from here on.
  if (isExpired(approval, now)) {
    // An expired-but-not-yet-marked-expired approval can only transition to
    // "expired" -- approve/reject on an expired request is denied even if
    // the expire action hasn't been recorded yet, so a race between "the
    // customer clicks approve right as it expires" and "the expiry sweep
    // runs" always resolves to expired, never approved.
    if (action !== "expire") {
      return { allowed: false, reason: "approval window has passed -- must expire before any other transition" };
    }
    return { allowed: true, reason: "approval window passed", nextStatus: "expired" };
  }

  switch (action) {
    case "approve":
      return { allowed: true, reason: "approval recorded", nextStatus: "approved" };
    case "reject":
      return { allowed: true, reason: "rejection recorded", nextStatus: "rejected" };
    case "expire":
      return { allowed: false, reason: "approval has not yet expired" };
    default:
      return { allowed: false, reason: `unknown action "${action}"` };
  }
}

module.exports = { transitionApproval, isExpired, TERMINAL_STATUSES };
