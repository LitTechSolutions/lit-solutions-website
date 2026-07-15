const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./technology-assets");

const FIXED_NOW = () => new Date("2026-07-15T12:00:00.000Z");
const FIXED_ID = () => "asset-fixed-id";

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("technology_assets")) return byTable.assets || [];
    if (text.includes("backup_records")) return byTable.backups || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeDeps(role) {
  return { getSession: async (token) => (token === "fake-token" ? { userId: "admin-1", role, sessionId: "s1" } : null), readCookie: () => "fake-token" };
}
function fakeCustomerDeps(authContext) {
  return { getSession: async (token) => (token === "fake-token" ? { userId: "user-1", sessionId: "s1" } : null), readCookie: () => "fake-token", resolveAuthorizationContext: async () => authContext };
}

test("POST as admin creates an asset", async () => {
  const sql = routingFakeSql({});
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ kind: "asset", organizationId: "org-a", type: "computer", label: "Front desk laptop" }) },
    {},
    { ...fakeDeps("admin"), sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 201);
});

test("POST as admin records a backup", async () => {
  const sql = routingFakeSql({});
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ kind: "backup", organizationId: "org-a", websiteProfileId: "wp-1", category: "database", location: "Offsite S3" }) },
    {},
    { ...fakeDeps("admin"), sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 201);
});

test("POST as a non-admin is denied", async () => {
  const res = await handler({ httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ kind: "asset", organizationId: "org-a", type: "x", label: "y" }) }, {}, fakeDeps("customer"));
  assert.equal(res.statusCode, 403);
});

test("POST with an invalid kind returns 400", async () => {
  const res = await handler({ httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ kind: "bogus", organizationId: "org-a" }) }, {}, fakeDeps("admin"));
  assert.equal(res.statusCode, 400);
});

test("GET as org_owner lists assets", async () => {
  const sql = routingFakeSql({ assets: [{ id: "asset-1", organization_id: "org-a", type: "computer", label: "x", warranty_expires_at: null, license_expires_at: null, created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z" }] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a" } },
    {},
    { ...fakeCustomerDeps({ actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).assets.length, 1);
});

test("PATCH as admin marks a backup restore-verified", async () => {
  const sql = routingFakeSql({});
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ backupId: "backup-1" }) },
    {},
    { ...fakeDeps("admin"), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 200);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
