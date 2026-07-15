// F019/F023/F029 -- Ticket Submission & Lifecycle. Postgres persistence
// wired to the existing pure logic: creation goes through
// src/policy/ticketSubmission.js (which rejects placeholder-junk values,
// fixing audit finding F018), status changes go through
// src/policy/ticketLifecycle.js's state machine -- this module never
// decides what's legal, it only persists what the pure functions allow.
//
// Every state-changing call records an audit event (SYS-NFR-020), same
// pattern as invitationStore.js -- tickets are now reachable
// cross-organization by platform_admin (Session 20 RBAC decision), so
// "who did what to which org's ticket" must be reconstructable.

const { getSql } = require("./pgClient");
const { shapeTicketSubmission } = require("../policy/ticketSubmission");
const { transitionTicketStatus } = require("../policy/ticketLifecycle");
const { createAuditRecorder } = require("../audit/auditLog");
const { createPgAuditSink } = require("./pgAuditSink");
const { shapeAuditEvent } = require("../audit/auditLog");

function resolveAuditRecorder(deps) {
  return deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));
}

/**
 * @param {import("../policy/ticketSubmission").TicketSubmissionInput} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string, auditRecorder?: object }} [deps]
 * @returns {Promise<import("../domain/ticket").Ticket>}
 */
async function createTicket(input, deps = {}) {
  const sql = deps.sql || getSql();
  const auditRecorder = resolveAuditRecorder(deps);
  const ticket = shapeTicketSubmission(input, deps); // validation + placeholder-junk rejection happens here

  await sql`
    INSERT INTO tickets (id, organization_id, category, subject, description, status, details, submitted_at, submitted_by, updated_at, version)
    VALUES (${ticket.id}, ${ticket.organizationId}, ${ticket.category}, ${ticket.subject}, ${ticket.description}, ${ticket.status}, ${ticket.details ? JSON.stringify(ticket.details) : null}, ${ticket.submittedAt}, ${ticket.submittedBy}, ${ticket.updatedAt}, ${ticket.version})
  `;

  await auditRecorder.record(
    {
      correlationId: ticket.id,
      actorType: "user",
      actorId: ticket.submittedBy,
      organizationId: ticket.organizationId,
      action: "ticket.create",
      targetType: "ticket",
      targetId: ticket.id,
      outcome: "success",
      metadata: { category: ticket.category },
    },
    deps
  );

  return ticket;
}

/**
 * @param {string} id
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/ticket").Ticket | null>}
 */
async function getTicketById(id, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM tickets WHERE id = ${id}`;
  return rows.length > 0 ? mapRowToTicket(rows[0]) : null;
}

/**
 * @param {string} organizationId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/ticket").Ticket[]>}
 */
async function listTicketsForOrganization(organizationId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM tickets WHERE organization_id = ${organizationId} ORDER BY updated_at DESC`;
  return rows.map(mapRowToTicket);
}

/**
 * Fetch, validate the transition through the pure state machine, and
 * persist only if legal -- same fetch-validate-transition-persist shape
 * as approvalStore.js's applyApprovalDecision().
 *
 * @param {string} id
 * @param {import("../domain/ticket").TicketStatus} nextStatus
 * @param {string | null} [actorId] - who performed the transition, for the audit record; null when not known (e.g. system-driven transitions).
 * @param {{ sql?: Function, now?: () => Date, auditRecorder?: object }} [deps]
 * @returns {Promise<import("../domain/ticket").Ticket>}
 */
async function transitionTicket(id, nextStatus, actorId = null, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const auditRecorder = resolveAuditRecorder(deps);

  const current = await getTicketById(id, { sql });
  if (!current) {
    throw new Error(`transitionTicket: no ticket "${id}"`);
  }
  const decision = transitionTicketStatus(current.status, nextStatus);
  if (!decision.allowed) {
    throw new Error(`transitionTicket: ${decision.reason}`);
  }

  const nowIso = now().toISOString();
  const closedAt = nextStatus === "closed" ? nowIso : null;
  const auditEvent = shapeAuditEvent({
    correlationId: id,
    actorType: "user",
    actorId: actorId || "system",
    organizationId: current.organizationId,
    action: "ticket.transition",
    targetType: "ticket",
    targetId: id,
    outcome: "success",
    metadata: { fromStatus: current.status, toStatus: nextStatus },
  }, { now: () => new Date(nowIso), idGenerator: deps.auditIdGenerator });
  const changed = await sql`
    WITH changed AS (
      UPDATE tickets
      SET status = ${nextStatus}, updated_at = ${nowIso}, closed_at = COALESCE(${closedAt}, closed_at), version = version + 1
      WHERE id = ${id} AND status = ${current.status} AND version = ${current.version}
      RETURNING *
    ), audited AS (
      INSERT INTO audit_events (id, correlation_id, occurred_at, actor_type, actor_id, actor_role, organization_id, action, target_type, target_id, outcome, metadata)
      SELECT ${auditEvent.id}, ${auditEvent.correlationId}, ${auditEvent.occurredAt}, ${auditEvent.actorType}, ${auditEvent.actorId}, ${auditEvent.actorRole || null}, ${auditEvent.organizationId}, ${auditEvent.action}, ${auditEvent.targetType}, ${auditEvent.targetId}, ${auditEvent.outcome}, ${JSON.stringify(auditEvent.metadata)}
      FROM changed RETURNING id
    )
    SELECT changed.* FROM changed INNER JOIN audited ON TRUE
  `;
  if (changed.length === 0) throw new Error("transitionTicket: ticket changed by another request");

  return { ...current, status: nextStatus, updatedAt: nowIso, version: current.version + 1 };
}

function mapRowToTicket(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    category: row.category,
    subject: row.subject,
    description: row.description,
    status: row.status,
    ...(row.details ? { details: row.details } : {}),
    submittedAt: new Date(row.submitted_at).toISOString(),
    submittedBy: row.submitted_by,
    updatedAt: new Date(row.updated_at).toISOString(),
    version: row.version,
  };
}

module.exports = { createTicket, getTicketById, listTicketsForOrganization, transitionTicket, mapRowToTicket };
