// Session 20 owner decision #3 -- readiness-checklist submission
// workflow. Pure state machine over ChecklistSubmissionStatus, same
// fetch-validate-transition-persist shape as ticketLifecycle.js's
// transitionTicketStatus() -- this module never decides WHO may trigger
// a transition (that's rbac.js's job at the endpoint layer), only
// whether a given from -> to move is legal at all.
//
// "Submitted for review" (Session 20 directive, verbatim) is the
// customer-visible label for the "submitted" status.

const { CHECKLIST_SUBMISSION_STATUSES } = require("../domain/readinessChecklist");

const ALLOWED_TRANSITIONS = {
  draft: new Set(["submitted"]),
  submitted: new Set(["returned", "verified"]),
  returned: new Set(["submitted"]),
  verified: new Set([]), // terminal -- once staff-verified, no further customer edits or resubmission
};

/**
 * @typedef {Object} ChecklistSubmissionTransitionDecision
 * @property {boolean} allowed
 * @property {string} reason
 */

/**
 * @param {import("../domain/readinessChecklist").ChecklistSubmissionStatus} currentStatus
 * @param {import("../domain/readinessChecklist").ChecklistSubmissionStatus} nextStatus
 * @returns {ChecklistSubmissionTransitionDecision}
 */
function transitionChecklistSubmission(currentStatus, nextStatus) {
  if (!CHECKLIST_SUBMISSION_STATUSES.includes(currentStatus)) {
    return { allowed: false, reason: `unknown current status "${currentStatus}"` };
  }
  if (!CHECKLIST_SUBMISSION_STATUSES.includes(nextStatus)) {
    return { allowed: false, reason: `unknown target status "${nextStatus}"` };
  }
  if (!ALLOWED_TRANSITIONS[currentStatus].has(nextStatus)) {
    return { allowed: false, reason: `cannot move from "${currentStatus}" to "${nextStatus}"` };
  }
  return { allowed: true, reason: `"${currentStatus}" -> "${nextStatus}" is a legal transition` };
}

/**
 * Whether a customer may currently edit their answers -- draft (never
 * submitted) or returned (staff asked for changes). Not submitted
 * (under review) or verified (done) per the Session 20 directive:
 * "Customers may not... mark themselves fully approved," and a
 * submission mid-review shouldn't silently change under the reviewer.
 *
 * @param {import("../domain/readinessChecklist").ChecklistSubmissionStatus} status
 * @returns {boolean}
 */
function canCustomerEdit(status) {
  return status === "draft" || status === "returned";
}

module.exports = { transitionChecklistSubmission, canCustomerEdit };
