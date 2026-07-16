// F027 -- Change Order Approval & Rejection. No new approval workflow
// here -- src/db/approvalStore.js (Session 11) already handles the
// "change_order" subject type through the pure src/policy/approvalWorkflow.js
// state machine (deciding/reading an approval still goes through that
// module). This module only persists the change_order record itself and
// creates the paired approval request, matching the "no out-of-scope work
// begins without written customer approval" policy (OWNER_DECISIONS.md #2)
// as a structural guarantee: a change order exists in the database with
// no legal path to "approved" that doesn't go through the same approval
// machinery every other approval uses.
//
// CH-H-02: the change-order insert, its paired approval-request insert,
// and both audit events used to be four separate statements -- a crash or
// partial failure between them could leave a change order with no
// approval request at all (permanently unapprovable). approvalStore.js's
// createApprovalRequest() has exactly one caller (this file), so its
// minimal insert logic is duplicated here (not called) to fold everything
// into one indivisible statement, the same pattern approvalStore.js/
// ticketStore.js/scopeOfWorkStore.js already use for their own writes.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidChangeOrder } = require("../domain/changeOrder");
const { assertValidApprovalRequest } = require("../domain/approval");
const { shapeAuditEvent } = require("../audit/auditLog");

const DEFAULT_APPROVAL_WINDOW_DAYS = 14; // engineering default, not owner-approved -- matches ticketLifecycle.js's reopen-window precedent.

/**
 * @param {{ organizationId: string, originalScopeId: string, description: string, addedLineItems: import("../domain/scopeOfWork").ScopeLineItem[], createdBy: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string, approvalWindowDays?: number, actorId?: string }} [deps]
 * @returns {Promise<{ changeOrder: import("../domain/changeOrder").ChangeOrder, approval: import("../domain/approval").ApprovalRequest }>}
 */
async function createChangeOrder(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());
  const approvalWindowDays = deps.approvalWindowDays ?? DEFAULT_APPROVAL_WINDOW_DAYS;

  const changeOrder = {
    id: idGenerator(),
    organizationId: input.organizationId,
    originalScopeId: input.originalScopeId,
    description: input.description,
    addedLineItems: input.addedLineItems,
    createdAt: now().toISOString(),
    createdBy: input.createdBy,
  };
  assertValidChangeOrder(changeOrder);

  const expiresAt = new Date(now().getTime() + approvalWindowDays * 24 * 60 * 60 * 1000).toISOString();
  const approval = {
    id: idGenerator(),
    organizationId: input.organizationId,
    subjectType: "change_order",
    subjectId: changeOrder.id,
    status: "pending",
    requestedAt: now().toISOString(),
    requestedBy: input.createdBy,
    expiresAt,
  };
  assertValidApprovalRequest(approval);

  const approvalAuditEvent = shapeAuditEvent(
    {
      correlationId: approval.id,
      actorType: "user",
      actorId: deps.actorId || "system",
      organizationId: approval.organizationId,
      action: "approval.create",
      targetType: "approval_request",
      targetId: approval.id,
      outcome: "success",
      metadata: { subjectType: approval.subjectType, subjectId: approval.subjectId },
    },
    { now, idGenerator: deps.auditIdGenerator }
  );
  const changeOrderAuditEvent = shapeAuditEvent(
    {
      correlationId: changeOrder.id,
      actorType: "user",
      actorId: deps.actorId || "system",
      organizationId: changeOrder.organizationId,
      action: "change_order.create",
      targetType: "change_order",
      targetId: changeOrder.id,
      outcome: "success",
      metadata: { approvalId: approval.id, originalScopeId: changeOrder.originalScopeId },
    },
    { now, idGenerator: deps.auditIdGenerator }
  );

  // CH-H-02: one statement makes the change-order insert, its paired
  // approval-request insert, and both audit events indivisible -- a
  // change order can no longer exist without its approval request (or
  // vice versa), and neither can exist without an audit trail.
  await sql`
    WITH inserted_co AS (
      INSERT INTO change_orders (id, organization_id, original_scope_id, description, added_line_items, created_at, created_by)
      VALUES (${changeOrder.id}, ${changeOrder.organizationId}, ${changeOrder.originalScopeId}, ${changeOrder.description}, ${JSON.stringify(changeOrder.addedLineItems)}, ${changeOrder.createdAt}, ${changeOrder.createdBy})
      RETURNING id
    ), inserted_approval AS (
      INSERT INTO approval_requests (id, organization_id, subject_type, subject_id, status, requested_at, requested_by, expires_at)
      SELECT ${approval.id}, ${approval.organizationId}, ${approval.subjectType}, ${approval.subjectId}, ${approval.status}, ${approval.requestedAt}, ${approval.requestedBy}, ${approval.expiresAt}
      FROM inserted_co
      RETURNING id
    ), audited_approval AS (
      INSERT INTO audit_events (id, correlation_id, occurred_at, actor_type, actor_id, actor_role, organization_id, action, target_type, target_id, outcome, metadata)
      SELECT ${approvalAuditEvent.id}, ${approvalAuditEvent.correlationId}, ${approvalAuditEvent.occurredAt}, ${approvalAuditEvent.actorType}, ${approvalAuditEvent.actorId}, ${approvalAuditEvent.actorRole || null}, ${approvalAuditEvent.organizationId}, ${approvalAuditEvent.action}, ${approvalAuditEvent.targetType}, ${approvalAuditEvent.targetId}, ${approvalAuditEvent.outcome}, ${JSON.stringify(approvalAuditEvent.metadata)}
      FROM inserted_approval
      RETURNING id
    ), audited_co AS (
      INSERT INTO audit_events (id, correlation_id, occurred_at, actor_type, actor_id, actor_role, organization_id, action, target_type, target_id, outcome, metadata)
      SELECT ${changeOrderAuditEvent.id}, ${changeOrderAuditEvent.correlationId}, ${changeOrderAuditEvent.occurredAt}, ${changeOrderAuditEvent.actorType}, ${changeOrderAuditEvent.actorId}, ${changeOrderAuditEvent.actorRole || null}, ${changeOrderAuditEvent.organizationId}, ${changeOrderAuditEvent.action}, ${changeOrderAuditEvent.targetType}, ${changeOrderAuditEvent.targetId}, ${changeOrderAuditEvent.outcome}, ${JSON.stringify(changeOrderAuditEvent.metadata)}
      FROM audited_approval
      RETURNING id
    )
    SELECT 1 AS ok FROM audited_co
  `;

  return { changeOrder, approval };
}

/**
 * SECURITY: `organizationId` is required and constrains the query directly
 * -- found via independent review (Session 20 post-step-8): the original
 * version queried by `id` alone, so an authenticated org_owner of Org A
 * supplying Org B's `changeOrderId` (with `organizationId: "org-a"` to pass
 * authentication) would get Org B's change order back. A mismatched id now
 * simply returns `null`, which `change-orders.js` already maps to a plain
 * 404 -- indistinguishable from a genuinely nonexistent id.
 *
 * @param {string} id
 * @param {string} organizationId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/changeOrder").ChangeOrder | null>}
 */
async function getChangeOrderById(id, organizationId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM change_orders WHERE id = ${id} AND organization_id = ${organizationId}`;
  return rows.length > 0 ? mapRowToChangeOrder(rows[0]) : null;
}

/**
 * @param {string} organizationId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/changeOrder").ChangeOrder[]>}
 */
async function listChangeOrdersForOrganization(organizationId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM change_orders WHERE organization_id = ${organizationId} ORDER BY created_at DESC`;
  return rows.map(mapRowToChangeOrder);
}

function mapRowToChangeOrder(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    originalScopeId: row.original_scope_id,
    description: row.description,
    addedLineItems: row.added_line_items,
    createdAt: new Date(row.created_at).toISOString(),
    createdBy: row.created_by,
  };
}

module.exports = { createChangeOrder, getChangeOrderById, listChangeOrdersForOrganization, mapRowToChangeOrder, DEFAULT_APPROVAL_WINDOW_DAYS };
