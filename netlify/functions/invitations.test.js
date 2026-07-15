const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./invitations");

const FIXED_NOW = () => new Date("2026-07-15T12:00:00.000Z");
let idCounter = 0;
const SEQUENTIAL_ID = () => `inv-${++idCounter}`;

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("audit_events")) return [];
    if (text.includes("invitations")) return byTable.invitations || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeDeps({ role } = {}) {
  const sentEmails = [];
  return {
    getSession: async (token) => (token === "fake-token" ? { userId: "admin-1", role, sessionId: "s1" } : null),
    readCookie: () => "fake-token",
    sendEmail: async (opts) => { sentEmails.push(opts); },
    sentEmails,
  };
}

function invitationRow(overrides = {}) {
  return {
    id: "inv-1", organization_id: "org-a", email: "customer@example.com", role: "org_member",
    status: "pending", invited_by: "admin-1", created_at: "2026-07-01T00:00:00.000Z",
    expires_at: "2026-07-22T00:00:00.000Z", accepted_at: null,
    token_hash: "a".repeat(64), revoked_at: null, revoked_by: null, resend_count: 0, last_sent_at: null,
    ...overrides,
  };
}

test("POST without a session returns 401", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ organizationId: "org-a", email: "x@example.com", role: "org_member" }) },
    {},
    { getSession: async () => null, readCookie: () => null }
  );
  assert.equal(res.statusCode, 401);
});

test("POST as a non-admin is denied", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", email: "x@example.com", role: "org_member" }) },
    {},
    fakeDeps({ role: "customer" })
  );
  assert.equal(res.statusCode, 403);
});

test("POST rejects inviting a technician role -- staff are provisioned out of band, not through this flow", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", email: "x@example.com", role: "technician" }) },
    {},
    fakeDeps({ role: "admin" })
  );
  assert.equal(res.statusCode, 400);
});

test("POST rejects an invalid email before touching the database", async () => {
  const sql = routingFakeSql({});
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", email: "not-an-email", role: "org_member" }) },
    {},
    { ...fakeDeps({ role: "admin" }), sql }
  );
  assert.equal(res.statusCode, 400);
  assert.equal(sql.calls.length, 0);
});

test("POST as admin creates an invitation and sends the email, never returning the raw token in the response", async () => {
  idCounter = 0;
  const sql = routingFakeSql({});
  const deps = { ...fakeDeps({ role: "admin" }), sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID };
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", email: "Customer@Example.com", role: "org_member" }) },
    {},
    deps
  );
  assert.equal(res.statusCode, 201);
  const body = JSON.parse(res.body);
  assert.equal(body.invitation.email, "customer@example.com");
  assert.equal("token" in body.invitation, false);
  assert.equal(JSON.stringify(body).includes("token_hash"), false);
  assert.equal(deps.sentEmails.length, 1);
  assert.equal(deps.sentEmails[0].to, "customer@example.com");
});

test("GET as admin lists invitations for an organization", async () => {
  const sql = routingFakeSql({ invitations: [invitationRow()] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a" } },
    {},
    { ...fakeDeps({ role: "admin" }), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).invitations.length, 1);
});

test("PATCH revoke as admin revokes a pending invitation", async () => {
  const sql = routingFakeSql({ invitations: [invitationRow()] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ invitationId: "inv-1", action: "revoke" }) },
    {},
    { ...fakeDeps({ role: "admin" }), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).invitation.status, "revoked");
});

test("PATCH resend as admin issues a fresh invitation email", async () => {
  const sql = routingFakeSql({ invitations: [invitationRow()] });
  const deps = { ...fakeDeps({ role: "admin" }), sql, now: FIXED_NOW };
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ invitationId: "inv-1", action: "resend" }) },
    {},
    deps
  );
  assert.equal(res.statusCode, 200);
  assert.equal(deps.sentEmails.length, 1);
});

test("PATCH with an invalid action returns 400", async () => {
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ invitationId: "inv-1", action: "delete" }) },
    {},
    fakeDeps({ role: "admin" })
  );
  assert.equal(res.statusCode, 400);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
