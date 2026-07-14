// F054 -- Operational Analytics & Conversion Metrics. Persists
// MetricEvent rows (structurally payload-free, see
// src/domain -- assertValidMetricEvent's ALLOWED_FIELDS) and aggregates
// through the pure src/analytics/operationalMetrics.js functions rather
// than computing counts in SQL.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidMetricEvent, countByType, countByDay } = require("../analytics/operationalMetrics");

/**
 * @param {import("../analytics/operationalMetrics").MetricEvent} input
 * @param {{ sql?: Function, idGenerator?: () => string }} [deps]
 * @returns {Promise<void>}
 */
async function recordMetricEvent(input, deps = {}) {
  const sql = deps.sql || getSql();
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());
  assertValidMetricEvent(input);

  await sql`
    INSERT INTO metric_events (id, type, occurred_at, organization_id)
    VALUES (${idGenerator()}, ${input.type}, ${input.occurredAt}, ${input.organizationId || null})
  `;
}

/**
 * @param {{ from: string, to: string }} range
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<{ byType: Record<string, number>, byDay: Record<string, number> }>}
 */
async function getMetricsSummary(range, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`
    SELECT type, occurred_at FROM metric_events
    WHERE occurred_at >= ${range.from} AND occurred_at <= ${range.to}
  `;
  const events = rows.map((row) => ({ type: row.type, occurredAt: new Date(row.occurred_at).toISOString() }));
  return { byType: countByType(events), byDay: countByDay(events) };
}

module.exports = { recordMetricEvent, getMetricsSummary };
