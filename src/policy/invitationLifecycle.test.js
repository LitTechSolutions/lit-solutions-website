const test = require("node:test");
const assert = require("node:assert/strict");
const {
  transitionInvitation,
  computeExpiresAt,
  generateInvitationToken,
  hashInvitationToken,
  TOKEN_TTL_DAYS,
} = require("./invitationLifecycle");

const FIXED_NOW = () => new Date("2026-07-15T12:00:00.000Z");

function invitation(overrides = {}) {
  return {
    id: "inv-1", organizationId: "org-a", email: "customer@example.com", role: "org_member",
    status: "pending", invitedBy: "admin-1", createdAt: "2026-07-08T12:00:00.000Z",
    expiresAt: "2026-07-15T12:00:00.000Z", ...overrides,
  };
}

test("pending invitation can be accepted before expiry", () => {
  const decision = transitionInvitation(invitation({ expiresAt: "2026-07-20T00:00:00.000Z" }), "accept", { now: FIXED_NOW });
  assert.equal(decision.allowed, true);
  assert.equal(decision.nextStatus, "accepted");
});

test("pending invitation can be revoked before expiry", () => {
  const decision = transitionInvitation(invitation({ expiresAt: "2026-07-20T00:00:00.000Z" }), "revoke", { now: FIXED_NOW });
  assert.equal(decision.allowed, true);
  assert.equal(decision.nextStatus, "revoked");
});

test("a token redeemed right as it expires resolves to expired, never accepted (race safety, same rule as approvalWorkflow.js)", () => {
  const decision = transitionInvitation(invitation({ expiresAt: "2026-07-15T11:00:00.000Z" }), "accept", { now: FIXED_NOW });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /expired/);
});

test("expire action succeeds once the window has passed", () => {
  const decision = transitionInvitation(invitation({ expiresAt: "2026-07-15T11:00:00.000Z" }), "expire", { now: FIXED_NOW });
  assert.equal(decision.allowed, true);
  assert.equal(decision.nextStatus, "expired");
});

test("expire action is denied while still within the window", () => {
  const decision = transitionInvitation(invitation({ expiresAt: "2026-07-20T00:00:00.000Z" }), "expire", { now: FIXED_NOW });
  assert.equal(decision.allowed, false);
});

for (const status of ["accepted", "expired", "revoked"]) {
  test(`no further transitions once terminal (status: ${status})`, () => {
    const decision = transitionInvitation(invitation({ status, expiresAt: "2026-07-20T00:00:00.000Z" }), "accept", { now: FIXED_NOW });
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /terminal/);
  });
}

test("rejects an unknown action", () => {
  const decision = transitionInvitation(invitation({ expiresAt: "2026-07-20T00:00:00.000Z" }), "delete", { now: FIXED_NOW });
  assert.equal(decision.allowed, false);
});

test("rejects an invalid invitation record", () => {
  assert.equal(transitionInvitation(null, "accept").allowed, false);
  assert.equal(transitionInvitation({ status: "bogus" }, "accept").allowed, false);
});

test("computeExpiresAt returns exactly TOKEN_TTL_DAYS (7) from now", () => {
  const expiresAt = computeExpiresAt({ now: FIXED_NOW });
  const diffDays = (new Date(expiresAt).getTime() - FIXED_NOW().getTime()) / (24 * 60 * 60 * 1000);
  assert.equal(diffDays, TOKEN_TTL_DAYS);
  assert.equal(TOKEN_TTL_DAYS, 7);
});

test("generateInvitationToken returns a 64-character hex string with no collisions across calls", () => {
  const a = generateInvitationToken();
  const b = generateInvitationToken();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test("hashInvitationToken is deterministic and never returns the raw token", () => {
  const token = "a".repeat(64);
  const hash1 = hashInvitationToken(token);
  const hash2 = hashInvitationToken(token);
  assert.equal(hash1, hash2);
  assert.notEqual(hash1, token);
  assert.match(hash1, /^[0-9a-f]{64}$/);
});

test("different tokens hash to different values", () => {
  assert.notEqual(hashInvitationToken("a".repeat(64)), hashInvitationToken("b".repeat(64)));
});
