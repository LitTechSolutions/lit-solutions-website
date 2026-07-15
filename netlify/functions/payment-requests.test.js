const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./payment-requests");

const FIXED_NOW = () => new Date("2026-07-15T12:00:00.000Z");
let idCounter = 0;
const SEQUENTIAL_ID = () => `pr-${++idCounter}`;

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("payment_requests")) return byTable.paymentRequests || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeAuthDeps({ role, authContext } = {}) {
  return {
    getSession: async (token) => (token === "fake-token" ? { userId: "user-1", role, sessionId: "s1" } : null),
    readCookie: () => "fake-token",
    resolveAuthorizationContext: async () => authContext,
  };
}

function paymentRequestRow(overrides = {}) {
  return { id: "pr-1", organization_id: "org-a", subject_type: "scope", subject_id: "scope-1", amount_ref: "scope-1:full", status: "requested", created_at: "2026-07-01T00:00:00.000Z", provider_reference: null, ...overrides };
}

test("POST without a session returns 401", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ organizationId: "org-a", subjectType: "scope", subjectId: "s1", amountRefPrefix: "s1", totalAmount: 1000 }) },
    {},
    { getSession: async () => null, readCookie: () => null }
  );
  assert.equal(res.statusCode, 401);
});

test("POST as a non-admin is denied", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", subjectType: "scope", subjectId: "s1", amountRefPrefix: "s1", totalAmount: 1000 }) },
    {},
    fakeDeps("customer")
  );
  assert.equal(res.statusCode, 403);
});

function fakeDeps(role) {
  return { getSession: async (token) => (token === "fake-token" ? { userId: "admin-1", role, sessionId: "s1" } : null), readCookie: () => "fake-token" };
}

test("POST as admin creates a deposit_balance schedule for work at or above $500", async () => {
  idCounter = 0;
  const sql = routingFakeSql({});
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", subjectType: "scope", subjectId: "scope-1", amountRefPrefix: "scope-1", totalAmount: 1000 }) },
    {},
    { ...fakeDeps("admin"), sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID }
  );
  assert.equal(res.statusCode, 201);
  const body = JSON.parse(res.body);
  assert.equal(body.scheduleType, "deposit_balance");
  assert.equal(body.paymentRequests.length, 2);
});

test("POST rejects a non-numeric totalAmount before touching auth", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", subjectType: "scope", subjectId: "s1", amountRefPrefix: "s1", totalAmount: "a lot" }) },
    {},
    fakeDeps("admin")
  );
  assert.equal(res.statusCode, 400);
});

test("GET as org_member lists payment requests for a subject", async () => {
  const sql = routingFakeSql({ paymentRequests: [paymentRequestRow()] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a", subjectType: "scope", subjectId: "scope-1" } },
    {},
    { ...fakeAuthDeps({ authContext: { actorRole: "org_member", actorOrgId: "org-a", actorMembershipStatus: "active" } }), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).paymentRequests.length, 1);
});

test("GET without required params returns 400", async () => {
  const res = await handler({ httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a" } }, {}, fakeAuthDeps({ authContext: null }));
  assert.equal(res.statusCode, 400);
});

test("PATCH as admin transitions requested -> paid", async () => {
  const sql = routingFakeSql({ paymentRequests: [paymentRequestRow({ status: "requested" })] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ paymentRequestId: "pr-1", nextStatus: "paid", providerReference: "square-txn-1" }) },
    {},
    { ...fakeDeps("admin"), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).paymentRequest.status, "paid");
  assert.equal(JSON.parse(res.body).paymentRequest.providerReference, "square-txn-1");
});

test("PATCH attempting an illegal transition returns 400", async () => {
  const sql = routingFakeSql({ paymentRequests: [paymentRequestRow({ status: "requested" })] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ paymentRequestId: "pr-1", nextStatus: "reconciled" }) },
    {},
    { ...fakeDeps("admin"), sql }
  );
  assert.equal(res.statusCode, 400);
});

test("PATCH as a non-admin is denied", async () => {
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ paymentRequestId: "pr-1", nextStatus: "paid" }) },
    {},
    fakeDeps("customer")
  );
  assert.equal(res.statusCode, 403);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
