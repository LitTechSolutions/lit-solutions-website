// F016 -- Customer Approval Inbox. Postgres persistence, wired to the
// existing pure state machine (src/policy/approvalWorkflow.js, built
// Session 2) rather than re-implementing transition rules here -- this
// module's job is fetch-validate-transition-persist, with
// transitionApproval() remaining the single source of truth for which
// transitions are legal.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidApprovalRequest } = require("../domain/approval");
const { transitionApproval } = require("../policy/approvalWorkflow");

/**
 * @param {{ organizationId: string, subjectType: string, subjectId: string, requestedBy: string, expiresAt: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string }} [deps]
 * @returns {Promise<import("../domain/approval").ApprovalRequest>}
 */
async function createApprovalRequest(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

  const approval = {
    id: idGenerator(),
    organizationId: input.organizationId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    status: "pending",
    requestedAt: now().toISOString(),
    requestedBy: input.requestedBy,
    expiresAt: input.expiresAt,
  };
  assertValidApprovalRequest(approval);

  await sql`
    INSERT INTO approval_requests (id, organization_id, subject_type, subject_id, status, requested_at, requested_by, expires_at)
    VALUES (${approval.id}, ${approval.organizationId}, ${approval.subjectType}, ${approval.subjectId}, ${approval.status}, ${approval.requestedAt}, ${approval.requestedBy}, ${approval.expiresAt})
  `;
  return approval;
}

/**
 * @param {string} organizationId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/approval").ApprovalRequest[]>}
 */
async function listPendingApprovals(organizationId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM approval_requests WHERE organization_id = ${organizationId} AND status = 'pending' ORDER BY requested_at`;
  return rows.map(mapRowToApproval);
}

/**
 * Fetch the current approval, run it through the pure state machine, and
 * persist the outcome only if the transition is legal. Throws (does not
 * silently no-op) when the transition is denied, so a caller's bug
 * (attempting an illegal transition) surfaces immediately rather than
 * disappearing into a no-op write.
 *
 * @param {string} id
 * @param {import("../policy/approvalWorkflow").ApprovalAction} action
 * @param {{ decidedBy?: string, decisionNote?: string }} decision
 * @param {{ sql?: Function, now?: () => Date }} [deps]
 * @returns {Promise<import("../domain/approval").ApprovalRequest>}
 */
async function applyApprovalDecision(id, action, decision, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());

  const rows = await sql`SELECT * FROM approval_requests WHERE id = ${id}`;
  if (rows.length === 0) {
    throw new Error(`applyApprovalDecision: no approval request "${id}"`);
  }
  const current = mapRowToApproval(rows[0]);
  const result = transitionApproval(current, action, { now });
  if (!result.allowed) {
    throw new Error(`applyApprovalDecision: ${result.reason}`);
  }

  const nowIso = now().toISOString();
  await sql`
    UPDATE approval_requests
    SET status = ${result.nextStatus}, decided_at = ${nowIso}, decided_by = ${decision.decidedBy || null}, decision_note = ${decision.decisionNote || null}
    WHERE id = ${id}
  `;

  return { ...current, status: result.nextStatus, decidedAt: nowIso, ...(decision.decidedBy ? { decidedBy: decision.decidedBy } : {}), ...(decision.decisionNote ? { decisionNote: decision.decisionNote } : {}) };
}

function mapRowToApproval(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    status: row.status,
    requestedAt: new Date(row.requested_at).toISOString(),
    requestedBy: row.requested_by,
    expiresAt: new Date(row.expires_at).toISOString(),
    ...(row.decided_at ? { decidedAt: new Date(row.decided_at).toISOString() } : {}),
    ...(row.decided_by ? { decidedBy: row.decided_by } : {}),
    ...(row.decision_note ? { decisionNote: row.decision_note } : {}),
  };
}

module.exports = { createApprovalRequest, listPendingApprovals, applyApprovalDecision, mapRowToApproval };
