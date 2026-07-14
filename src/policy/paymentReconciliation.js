// F028 -- Payment Request & Payment Status Reconciliation (state-machine
// half; no pricing/amount logic here -- see domain/paymentRequest.js for
// why amounts are opaque refs). Generic request/paid/reconciled/failed
// shape: this codebase has no payment webhook infrastructure at all yet
// (confirmed in Session 0 discovery), so this models the states a manual
// or future-webhook-driven reconciliation flow would move through,
// following the same "manual-tracking-first" pattern already designed in
// the existing quote-acceptance spec.

const { STATUSES } = require("../domain/paymentRequest");

const TERMINAL_STATUSES = new Set(["reconciled", "failed"]);

const ALLOWED_TRANSITIONS = {
  requested: new Set(["paid", "failed"]),
  paid: new Set(["reconciliation_pending", "reconciled"]),
  reconciliation_pending: new Set(["reconciled", "failed"]),
  reconciled: new Set([]),
  failed: new Set(["requested"]), // a failed payment can be re-requested
};

/**
 * @param {import("../domain/paymentRequest").PaymentRequestStatus} currentStatus
 * @param {import("../domain/paymentRequest").PaymentRequestStatus} nextStatus
 * @returns {{ allowed: boolean, reason: string }}
 */
function transitionPaymentStatus(currentStatus, nextStatus) {
  if (!STATUSES.includes(currentStatus) || !STATUSES.includes(nextStatus)) {
    return { allowed: false, reason: "unknown payment status" };
  }
  if (TERMINAL_STATUSES.has(currentStatus) && !ALLOWED_TRANSITIONS[currentStatus].has(nextStatus)) {
    return { allowed: false, reason: `"${currentStatus}" is terminal -- no further transitions except as explicitly modeled` };
  }
  if (!ALLOWED_TRANSITIONS[currentStatus].has(nextStatus)) {
    return { allowed: false, reason: `cannot move from "${currentStatus}" directly to "${nextStatus}"` };
  }
  return { allowed: true, reason: `"${currentStatus}" -> "${nextStatus}" is a legal transition` };
}

module.exports = { transitionPaymentStatus, ALLOWED_TRANSITIONS, TERMINAL_STATUSES };
