const test = require("node:test");
const assert = require("node:assert/strict");
const { assembleDashboard } = require("./dashboardViewModel");

function service(overrides = {}) {
  return { id: "svc-1", organizationId: "org-a", category: "website", title: "Site care", status: "active", createdAt: "x", updatedAt: "x", createdBy: "u", version: 1, ...overrides };
}

function approval(overrides = {}) {
  return { id: "appr-1", organizationId: "org-a", subjectType: "scope", subjectId: "scope-1", status: "pending", requestedAt: "x", requestedBy: "u", expiresAt: "y", ...overrides };
}

test("counts active services and separates ones needing attention", () => {
  const view = assembleDashboard({
    organizationId: "org-a",
    services: [service({ status: "active" }), service({ id: "svc-2", status: "on_hold" }), service({ id: "svc-3", status: "completed" })],
    approvals: [],
    recentActivity: [],
    unreadNotificationCount: 0,
  });
  assert.equal(view.activeServiceCount, 1);
  assert.equal(view.servicesNeedingAttention.length, 1);
  assert.equal(view.servicesNeedingAttention[0].id, "svc-2");
});

test("only counts pending approvals, not already-decided ones", () => {
  const view = assembleDashboard({
    organizationId: "org-a",
    services: [],
    approvals: [approval({ status: "pending" }), approval({ id: "appr-2", status: "approved" })],
    recentActivity: [],
    unreadNotificationCount: 0,
  });
  assert.equal(view.pendingApprovalCount, 1);
});

test("planUsage is explicitly null with a reason, not a fake zero", () => {
  const view = assembleDashboard({ organizationId: "org-a", services: [], approvals: [], recentActivity: [], unreadNotificationCount: 0 });
  assert.equal(view.planUsage, null);
  assert.match(view.planUsageUnavailableReason, /F049/);
});

test("throws if any input slice contains a record from a different organization (caller scoping bug)", () => {
  assert.throws(
    () =>
      assembleDashboard({
        organizationId: "org-a",
        services: [service({ organizationId: "org-b" })],
        approvals: [],
        recentActivity: [],
        unreadNotificationCount: 0,
      }),
    /different organization/
  );
});

test("requires organizationId", () => {
  assert.throws(() => assembleDashboard({ services: [], approvals: [], recentActivity: [] }), /organizationId is required/);
});
