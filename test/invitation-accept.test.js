const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/invitation-accept");
const { hashInvitationToken } = require("../src/policy/invitationLifecycle");

const FIXED_NOW = () => new Date("2026-07-15T12:00:00.000Z");
const NO_RATE_LIMIT = { rateLimited: async () => false };

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("audit_events")) return [];
    if (text.includes("invitations")) return byTable.invitations || [];
    if (text.includes("organizations")) return byTable.organizations || [];
    if (text.includes("organization_memberships")) return [];
    if (text.includes("consent_records")) return [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeBlobStore(existingUsers = {}) {
  const store = { ...existingUsers };
  return {
    getJSON: async (storeName, key) => (storeName === "users" ? store[key] || null : null),
    setJSON: async (storeName, key, value) => { if (storeName === "users") store[key] = value; },
    store,
  };
}

function invitationRow(overrides = {}) {
  return {
    id: "inv-1", organization_id: "org-a", email: "customer@example.com", role: "org_member",
    status: "pending", invited_by: "admin-1", created_at: "2026-07-01T00:00:00.000Z",
    expires_at: "2026-07-22T00:00:00.000Z", accepted_at: null,
    token_hash: hashInvitationToken("valid-token-1234567890"), revoked_at: null, revoked_by: null,
    resend_count: 0, last_sent_at: null, ...overrides,
  };
}

test("GET without a token returns 400", async () => {
  const res = await handler({ httpMethod: "GET", headers: {}, queryStringParameters: {} }, {}, NO_RATE_LIMIT);
  assert.equal(res.statusCode, 400);
});

test("GET with an unknown token returns a generic 404, not a distinguishing message", async () => {
  const sql = routingFakeSql({ invitations: [] });
  const res = await handler({ httpMethod: "GET", headers: {}, queryStringParameters: { token: "bogus" } }, {}, { sql, ...NO_RATE_LIMIT });
  assert.equal(res.statusCode, 404);
});

test("GET with a valid pending token peeks without creating anything", async () => {
  const sql = routingFakeSql({ invitations: [invitationRow()], organizations: [{ id: "org-a", name: "Acme LLC", status: "active", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", created_by: "admin-1", version: 1 }] });
  const res = await handler({ httpMethod: "GET", headers: {}, queryStringParameters: { token: "valid-token-1234567890" } }, {}, { sql, ...NO_RATE_LIMIT });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.email, "customer@example.com");
  assert.equal(body.organizationName, "Acme LLC");
  assert.equal(sql.calls.some((c) => /INSERT|UPDATE/.test(c.text)), false, "peek must not write anything");
});

test("POST without termsAccepted:true is rejected -- consent is never inferred", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ token: "t", name: "A Customer", password: "supersecurepassword" }) },
    {},
    NO_RATE_LIMIT
  );
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /Terms/);
});

test("POST with a short password is rejected", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ token: "t", name: "A Customer", password: "short", termsAccepted: true }) },
    {},
    NO_RATE_LIMIT
  );
  assert.equal(res.statusCode, 400);
});

test("POST with an invalid token surfaces the store's generic error", async () => {
  const sql = routingFakeSql({ invitations: [] });
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ token: "bogus", name: "A Customer", password: "supersecurepassword", termsAccepted: true }) },
    {},
    { sql, ...NO_RATE_LIMIT }
  );
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /invalid or has expired/);
});

test("POST with a valid token activates a brand-new account: creates the user, org membership, and both consent records", async () => {
  const sql = routingFakeSql({ invitations: [invitationRow()] });
  const blobs = fakeBlobStore();
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ token: "valid-token-1234567890", name: "A Customer", password: "supersecurepassword", termsAccepted: true, marketingConsent: true }) },
    {},
    { sql, now: FIXED_NOW, getJSON: blobs.getJSON, setJSON: blobs.setJSON, hashPassword: async () => "scrypt:fake:hash", idGenerator: () => "user-fixed-id", ...NO_RATE_LIMIT }
  );
  assert.equal(res.statusCode, 201);
  assert.equal(blobs.store["customer@example.com"].verified, true, "invitation acceptance itself is the email-ownership proof");
  assert.equal(blobs.store["customer@example.com"].role, "customer");
  assert.match(sql.calls.map((c) => c.text).join("|"), /INSERT INTO organization_memberships/);
  const consentInserts = sql.calls.filter((c) => c.text.includes("INSERT INTO consent_records"));
  assert.equal(consentInserts.length, 2, "one terms_privacy + one marketing consent record");
});

test("POST reuses an existing Blobs user by email instead of creating a duplicate account", async () => {
  const sql = routingFakeSql({ invitations: [invitationRow()] });
  const blobs = fakeBlobStore({ "customer@example.com": { id: "existing-user-1", email: "customer@example.com", name: "Existing", passwordHash: "scrypt:x:y", role: "customer", verified: true, createdAt: 1 } });
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ token: "valid-token-1234567890", name: "A Customer", password: "supersecurepassword", termsAccepted: true }) },
    {},
    { sql, now: FIXED_NOW, getJSON: blobs.getJSON, setJSON: blobs.setJSON, hashPassword: async () => "scrypt:fake:hash", ...NO_RATE_LIMIT }
  );
  assert.equal(res.statusCode, 201);
  assert.equal(blobs.store["customer@example.com"].id, "existing-user-1", "the existing account was reused, not overwritten");
});

test("POST declining marketing consent still records a granted:false decision", async () => {
  const sql = routingFakeSql({ invitations: [invitationRow()] });
  const blobs = fakeBlobStore();
  await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ token: "valid-token-1234567890", name: "A Customer", password: "supersecurepassword", termsAccepted: true }) },
    {},
    { sql, now: FIXED_NOW, getJSON: blobs.getJSON, setJSON: blobs.setJSON, hashPassword: async () => "scrypt:fake:hash", ...NO_RATE_LIMIT }
  );
  const consentInserts = sql.calls.filter((c) => c.text.includes("INSERT INTO consent_records"));
  assert.equal(consentInserts.length, 2);
  assert.equal(consentInserts[1].values.includes(false), true, "marketing consent defaults to false when the field is omitted");
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
