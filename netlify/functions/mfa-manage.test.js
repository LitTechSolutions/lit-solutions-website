const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./mfa-manage");

function fakeAuditRecorder() {
  const events = [];
  return { record: async (input) => { events.push(input); return input; }, events };
}

function enrolledAdminUser(overrides = {}) {
  return {
    id: "admin-1",
    email: "dylan@lit-solutions.tech",
    name: "Dylan",
    role: "admin",
    passwordHash: "irrelevant",
    mfaEnabled: true,
    mfaSecretEncrypted: "encrypted-secret",
    mfaRecoveryCodeHashes: ["hash1", "hash2"],
    mfaEnrolledAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function fakeStoreFor(users) {
  return () => ({
    list: async () => ({ blobs: Object.keys(users).map((key) => ({ key })) }),
    get: async (key) => users[key] || null,
  });
}

function baseEvent(overrides = {}) {
  return { httpMethod: "POST", headers: { cookie: "lts_session=fake-session-token" }, body: JSON.stringify({ action: "disable", password: "correct-password" }), ...overrides };
}

function baseDeps(users, extra = {}) {
  const saved = {};
  let revokedFor = null;
  return {
    readCookie: () => "fake-session-token",
    getSession: async (token) => (token === "fake-session-token" ? { userId: "admin-1", role: "admin", sessionId: "s1" } : null),
    store: fakeStoreFor(users),
    setJSON: async (storeName, key, value) => { saved[key] = value; users[key] = value; },
    rateLimited: async () => false,
    verifyPassword: async () => true,
    auditRecorder: fakeAuditRecorder(),
    revokeAllSessionsForUser: async (userId) => { revokedFor = userId; },
    _saved: saved,
    _revokedFor: () => revokedFor,
    ...extra,
  };
}

test("POST without a session cookie returns 401", async () => {
  const res = await handler(baseEvent({ headers: {} }), {}, { getSession: async () => null, readCookie: () => null });
  assert.equal(res.statusCode, 401);
});

test("POST as a non-admin session role is denied", async () => {
  const res = await handler(baseEvent(), {}, { readCookie: () => "fake-session-token", getSession: async () => ({ userId: "cust-1", role: "customer" }) });
  assert.equal(res.statusCode, 403);
});

test("POST with an unrecognized action returns 400", async () => {
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser() };
  const res = await handler(baseEvent({ body: JSON.stringify({ action: "bogus", password: "x" }) }), {}, baseDeps(users));
  assert.equal(res.statusCode, 400);
});

test("POST without a password returns 400 before touching rate limiting or the account", async () => {
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser() };
  const res = await handler(baseEvent({ body: JSON.stringify({ action: "disable" }) }), {}, baseDeps(users, { rateLimited: async () => { throw new Error("should not be reached"); } }));
  assert.equal(res.statusCode, 400);
});

test("POST is rate-limited per account", async () => {
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser() };
  const res = await handler(baseEvent(), {}, baseDeps(users, { rateLimited: async () => true }));
  assert.equal(res.statusCode, 429);
});

test("the wrong password is denied, audited as a failure, and MFA stays enabled", async () => {
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser() };
  const deps = baseDeps(users, { verifyPassword: async () => false });
  const res = await handler(baseEvent(), {}, deps);
  assert.equal(res.statusCode, 401);
  assert.equal(deps.auditRecorder.events[0].action, "mfa.disable");
  assert.equal(deps.auditRecorder.events[0].outcome, "failure");
  assert.equal(users["dylan@lit-solutions.tech"].mfaEnabled, true, "unchanged on failed reauth");
});

test("action: disable with the correct password clears MFA state, audits mfa.disable, and revokes all sessions", async () => {
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser() };
  const deps = baseDeps(users);
  const res = await handler(baseEvent({ body: JSON.stringify({ action: "disable", password: "correct-password" }) }), {}, deps);

  assert.equal(res.statusCode, 200);
  const saved = deps._saved["dylan@lit-solutions.tech"];
  assert.equal(saved.mfaEnabled, false);
  assert.equal(saved.mfaSecretEncrypted, undefined);
  assert.equal(saved.mfaRecoveryCodeHashes.length, 0);
  assert.equal(saved.mfaEnrolledAt, undefined);

  assert.equal(deps.auditRecorder.events[0].action, "mfa.disable");
  assert.equal(deps.auditRecorder.events[0].outcome, "success");
  assert.equal(deps._revokedFor(), "admin-1");
});

test("action: reset has the same effect as disable but is audited under a distinct action name", async () => {
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser() };
  const deps = baseDeps(users);
  const res = await handler(baseEvent({ body: JSON.stringify({ action: "reset", password: "correct-password" }) }), {}, deps);

  assert.equal(res.statusCode, 200);
  assert.equal(deps._saved["dylan@lit-solutions.tech"].mfaEnabled, false);
  assert.equal(deps.auditRecorder.events[0].action, "mfa.reset");
});

test("action: disable sends a security notification email and audits successful delivery under a distinct action name", async () => {
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser() };
  const sentEmails = [];
  const deps = baseDeps(users, { sendEmail: async (opts) => { sentEmails.push(opts); return { sent: true }; } });
  await handler(baseEvent({ body: JSON.stringify({ action: "disable", password: "correct-password" }) }), {}, deps);

  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "dylan@lit-solutions.tech");
  assert.equal(deps.auditRecorder.events[1].action, "mfa.disable.notification");
  assert.equal(deps.auditRecorder.events[1].outcome, "success");
});

test("action: reset audits a failed notification delivery without failing the reset itself", async () => {
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser() };
  const deps = baseDeps(users, { sendEmail: async () => ({ sent: false, reason: "not configured" }) });
  const res = await handler(baseEvent({ body: JSON.stringify({ action: "reset", password: "correct-password" }) }), {}, deps);

  assert.equal(res.statusCode, 200, "the reset itself still succeeds even if the notification email couldn't be delivered");
  assert.equal(deps.auditRecorder.events[1].action, "mfa.reset.notification");
  assert.equal(deps.auditRecorder.events[1].outcome, "failure");
  assert.equal(deps.auditRecorder.events[1].metadata.reason, "not configured");
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "GET" }, {}, {});
  assert.equal(res.statusCode, 405);
});
