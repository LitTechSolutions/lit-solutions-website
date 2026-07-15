// F028 -- Payment Request & Payment Status Reconciliation. Persistence
// wiring two existing pure engines together: src/policy/paymentSchedule.js
// (how many payments, what amounts, when they're due -- Dylan's verbatim
// deposit-threshold policy, OWNER_DECISIONS.md #2) and
// src/policy/paymentReconciliation.js (the requested -> paid -> reconciled
// state machine). Per src/domain/paymentRequest.js, amount_ref stays an
// opaque pointer -- this module never writes a raw dollar amount into the
// database; the computed amount/dueWhen from paymentSchedule.js is
// returned to the caller in-memory only, for display/invoicing, not
// persisted as a column (no such column exists on payment_requests, and
// none should until a real F050 pricing computation is persisted).

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidPaymentRequest } = require("../domain/paymentRequest");
const { determinePaymentSchedule } = require("../policy/paymentSchedule");
const { transitionPaymentStatus } = require("../policy/paymentReconciliation");

/**
 * Computes the payment schedule for a priced piece of work and persists
 * one payment_requests row per scheduled payment (one row for
 * full_upfront, two for deposit_balance).
 *
 * @param {{ organizationId: string, subjectType: string, subjectId: string, amountRefPrefix: string, totalAmount: number, isThirdPartyExpense?: boolean }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string }} [deps]
 * @returns {Promise<{ scheduleType: string, reason: string, paymentRequests: Array<import("../domain/paymentRequest").PaymentRequest & { amount: number, dueWhen: string }> }>}
 */
async function createPaymentRequestsForSchedule(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

  const schedule = determinePaymentSchedule(input.totalAmount, { isThirdPartyExpense: input.isThirdPartyExpense });

  const paymentRequests = [];
  for (const payment of schedule.payments) {
    const paymentRequest = {
      id: idGenerator(),
      organizationId: input.organizationId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      amountRef: `${input.amountRefPrefix}:${payment.label}`,
      status: "requested",
      createdAt: now().toISOString(),
    };
    assertValidPaymentRequest(paymentRequest);

    await sql`
      INSERT INTO payment_requests (id, organization_id, subject_type, subject_id, amount_ref, status, created_at)
      VALUES (${paymentRequest.id}, ${paymentRequest.organizationId}, ${paymentRequest.subjectType}, ${paymentRequest.subjectId}, ${paymentRequest.amountRef}, ${paymentRequest.status}, ${paymentRequest.createdAt})
    `;
    paymentRequests.push({ ...paymentRequest, amount: payment.amount, dueWhen: payment.dueWhen });
  }

  return { scheduleType: schedule.scheduleType, reason: schedule.reason, paymentRequests };
}

/**
 * @param {string} id
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/paymentRequest").PaymentRequest | null>}
 */
async function getPaymentRequestById(id, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM payment_requests WHERE id = ${id}`;
  return rows.length > 0 ? mapRowToPaymentRequest(rows[0]) : null;
}

/**
 * Fetches the current status, validates the transition through the pure
 * paymentReconciliation.js state machine, and persists only if legal.
 *
 * @param {string} id
 * @param {import("../domain/paymentRequest").PaymentRequestStatus} nextStatus
 * @param {{ sql?: Function, providerReference?: string }} [deps]
 * @returns {Promise<import("../domain/paymentRequest").PaymentRequest>}
 */
async function applyPaymentStatusTransition(id, nextStatus, deps = {}) {
  const sql = deps.sql || getSql();
  const current = await getPaymentRequestById(id, { sql });
  if (!current) {
    throw new Error(`applyPaymentStatusTransition: no payment request "${id}"`);
  }
  const { allowed, reason } = transitionPaymentStatus(current.status, nextStatus);
  if (!allowed) {
    throw new Error(`applyPaymentStatusTransition: ${reason}`);
  }
  const providerReference = deps.providerReference ?? current.providerReference ?? null;

  await sql`UPDATE payment_requests SET status = ${nextStatus}, provider_reference = ${providerReference} WHERE id = ${id}`;
  return { ...current, status: nextStatus, providerReference: providerReference || undefined };
}

/**
 * @param {string} subjectType
 * @param {string} subjectId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/paymentRequest").PaymentRequest[]>}
 */
async function listPaymentRequestsForSubject(subjectType, subjectId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM payment_requests WHERE subject_type = ${subjectType} AND subject_id = ${subjectId} ORDER BY created_at`;
  return rows.map(mapRowToPaymentRequest);
}

function mapRowToPaymentRequest(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    amountRef: row.amount_ref,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    providerReference: row.provider_reference || undefined,
  };
}

module.exports = {
  createPaymentRequestsForSchedule,
  getPaymentRequestById,
  applyPaymentStatusTransition,
  listPaymentRequestsForSubject,
  mapRowToPaymentRequest,
};
