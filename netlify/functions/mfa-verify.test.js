const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./mfa-verify");
const { generateTotpSecret } = require("../../src/security/totp");
const { encryptSecret, generateRecoveryCodes, hashRecoveryCode } = require("../../src/security/mfaCrypto");

const MFA_KEY = "a".repeat(64);

function fakeAuditRecorder() {
  const events = [];
  return { record: async (input) => { events.push(input); return input; }, events };
}

function enrolledAdminUser(overrides = {}) {
  const secret = generateTotpSecret();
  return {
    id: "admin-1",
    email: "dylan@lit-solutions.tech",
    name: "Dylan",
    role: "admin",
    verified: true,
    mfaEnabled: true,
    mfaSecretEncrypted: encryptSecret(secret, MFA_KEY),
    mfaRecoveryCodeHashes: [],
    _secret: secret,
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
  return { httpMethod: "POST", headers: { cookie: "lts_mfa_pending=fake-pending-token" }, body: JSON.stringify({ code: "123456" }), ...overrides };
}

function baseDeps(users, extra = {}) {
  const saved = {};
  return {
    readCookie: () => "fake-pending-token",
    verify: (token) => (token === "fake-pending-token" ? { type: "mfa_pending", uid: "admin-1" } : null),
    store: fakeStoreFor(users),
    setJSON: async (storeName, key, value) => { saved[key] = value; users[key] = value; },
    rateLimited: async () => false,
    mfaEncryptionKey: MFA_KEY,
    auditRecorder: fakeAuditRecorder(),
    createSession: async () => ({ token: "real-session-token", expiresAt: Date.now() + 1000 }),
    _saved: saved,
    ...extra,
  };
}

test("POST without a pending cookie returns 401", async () => {
  const res = await handler(baseEvent({ headers: {} }), {}, { readCookie: () => null });
  assert.equal(res.statusCode, 401);
});

test("POST with neither code nor recoveryCode returns 400", async () => {
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser() };
  const res = await handler(baseEvent({ body: JSON.stringify({}) }), {}, baseDeps(users));
  assert.equal(res.statusCode, 400);
});

test("POST for an account that never enrolled MFA returns 400", async () => {
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser({ mfaEnabled: false }) };
  const res = await handler(baseEvent(), {}, baseDeps(users));
  assert.equal(res.statusCode, 400);
});

test("POST is rate-limited per account", async () => {
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser() };
  const res = await handler(baseEvent(), {}, baseDeps(users, { rateLimited: async () => true }));
  assert.equal(res.statusCode, 429);
});

test("a correct TOTP code issues a real session, clears the pending cookie, and audits success", async () => {
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser() };
  const deps = baseDeps(users, { verifyTotpCode: () => true });
  const res = await handler(baseEvent(), {}, deps);
  assert.equal(res.statusCode, 200);
  assert.equal(res.multiValueHeaders["Set-Cookie"].length, 2);
  assert.match(res.multiValueHeaders["Set-Cookie"][0], /^lts_session=real-session-token/);
  assert.match(res.multiValueHeaders["Set-Cookie"][1], /^lts_mfa_pending=;.*Max-Age=0/);
  assert.equal(deps.auditRecorder.events[0].action, "mfa.challenge.success");
});

test("an incorrect TOTP code is denied and audited as a failure, no session issued", async () => {
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser() };
  const deps = baseDeps(users, { verifyTotpCode: () => false });
  const res = await handler(baseEvent(), {}, deps);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers["Set-Cookie"], undefined);
  assert.equal(res.multiValueHeaders, undefined);
  assert.equal(deps.auditRecorder.events[0].action, "mfa.challenge.failure");
});

test("a valid, unused recovery code issues a real session and is consumed (single-use)", async () => {
  const codes = generateRecoveryCodes(3);
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser({ mfaRecoveryCodeHashes: codes.map(hashRecoveryCode) }) };
  const deps = baseDeps(users);
  const res = await handler(baseEvent({ body: JSON.stringify({ recoveryCode: codes[1] }) }), {}, deps);

  assert.equal(res.statusCode, 200);
  const saved = deps._saved["dylan@lit-solutions.tech"];
  assert.equal(saved.mfaRecoveryCodeHashes.length, 2, "the used code is removed, the other two remain");
  assert.equal(saved.mfaRecoveryCodeHashes.includes(hashRecoveryCode(codes[1])), false);
  assert.equal(deps.auditRecorder.events[0].action, "mfa.recovery_code.used");
});

test("reusing an already-consumed recovery code is denied", async () => {
  const codes = generateRecoveryCodes(1);
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser({ mfaRecoveryCodeHashes: [] }) }; // already consumed
  const deps = baseDeps(users);
  const res = await handler(baseEvent({ body: JSON.stringify({ recoveryCode: codes[0] }) }), {}, deps);
  assert.equal(res.statusCode, 401);
});

test("an unknown recovery code is denied and audited as a failure", async () => {
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser({ mfaRecoveryCodeHashes: [hashRecoveryCode("AAAAA-AAAAA")] }) };
  const deps = baseDeps(users);
  const res = await handler(baseEvent({ body: JSON.stringify({ recoveryCode: "ZZZZZ-ZZZZZ" }) }), {}, deps);
  assert.equal(res.statusCode, 401);
  assert.equal(deps.auditRecorder.events[0].action, "mfa.challenge.failure");
});

test("recovery code takes precedence when both code and recoveryCode are supplied", async () => {
  const codes = generateRecoveryCodes(1);
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser({ mfaRecoveryCodeHashes: codes.map(hashRecoveryCode) }) };
  const deps = baseDeps(users, { verifyTotpCode: () => false }); // TOTP would fail, recovery should still work
  const res = await handler(baseEvent({ body: JSON.stringify({ code: "000000", recoveryCode: codes[0] }) }), {}, deps);
  assert.equal(res.statusCode, 200);
});

test("real TOTP round-trip: a code generated from the enrolled secret validates", async () => {
  const users = { "dylan@lit-solutions.tech": enrolledAdminUser() };
  const secret = users["dylan@lit-solutions.tech"]._secret;
  const { TOTP, Secret } = require("otpauth");
  const totp = new TOTP({ digits: 6, period: 30, secret: Secret.fromBase32(secret) });
  const code = totp.generate();
  const res = await handler(baseEvent({ body: JSON.stringify({ code }) }), {}, baseDeps(users));
  assert.equal(res.statusCode, 200);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "GET" }, {}, {});
  assert.equal(res.statusCode, 405);
});
