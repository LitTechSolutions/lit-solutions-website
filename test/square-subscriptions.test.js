const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/square-subscriptions");

const FIXED_NOW = () => new Date("2026-07-26T12:00:00.000Z");
const FIXED_ID = () => "sub-fixed-id";

function fakeSql(queue = []) {
  const calls = [];
  const results = [...queue];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?").replace(/\s+/g, " ").trim(), values });
    return results.length ? results.shift() : [];
  };
  tag.calls = calls;
  return tag;
}

// Matches the mocking style used by test/subscriptions.test.js.
function adminDeps(role, sql, extra = {}) {
  return {
    sql,
    now: FIXED_NOW,
    idGenerator: FIXED_ID,
    auditRecorder: { record: async () => {} },
    getSession: async (t) => (t === "fake-token" ? { userId: "admin-1", role, sessionId: "s1" } : null),
    readCookie: () => "fake-token",
    ...extra,
  };
}
function customerDeps(authContext, sql) {
  return {
    sql,
    now: FIXED_NOW,
    getSession: async (t) => (t === "fake-token" ? { userId: "user-1", sessionId: "s1" } : null),
    readCookie: () => "fake-token",
    resolveAuthorizationContext: async () => authContext,
  };
}

const linkRow = (o = {}) => ({
  square_subscription_id: "sub_abc",
  square_customer_id: "cust_1",
  square_plan_variation_id: "plan_basic",
  square_status: "ACTIVE",
  customer_email: null,
  customer_name: null,
  organization_id: null,
  subscription_id: null,
  first_seen_at: "2026-07-26T11:00:00.000Z",
  last_event_at: "2026-07-26T11:00:00.000Z",
  last_event_type: "subscription.created",
  linked_at: null,
  ...o,
});

const get = (qs) => ({ httpMethod: "GET", queryStringParameters: qs, headers: {} });
const post = (body) => ({ httpMethod: "POST", body: JSON.stringify(body), headers: {} });

/* ------------------------------------------------------------- routing --- */

test("rejects unsupported methods", async () => {
  const res = await handler({ httpMethod: "DELETE", headers: {} }, {}, adminDeps("admin", fakeSql()));
  assert.equal(res.statusCode, 405);
});

test("requires either organizationId or unlinked=true", async () => {
  const res = await handler(get({}), {}, adminDeps("admin", fakeSql()));
  assert.equal(res.statusCode, 400);
});

/* --------------------------------------------------------------- authz --- */

test("the cross-tenant unlinked queue is refused without a session", async () => {
  const res = await handler(get({ unlinked: "true" }), {}, { sql: fakeSql(), readCookie: () => null, getSession: async () => null });
  assert.ok(res.statusCode === 401 || res.statusCode === 403, `expected a denial, got ${res.statusCode}`);
});

test("the unlinked queue is refused to a non-admin role", async () => {
  const res = await handler(get({ unlinked: "true" }), {}, adminDeps("technician-session", fakeSql()));
  assert.ok(res.statusCode === 401 || res.statusCode === 403, `expected a denial, got ${res.statusCode}`);
});

test("linking is refused to a non-admin role", async () => {
  const res = await handler(
    post({ squareSubscriptionId: "sub_abc", organizationId: "org-a", planKey: "website_basic" }),
    {}, adminDeps("technician-session", fakeSql())
  );
  assert.ok(res.statusCode === 401 || res.statusCode === 403, `expected a denial, got ${res.statusCode}`);
});

/* ---------------------------------------------------------- happy path --- */

test("a platform admin can read the unlinked onboarding queue", async () => {
  const sql = fakeSql([[linkRow()]]);
  const res = await handler(get({ unlinked: "true" }), {}, adminDeps("admin", sql));
  assert.equal(res.statusCode, 200);
  const { links } = JSON.parse(res.body);
  assert.equal(links.length, 1);
  assert.equal(links[0].squareSubscriptionId, "sub_abc");
  assert.equal(links[0].mappedStatus, "active");
  assert.equal(links[0].organizationId, undefined, "an unlinked row has no organization");
  assert.match(sql.calls[0].text, /organization_id IS NULL/);
});

test("linking requires all three fields", async () => {
  for (const body of [
    { organizationId: "org-a", planKey: "p" },
    { squareSubscriptionId: "s", planKey: "p" },
    { squareSubscriptionId: "s", organizationId: "org-a" },
  ]) {
    const res = await handler(post(body), {}, adminDeps("admin", fakeSql()));
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
});

test("rejects malformed JSON", async () => {
  const res = await handler({ httpMethod: "POST", body: "{oh no", headers: {} }, {}, adminDeps("admin", fakeSql()));
  assert.equal(res.statusCode, 400);
});

test("linking creates the internal subscription and stamps the Square reference", async () => {
  const sql = fakeSql([
    [linkRow()],                                   // lookup: exists, unlinked
    [],                                            // createSubscription INSERT
    [],                                            // UPDATE ... provider_subscription_reference
    [{ square_subscription_id: "sub_abc" }],       // UPDATE link row -> claimed
  ]);
  const res = await handler(
    post({ squareSubscriptionId: "sub_abc", organizationId: "org-a", planKey: "website_basic" }),
    {}, adminDeps("admin", sql)
  );
  assert.equal(res.statusCode, 201, res.body);
  const { subscription } = JSON.parse(res.body);
  assert.equal(subscription.organizationId, "org-a");
  assert.equal(subscription.planKey, "website_basic");
  assert.equal(subscription.providerSubscriptionReference, "sub_abc");
  assert.ok(sql.calls.some((c) => /provider_subscription_reference/.test(c.text)),
    "the Square id must be written onto the subscription record");
});

test("re-linking an already-linked subscription is a 400, not a duplicate", async () => {
  const sql = fakeSql([[linkRow({ organization_id: "org-existing", subscription_id: "int-1" })]]);
  const res = await handler(
    post({ squareSubscriptionId: "sub_abc", organizationId: "org-b", planKey: "website_basic" }),
    {}, adminDeps("admin", sql)
  );
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /already linked/);
});

test("an org member can see their own Square links", async () => {
  const sql = fakeSql([[linkRow({ organization_id: "org-a", subscription_id: "int-1", linked_at: "2026-07-26T12:00:00.000Z" })]]);
  const res = await handler(
    get({ organizationId: "org-a" }), {},
    customerDeps({ actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" }, sql)
  );
  assert.equal(res.statusCode, 200, res.body);
  const { links } = JSON.parse(res.body);
  assert.equal(links[0].organizationId, "org-a");
  assert.match(sql.calls[0].text, /WHERE organization_id =/);
});
