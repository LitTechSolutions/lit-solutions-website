const test = require("node:test");
const assert = require("node:assert/strict");
const { transitionApproval, isExpired } = require("./approvalWorkflow");

const NOW = () => new Date("2026-07-14T12:00:00.000Z");

function pendingApproval(overrides = {}) {
  return {
    id: "approval-1",
    organizationId: "org-a",
    subjectType: "scope",
    subjectId: "scope-1",
    status: "pending",
    requestedAt: "2026-07-01T00:00:00.000Z",
    requestedBy: "user-tech-1",
    expiresAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

test("pending -> approved via 'approve'", () => {
  const decision = transitionApproval(pendingApproval(), "approve", { now: NOW });
  assert.equal(decision.allowed, true);
  assert.equal(decision.nextStatus, "approved");
});

test("pending -> rejected via 'reject'", () => {
  const decision = transitionApproval(pendingApproval(), "reject", { now: NOW });
  assert.equal(decision.allowed, true);
  assert.equal(decision.nextStatus, "rejected");
});

test("cannot expire a still-open approval", () => {
  const decision = transitionApproval(pendingApproval(), "expire", { now: NOW });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /has not yet expired/);
});

test("an approval past its expiry can only transition to expired", () => {
  const expiredCandidate = pendingApproval({ expiresAt: "2026-01-01T00:00:00.000Z" });
  const approveAttempt = transitionApproval(expiredCandidate, "approve", { now: NOW });
  const expireAttempt = transitionApproval(expiredCandidate, "expire", { now: NOW });
  assert.equal(approveAttempt.allowed, false);
  assert.match(approveAttempt.reason, /approval window has passed/);
  assert.equal(expireAttempt.allowed, true);
  assert.equal(expireAttempt.nextStatus, "expired");
});

test("terminal states (approved/rejected/expired) accept no further transitions", () => {
  for (const status of ["approved", "rejected", "expired"]) {
    const decision = transitionApproval(pendingApproval({ status }), "approve", { now: NOW });
    assert.equal(decision.allowed, false, `expected ${status} to be terminal`);
    assert.match(decision.reason, /already terminal/);
  }
});

test("unknown action is denied", () => {
  const decision = transitionApproval(pendingApproval(), "delete", { now: NOW });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /unknown action/);
});

test("invalid approval record is denied", () => {
  assert.equal(transitionApproval(null, "approve", { now: NOW }).allowed, false);
  assert.equal(transitionApproval({ status: "not_a_real_status" }, "approve", { now: NOW }).allowed, false);
});

test("isExpired is true only for pending approvals past their expiresAt", () => {
  assert.equal(isExpired(pendingApproval({ expiresAt: "2026-01-01T00:00:00.000Z" }), NOW()), true);
  assert.equal(isExpired(pendingApproval({ expiresAt: "2027-01-01T00:00:00.000Z" }), NOW()), false);
  assert.equal(isExpired(pendingApproval({ status: "approved", expiresAt: "2026-01-01T00:00:00.000Z" }), NOW()), false);
});
