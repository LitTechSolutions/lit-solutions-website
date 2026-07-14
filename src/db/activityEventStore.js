// F017 -- Unified Activity Timeline. Postgres persistence for the raw
// event stream; the merge/permission-filter/pagination logic stays in
// the existing pure src/timeline/activityTimeline.js (Session 2) --
// listActivityEventsForOrganization() here just fetches one
// organization's rows so a caller can pass them (alongside other
// sources) into buildTimeline().

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidActivityEvent } = require("../domain/activityEvent");

/**
 * @param {Omit<import("../domain/activityEvent").ActivityEvent, "id" | "occurredAt"> & { occurredAt?: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string }} [deps]
 * @returns {Promise<import("../domain/activityEvent").ActivityEvent>}
 */
async function recordActivityEvent(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

  const event = { ...input, id: idGenerator(), occurredAt: input.occurredAt || now().toISOString() };
  assertValidActivityEvent(event);

  await sql`
    INSERT INTO activity_events (id, organization_id, source_type, source_id, occurred_at, summary, customer_visible)
    VALUES (${event.id}, ${event.organizationId}, ${event.sourceType}, ${event.sourceId}, ${event.occurredAt}, ${event.summary}, ${event.customerVisible})
  `;
  return event;
}

/**
 * @param {string} organizationId
 * @param {{ sql?: Function, limit?: number }} [deps]
 * @returns {Promise<import("../domain/activityEvent").ActivityEvent[]>}
 */
async function listActivityEventsForOrganization(organizationId, deps = {}) {
  const sql = deps.sql || getSql();
  const limit = deps.limit ?? 200;
  const rows = await sql`
    SELECT * FROM activity_events
    WHERE organization_id = ${organizationId}
    ORDER BY occurred_at DESC
    LIMIT ${limit}
  `;
  return rows.map(mapRowToActivityEvent);
}

function mapRowToActivityEvent(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    summary: row.summary,
    customerVisible: row.customer_visible,
  };
}

module.exports = { recordActivityEvent, listActivityEventsForOrganization, mapRowToActivityEvent };
