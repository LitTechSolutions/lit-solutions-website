const test = require("node:test");
const assert = require("node:assert/strict");
const { assertValidOrganization, assertValidMembership } = require("../../src/domain/organization");
const { authorize } = require("../../src/policy/rbac");
const { ORG_A, ORG_B, USERS, MEMBERSHIPS } = require("./organizations");

test("fixture organizations satisfy the domain validator", () => {
  assert.doesNotThrow(() => assertValidOrganization(ORG_A));
  assert.doesNotThrow(() => assertValidOrganization(ORG_B));
});

test("fixture memberships satisfy the domain validator", () => {
  for (const membership of MEMBERSHIPS) {
    assert.doesNotThrow(() => assertValidMembership(membership));
  }
});

test("fixture matrix covers Org A, Org B, an authorized owner, a member, a suspended member, and a cross-org owner", () => {
  const orgAMembers = MEMBERSHIPS.filter((m) => m.organizationId === ORG_A.id);
  const orgBMembers = MEMBERSHIPS.filter((m) => m.organizationId === ORG_B.id);
  assert.ok(orgAMembers.some((m) => m.userId === USERS.orgAOwner.id && m.status === "active"));
  assert.ok(orgAMembers.some((m) => m.userId === USERS.orgAMember.id && m.status === "active"));
  assert.ok(orgAMembers.some((m) => m.userId === USERS.orgASuspendedMember.id && m.status === "suspended"));
  assert.ok(orgBMembers.some((m) => m.userId === USERS.orgBOwner.id && m.status === "active"));
});

test("integration: Org A owner authorized within Org A, denied on Org B via rbac.authorize", () => {
  const withinOrg = authorize({
    actorRole: "org_owner",
    action: "member.invite",
    actorOrgId: ORG_A.id,
    resourceOrgId: ORG_A.id,
    actorMembershipStatus: "active",
  });
  const crossOrg = authorize({
    actorRole: "org_owner",
    action: "member.invite",
    actorOrgId: ORG_A.id,
    resourceOrgId: ORG_B.id,
    actorMembershipStatus: "active",
  });
  assert.equal(withinOrg.allowed, true);
  assert.equal(crossOrg.allowed, false);
});

test("integration: a fixture with a suspended membership is denied by rbac.authorize() itself (SYS-AUTH-005)", () => {
  // Passing membership.status straight through as actorMembershipStatus is
  // the expected call pattern once F001/F005 persistence exists -- no
  // separate caller-side filtering step is required, since authorize()
  // itself fails closed on anything other than "active".
  const suspended = MEMBERSHIPS.find((m) => m.userId === USERS.orgASuspendedMember.id);
  assert.equal(suspended.status, "suspended");
  const decision = authorize({
    actorRole: suspended.role,
    action: "request.submit",
    actorOrgId: suspended.organizationId,
    resourceOrgId: suspended.organizationId,
    actorMembershipStatus: suspended.status,
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /membership is not active/);
});
