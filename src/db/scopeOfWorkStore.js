// F026 -- Scope of Work & Estimate Generation. Postgres persistence wired
// to the existing pure src/policy/scopeVersioning.js -- versioning logic
// (increment version, mark superseded, never mutate in place) lives
// entirely there; this module only persists what it decides.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidScopeOfWork } = require("../domain/scopeOfWork");
const { createNextVersion } = require("../policy/scopeVersioning");
const { createAuditRecorder, shapeAuditEvent } = require("../audit/auditLog");
const { createPgAuditSink } = require("./pgAuditSink");

function resolveAuditRecorder(deps) {
  return deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));
}

/**
 * @param {{ organizationId: string, ticketId: string, assumptions: string[], exclusions: string[], lineItems: import("../domain/scopeOfWork").ScopeLineItem[], createdBy: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string, actorId?: string, auditRecorder?: object }} [deps]
 * @returns {Promise<import("../domain/scopeOfWork").ScopeOfWork>}
 */
async function createInitialScope(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());
  const auditRecorder = resolveAuditRecorder(deps);

  const scope = {
    id: idGenerator(),
    organizationId: input.organizationId,
    ticketId: input.ticketId,
    version: 1,
    status: "draft",
    assumptions: input.assumptions || [],
    exclusions: input.exclusions || [],
    lineItems: input.lineItems,
    createdAt: now().toISOString(),
    createdBy: input.createdBy,
  };
  assertValidScopeOfWork(scope);

  await sql`
    INSERT INTO scope_of_work (id, organization_id, ticket_id, version, status, assumptions, exclusions, line_items, created_at, created_by)
    VALUES (${scope.id}, ${scope.organizationId}, ${scope.ticketId}, ${scope.version}, ${scope.status}, ${JSON.stringify(scope.assumptions)}, ${JSON.stringify(scope.exclusions)}, ${JSON.stringify(scope.lineItems)}, ${scope.createdAt}, ${scope.createdBy})
  `;

  await auditRecorder.record(
    {
      correlationId: scope.id,
      actorType: "user",
      actorId: deps.actorId || "system",
      organizationId: scope.organizationId,
      action: "scope.create",
      targetType: "scope_of_work",
      targetId: scope.id,
      outcome: "success",
      metadata: { ticketId: scope.ticketId, version: scope.version },
    },
    deps
  );

  return scope;
}

/**
 * @param {string} id
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/scopeOfWork").ScopeOfWork | null>}
 */
async function getScopeById(id, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM scope_of_work WHERE id = ${id}`;
  return rows.length > 0 ? mapRowToScope(rows[0]) : null;
}

/**
 * Fetches the current version, creates the next version through the pure
 * scopeVersioning.js engine, and persists both the superseded old row
 * and the new row -- versioned records are never silently overwritten
 * (SYS-NFR-011).
 *
 * CH-H-02: the supersede-update, next-version insert, and audit event are
 * one indivisible statement (mirrors approvalStore.js/ticketStore.js's
 * pattern). The supersede UPDATE repeats the status predicate we already
 * read, so a concurrent caller versioning the same scope loses cleanly --
 * their INSERT/audit CTEs run "FROM superseded", which is empty if the
 * UPDATE matched no row, so the whole statement is a no-op for the loser
 * instead of two racing callers both creating a "version 2".
 *
 * @param {string} scopeId
 * @param {Pick<import("../domain/scopeOfWork").ScopeOfWork, "assumptions" | "exclusions" | "lineItems">} updates
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string, actorId?: string, auditRecorder?: object }} [deps]
 * @returns {Promise<import("../domain/scopeOfWork").ScopeOfWork>}
 */
async function createNextScopeVersion(scopeId, updates, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const current = await getScopeById(scopeId, { sql });
  if (!current) {
    throw new Error(`createNextScopeVersion: no scope "${scopeId}"`);
  }
  const { supersededPrevious, next } = createNextVersion(current, updates, deps);

  const nowIso = now().toISOString();
  const auditEvent = shapeAuditEvent(
    {
      correlationId: next.id,
      actorType: "user",
      actorId: deps.actorId || "system",
      organizationId: next.organizationId,
      action: "scope.new_version",
      targetType: "scope_of_work",
      targetId: next.id,
      outcome: "success",
      metadata: { scopeId, version: next.version },
    },
    { now: () => new Date(nowIso), idGenerator: deps.auditIdGenerator }
  );

  const written = await sql`
    WITH superseded AS (
      UPDATE scope_of_work
      SET status = ${supersededPrevious.status}
      WHERE id = ${current.id} AND status = ${current.status}
      RETURNING id
    ), inserted AS (
      INSERT INTO scope_of_work (id, organization_id, ticket_id, version, status, assumptions, exclusions, line_items, created_at, created_by)
      SELECT ${next.id}, ${next.organizationId}, ${next.ticketId}, ${next.version}, ${next.status}, ${JSON.stringify(next.assumptions)}, ${JSON.stringify(next.exclusions)}, ${JSON.stringify(next.lineItems)}, ${next.createdAt}, ${next.createdBy}
      FROM superseded
      RETURNING id
    ), audited AS (
      INSERT INTO audit_events (id, correlation_id, occurred_at, actor_type, actor_id, actor_role, organization_id, action, target_type, target_id, outcome, metadata)
      SELECT ${auditEvent.id}, ${auditEvent.correlationId}, ${auditEvent.occurredAt}, ${auditEvent.actorType}, ${auditEvent.actorId}, ${auditEvent.actorRole || null}, ${auditEvent.organizationId}, ${auditEvent.action}, ${auditEvent.targetType}, ${auditEvent.targetId}, ${auditEvent.outcome}, ${JSON.stringify(auditEvent.metadata)}
      FROM inserted
      RETURNING id
    )
    SELECT inserted.id FROM inserted INNER JOIN audited ON TRUE
  `;

  if (written.length === 0) {
    throw new Error("createNextScopeVersion: scope was versioned or superseded by another request");
  }

  return next;
}

/**
 * SECURITY: `organizationId` is required and constrains the query directly
 * -- found via independent review (Session 20 post-step-8): the original
 * version queried by `ticketId` alone, so an authenticated org_owner of
 * Org A supplying Org B's `ticketId` (with `organizationId: "org-a"` to
 * pass authentication) would get Org B's scope-of-work versions back. A
 * `ticketId` from another organization now simply matches no rows (empty
 * array), consistent with how every other list endpoint in this codebase
 * behaves for a caller with no visible data, rather than a distinct
 * not-found/error response that would confirm the ticket exists elsewhere.
 *
 * @param {string} ticketId
 * @param {string} organizationId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/scopeOfWork").ScopeOfWork[]>}
 */
async function listScopeVersionsForTicket(ticketId, organizationId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM scope_of_work WHERE ticket_id = ${ticketId} AND organization_id = ${organizationId} ORDER BY version`;
  return rows.map(mapRowToScope);
}

function mapRowToScope(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    ticketId: row.ticket_id,
    version: row.version,
    status: row.status,
    assumptions: row.assumptions || [],
    exclusions: row.exclusions || [],
    lineItems: row.line_items,
    createdAt: new Date(row.created_at).toISOString(),
    createdBy: row.created_by,
  };
}

module.exports = { createInitialScope, getScopeById, createNextScopeVersion, listScopeVersionsForTicket, mapRowToScope };
