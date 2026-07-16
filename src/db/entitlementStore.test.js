const test = require("node:test");
const assert = require("node:assert/strict");
const {
  upsertEntitlementLimit,
  getEntitlementLimit,
  listEntitlementLimitsForPlan,
  recordUsage,
  resolvePeriodStart,
} = require("./entitlementStore");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
let idCounter = 0;
const SEQUENTIAL_ID = () => `usage-${++idCounter}`;

function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return typeof cannedRows === "function" ? cannedRows(calls.length) : cannedRows;
  };
  tag.calls = calls;
  return tag;
}

function fakeAuditRecorder() {
  const events = [];
  return { record: async (input) => { events.push(input); return input; }, events };
}

test("upsertEntitlementLimit inserts with ON CONFLICT upsert semantics", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const limit = { planKey: "website_care", usageKey: "monthly_edit_minutes", limit: 30, resetPeriod: "monthly" };
  await upsertEntitlementLimit(limit, { sql, actorId: "user-admin-1", auditRecorder });
  assert.match(sql.calls[0].text, /INSERT INTO entitlement_limits/);
  assert.match(sql.calls[0].text, /ON CONFLICT/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "entitlement.limit_set");
  assert.equal(auditRecorder.events[0].actorId, "user-admin-1");
  assert.equal(auditRecorder.events[0].organizationId, null);
});

test("upsertEntitlementLimit rejects an invalid limit before writing", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(() => upsertEntitlementLimit({ planKey: "", usageKey: "x", limit: 5, resetPeriod: "monthly" }, { sql, auditRecorder }));
  assert.equal(sql.calls.length, 0);
  assert.equal(auditRecorder.events.length, 0);
});

test("getEntitlementLimit returns null when nothing is configured for that plan/usage pair", async () => {
  const sql = fakeSql([]);
  assert.equal(await getEntitlementLimit("website_care", "monthly_edit_minutes", { sql }), null);
});

test("listEntitlementLimitsForPlan queries by plan_key only and maps every row", async () => {
  const sql = fakeSql([
    { plan_key: "website_care", usage_key: "monthly_edit_minutes", limit_value: 30, reset_period: "monthly" },
    { plan_key: "website_care", usage_key: "included_hours", limit_value: null, reset_period: "unlimited" },
  ]);
  const limits = await listEntitlementLimitsForPlan("website_care", { sql });
  assert.equal(limits.length, 2);
  assert.deepEqual(limits[0], { planKey: "website_care", usageKey: "monthly_edit_minutes", limit: 30, resetPeriod: "monthly" });
  assert.deepEqual(limits[1], { planKey: "website_care", usageKey: "included_hours", limit: null, resetPeriod: "unlimited" });
  assert.match(sql.calls[0].text, /SELECT \* FROM entitlement_limits WHERE plan_key/);
  assert.doesNotMatch(sql.calls[0].text, /usage_key/);
});

test("listEntitlementLimitsForPlan returns an empty array for a plan with no configured limits", async () => {
  const sql = fakeSql([]);
  assert.deepEqual(await listEntitlementLimitsForPlan("no_such_plan", { sql }), []);
});

test("resolvePeriodStart buckets monthly usage to the 1st of the current UTC month", () => {
  assert.equal(resolvePeriodStart("monthly", () => new Date("2026-07-14T23:59:00.000Z")), "2026-07-01T00:00:00.000Z");
});

test("resolvePeriodStart buckets total-reset usage into a single fixed period", () => {
  assert.equal(resolvePeriodStart("total", FIXED_NOW), "1970-01-01T00:00:00.000Z");
});

test("recordUsage rejects when no entitlement limit is configured for the plan/usage pair", async () => {
  const sql = fakeSql([]); // getEntitlementLimit -> no rows
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(
    () => recordUsage({ organizationId: "org-a", planKey: "website_care", usageKey: "monthly_edit_minutes", amount: 10 }, { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID, auditRecorder }),
    /no entitlement limit configured/
  );
  assert.equal(auditRecorder.events.length, 0);
});

test("recordUsage allows and persists usage that fits within the limit (first usage this period -- INSERT)", async () => {
  idCounter = 0;
  let call = 0;
  const sql = fakeSql(() => {
    call += 1;
    if (call === 1) return [{ plan_key: "website_care", usage_key: "monthly_edit_minutes", limit_value: 30, reset_period: "monthly" }]; // getEntitlementLimit
    if (call === 2) return []; // getConsumedForPeriod -- none yet
    if (call === 3) return []; // existing-row lookup before insert/update
    return [];
  });
  const auditRecorder = fakeAuditRecorder();
  const result = await recordUsage({ organizationId: "org-a", planKey: "website_care", usageKey: "monthly_edit_minutes", amount: 10 }, { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID, actorId: "user-staff-1", auditRecorder });
  assert.equal(result.recorded, true);
  assert.equal(result.withinLimit, true);
  assert.equal(result.remaining, 20);
  assert.match(sql.calls[3].text, /INSERT INTO usage_records/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "entitlement.usage_recorded");
  assert.equal(auditRecorder.events[0].actorId, "user-staff-1");
  assert.equal(auditRecorder.events[0].organizationId, "org-a");
});

test("recordUsage updates an existing period row instead of inserting a duplicate", async () => {
  let call = 0;
  const sql = fakeSql(() => {
    call += 1;
    if (call === 1) return [{ plan_key: "website_care", usage_key: "monthly_edit_minutes", limit_value: 30, reset_period: "monthly" }];
    if (call === 2) return [{ consumed: 10 }]; // already 10 consumed
    if (call === 3) return [{ id: "usage-existing" }]; // existing row found
    return [];
  });
  const auditRecorder = fakeAuditRecorder();
  const result = await recordUsage({ organizationId: "org-a", planKey: "website_care", usageKey: "monthly_edit_minutes", amount: 5 }, { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID, auditRecorder });
  assert.equal(result.recorded, true);
  assert.equal(result.remaining, 15); // 30 - (10 + 5)
  assert.match(sql.calls[3].text, /UPDATE usage_records/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].targetId, "usage-existing");
});

test("recordUsage refuses to persist usage that would exceed the remaining allowance", async () => {
  let call = 0;
  const sql = fakeSql(() => {
    call += 1;
    if (call === 1) return [{ plan_key: "website_care", usage_key: "monthly_edit_minutes", limit_value: 30, reset_period: "monthly" }];
    if (call === 2) return [{ consumed: 25 }];
    return [];
  });
  const auditRecorder = fakeAuditRecorder();
  const result = await recordUsage({ organizationId: "org-a", planKey: "website_care", usageKey: "monthly_edit_minutes", amount: 10 }, { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID, auditRecorder });
  assert.equal(result.recorded, false);
  assert.equal(result.withinLimit, false);
  assert.equal(sql.calls.length, 2, "no write happens once the requested amount would exceed the allowance");
  assert.equal(auditRecorder.events.length, 0, "no audit event for a rejected (non-persisted) usage attempt");
});

test("recordUsage refuses when the limit is already fully consumed", async () => {
  let call = 0;
  const sql = fakeSql(() => {
    call += 1;
    if (call === 1) return [{ plan_key: "website_care", usage_key: "monthly_edit_minutes", limit_value: 30, reset_period: "monthly" }];
    if (call === 2) return [{ consumed: 30 }];
    return [];
  });
  const auditRecorder = fakeAuditRecorder();
  const result = await recordUsage({ organizationId: "org-a", planKey: "website_care", usageKey: "monthly_edit_minutes", amount: 5 }, { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID, auditRecorder });
  assert.equal(result.recorded, false);
  assert.equal(sql.calls.length, 2);
  assert.equal(auditRecorder.events.length, 0);
});

test("recordUsage rejects a non-positive amount", async () => {
  const sql = fakeSql([]);
  await assert.rejects(() => recordUsage({ organizationId: "org-a", planKey: "website_care", usageKey: "x", amount: 0 }, { sql }));
  await assert.rejects(() => recordUsage({ organizationId: "org-a", planKey: "website_care", usageKey: "x", amount: -1 }, { sql }));
});

test("unlimited usage keys are always recorded without a remaining ceiling", async () => {
  let call = 0;
  const sql = fakeSql(() => {
    call += 1;
    if (call === 1) return [{ plan_key: "small_business_it", usage_key: "covered_device_count", limit_value: null, reset_period: "unlimited" }];
    if (call === 2) return [{ consumed: 1000 }];
    if (call === 3) return [{ id: "usage-existing" }];
    return [];
  });
  const auditRecorder = fakeAuditRecorder();
  const result = await recordUsage({ organizationId: "org-a", planKey: "small_business_it", usageKey: "covered_device_count", amount: 1 }, { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID, auditRecorder });
  assert.equal(result.recorded, true);
  assert.equal(result.remaining, null);
  assert.equal(auditRecorder.events.length, 1);
});
