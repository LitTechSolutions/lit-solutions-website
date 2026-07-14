const test = require("node:test");
const assert = require("node:assert/strict");
const { assertValidMetricEvent, countByType, countByDay } = require("./operationalMetrics");

function event(overrides = {}) {
  return { type: "ticket.submitted", occurredAt: "2026-07-14T10:00:00.000Z", ...overrides };
}

test("accepts a valid minimal event", () => {
  assert.doesNotThrow(() => assertValidMetricEvent(event()));
});

test("rejects any field outside type/occurredAt/organizationId -- no payload field exists", () => {
  assert.throws(() => assertValidMetricEvent(event({ messageBody: "hello" })), /unexpected field/);
  assert.throws(() => assertValidMetricEvent(event({ customerEmail: "x@example.com" })), /unexpected field/);
  assert.throws(() => assertValidMetricEvent(event({ formData: {} })), /unexpected field/);
});

test("organizationId is optional (anonymous/pre-account events allowed)", () => {
  assert.doesNotThrow(() => assertValidMetricEvent({ type: "lead.created", occurredAt: "2026-07-14T10:00:00.000Z" }));
});

test("countByType tallies events per type", () => {
  const counts = countByType([event({ type: "ticket.submitted" }), event({ type: "ticket.submitted" }), event({ type: "lead.created" })]);
  assert.deepEqual(counts, { "ticket.submitted": 2, "lead.created": 1 });
});

test("countByDay buckets events by calendar day, ignoring time-of-day", () => {
  const counts = countByDay([
    event({ occurredAt: "2026-07-14T01:00:00.000Z" }),
    event({ occurredAt: "2026-07-14T23:00:00.000Z" }),
    event({ occurredAt: "2026-07-15T01:00:00.000Z" }),
  ]);
  assert.deepEqual(counts, { "2026-07-14": 2, "2026-07-15": 1 });
});

test("countByType and countByDay validate every event, not just the first", () => {
  assert.throws(() => countByType([event(), event({ leakedField: "x" })]));
  assert.throws(() => countByDay([event(), event({ leakedField: "x" })]));
});
