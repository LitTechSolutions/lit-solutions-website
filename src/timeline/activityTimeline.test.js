const test = require("node:test");
const assert = require("node:assert/strict");
const { buildTimeline, DEFAULT_LIMIT, MAX_LIMIT } = require("./activityTimeline");

function event(overrides = {}) {
  return {
    id: `evt-${Math.random()}`,
    organizationId: "org-a",
    sourceType: "ticket",
    sourceId: "ticket-1",
    occurredAt: "2026-07-01T00:00:00.000Z",
    summary: "something happened",
    customerVisible: true,
    ...overrides,
  };
}

test("merges multiple sources and sorts newest first", () => {
  const older = event({ occurredAt: "2026-07-01T00:00:00.000Z", summary: "older" });
  const newer = event({ occurredAt: "2026-07-10T00:00:00.000Z", summary: "newer" });
  const result = buildTimeline([[older], [newer]], { organizationId: "org-a", viewerRole: "org_owner" });
  assert.deepEqual(result.map((e) => e.summary), ["newer", "older"]);
});

test("excludes events from other organizations", () => {
  const orgAEvent = event({ organizationId: "org-a" });
  const orgBEvent = event({ organizationId: "org-b" });
  const result = buildTimeline([[orgAEvent, orgBEvent]], { organizationId: "org-a", viewerRole: "org_owner" });
  assert.equal(result.length, 1);
  assert.equal(result[0].organizationId, "org-a");
});

test("customer-facing roles never see customerVisible: false events", () => {
  const staffOnly = event({ customerVisible: false, summary: "internal note" });
  const visible = event({ customerVisible: true, summary: "customer update" });
  for (const role of ["org_owner", "org_member", "read_only_customer"]) {
    const result = buildTimeline([[staffOnly, visible]], { organizationId: "org-a", viewerRole: role });
    assert.deepEqual(result.map((e) => e.summary), ["customer update"], `role ${role} should not see staff-only events`);
  }
});

test("technician and platform_admin see everything, including customerVisible: false", () => {
  const staffOnly = event({ customerVisible: false, summary: "internal note" });
  const visible = event({ customerVisible: true, summary: "customer update" });
  for (const role of ["technician", "platform_admin"]) {
    const result = buildTimeline([[staffOnly, visible]], { organizationId: "org-a", viewerRole: role });
    assert.equal(result.length, 2, `role ${role} should see both`);
  }
});

test("defaults to a bounded page size and never exceeds the hard max", () => {
  const many = Array.from({ length: 300 }, (_, i) => event({ occurredAt: new Date(2026, 0, i + 1).toISOString() }));
  const defaultResult = buildTimeline([many], { organizationId: "org-a", viewerRole: "org_owner" });
  assert.equal(defaultResult.length, DEFAULT_LIMIT);

  const overRequested = buildTimeline([many], { organizationId: "org-a", viewerRole: "org_owner", limit: 10_000 });
  assert.equal(overRequested.length, MAX_LIMIT);
});

test("throws without an organizationId (no accidental unscoped query)", () => {
  assert.throws(() => buildTimeline([[event()]], { viewerRole: "org_owner" }), /organizationId is required/);
});
