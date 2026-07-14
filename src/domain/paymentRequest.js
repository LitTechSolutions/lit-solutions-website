// Domain type for F028 (Payment Request & Payment Status Reconciliation).
// `amountRef` mirrors scopeOfWork.js's `priceRef` pattern -- an opaque
// pointer to a F050 pricing computation, never a raw dollar amount
// computed or invented by this module. No payment webhook infrastructure
// exists anywhere in this codebase yet (confirmed in Session 0 discovery
// via the quote-acceptance/referral-program specs) -- this type models
// the record a future webhook or manual-reconciliation flow would update,
// not the integration itself.

/**
 * @typedef {"requested" | "paid" | "reconciliation_pending" | "reconciled" | "failed"} PaymentRequestStatus
 */

/**
 * @typedef {Object} PaymentRequest
 * @property {string} id
 * @property {string} organizationId
 * @property {string} subjectType - "scope" | "change_order" | "subscription", whatever this payment is for.
 * @property {string} subjectId
 * @property {string} amountRef - Opaque reference to a F050 pricing computation.
 * @property {PaymentRequestStatus} status
 * @property {string} createdAt
 * @property {string} [providerReference] - Square (or successor) transaction/session reference, once one exists.
 */

const STATUSES = ["requested", "paid", "reconciliation_pending", "reconciled", "failed"];

/**
 * @param {Partial<PaymentRequest>} candidate
 * @returns {asserts candidate is PaymentRequest}
 */
function assertValidPaymentRequest(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("paymentRequest: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("paymentRequest: id is required");
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("paymentRequest: organizationId is required");
  }
  if (typeof candidate.amountRef !== "string" || candidate.amountRef.length === 0) {
    throw new Error("paymentRequest: amountRef is required (not a raw dollar amount -- pricing is blocked, OWNER_DECISIONS.md #2)");
  }
  if (!STATUSES.includes(candidate.status)) throw new Error(`paymentRequest: status must be one of ${STATUSES.join(", ")}`);
}

module.exports = { STATUSES, assertValidPaymentRequest };
