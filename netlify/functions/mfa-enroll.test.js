const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./mfa-enroll");
const { generateTotpSecret, buildOtpauthUri, validateTotpToken } = require("../../src/security/totp");
const { encryptSecret, decryptSecret } = require("../../src/security/mfaCrypto");

const MFA_KEY = "a".repeat(64);
const FIXED_TS = 1752580800000;

function fakeAuditRecorder() {
  const events = [];
  return { record: async (input) => { events.push(input); return input; }, events };
}

function adminUser(overrides = {}) {
  return { id: "admin-1", email: "dylan@lit-solutions.tech", name: "Dylan", role: "admin", verified: true, ...overrides };
}

function fakeStoreFor(users) {
  // users: { [blobKey]: userObject }
  return () => ({
    list: async () => ({ blobs: Object.keys(users).map((key) => ({ key })) }),
    get: async (key) => users[key] || null,
  });
}

function baseEvent(overrides = {}) {
  return { httpMethod: "POST", headers: { cookie: "lts_mfa_pending=fake-pending-token" }, body: JSON.stringify({ action: "start" }), ...overrides };
}

function baseDeps(users, extra = {}) {
  const saved = {};
  return {
    readCookie: () => "fake-pending-token",
    verify: (token) => (token === "fake-pending-token" ? { type: "mfa_pending", uid: "admin-1" } : null),
    store: fakeStoreFor(users),
    getJSON: async () => null,
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

test("POST with an invalid/expired pending token returns 401", async () => {
  const res = await handler(baseEvent(), {}, { readCookie: () => "fake-pending-token", verify: () => null });
  assert.equal(res.statusCode, 401);
});

test("POST for an account that already has MFA enabled returns 400", async () => {
  const users = { "dylan@lit-solutions.tech": adminUser({ mfaEnabled: true }) };
  const res = await handler(baseEvent(), {}, baseDeps(users));
  assert.equal(res.statusCode, 400);
});

test("action: start generates a secret, stores it encrypted as PENDING (not active), and returns it once", async () => {
  const users = { "dylan@lit-solutions.tech": adminUser() };
  const deps = baseDeps(users);
  const res = await handler(baseEvent({ body: JSON.stringify({ action: "start" }) }), {}, deps);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.match(body.secret, /^[A-Z2-7]+=*$/);
  assert.match(body.otpauthUri, /^otpauth:\/\/totp\//);

  const saved = deps._saved["dylan@lit-solutions.tech"];
  assert.ok(saved.mfaPendingSecretEncrypted, "the pending secret was persisted, encrypted");
  assert.notEqual(saved.mfaPendingSecretEncrypted, body.secret, "never stored in plaintext");
  assert.equal(decryptSecret(saved.mfaPendingSecretEncrypted, MFA_KEY), body.secret);
  assert.equal(saved.mfaEnabled, undefined, "not active until confirmed");

  assert.equal(deps.auditRecorder.events.length, 1);
  assert.equal(deps.auditRecorder.events[0].action, "mfa.enroll.start");
});

test("action: start is rate-limited", async () => {
  const users = { "dylan@lit-solutions.tech": adminUser() };
  const res = await handler(baseEvent(), {}, baseDeps(users, { rateLimited: async () => true }));
  assert.equal(res.statusCode, 429);
});

test("action: confirm with no enrollment in progress returns 400", async () => {
  const users = { "dylan@lit-solutions.tech": adminUser() };
  const res = await handler(baseEvent({ body: JSON.stringify({ action: "confirm", code: "123456" }) }), {}, baseDeps(users));
  assert.equal(res.statusCode, 400);
});

test("action: confirm with the wrong code is denied, audited as a failure, and MFA is NOT activated", async () => {
  const secret = generateTotpSecret();
  const users = { "dylan@lit-solutions.tech": adminUser({ mfaPendingSecretEncrypted: encryptSecret(secret, MFA_KEY) }) };
  const deps = baseDeps(users, { validateTotpToken: () => ({ valid: false, counter: null }) });
  const res = await handler(baseEvent({ body: JSON.stringify({ action: "confirm", code: "000000" }) }), {}, deps);
  assert.equal(res.statusCode, 401);
  assert.equal(deps.auditRecorder.events[0].action, "mfa.enroll.confirm");
  assert.equal(deps.auditRecorder.events[0].outcome, "failure");
});

test("action: confirm with the correct code activates MFA, issues recovery codes once, and upgrades to a real session", async () => {
  const secret = generateTotpSecret();
  const users = { "dylan@lit-solutions.tech": adminUser({ mfaPendingSecretEncrypted: encryptSecret(secret, MFA_KEY) }) };
  const deps = baseDeps(users, { validateTotpToken: () => ({ valid: true, counter: 1000 }) });
  const res = await handler(baseEvent({ body: JSON.stringify({ action: "confirm", code: "123456" }) }), {}, deps);

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.recoveryCodes.length, 10);
  for (const code of body.recoveryCodes) assert.match(code, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

  const saved = deps._saved["dylan@lit-solutions.tech"];
  assert.equal(saved.mfaEnabled, true);
  assert.equal(saved.mfaPendingSecretEncrypted, undefined, "pending secret cleared once promoted");
  assert.ok(saved.mfaSecretEncrypted);
  assert.equal(saved.mfaRecoveryCodeHashes.length, 10);
  assert.notEqual(saved.mfaRecoveryCodeHashes[0], body.recoveryCodes[0], "stored hashed, not plaintext");
  assert.equal(saved.mfaLastUsedCounter, 1000, "seeds anti-replay tracking with the confirm code's own counter");

  assert.equal(deps.auditRecorder.events.length, 2, "mfa.enroll.confirm plus a delivery-outcome event for the security notification email");
  assert.equal(deps.auditRecorder.events[0].action, "mfa.enroll.confirm");
  assert.equal(deps.auditRecorder.events[0].outcome, "success");
  assert.equal(deps.auditRecorder.events[1].action, "mfa.enroll.notification");

  assert.equal(res.multiValueHeaders["Set-Cookie"].length, 2);
  assert.match(res.multiValueHeaders["Set-Cookie"][0], /^lts_session=real-session-token/);
  assert.match(res.multiValueHeaders["Set-Cookie"][1], /^lts_mfa_pending=;.*Max-Age=0/);
});

test("action: confirm sends a security notification email and audits successful delivery", async () => {
  const secret = generateTotpSecret();
  const users = { "dylan@lit-solutions.tech": adminUser({ mfaPendingSecretEncrypted: encryptSecret(secret, MFA_KEY) }) };
  const sentEmails = [];
  const deps = baseDeps(users, {
    validateTotpToken: () => ({ valid: true, counter: 1000 }),
    sendEmail: async (opts) => { sentEmails.push(opts); return { sent: true }; },
  });
  await handler(baseEvent({ body: JSON.stringify({ action: "confirm", code: "123456" }) }), {}, deps);

  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "dylan@lit-solutions.tech");
  assert.match(sentEmails[0].subject, /enabled/i);
  assert.equal(deps.auditRecorder.events[1].action, "mfa.enroll.notification");
  assert.equal(deps.auditRecorder.events[1].outcome, "success");
});

test("action: confirm audits a failed notification delivery without failing the enrollment itself", async () => {
  const secret = generateTotpSecret();
  const users = { "dylan@lit-solutions.tech": adminUser({ mfaPendingSecretEncrypted: encryptSecret(secret, MFA_KEY) }) };
  const deps = baseDeps(users, {
    validateTotpToken: () => ({ valid: true, counter: 1000 }),
    sendEmail: async () => ({ sent: false, reason: "not configured" }),
  });
  const res = await handler(baseEvent({ body: JSON.stringify({ action: "confirm", code: "123456" }) }), {}, deps);

  assert.equal(res.statusCode, 200, "enrollment itself still succeeds even if the notification email couldn't be delivered");
  assert.equal(deps.auditRecorder.events[1].action, "mfa.enroll.notification");
  assert.equal(deps.auditRecorder.events[1].outcome, "failure");
  assert.equal(deps.auditRecorder.events[1].metadata.reason, "not configured");
});

test("action: confirm rate-limits repeated attempts", async () => {
  const secret = generateTotpSecret();
  const users = { "dylan@lit-solutions.tech": adminUser({ mfaPendingSecretEncrypted: encryptSecret(secret, MFA_KEY) }) };
  const res = await handler(baseEvent({ body: JSON.stringify({ action: "confirm", code: "123456" }) }), {}, baseDeps(users, { rateLimited: async () => true }));
  assert.equal(res.statusCode, 429);
});

test("an unrecognized action returns 400", async () => {
  const users = { "dylan@lit-solutions.tech": adminUser() };
  const res = await handler(baseEvent({ body: JSON.stringify({ action: "bogus" }) }), {}, baseDeps(users));
  assert.equal(res.statusCode, 400);
});

test("real TOTP round-trip end to end: generate a code from the returned secret and confirm with it", async () => {
  const users = { "dylan@lit-solutions.tech": adminUser() };
  const deps = baseDeps(users);
  const startRes = await handler(baseEvent({ body: JSON.stringify({ action: "start" }) }), {}, deps);
  const { secret } = JSON.parse(startRes.body);

  const { TOTP, Secret } = require("otpauth");
  const totp = new TOTP({ digits: 6, period: 30, secret: Secret.fromBase32(secret) });
  const code = totp.generate({ timestamp: FIXED_TS });

  const confirmRes = await handler(
    baseEvent({ body: JSON.stringify({ action: "confirm", code }) }),
    {},
    { ...deps, validateTotpToken: (s, t) => validateTotpToken(s, t, { timestamp: FIXED_TS }) }
  );
  assert.equal(confirmRes.statusCode, 200);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "GET" }, {}, {});
  assert.equal(res.statusCode, 405);
});
