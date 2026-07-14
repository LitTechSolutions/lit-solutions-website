// F054 -- Operational Analytics & Conversion Metrics. Structural
// implementation of "without invasive tracking or exposing sensitive
// customer content" (F054's own objective): MetricEvent has exactly three
// allowed fields (type, occurredAt, organizationId) and nothing else --
// there is no free-form payload/metadata field at all, unlike
// auditEvent.js's typed-but-present metadata. Analytics events cannot
// carry message bodies, file content, or form submissions because the
// shape doesn't have anywhere to put them.

const ALLOWED_FIELDS = new Set(["type", "occurredAt", "organizationId"]);

/**
 * @typedef {Object} MetricEvent
 * @property {string} type - e.g. "lead.created", "ticket.submitted", "quote.accepted".
 * @property {string} occurredAt
 * @property {string} [organizationId] - Optional: present for per-org breakdowns, omitted for anonymous/pre-account events (e.g. a lead that never became a customer).
 */

/**
 * @param {Partial<MetricEvent>} candidate
 * @returns {asserts candidate is MetricEvent}
 */
function assertValidMetricEvent(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("metricEvent: expected an object");
  const extraFields = Object.keys(candidate).filter((key) => !ALLOWED_FIELDS.has(key));
  if (extraFields.length > 0) {
    throw new Error(`metricEvent: unexpected field(s) ${extraFields.join(", ")} -- MetricEvent has no payload field; customer content must never be tracked here (F054 objective)`);
  }
  if (typeof candidate.type !== "string" || candidate.type.length === 0) throw new Error("metricEvent: type is required");
  if (typeof candidate.occurredAt !== "string") throw new Error("metricEvent: occurredAt is required");
}

/**
 * @param {MetricEvent[]} events
 * @returns {Record<string, number>}
 */
function countByType(events) {
  for (const event of events) assertValidMetricEvent(event);
  const counts = {};
  for (const event of events) {
    counts[event.type] = (counts[event.type] || 0) + 1;
  }
  return counts;
}

/**
 * @param {MetricEvent[]} events
 * @returns {Record<string, number>} counts keyed by "YYYY-MM-DD".
 */
function countByDay(events) {
  for (const event of events) assertValidMetricEvent(event);
  const counts = {};
  for (const event of events) {
    const day = event.occurredAt.slice(0, 10);
    counts[day] = (counts[day] || 0) + 1;
  }
  return counts;
}

module.exports = { assertValidMetricEvent, countByType, countByDay, ALLOWED_FIELDS };
