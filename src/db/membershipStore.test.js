const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createMembership,
  resolveAuthorizationContext,
  listMembershipsForUser,
  updateMembershipStatus,
  getOrganizationOwnerUserId,
  mapRowToMembership,
} = require("./membershipStore");
const { authorize } = require("../policy/rbac");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "membership-fixed-id";

function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return cannedRows;
  };
  tag.calls = calls;
  return tag;
}

test("createMembership validates and inserts", async () => {
  const sql = fakeSql();
  const membership = await createMembership(
    { organizationId: "org-a", userId: "user-1", role: "org_owner" },
    { sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(membership.status, "active");
  assert.match(sql.calls[0].text, /INSERT INTO organization_memberships/);
});

test("createMembership rejects an invalid role before querying", async () => {
  const sql = fakeSql();
  await assert.rejects(() => createMembership({ organizationId: "org-a", userId: "user-1", role: "not_a_real_role" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID }));
  assert.equal(sql.calls.length, 0);
});

test("resolveAuthorizationContext returns null when the user has no membership in that org", async () => {
  const sql = fakeSql([]);
  const context = await resolveAuthorizationContext("user-1", "org-a", { sql });
  assert.equal(context, null);
});

test("resolveAuthorizationContext returns exactly the shape rbac.authorize() expects", async () => {
  const sql = fakeSql([{ role: "org_owner", status: "active" }]);
  const context = await resolveAuthorizationContext("user-1", "org-a", { sql });
  assert.deepEqual(context, { actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" });
});

// The key integration test: persistence -> pure policy, end to end.
test("integration: resolveAuthorizationContext feeds directly into rbac.authorize()", async () => {
  const activeOwner = fakeSql([{ role: "org_owner", status: "active" }]);
  const context = await resolveAuthorizationContext("user-1", "org-a", { sql: activeOwner });
  const decision = authorize({ ...context, action: "member.invite", resourceOrgId: "org-a" });
  assert.equal(decision.allowed, true);
});

test("integration: a suspended membership resolved from the database is denied by rbac.authorize()", async () => {
  const suspendedMember = fakeSql([{ role: "org_member", status: "suspended" }]);
  const context = await resolveAuthorizationContext("user-1", "org-a", { sql: suspendedMember });
  const decision = authorize({ ...context, action: "request.submit", resourceOrgId: "org-a" });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /membership is not active/);
});

test("integration: no membership at all means no context, and the caller must deny before ever calling authorize()", async () => {
  const noMembership = fakeSql([]);
  const context = await resolveAuthorizationContext("user-1", "org-b", { sql: noMembership });
  assert.equal(context, null);
});

test("listMembershipsForUser maps every row", async () => {
  const sql = fakeSql([
    { id: "m1", organization_id: "org-a", user_id: "user-1", role: "org_owner", status: "active", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
    { id: "m2", organization_id: "org-b", user_id: "user-1", role: "org_member", status: "active", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
  ]);
  const memberships = await listMembershipsForUser("user-1", { sql });
  assert.equal(memberships.length, 2);
  assert.equal(memberships[1].organizationId, "org-b");
});

test("updateMembershipStatus rejects an invalid status without querying", async () => {
  const sql = fakeSql();
  await assert.rejects(() => updateMembershipStatus("m1", "bogus", { sql, now: FIXED_NOW }));
  assert.equal(sql.calls.length, 0);
});

test("updateMembershipStatus issues an UPDATE (this is how suspension takes effect, SYS-AUTH-005)", async () => {
  const sql = fakeSql();
  await updateMembershipStatus("m1", "suspended", { sql, now: FIXED_NOW });
  assert.match(sql.calls[0].text, /UPDATE organization_memberships/);
  assert.ok(sql.calls[0].values.includes("suspended"));
});

test("getOrganizationOwnerUserId returns the owner's user id when an active org_owner membership exists", async () => {
  const sql = fakeSql([{ user_id: "user-owner-1" }]);
  const ownerId = await getOrganizationOwnerUserId("org-a", { sql });
  assert.equal(ownerId, "user-owner-1");
  assert.match(sql.calls[0].text, /organization_memberships/);
  assert.match(sql.calls[0].text, /role = 'org_owner'/);
});

test("getOrganizationOwnerUserId returns null when no active org_owner membership exists", async () => {
  const sql = fakeSql([]);
  const ownerId = await getOrganizationOwnerUserId("org-a", { sql });
  assert.equal(ownerId, null);
});

test("mapRowToMembership omits invitedBy when the row has none", () => {
  const mapped = mapRowToMembership({ id: "m1", organization_id: "org-a", user_id: "user-1", role: "org_member", status: "active", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", invited_by: null });
  assert.equal("invitedBy" in mapped, false);
});
