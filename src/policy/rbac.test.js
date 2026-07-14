const test = require("node:test");
const assert = require("node:assert/strict");
const { authorize, ROLE_CAPABILITIES, ORG_SCOPED_ACTIONS } = require("./rbac");

const ORG_A = "org-a";
const ORG_B = "org-b";

test("default deny: unknown role", () => {
  const decision = authorize({ actorRole: "superuser", action: "organization.view" });
  assert.equal(decision.allowed, false);
});

test("default deny: unknown action for an otherwise-privileged role", () => {
  const decision = authorize({ actorRole: "platform_admin", action: "nonexistent.action" });
  assert.equal(decision.allowed, false);
});

test("default deny: missing context", () => {
  assert.equal(authorize(undefined).allowed, false);
  assert.equal(authorize({}).allowed, false);
});

test("org_owner can act within their own organization, with an active membership", () => {
  const decision = authorize({
    actorRole: "org_owner",
    action: "member.invite",
    actorOrgId: ORG_A,
    resourceOrgId: ORG_A,
    actorMembershipStatus: "active",
  });
  assert.equal(decision.allowed, true);
});

// The two-organization tenant-isolation matrix required by SYS-SEC-005 /
// the master instruction's "every customer-data test suite" rule.
test("two-org isolation: org_owner of Org A cannot act on Org B's resource", () => {
  const decision = authorize({
    actorRole: "org_owner",
    action: "member.invite",
    actorOrgId: ORG_A,
    resourceOrgId: ORG_B,
    actorMembershipStatus: "active",
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /cross-organization/);
});

test("two-org isolation: org_member of Org A cannot view Org B's document", () => {
  const decision = authorize({
    actorRole: "org_member",
    action: "document.view",
    actorOrgId: ORG_A,
    resourceOrgId: ORG_B,
    actorMembershipStatus: "active",
  });
  assert.equal(decision.allowed, false);
});

test("two-org isolation: read_only_customer of Org A cannot view Org B's project", () => {
  const decision = authorize({
    actorRole: "read_only_customer",
    action: "project.view",
    actorOrgId: ORG_A,
    resourceOrgId: ORG_B,
    actorMembershipStatus: "active",
  });
  assert.equal(decision.allowed, false);
});

test("org_member has no financial-approval capability regardless of org match", () => {
  const decision = authorize({
    actorRole: "org_member",
    action: "change_order.approve",
    actorOrgId: ORG_A,
    resourceOrgId: ORG_A,
    actorMembershipStatus: "active",
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /no "change_order.approve" capability/);
});

test("read_only_customer cannot upload files (view-only role)", () => {
  const decision = authorize({
    actorRole: "read_only_customer",
    action: "file.upload",
    actorOrgId: ORG_A,
    resourceOrgId: ORG_A,
    actorMembershipStatus: "active",
  });
  assert.equal(decision.allowed, false);
});

// SYS-AUTH-005: "Role, membership, and organization suspension changes
// take effect on the next authorization check."
test("org_owner denied when membership status is suspended, even within their own organization", () => {
  const decision = authorize({
    actorRole: "org_owner",
    action: "member.invite",
    actorOrgId: ORG_A,
    resourceOrgId: ORG_A,
    actorMembershipStatus: "suspended",
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /membership is not active/);
});

test("org_member denied by default when actorMembershipStatus is not provided (fail closed)", () => {
  const decision = authorize({
    actorRole: "org_member",
    action: "request.submit",
    actorOrgId: ORG_A,
    resourceOrgId: ORG_A,
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /not provided/);
});

test("membership-status check does not apply to platform_admin, technician, or automated_service", () => {
  assert.equal(authorize({ actorRole: "platform_admin", action: "staff.administer", actorOrgId: null }).allowed, true);
  assert.equal(
    authorize({ actorRole: "technician", action: "ticket.work", actorOrgId: null, resourceOrgId: ORG_A, assigned: true }).allowed,
    true
  );
});

test("platform_admin can act across organizations for platform-scoped actions", () => {
  const decision = authorize({ actorRole: "platform_admin", action: "staff.administer", actorOrgId: null });
  assert.equal(decision.allowed, true);
});

test("platform_admin bypasses the org-match check on org-scoped actions", () => {
  const decision = authorize({
    actorRole: "platform_admin",
    action: "organization.view",
    actorOrgId: null,
    resourceOrgId: ORG_B,
  });
  assert.equal(decision.allowed, true);
});

test("technician denied on assigned resource without explicit assignment", () => {
  const decision = authorize({
    actorRole: "technician",
    action: "ticket.work",
    actorOrgId: null,
    resourceOrgId: ORG_A,
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /not assigned/);
});

test("technician allowed on resource with explicit assignment", () => {
  const decision = authorize({
    actorRole: "technician",
    action: "ticket.work",
    actorOrgId: null,
    resourceOrgId: ORG_A,
    assigned: true,
  });
  assert.equal(decision.allowed, true);
});

test("automated_service denied without an explicit per-call grant", () => {
  const decision = authorize({
    actorRole: "automated_service",
    action: "notification.send",
    actorOrgId: ORG_A,
    resourceOrgId: ORG_A,
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /not explicitly granted/);
});

test("automated_service allowed when explicitly granted for this call and org matches", () => {
  const decision = authorize({
    actorRole: "automated_service",
    action: "notification.send",
    actorOrgId: ORG_A,
    resourceOrgId: ORG_A,
    grantedCapabilities: ["notification.send"],
  });
  assert.equal(decision.allowed, true);
});

test("automated_service grant does not extend across organizations (cannot impersonate a human approver cross-tenant)", () => {
  const decision = authorize({
    actorRole: "automated_service",
    action: "notification.send",
    actorOrgId: ORG_A,
    resourceOrgId: ORG_B,
    grantedCapabilities: ["notification.send"],
  });
  assert.equal(decision.allowed, false);
});

test("every capability granted to a customer/technician role is also declared org-scoped", () => {
  // Regression guard for the maintenance hazard called out in rbac.js:
  // a new capability added to org_owner/org_member/read_only_customer/
  // technician that's forgotten in ORG_SCOPED_ACTIONS would silently skip
  // the organization-ownership check entirely.
  for (const role of ["technician", "org_owner", "org_member", "read_only_customer"]) {
    for (const action of ROLE_CAPABILITIES[role]) {
      assert.ok(ORG_SCOPED_ACTIONS.has(action), `${role}'s "${action}" capability must be listed in ORG_SCOPED_ACTIONS`);
    }
  }
});

test("every decision includes a non-empty reason (for downstream audit-event shaping)", () => {
  const decisions = [
    authorize({ actorRole: "org_owner", action: "member.invite", actorOrgId: ORG_A, resourceOrgId: ORG_A, actorMembershipStatus: "active" }),
    authorize({ actorRole: "org_owner", action: "member.invite", actorOrgId: ORG_A, resourceOrgId: ORG_B, actorMembershipStatus: "active" }),
  ];
  for (const decision of decisions) {
    assert.equal(typeof decision.reason, "string");
    assert.ok(decision.reason.length > 0);
  }
});
