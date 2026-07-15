// mfa-verify.js -- Session 20 TOTP challenge for platform_admin accounts
// that already have MFA enabled (see mfa-enroll.js for first-time setup).
// Reached only via the short-lived lts_mfa_pending pre-auth cookie
// auth-login.js issues after a correct password.
//
// POST { code }          -- a 6-digit authenticator app code
// POST { recoveryCode }  -- a one-time recovery code (consumed on use)
//
// Rate-limited per account (not just per IP, since the attacker already
// has valid credentials at this stage -- the account itself is the
// target). Every attempt is audited: mfa.challenge.success,
// mfa.challenge.failure, mfa.recovery_code.used.

const {
  verify,
  createSession,
  sessionCookie,
  clearMfaPendingCookie,
  json,
  rateLimited,
} = require("./_lib/auth_utils");
const { setJSON, store } = require("./_lib/blob_store");
const { validateTotpToken } = require("../../src/security/totp");
const { decryptSecret, verifyRecoveryCode } = require("../../src/security/mfaCrypto");
const { createAuditRecorder } = require("../../src/audit/auditLog");
const { createPgAuditSink } = require("../../src/db/pgAuditSink");

function resolveMfaKey(deps) {
  const key = deps.mfaEncryptionKey || process.env.MFA_ENCRYPTION_KEY;
  if (!key) throw new Error("mfa-verify: MFA_ENCRYPTION_KEY is not set in this site's environment variables.");
  return key;
}

async function findUserById(uid, deps) {
  const storeFn = deps.store || store;
  const usersStore = storeFn("users");
  const { blobs } = await usersStore.list();
  for (const b of blobs) {
    const u = await usersStore.get(b.key, { type: "json" });
    if (u && u.id === uid) return { key: b.key, user: u };
  }
  return null;
}

async function resolvePendingAuth(event, deps) {
  const readCookieFn = deps.readCookie || require("./_lib/auth_utils").readCookie;
  const verifyFn = deps.verify || verify;
  const token = readCookieFn(event, "lts_mfa_pending");
  if (!token) return null;
  const decoded = verifyFn(token);
  if (!decoded || decoded.type !== "mfa_pending" || !decoded.uid) return null;
  return decoded;
}

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const pending = await resolvePendingAuth(event, deps);
  if (!pending) return json(401, { error: "No pending sign-in. Please sign in again." });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }
  if (!body.code && !body.recoveryCode) return json(400, { error: "code or recoveryCode is required." });

  const setJSONFn = deps.setJSON || setJSON;
  const findUserByIdFn = deps.findUserById || findUserById;
  const rateLimitedFn = deps.rateLimited || rateLimited;
  const auditRecorder = deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));

  const found = await findUserByIdFn(pending.uid, deps);
  if (!found) return json(400, { error: "Account not found." });
  const { key: userKey, user } = found;

  if (!user.mfaEnabled) {
    return json(400, { error: "Two-factor authentication is not set up on this account yet." });
  }

  if (await rateLimitedFn("mfa-verify", pending.uid, 8, 300)) {
    return json(429, { error: "Too many attempts. Try again in a few minutes." });
  }

  async function recordFailureAndDeny() {
    await auditRecorder.record(
      { correlationId: user.id, actorType: "user", actorId: user.id, organizationId: null, action: "mfa.challenge.failure", targetType: "user", targetId: user.id, outcome: "failure" },
      deps
    );
    return json(401, { error: "Incorrect code." });
  }

  async function issueRealSession() {
    const createSessionFn = deps.createSession || createSession;
    const { token, expiresAt } = await createSessionFn(user.id, user.role);
    const maxAge = Math.floor((expiresAt - Date.now()) / 1000);
    return json(
      200,
      { message: "Signed in.", user: { id: user.id, name: user.name, email: user.email, role: user.role, verified: !!user.verified } },
      { "Set-Cookie": [sessionCookie(token, maxAge), clearMfaPendingCookie()] }
    );
  }

  if (body.recoveryCode) {
    const hashes = Array.isArray(user.mfaRecoveryCodeHashes) ? user.mfaRecoveryCodeHashes : [];
    const matchIndex = hashes.findIndex((hash) => verifyRecoveryCode(body.recoveryCode, hash));
    if (matchIndex === -1) return recordFailureAndDeny();

    user.mfaRecoveryCodeHashes = hashes.filter((_, i) => i !== matchIndex); // single-use: consumed
    await setJSONFn("users", userKey, user);

    await auditRecorder.record(
      {
        correlationId: user.id,
        actorType: "user",
        actorId: user.id,
        organizationId: null,
        action: "mfa.recovery_code.used",
        targetType: "user",
        targetId: user.id,
        outcome: "success",
        metadata: { remainingCodes: user.mfaRecoveryCodeHashes.length },
      },
      deps
    );

    return issueRealSession();
  }

  const mfaKey = resolveMfaKey(deps);
  const secretBase32 = decryptSecret(user.mfaSecretEncrypted, mfaKey);
  const validateTotpTokenFn = deps.validateTotpToken || validateTotpToken;
  const { valid, counter } = validateTotpTokenFn(secretBase32, String(body.code || ""));
  if (!valid) return recordFailureAndDeny();

  // Anti-replay: a code is only valid the FIRST time it's presented, even
  // within its own +/-1 period clock-skew window -- otherwise an
  // intercepted code (shoulder-surfed, proxied, exfiltrated) stays usable
  // for up to ~90s after the legitimate holder already used it.
  if (typeof user.mfaLastUsedCounter === "number" && counter <= user.mfaLastUsedCounter) {
    return recordFailureAndDeny();
  }
  user.mfaLastUsedCounter = counter;
  await setJSONFn("users", userKey, user);

  await auditRecorder.record(
    { correlationId: user.id, actorType: "user", actorId: user.id, organizationId: null, action: "mfa.challenge.success", targetType: "user", targetId: user.id, outcome: "success" },
    deps
  );

  return issueRealSession();
};
