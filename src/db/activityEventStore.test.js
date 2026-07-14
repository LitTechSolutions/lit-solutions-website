const test = require("node:test");
const assert = require("node:assert/strict");
const { recordActivityEvent, listActivityEventsForOrganization, mapRowToActivityEvent } = require("./activityEventStore");
const { buildTimeline } = require("../timeline/activityTimeline");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "activity-fixed-id";

function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return cannedRows;
  };
  tag.calls = calls;
  return tag;
}

test("recordActivityEvent validates and inserts", async () => {
  const sql = fakeSql();
  const event = await recordActivityEvent(
    { organizationId: "org-a", sourceType: "ticket", sourceId: "ticket-1", summary: "Ticket submitted", customerVisible: true },
    { sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(event.id, "activity-fixed-id");
  assert.match(sql.calls[0].text, /INSERT INTO activity_events/);
});

test("listActivityEventsForOrganization defaults to a bounded limit", async () => {
  const sql = fakeSql([]);
  await listActivityEventsForOrganization("org-a", { sql });
  assert.match(sql.calls[0].text, /LIMIT/);
  assert.ok(sql.calls[0].values.includes(200));
});

// Integration: persisted rows feed directly into the pure buildTimeline().
test("integration: rows fetched from the store feed directly into activityTimeline.js's buildTimeline()", async () => {
  const sql = fakeSql([
    {
      id: "a1",
      organization_id: "org-a",
      source_type: "ticket",
      source_id: "t1",
      occurred_at: "2026-07-10T00:00:00.000Z",
      summary: "Ticket resolved",
      customer_visible: true,
    },
    {
      id: "a2",
      organization_id: "org-a",
      source_type: "ticket",
      source_id: "t1",
      occurred_at: "2026-07-01T00:00:00.000Z",
      summary: "Internal triage note",
      customer_visible: false,
    },
  ]);
  const events = await listActivityEventsForOrganization("org-a", { sql });
  const customerTimeline = buildTimeline([events], { organizationId: "org-a", viewerRole: "org_owner" });
  const staffTimeline = buildTimeline([events], { organizationId: "org-a", viewerRole: "technician" });

  assert.equal(customerTimeline.length, 1, "customer view excludes the internal-only event");
  assert.equal(staffTimeline.length, 2, "staff view sees everything");
});

test("mapRowToActivityEvent maps every field", () => {
  const mapped = mapRowToActivityEvent({ id: "a1", organization_id: "org-a", source_type: "document", source_id: "d1", occurred_at: "2026-07-01T00:00:00.000Z", summary: "x", customer_visible: true });
  assert.equal(mapped.sourceType, "document");
  assert.equal(mapped.customerVisible, true);
});
