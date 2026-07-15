// F027 -- Change Order Approval & Rejection. No new approval workflow
// here -- src/db/approvalStore.js (Session 11) already handles the
// "change_order" subject type through the pure src/policy/approvalWorkflow.js
// state machine. This module only persists the change_order record
// itself and creates the paired approval request, matching the "no
// out-of-scope work begins without written customer approval" policy
// (OWNER_DECISIONS.md #2) as a structural guarantee: a change order
// exists in the database with no legal path to "approved" that doesn't
// go through the same approval machinery every other approval uses.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidChangeOrder } = require("../domain/changeOrder");
const { createApprovalRequest } = require("./approvalStore");
const { createAuditRecorder } = require("../audit/auditLog");
const { createPgAuditSink } = require("./pgAuditSink");

const DEFAULT_APPROVAL_WINDOW_DAYS = 14; // engineering default, not owner-approved -- matches ticketLifecycle.js's reopen-window precedent.

function resolveAuditRecorder(deps) {
  return deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));
}

/**
 * @param {{ organizationId: string, originalScopeId: string, description: string, addedLineItems: import("../domain/scopeOfWork").ScopeLineItem[], createdBy: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string, approvalWindowDays?: number, actorId?: string, auditRecorder?: object }} [deps]
 * @returns {Promise<{ changeOrder: import("../domain/changeOrder").ChangeOrder, approval: import("../domain/approval").ApprovalRequest }>}
 */
async function createChangeOrder(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());
  const approvalWindowDays = deps.approvalWindowDays ?? DEFAULT_APPROVAL_WINDOW_DAYS;
  const auditRecorder = resolveAuditRecorder(deps);

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

  await sql`
    INSERT INTO change_orders (id, organization_id, original_scope_id, description, added_line_items, created_at, created_by)
    VALUES (${changeOrder.id}, ${changeOrder.organizationId}, ${changeOrder.originalScopeId}, ${changeOrder.description}, ${JSON.stringify(changeOrder.addedLineItems)}, ${changeOrder.createdAt}, ${changeOrder.createdBy})
  `;

  const expiresAt = new Date(now().getTime() + approvalWindowDays * 24 * 60 * 60 * 1000).toISOString();
  const approval = await createApprovalRequest(
    { organizationId: input.organizationId, subjectType: "change_order", subjectId: changeOrder.id, requestedBy: input.createdBy, expiresAt },
    { sql, now, idGenerator, auditRecorder, actorId: deps.actorId }
  );

  await auditRecorder.record(
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
    deps
  );

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
