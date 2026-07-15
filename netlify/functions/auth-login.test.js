// Focused tests for the Session 20 MFA branching added to this endpoint.
// Pre-existing login behavior (rate limiting, generic-error shape,
// unverified-account gate) is exercised indirectly here via the deps
// seam this session added; nothing about the underlying password check
// changed.

const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./auth-login");

function adminUser(overrides = {}) {
  return { id: "admin-1", email: "dylan@lit-solutions.tech", name: "Dylan", role: "admin", passwordHash: "irrelevant", verified: true, ...overrides };
}

function customerUser(overrides = {}) {
  return { id: "cust-1", email: "cust@example.com", name: "Cust", role: "customer", passwordHash: "irrelevant", verified: true, ...overrides };
}

function baseEvent(overrides = {}) {
  return { httpMethod: "POST", headers: {}, body: JSON.stringify({ email: "x@example.com", password: "correct-password" }), ...overrides };
}

test("a non-admin user still gets a real session cookie directly (MFA is platform_admin-only)", async () => {
  const res = await handler(baseEvent(), {}, {
    rateLimited: async () => false,
    getJSON: async () => customerUser(),
    verifyPassword: async () => true,
    createSession: async () => ({ token: "tok", expiresAt: Date.now() + 1000 }),
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Set-Cookie"], /^lts_session=/);
  assert.equal(JSON.parse(res.body).mfaRequired, undefined);
});

test("an admin user with MFA already enabled gets a pre-auth cookie, not a real session, and enrollmentRequired: false", async () => {
  const res = await handler(baseEvent(), {}, {
    rateLimited: async () => false,
    getJSON: async () => adminUser({ mfaEnabled: true }),
    verifyPassword: async () => true,
    createSingleUseToken: (type, uid, ttl) => `pre-auth-token:${type}:${uid}:${ttl}`,
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.mfaRequired, true);
  assert.equal(body.enrollmentRequired, false);
  assert.match(res.headers["Set-Cookie"], /^lts_mfa_pending=pre-auth-token:mfa_pending:admin-1:300/);
  assert.doesNotMatch(res.headers["Set-Cookie"], /^lts_session=/);
});

test("an admin user with no MFA enrolled yet gets enrollmentRequired: true", async () => {
  const res = await handler(baseEvent(), {}, {
    rateLimited: async () => false,
    getJSON: async () => adminUser({ mfaEnabled: false }),
    verifyPassword: async () => true,
    createSingleUseToken: () => "pre-auth-token",
  });
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).enrollmentRequired, true);
});

test("an admin user with mfaEnabled undefined (never touched this field) is treated as needing enrollment", async () => {
  const res = await handler(baseEvent(), {}, {
    rateLimited: async () => false,
    getJSON: async () => adminUser(),
    verifyPassword: async () => true,
    createSingleUseToken: () => "pre-auth-token",
  });
  assert.equal(JSON.parse(res.body).enrollmentRequired, true);
});

test("wrong password never reaches the MFA branch, even for an admin account", async () => {
  const res = await handler(baseEvent(), {}, {
    rateLimited: async () => false,
    getJSON: async () => adminUser({ mfaEnabled: true }),
    verifyPassword: async () => false,
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers["Set-Cookie"], undefined);
});

test("an unverified admin account is still blocked before MFA is ever considered", async () => {
  const res = await handler(baseEvent(), {}, {
    rateLimited: async () => false,
    getJSON: async () => adminUser({ verified: false }),
    verifyPassword: async () => true,
  });
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).code, "unverified");
});

test("rate limiting still applies before any credential check", async () => {
  const res = await handler(baseEvent(), {}, { rateLimited: async () => true, getJSON: async () => { throw new Error("should not be reached"); } });
  assert.equal(res.statusCode, 429);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "GET" }, {}, {});
  assert.equal(res.statusCode, 405);
});
