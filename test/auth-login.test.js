const test = require("node:test");
const assert = require("node:assert/strict");
const { handler, maskedEmail, generateCode } = require("../netlify/functions/auth-login");

function adminUser(overrides = {}) {
  return { id: "admin-1", email: "dylan@lit-solutions.tech", name: "Dylan", role: "admin", passwordHash: "irrelevant", verified: true, ...overrides };
}

function customerUser(overrides = {}) {
  return { id: "cust-1", email: "cust@example.com", name: "Cust", role: "customer", passwordHash: "irrelevant", verified: true, ...overrides };
}

function baseEvent(overrides = {}) {
  return { httpMethod: "POST", headers: {}, body: JSON.stringify({ email: "x@example.com", password: "correct-password" }), ...overrides };
}

test("a non-admin user still receives a real session directly", async () => {
  const res = await handler(baseEvent(), {}, {
    rateLimited: async () => false,
    getJSON: async () => customerUser(),
    verifyPassword: async () => true,
    createSession: async () => ({ token: "tok", expiresAt: Date.now() + 1000 }),
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Set-Cookie"], /^lts_session=/);
  assert.equal(JSON.parse(res.body).emailCodeRequired, undefined);
});

test("an admin password issues an emailed, hashed, expiring challenge and no session", async () => {
  const writes = [];
  const emails = [];
  const now = 1_900_000_000_000;
  const res = await handler(baseEvent(), {}, {
    rateLimited: async () => false,
    getJSON: async () => adminUser({ mfaEnabled: true }),
    verifyPassword: async () => true,
    challengeId: () => "abcdef0123456789abcdef0123456789abcd",
    generateCode: () => "041209",
    hashCode: () => "a".repeat(64),
    now: () => now,
    setJSON: async (...args) => writes.push(args),
    sendEmail: async (message) => { emails.push(message); return { sent: true, id: "mail-1" }; },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Set-Cookie"], undefined);
  const body = JSON.parse(res.body);
  assert.equal(body.emailCodeRequired, true);
  assert.equal(body.challengeId, "abcdef0123456789abcdef0123456789abcd");
  assert.match(body.maskedEmail, /^dy.*@lit-solutions\.tech$/);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], "admin-login");
  assert.equal(writes[0][2].codeHash, "a".repeat(64));
  assert.equal(JSON.stringify(writes[0][2]).includes("041209"), false, "the readable code must not be persisted");
  assert.equal(writes[0][2].expiresAt, now + 10 * 60 * 1000);
  assert.match(emails[0].subject, /041209/);
  assert.match(emails[0].html, /041209/);
});

test("legacy authenticator enrollment state does not affect the new email-code flow", async () => {
  for (const mfaEnabled of [true, false, undefined]) {
    const res = await handler(baseEvent(), {}, {
      rateLimited: async () => false,
      getJSON: async () => adminUser({ mfaEnabled }),
      verifyPassword: async () => true,
      challengeId: () => "abcdef0123456789abcdef0123456789abcd",
      generateCode: () => "123456",
      hashCode: () => "a".repeat(64),
      setJSON: async () => {},
      sendEmail: async () => ({ sent: true }),
    });
    assert.equal(JSON.parse(res.body).emailCodeRequired, true);
    assert.equal(JSON.parse(res.body).enrollmentRequired, undefined);
  }
});

test("admin sign-in fails closed when the security email is not accepted", async () => {
  const res = await handler(baseEvent(), {}, {
    rateLimited: async () => false,
    getJSON: async () => adminUser(),
    verifyPassword: async () => true,
    challengeId: () => "abcdef0123456789abcdef0123456789abcd",
    generateCode: () => "123456",
    hashCode: () => "a".repeat(64),
    setJSON: async () => {},
    sendEmail: async () => ({ sent: false, reason: "provider error" }),
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers["Set-Cookie"], undefined);
});

test("wrong password never reaches the email-code branch", async () => {
  const res = await handler(baseEvent(), {}, {
    rateLimited: async () => false,
    getJSON: async () => adminUser(),
    verifyPassword: async () => false,
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers["Set-Cookie"], undefined);
});

test("an unverified admin account remains blocked before a code is sent", async () => {
  const res = await handler(baseEvent(), {}, {
    rateLimited: async () => false,
    getJSON: async () => adminUser({ verified: false }),
    verifyPassword: async () => true,
  });
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).code, "unverified");
});

test("login rate limiting applies before any credential check", async () => {
  const res = await handler(baseEvent(), {}, { rateLimited: async () => true });
  assert.equal(res.statusCode, 429);
});

test("masking keeps the destination recognizable without exposing the full address", () => {
  assert.equal(maskedEmail("dylan@example.com"), "dy•••@example.com");
});

test("generated codes are always six digits", () => {
  for (let i = 0; i < 30; i += 1) assert.match(generateCode(), /^\d{6}$/);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "GET" }, {}, {});
  assert.equal(res.statusCode, 405);
});
