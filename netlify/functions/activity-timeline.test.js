const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./activity-timeline");

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("activity_events")) return byTable.events || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeCustomerDeps(authContext) {
  return { getSession: async (token) => (token === "fake-token" ? { userId: "user-1", sessionId: "s1" } : null), readCookie: () => "fake-token", resolveAuthorizationContext: async () => authContext };
}

function eventRow(overrides = {}) {
  return { id: "ev-1", organization_id: "org-a", source_type: "ticket", source_id: "t1", occurred_at: "2026-07-15T00:00:00.000Z", summary: "Ticket submitted", customer_visible: true, ...overrides };
}

test("GET without organizationId returns 400", async () => {
  const res = await handler({ httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: {} }, {}, fakeCustomerDeps(null));
  assert.equal(res.statusCode, 400);
});

test("GET as org_member returns only customer-visible events", async () => {
  const sql = routingFakeSql({ events: [eventRow(), eventRow({ id: "ev-2", customer_visible: false, summary: "Internal note" })] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a" } },
    {},
    { ...fakeCustomerDeps({ actorRole: "org_member", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql }
  );
  assert.equal(res.statusCode, 200);
  const timeline = JSON.parse(res.body).timeline;
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].summary, "Ticket submitted");
});

test("GET as technician is denied -- history.view is customer-facing only", async () => {
  const sql = routingFakeSql({ events: [] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a" } },
    {},
    { ...fakeCustomerDeps({ actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined }), sql }
  );
  assert.equal(res.statusCode, 403);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "POST" }, {}, {});
  assert.equal(res.statusCode, 405);
});
