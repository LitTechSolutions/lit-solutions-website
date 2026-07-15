const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./my-memberships");

function fakeDeps({ userId = "user-1", memberships = [], organizations = {} } = {}) {
  return {
    readCookie: () => "fake-token",
    getSession: async (token) => (token === "fake-token" ? { userId, sessionId: "s1" } : null),
    listMembershipsForUser: async () => memberships,
    getOrganizationById: async (id) => organizations[id] || null,
  };
}

test("GET without a session cookie returns 401", async () => {
  const res = await handler({ httpMethod: "GET", headers: {} }, {}, { getSession: async () => null, readCookie: () => null });
  assert.equal(res.statusCode, 401);
});

test("GET returns the caller's memberships joined with organization names", async () => {
  const deps = fakeDeps({
    memberships: [{ id: "m1", organizationId: "org-a", userId: "user-1", role: "org_owner", status: "active", createdAt: "z", updatedAt: "z" }],
    organizations: { "org-a": { id: "org-a", name: "Fixture Org A", status: "active", createdAt: "z", updatedAt: "z", createdBy: "u", version: 1 } },
  });
  const res = await handler({ httpMethod: "GET", headers: { cookie: "lts_session=fake-token" } }, {}, deps);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.deepEqual(body.memberships, [{ organizationId: "org-a", organizationName: "Fixture Org A", role: "org_owner", status: "active" }]);
});

test("GET with zero memberships (platform_admin/technician) returns an empty array, not an error", async () => {
  const deps = fakeDeps({ memberships: [] });
  const res = await handler({ httpMethod: "GET", headers: { cookie: "lts_session=fake-token" } }, {}, deps);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body).memberships, []);
});

test("GET handles a membership whose organization no longer resolves (organizationName: null) without crashing", async () => {
  const deps = fakeDeps({
    memberships: [{ id: "m1", organizationId: "org-gone", userId: "user-1", role: "org_member", status: "active", createdAt: "z", updatedAt: "z" }],
    organizations: {},
  });
  const res = await handler({ httpMethod: "GET", headers: { cookie: "lts_session=fake-token" } }, {}, deps);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).memberships[0].organizationName, null);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "POST" }, {}, {});
  assert.equal(res.statusCode, 405);
});
