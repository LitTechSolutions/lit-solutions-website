// Postgres-backed implementation of the AuditSink interface from
// src/audit/auditLog.js -- same interface as src/audit/blobsAuditSink.js,
// so this is a drop-in swap now that the data-store decision is made.
// This is specifically why F008 was built against an interface
// (AuditSink) rather than coupled to Blobs directly back in Session 1 --
// the swap costs nothing at the call-site level.
//
// Real indexes (idx_audit_org, idx_audit_actor, idx_audit_action) replace
// Blobs' list()-scan-and-filter, addressing the scaling concern flagged
// in DATA_MODEL.md since Session 0: audit events are exactly the
// high-volume, query-by-org/actor/date-range data that benefits most
// from real indexes.

const { getSql } = require("./pgClient");

/**
 * @param {{ sql?: Function }} [deps]
 * @returns {import("../audit/auditLog").AuditSink & { listByOrganization: (organizationId: string) => Promise<import("../domain/auditEvent").AuditEvent[]> }}
 */
function createPgAuditSink(deps = {}) {
  const sql = deps.sql || getSql();

  return {
    async write(event) {
      await sql`
        INSERT INTO audit_events (id, correlation_id, occurred_at, actor_type, actor_id, actor_role, organization_id, action, target_type, target_id, outcome, metadata)
        VALUES (${event.id}, ${event.correlationId}, ${event.occurredAt}, ${event.actorType}, ${event.actorId}, ${event.actorRole || null}, ${event.organizationId}, ${event.action}, ${event.targetType || null}, ${event.targetId || null}, ${event.outcome}, ${event.metadata ? JSON.stringify(event.metadata) : null})
      `;
    },

    async listByOrganization(organizationId) {
      const rows = await sql`
        SELECT * FROM audit_events
        WHERE organization_id = ${organizationId}
        ORDER BY occurred_at DESC
        LIMIT 200
      `;
      return rows.map(mapRowToAuditEvent);
    },

    async queryAuditEvents(filters = {}) {
      return queryAuditEvents(sql, filters);
    },
  };
}

// F008 audit-log viewer (platform_admin-only, netlify/functions/audit-log.js).
// Cursor-based (occurred_at, id) keyset pagination, newest-first --
// offset pagination on a high-volume append-only table degrades as the
// offset grows, keyset pagination doesn't. Reuses mapRowToAuditEvent
// rather than duplicating row-shaping logic; the query itself must be
// built with sql.query(text, params) instead of the tagged-template form
// used everywhere else in this file, because the WHERE clause is
// genuinely conditional on which filters were supplied (see the
// migration-runner lesson in DECISION_LOG.md: sql.unsafe() is an
// interpolation marker, not an execution path -- sql.query() is the
// real parameterized-query escape hatch).
//
// @param {import("@neondatabase/serverless").NeonQueryFunction<false, false>} sql
// @param {{ organizationId?: string, actorId?: string, action?: string, dateFrom?: string, dateTo?: string, cursor?: string, limit?: number }} filters
// @returns {Promise<{ events: import("../domain/auditEvent").AuditEvent[], nextCursor: string | null }>}
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

async function queryAuditEvents(sql, filters = {}) {
  const conditions = [];
  const params = [];

  function addCondition(clause, value) {
    params.push(value);
    conditions.push(clause.replace("?", `$${params.length}`));
  }

  if (filters.organizationId) addCondition("organization_id = ?", filters.organizationId);
  if (filters.actorId) addCondition("actor_id = ?", filters.actorId);
  if (filters.action) addCondition("action = ?", filters.action);
  if (filters.dateFrom) addCondition("occurred_at >= ?", filters.dateFrom);
  if (filters.dateTo) addCondition("occurred_at <= ?", filters.dateTo);

  const cursor = decodeAuditCursor(filters.cursor);
  if (cursor) {
    params.push(cursor.occurredAt, cursor.id);
    conditions.push(`(occurred_at, id) < ($${params.length - 1}, $${params.length})`);
  }

  const limit = Math.min(Math.max(Number.parseInt(filters.limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  params.push(limit + 1); // fetch one extra row to know whether a next page exists

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const text = `SELECT * FROM audit_events ${whereClause} ORDER BY occurred_at DESC, id DESC LIMIT $${params.length}`;

  const rows = await sql.query(text, params);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const events = page.map(mapRowToAuditEvent);
  const last = events[events.length - 1];
  const nextCursor = hasMore && last ? encodeAuditCursor(last.occurredAt, last.id) : null;

  return { events, nextCursor };
}

function encodeAuditCursor(occurredAt, id) {
  return Buffer.from(JSON.stringify({ occurredAt, id }), "utf8").toString("base64url");
}

function decodeAuditCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof parsed.occurredAt !== "string" || typeof parsed.id !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function mapRowToAuditEvent(row) {
  return {
    id: row.id,
    correlationId: row.correlation_id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    actorType: row.actor_type,
    actorId: row.actor_id,
    ...(row.actor_role ? { actorRole: row.actor_role } : {}),
    organizationId: row.organization_id,
    action: row.action,
    ...(row.target_type ? { targetType: row.target_type } : {}),
    ...(row.target_id ? { targetId: row.target_id } : {}),
    outcome: row.outcome,
    ...(row.metadata ? { metadata: row.metadata } : {}),
  };
}

module.exports = { createPgAuditSink, mapRowToAuditEvent, queryAuditEvents, encodeAuditCursor, decodeAuditCursor, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE };
