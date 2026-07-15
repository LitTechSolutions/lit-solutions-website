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
  const sub = await createSubscription({ organizationId: "org-a", planKey: "website_care" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID });
  assert.equal(sub.status, "active");
  assert.equal(sub.planKey, "website_care");
  assert.match(sql.calls[0].text, /INSERT INTO subscriptions/);
});

test("createSubscription rejects a subscription without an organizationId", async () => {
  const sql = fakeSql();
  await assert.rejects(() => createSubscription({ organizationId: "", planKey: "website_care" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID }));
  assert.equal(sql.calls.length, 0);
});

test("getSubscriptionById returns null for no match", async () => {
  const sql = fakeSql([]);
  assert.equal(await getSubscriptionById("nope", { sql }), null);
});

test("applySubscriptionStatusTransition allows active -> paused and stamps paused_at", async () => {
  const sql = fakeSql([subscriptionRow({ status: "active" })]);
  const updated = await applySubscriptionStatusTransition("sub-1", "paused", { sql, now: FIXED_NOW });
  assert.equal(updated.status, "paused");
  assert.equal(updated.pausedAt, "2026-07-14T12:00:00.000Z");
  assert.equal(sql.calls.length, 2, "1 SELECT + 1 UPDATE");
  assert.match(sql.calls[1].text, /UPDATE subscriptions/);
});

test("applySubscriptionStatusTransition allows paused -> active (resume) without re-creating the record", async () => {
  const sql = fakeSql([subscriptionRow({ status: "paused", paused_at: "2026-07-10T00:00:00.000Z" })]);
  const updated = await applySubscriptionStatusTransition("sub-1", "active", { sql, now: FIXED_NOW });
  assert.equal(updated.status, "active");
});

test("applySubscriptionStatusTransition rejects reactivating a cancelled subscription (terminal state)", async () => {
  const sql = fakeSql([subscriptionRow({ status: "cancelled", cancelled_at: "2026-07-05T00:00:00.000Z" })]);
  await assert.rejects(() => applySubscriptionStatusTransition("sub-1", "active", { sql, now: FIXED_NOW }));
  assert.equal(sql.calls.length, 1, "no UPDATE happens on an illegal transition");
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
