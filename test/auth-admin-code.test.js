const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/auth-admin-code");

const challengeId = "abcdef0123456789abcdef0123456789abcd";
const now = 1_900_000_000_000;

function event(code = "123456") {
  return { httpMethod: "POST", headers: {}, body: JSON.stringify({ challengeId, code }) };
}

function challenge(overrides = {}) {
  return { userId: "admin-1", email: "admin@example.com", codeHash: "b".repeat(64), expiresAt: now + 600_000, attempts: 0, used: false, ...overrides };
}

test("a valid emailed code creates the admin session and consumes the challenge", async () => {
  const writes = [];
  const res = await handler(event(), {}, {
    rateLimited: async () => false,
    getJSON: async () => challenge(),
    setJSON: async (...args) => writes.push(args),
    hashCode: () => "b".repeat(64),
    findUserById: async () => ({ id: "admin-1", name: "Dylan", email: "admin@example.com", role: "admin", verified: true }),
    createSession: async () => ({ token: "session-token", expiresAt: now + 3_600_000 }),
    now: () => now,
  });
  assert.equal(res.statusCode, 200);
  assert.equal(writes[0][2].used, true);
  assert.deepEqual(res.multiValueHeaders["Set-Cookie"].map((v) => v.split("=")[0]), ["lts_session", "lts_mfa_pending"]);
});

test("a wrong code increments the persistent attempt counter and creates no session", async () => {
  const writes = [];
  const res = await handler(event("000000"), {}, {
    rateLimited: async () => false,
    getJSON: async () => challenge(),
    setJSON: async (...args) => writes.push(args),
    hashCode: () => "c".repeat(64),
    now: () => now,
  });
  assert.equal(res.statusCode, 401);
  assert.equal(writes[0][2].attempts, 1);
  assert.equal(res.headers["Set-Cookie"], undefined);
});

test("expired, used, and locked challenges all fail closed", async () => {
  for (const rec of [challenge({ expiresAt: now - 1 }), challenge({ used: true }), challenge({ attempts: 6 })]) {
    const res = await handler(event(), {}, { rateLimited: async () => false, getJSON: async () => rec, now: () => now });
    assert.equal(res.statusCode, 401);
  }
});

test("a matching code cannot create a non-admin session", async () => {
  const res = await handler(event(), {}, {
    rateLimited: async () => false,
    getJSON: async () => challenge(),
    setJSON: async () => {},
    hashCode: () => "b".repeat(64),
    findUserById: async () => ({ id: "admin-1", role: "customer", verified: true }),
    now: () => now,
  });
  assert.equal(res.statusCode, 401);
});

test("malformed codes and unsupported methods are rejected", async () => {
  assert.equal((await handler(event("12"), {}, { rateLimited: async () => false })).statusCode, 400);
  assert.equal((await handler({ httpMethod: "GET" }, {}, {})).statusCode, 405);
});
