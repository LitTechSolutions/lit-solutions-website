const test = require("node:test");
const assert = require("node:assert/strict");
const { recordMetricEvent, getMetricsSummary } = require("./metricsStore");

const FIXED_ID = () => "metric-fixed-id";

function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return cannedRows;
  };
  tag.calls = calls;
  return tag;
}

test("recordMetricEvent rejects a field outside the allowlist before querying", async () => {
  const sql = fakeSql();
  await assert.rejects(() => recordMetricEvent({ type: "ticket.submitted", occurredAt: "2026-07-14T00:00:00.000Z", messageBody: "leak" }, { sql, idGenerator: FIXED_ID }));
  assert.equal(sql.calls.length, 0);
});

test("recordMetricEvent inserts a valid event", async () => {
  const sql = fakeSql();
  await recordMetricEvent({ type: "ticket.submitted", occurredAt: "2026-07-14T00:00:00.000Z", organizationId: "org-a" }, { sql, idGenerator: FIXED_ID });
  assert.match(sql.calls[0].text, /INSERT INTO metric_events/);
});

// Integration: fetched rows feed into the pure operationalMetrics.js aggregators.
test("integration: getMetricsSummary aggregates fetched rows via operationalMetrics.js", async () => {
  const sql = fakeSql([
    { type: "ticket.submitted", occurred_at: "2026-07-14T01:00:00.000Z" },
    { type: "ticket.submitted", occurred_at: "2026-07-14T05:00:00.000Z" },
    { type: "lead.created", occurred_at: "2026-07-15T01:00:00.000Z" },
  ]);
  const summary = await getMetricsSummary({ from: "2026-07-01T00:00:00.000Z", to: "2026-07-31T00:00:00.000Z" }, { sql });
  assert.deepEqual(summary.byType, { "ticket.submitted": 2, "lead.created": 1 });
  assert.deepEqual(summary.byDay, { "2026-07-14": 2, "2026-07-15": 1 });
});

test("getMetricsSummary handles an empty range", async () => {
  const sql = fakeSql([]);
  const summary = await getMetricsSummary({ from: "2026-01-01T00:00:00.000Z", to: "2026-01-31T00:00:00.000Z" }, { sql });
  assert.deepEqual(summary.byType, {});
});
