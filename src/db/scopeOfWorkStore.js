// F026 -- Scope of Work & Estimate Generation. Postgres persistence wired
// to the existing pure src/policy/scopeVersioning.js -- versioning logic
// (increment version, mark superseded, never mutate in place) lives
// entirely there; this module only persists what it decides.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidScopeOfWork } = require("../domain/scopeOfWork");
const { createNextVersion } = require("../policy/scopeVersioning");
const { createAuditRecorder } = require("../audit/auditLog");
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
 * @param {string} scopeId
 * @param {Pick<import("../domain/scopeOfWork").ScopeOfWork, "assumptions" | "exclusions" | "lineItems">} updates
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string, actorId?: string, auditRecorder?: object }} [deps]
 * @returns {Promise<import("../domain/scopeOfWork").ScopeOfWork>}
 */
async function createNextScopeVersion(scopeId, updates, deps = {}) {
  const sql = deps.sql || getSql();
  const auditRecorder = resolveAuditRecorder(deps);
  const current = await getScopeById(scopeId, { sql });
  if (!current) {
    throw new Error(`createNextScopeVersion: no scope "${scopeId}"`);
  }
  const { supersededPrevious, next } = createNextVersion(current, updates, deps);

  await sql`UPDATE scope_of_work SET status = ${supersededPrevious.status} WHERE id = ${current.id}`;
  await sql`
    INSERT INTO scope_of_work (id, organization_id, ticket_id, version, status, assumptions, exclusions, line_items, created_at, created_by)
    VALUES (${next.id}, ${next.organizationId}, ${next.ticketId}, ${next.version}, ${next.status}, ${JSON.stringify(next.assumptions)}, ${JSON.stringify(next.exclusions)}, ${JSON.stringify(next.lineItems)}, ${next.createdAt}, ${next.createdBy})
  `;

  await auditRecorder.record(
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
    deps
  );

  return next;
}

/**
 * @param {string} ticketId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/scopeOfWork").ScopeOfWork[]>}
 */
async function listScopeVersionsForTicket(ticketId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM scope_of_work WHERE ticket_id = ${ticketId} ORDER BY version`;
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
