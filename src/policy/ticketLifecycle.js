// F023 -- Ticket Lifecycle & Status Workflow. F029 -- Closure,
// Confirmation & Reopen (the reopen-window half lives here too, since
// it's the same state machine, not a separate one). Generalized from the
// already-designed project-status spec's status-lifecycle shape (see
// ARCHITECTURE.md's overlap table) rather than invented from scratch.

const { STATUSES } = require("../domain/ticket");

const TERMINAL_STATUSES = new Set(["closed"]);

// Legal transitions. Reopening only from "closed" (and only within the
// reopen window, checked separately below) -- a resolved-but-not-yet-closed
// ticket doesn't need "reopening," the customer/technician can just keep
// working it, so "resolved" and "waiting_on_customer" flow back to
// "in_progress" directly rather than through a reopen concept.
const ALLOWED_TRANSITIONS = {
  submitted: new Set(["triaged"]),
  triaged: new Set(["assigned"]),
  assigned: new Set(["in_progress"]),
  in_progress: new Set(["waiting_on_customer", "resolved"]),
  waiting_on_customer: new Set(["in_progress"]),
  resolved: new Set(["closed", "in_progress"]),
  closed: new Set(["reopened"]),
  reopened: new Set(["in_progress"]),
};

/**
 * @typedef {Object} LifecycleTransitionDecision
 * @property {boolean} allowed
 * @property {string} reason
 */

/**
 * @param {import("../domain/ticket").TicketStatus} currentStatus
 * @param {import("../domain/ticket").TicketStatus} nextStatus
 * @returns {LifecycleTransitionDecision}
 */
function transitionTicketStatus(currentStatus, nextStatus) {
  if (!STATUSES.includes(currentStatus)) {
    return { allowed: false, reason: `unknown current status "${currentStatus}"` };
  }
  if (!STATUSES.includes(nextStatus)) {
    return { allowed: false, reason: `unknown target status "${nextStatus}"` };
  }
  const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || new Set();
  if (!allowedNext.has(nextStatus)) {
    return { allowed: false, reason: `cannot move from "${currentStatus}" directly to "${nextStatus}"` };
  }
  return { allowed: true, reason: `"${currentStatus}" -> "${nextStatus}" is a legal transition` };
}

// F029: closed tickets can only be reopened within a fixed window --
// generic engineering default (like fileValidation's size limit), not an
// owner-approved support-window policy. Exposed as a parameter, not
// hardcoded as final.
const DEFAULT_REOPEN_WINDOW_DAYS = 14;

/**
 * @param {{ status: import("../domain/ticket").TicketStatus, closedAt?: string }} ticket
 * @param {Date} now
 * @param {number} [reopenWindowDays]
 * @returns {LifecycleTransitionDecision}
 */
function canReopen(ticket, now, reopenWindowDays = DEFAULT_REOPEN_WINDOW_DAYS) {
  if (ticket.status !== "closed") {
    return { allowed: false, reason: `only closed tickets can be reopened (current status: "${ticket.status}")` };
  }
  if (!ticket.closedAt) {
    return { allowed: false, reason: "ticket is closed but has no closedAt timestamp -- cannot evaluate the reopen window" };
  }
  const deadline = new Date(ticket.closedAt).getTime() + reopenWindowDays * 24 * 60 * 60 * 1000;
  if (now.getTime() > deadline) {
    return { allowed: false, reason: `reopen window (${reopenWindowDays} days) has passed` };
  }
  return { allowed: true, reason: "within the reopen window" };
}

module.exports = { transitionTicketStatus, canReopen, ALLOWED_TRANSITIONS, TERMINAL_STATUSES, DEFAULT_REOPEN_WINDOW_DAYS };
