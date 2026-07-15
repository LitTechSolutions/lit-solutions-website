const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSubscription,
  getSubscriptionById,
  applySubscriptionStatusTransition,
  listSubscriptionsForOrganization,
} = require("./subscriptionStore");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "sub-fixed-id";

function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return cannedRows;
  };
  tag.calls = calls;
  return tag;
}

function fakeAuditRecorder() {
  const events = [];
  return { record: async (input) => { events.push(input); return input; }, events };
}

function subscriptionRow(overrides = {}) {
  return {
    id: "sub-1",
    organization_id: "org-a",
    plan_key: "website_care",
    status: "active",
    started_at: "2026-07-01T00:00:00.000Z",
    paused_at: null,
    cancelled_at: null,
    provider_subscription_reference: null,
    ...overrides,
  };
}

test("createSubscription validates and inserts as active", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const sub = await createSubscription({ organizationId: "org-a", planKey: "website_care" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder, actorId: "user-1" });
  assert.equal(sub.status, "active");
  assert.equal(sub.planKey, "website_care");
  assert.match(sql.calls[0].text, /INSERT INTO subscriptions/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "subscription.create");
  assert.equal(auditRecorder.events[0].actorId, "user-1");
  assert.deepEqual(auditRecorder.events[0].metadata, { planKey: "website_care" });
});

test("createSubscription rejects a subscription without an organizationId", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(() => createSubscription({ organizationId: "", planKey: "website_care" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder }));
  assert.equal(sql.calls.length, 0);
  assert.equal(auditRecorder.events.length, 0);
});

test("getSubscriptionById returns null for no match", async () => {
  const sql = fakeSql([]);
  assert.equal(await getSubscriptionById("nope", { sql }), null);
});

test("applySubscriptionStatusTransition allows active -> paused and stamps paused_at", async () => {
  const sql = fakeSql([subscriptionRow({ status: "active" })]);
  const auditRecorder = fakeAuditRecorder();
  const updated = await applySubscriptionStatusTransition("sub-1", "paused", { sql, now: FIXED_NOW, auditRecorder, actorId: "user-1" });
  assert.equal(updated.status, "paused");
  assert.equal(updated.pausedAt, "2026-07-14T12:00:00.000Z");
  assert.equal(sql.calls.length, 2, "1 SELECT + 1 UPDATE");
  assert.match(sql.calls[1].text, /UPDATE subscriptions/);
  assert.match(sql.calls[1].text, /AND status =/);
  assert.match(sql.calls[1].text, /INSERT INTO audit_events/);
  assert.match(sql.calls[1].text, /FROM changed/);
});

test("applySubscriptionStatusTransition allows paused -> active (resume) without re-creating the record", async () => {
  const sql = fakeSql([subscriptionRow({ status: "paused", paused_at: "2026-07-10T00:00:00.000Z" })]);
  const auditRecorder = fakeAuditRecorder();
  const updated = await applySubscriptionStatusTransition("sub-1", "active", { sql, now: FIXED_NOW, auditRecorder });
  assert.equal(updated.status, "active");
  assert.match(sql.calls[1].text, /INSERT INTO audit_events/);
});

test("applySubscriptionStatusTransition rejects reactivating a cancelled subscription (terminal state)", async () => {
  const sql = fakeSql([subscriptionRow({ status: "cancelled", cancelled_at: "2026-07-05T00:00:00.000Z" })]);
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(() => applySubscriptionStatusTransition("sub-1", "active", { sql, now: FIXED_NOW, auditRecorder }));
  assert.equal(sql.calls.length, 1, "no UPDATE happens on an illegal transition");
  assert.equal(auditRecorder.events.length, 0);
});

test("applySubscriptionStatusTransition throws for a nonexistent subscription", async () => {
  const sql = fakeSql([]);
  await assert.rejects(() => applySubscriptionStatusTransition("nope", "paused", { sql, now: FIXED_NOW }), /no subscription/);
});

test("listSubscriptionsForOrganization orders by started_at", async () => {
  const sql = fakeSql([subscriptionRow({ id: "sub-1" }), subscriptionRow({ id: "sub-2", plan_key: "small_business_it" })]);
  const list = await listSubscriptionsForOrganization("org-a", { sql });
  assert.equal(list.length, 2);
  assert.match(sql.calls[0].text, /ORDER BY started_at/);
});
