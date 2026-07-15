const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/mfa-enroll");
const { generateTotpSecret, buildOtpauthUri, validateTotpToken } = require("../src/security/totp");
const { encryptSecret, decryptSecret } = require("../src/security/mfaCrypto");

const MFA_KEY = "a".repeat(64);
const FIXED_TS = 1752580800000;
const ENROLLMENT_ID = "11111111-1111-4111-8111-111111111111";

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
  const challenges = new Map();
  let tokenCounter = 0;
  return {
    readCookie: () => "fake-pending-token",
    verify: (token) => (token === "fake-pending-token" ? { type: "mfa_pending", uid: "admin-1" } : null),
    store: fakeStoreFor(users),
    setJSON: async (storeName, key, value) => { saved[key] = value; users[key] = value; },
    rateLimited: async () => false,
    mfaEncryptionKey: MFA_KEY,
    auditRecorder: fakeAuditRecorder(),
    createSession: async () => ({ token: "real-session-token", expiresAt: Date.now() + 1000 }),
    claimMfaTotpCounter: async () => true,
    syncMfaRecoveryCodeHashes: async () => {},
    idGenerator: () => ENROLLMENT_ID,
    // Avoid the real auth_utils.js sign()/createSingleUseToken(), which
    // requires LTS_SESSION_SECRET -- deliberately not set in this test
    // environment, same reasoning as createSession above.
    createSingleUseToken: () => `fake-confirm-token-${++tokenCounter}`,
    createMfaEnrollmentChallenge: async ({ token, userId, enrollmentId, expiresAt }) => {
      for (const challenge of challenges.values()) {
        if (challenge.userId === userId) challenge.consumed = true;
      }
      challenges.set(token, { userId, enrollmentId, expiresAt, consumed: false });
    },
    claimMfaEnrollmentChallenge: async ({ token, userId, enrollmentId }) => {
      const challenge = challenges.get(token);
      if (!challenge || challenge.userId !== userId || challenge.enrollmentId !== enrollmentId || challenge.consumed) return false;
      challenge.consumed = true;
      return true;
    },
    deleteMfaEnrollmentChallenge: async (token) => challenges.delete(token),
    siteOrigin: () => "https://lit-solutions.tech",
    _saved: saved,
    _challenges: challenges,
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
  assert.equal(saved.mfaPendingEnrollmentId, ENROLLMENT_ID);
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

test("action: confirm defers activation and creates an atomically consumable email challenge", async () => {
  const secret = generateTotpSecret();
  const users = { "dylan@lit-solutions.tech": adminUser({ mfaPendingSecretEncrypted: encryptSecret(secret, MFA_KEY) }) };
  const sentEmails = [];
  const deps = baseDeps(users, {
    validateTotpToken: () => ({ valid: true, counter: 1000 }),
    sendEmail: async (opts) => { sentEmails.push(opts); return { sent: true }; },
  });
  const res = await handler(baseEvent({ body: JSON.stringify({ action: "confirm", code: "123456" }) }), {}, deps);

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.pendingEmailConfirmation, true);
  assert.equal(body.recoveryCodes, undefined, "recovery codes aren't issued until the link is clicked");
  assert.equal(res.multiValueHeaders, undefined, "no session is issued yet -- possessing the pre-auth cookie and the code alone is no longer enough");

  const saved = deps._saved["dylan@lit-solutions.tech"];
  assert.equal(saved.mfaEnabled, undefined, "not active until the emailed link is confirmed");
  assert.ok(saved.mfaPendingSecretEncrypted, "still pending");
  assert.equal(saved.mfaPendingCounter, 1000, "stashed for verify-email to seed anti-replay with");

  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "dylan@lit-solutions.tech");
  assert.match(sentEmails[0].subject, /confirm/i);
  assert.match(sentEmails[0].html, /https:\/\/lit-solutions\.tech\/care-hub\/mfa\/enroll-verify\?token=/);
  assert.equal(deps._challenges.size, 1, "server records the challenge before sending the link");

  assert.equal(deps.auditRecorder.events.length, 1, "only the link-sent event -- mfa.enroll.confirm doesn't fire until verify-email succeeds");
  assert.equal(deps.auditRecorder.events[0].action, "mfa.enroll.link_sent");
  assert.equal(deps.auditRecorder.events[0].outcome, "success");
});

test("action: confirm fails closed and deletes the challenge when email cannot be delivered", async () => {
  const secret = generateTotpSecret();
  const users = { "dylan@lit-solutions.tech": adminUser({ mfaPendingSecretEncrypted: encryptSecret(secret, MFA_KEY) }) };
  const deps = baseDeps(users, { validateTotpToken: () => ({ valid: true, counter: 1000 }) });
  const res = await handler(baseEvent({ body: JSON.stringify({ action: "confirm", code: "123456" }) }), {}, deps);

  assert.equal(res.statusCode, 503);
  const body = JSON.parse(res.body);
  assert.match(body.error, /was not enabled/i);

  const saved = deps._saved["dylan@lit-solutions.tech"];
  assert.equal(saved.mfaEnabled, undefined);
  assert.ok(saved.mfaPendingSecretEncrypted);
  assert.equal(saved.mfaPendingCounter, 1000);
  assert.equal(deps._challenges.size, 0, "an undelivered credential cannot remain usable");

  assert.equal(deps.auditRecorder.events.length, 1);
  assert.equal(deps.auditRecorder.events[0].action, "mfa.enroll.link_sent");
  assert.equal(deps.auditRecorder.events[0].outcome, "failure");
  assert.equal(res.multiValueHeaders, undefined, "no authenticated session is issued");
});

test("action: confirm records the provider reason when mandatory email delivery fails", async () => {
  const secret = generateTotpSecret();
  const users = { "dylan@lit-solutions.tech": adminUser({ mfaPendingSecretEncrypted: encryptSecret(secret, MFA_KEY) }) };
  const deps = baseDeps(users, {
    validateTotpToken: () => ({ valid: true, counter: 1000 }),
    sendEmail: async () => ({ sent: false, reason: "not configured" }),
  });
  const res = await handler(baseEvent({ body: JSON.stringify({ action: "confirm", code: "123456" }) }), {}, deps);

  assert.equal(res.statusCode, 503);
  assert.equal(deps.auditRecorder.events[0].action, "mfa.enroll.link_sent");
  assert.equal(deps.auditRecorder.events[0].outcome, "failure");
  assert.equal(deps.auditRecorder.events[0].metadata.reason, "not configured");
});

test("action: verify-email activates MFA and issues recovery codes/session for a valid, unused confirmation link", async () => {
  const secret = generateTotpSecret();
  const users = {
    "dylan@lit-solutions.tech": adminUser({ mfaPendingSecretEncrypted: encryptSecret(secret, MFA_KEY), mfaPendingCounter: 1000, mfaPendingEnrollmentId: ENROLLMENT_ID }),
  };
  const deps = baseDeps(users, {
    verify: (token) => (token === "confirm-token" ? { type: "mfa_enroll_verify", uid: "admin-1" } : null),
  });
  deps._challenges.set("confirm-token", { userId: "admin-1", enrollmentId: ENROLLMENT_ID, consumed: false });
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "verify-email", token: "confirm-token" }) },
    {},
    deps
  );

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.recoveryCodes.length, 10);

  const saved = deps._saved["dylan@lit-solutions.tech"];
  assert.equal(saved.mfaEnabled, true);
  assert.equal(saved.mfaLastUsedCounter, 1000);
  assert.equal(saved.mfaPendingSecretEncrypted, undefined);
  assert.equal(saved.mfaPendingCounter, undefined);
  assert.equal(saved.mfaPendingEnrollmentId, undefined);

  assert.equal(deps._challenges.get("confirm-token").consumed, true, "single-use: atomically consumed");

  assert.equal(deps.auditRecorder.events.length, 1);
  assert.equal(deps.auditRecorder.events[0].action, "mfa.enroll.confirm");
  assert.equal(deps.auditRecorder.events[0].outcome, "success");
  assert.equal(deps.auditRecorder.events[0].metadata.viaEmailConfirmation, true);

  assert.equal(res.multiValueHeaders["Set-Cookie"].length, 2);
  assert.match(res.multiValueHeaders["Set-Cookie"][0], /^lts_session=real-session-token/);
});

test("action: verify-email does not require the lts_mfa_pending cookie (the emailed link is its own credential)", async () => {
  const secret = generateTotpSecret();
  const users = {
    "dylan@lit-solutions.tech": adminUser({ mfaPendingSecretEncrypted: encryptSecret(secret, MFA_KEY), mfaPendingCounter: 1000, mfaPendingEnrollmentId: ENROLLMENT_ID }),
  };
  const deps = baseDeps(users, {
    readCookie: () => null,
    verify: () => ({ type: "mfa_enroll_verify", uid: "admin-1" }),
  });
  deps._challenges.set("confirm-token", { userId: "admin-1", enrollmentId: ENROLLMENT_ID, consumed: false });
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "verify-email", token: "confirm-token" }) },
    {},
    deps
  );
  assert.equal(res.statusCode, 200);
});

test("action: verify-email rejects a missing token", async () => {
  const res = await handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "verify-email" }) }, {}, baseDeps({}));
  assert.equal(res.statusCode, 400);
});

test("action: verify-email rejects an invalid or unsigned token", async () => {
  const deps = baseDeps({}, { verify: () => null });
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "verify-email", token: "garbage" }) },
    {},
    deps
  );
  assert.equal(res.statusCode, 400);
});

test("action: verify-email rejects an already-used confirmation link", async () => {
  const users = { "dylan@lit-solutions.tech": adminUser({ mfaPendingSecretEncrypted: "x", mfaPendingCounter: 1000, mfaPendingEnrollmentId: ENROLLMENT_ID }) };
  const deps = baseDeps(users, {
    verify: () => ({ type: "mfa_enroll_verify", uid: "admin-1" }),
  });
  deps._challenges.set("confirm-token", { userId: "admin-1", enrollmentId: ENROLLMENT_ID, consumed: true });
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "verify-email", token: "confirm-token" }) },
    {},
    deps
  );
  assert.equal(res.statusCode, 400);
});

test("action: verify-email rejects a challenge from an older enrollment for the same user", async () => {
  const users = {
    "dylan@lit-solutions.tech": adminUser({
      mfaPendingSecretEncrypted: "x",
      mfaPendingCounter: 1000,
      mfaPendingEnrollmentId: ENROLLMENT_ID,
    }),
  };
  const deps = baseDeps(users, { verify: () => ({ type: "mfa_enroll_verify", uid: "admin-1" }) });
  deps._challenges.set("old-confirm-token", {
    userId: "admin-1",
    enrollmentId: "22222222-2222-4222-8222-222222222222",
    consumed: false,
  });
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "verify-email", token: "old-confirm-token" }) },
    {},
    deps
  );

  assert.equal(res.statusCode, 400);
  assert.equal(deps._challenges.get("old-confirm-token").consumed, false);
});

test("action: verify-email rejects a link for an account that already has MFA enabled", async () => {
  const users = { "dylan@lit-solutions.tech": adminUser({ mfaEnabled: true }) };
  const deps = baseDeps(users, {
    verify: () => ({ type: "mfa_enroll_verify", uid: "admin-1" }),
  });
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "verify-email", token: "confirm-token" }) },
    {},
    deps
  );
  assert.equal(res.statusCode, 400);
});

test("action: verify-email allows only one winner when the same link is submitted concurrently", async () => {
  const secret = generateTotpSecret();
  const users = {
    "dylan@lit-solutions.tech": adminUser({ mfaPendingSecretEncrypted: encryptSecret(secret, MFA_KEY), mfaPendingCounter: 1000, mfaPendingEnrollmentId: ENROLLMENT_ID }),
  };
  let available = true;
  let sessions = 0;
  const deps = baseDeps(users, {
    verify: () => ({ type: "mfa_enroll_verify", uid: "admin-1" }),
    claimMfaEnrollmentChallenge: async () => {
      if (!available) return false;
      available = false;
      return true;
    },
    createSession: async () => {
      sessions += 1;
      return { token: `session-${sessions}`, expiresAt: Date.now() + 1000 };
    },
  });
  const event = { httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "verify-email", token: "confirm-token" }) };
  const results = await Promise.all([handler(event, {}, deps), handler(event, {}, deps)]);

  assert.deepEqual(results.map((result) => result.statusCode).sort(), [200, 400]);
  assert.equal(sessions, 1);
});

test("action: verify-email is rate-limited", async () => {
  const deps = baseDeps({}, { rateLimited: async () => true });
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "verify-email", token: "x" }) },
    {},
    deps
  );
  assert.equal(res.statusCode, 429);
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
  deps.sendEmail = async () => ({ sent: true });
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
