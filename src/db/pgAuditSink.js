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
  };
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

module.exports = { createPgAuditSink, mapRowToAuditEvent };
