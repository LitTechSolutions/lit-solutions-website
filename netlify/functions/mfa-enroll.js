// mfa-enroll.js -- Session 20 TOTP enrollment (RFC 6238, via the
// well-maintained otpauth library -- src/security/totp.js). Mandatory
// for platform_admin accounts at their next successful login (owner
// decision #2). Reached only via the short-lived lts_mfa_pending
// pre-auth cookie auth-login.js issues after a correct password -- never
// via the real lts_session cookie, and never for an account that already
// has MFA enabled (that's mfa-verify.js's job).
//
// POST { action: "start" }
//   -> generates a fresh TOTP secret, encrypts it at rest
//      (MFA_ENCRYPTION_KEY) as a PENDING secret (not yet active), and
//      returns the otpauth:// URI + base32 secret for the authenticator
//      app -- shown exactly once, never re-fetchable, never logged.
// POST { action: "confirm", code }
//   -> validates the 6-digit code against the pending secret. On
//      success: activates MFA, generates one-time recovery codes (shown
//      once, stored hashed), upgrades the pre-auth cookie to a real
//      session, and clears the pending cookie.
//
// Every enrollment step is audited (mfa.enroll.start / mfa.enroll.confirm
// success and failure) per the Session 20 directive.

const {
  verify,
  createSession,
  sessionCookie,
  clearMfaPendingCookie,
  json,
  rateLimited,
} = require("./_lib/auth_utils");
const { getJSON, setJSON, store } = require("./_lib/blob_store");
const { generateTotpSecret, buildOtpauthUri, validateTotpToken } = require("../../src/security/totp");
const { encryptSecret, decryptSecret, generateRecoveryCodes, hashRecoveryCode } = require("../../src/security/mfaCrypto");
const { createAuditRecorder } = require("../../src/audit/auditLog");
const { createPgAuditSink } = require("../../src/db/pgAuditSink");

const RECOVERY_CODE_COUNT = 10;

function resolveMfaKey(deps) {
  const key = deps.mfaEncryptionKey || process.env.MFA_ENCRYPTION_KEY;
  if (!key) throw new Error("mfa-enroll: MFA_ENCRYPTION_KEY is not set in this site's environment variables.");
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

  const getJSONFn = deps.getJSON || getJSON;
  const setJSONFn = deps.setJSON || setJSON;
  const findUserByIdFn = deps.findUserById || findUserById;
  const rateLimitedFn = deps.rateLimited || rateLimited;
  const auditRecorder = deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));

  const found = await findUserByIdFn(pending.uid, deps);
  if (!found) return json(400, { error: "Account not found." });
  const { key: userKey, user } = found;

  if (user.mfaEnabled) {
    return json(400, { error: "Two-factor authentication is already enabled on this account." });
  }

  if (body.action === "start") {
    if (await rateLimitedFn("mfa-enroll-start", pending.uid, 10, 300)) {
      return json(429, { error: "Too many enrollment attempts. Try again in a few minutes." });
    }

    const mfaKey = resolveMfaKey(deps);
    const generateTotpSecretFn = deps.generateTotpSecret || generateTotpSecret;
    const secretBase32 = generateTotpSecretFn();
    user.mfaPendingSecretEncrypted = encryptSecret(secretBase32, mfaKey);
    await setJSONFn("users", userKey, user);

    await auditRecorder.record(
      { correlationId: user.id, actorType: "user", actorId: user.id, organizationId: null, action: "mfa.enroll.start", targetType: "user", targetId: user.id, outcome: "success" },
      deps
    );

    return json(200, {
      secret: secretBase32,
      otpauthUri: buildOtpauthUri(secretBase32, user.email),
      message: "Scan this into your authenticator app, then confirm with a 6-digit code. This secret will not be shown again.",
    });
  }

  if (body.action === "confirm") {
    if (!user.mfaPendingSecretEncrypted) {
      return json(400, { error: "No enrollment in progress. Call action: \"start\" first." });
    }
    if (await rateLimitedFn("mfa-enroll-confirm", pending.uid, 8, 300)) {
      return json(429, { error: "Too many attempts. Try again in a few minutes." });
    }

    const mfaKey = resolveMfaKey(deps);
    const secretBase32 = decryptSecret(user.mfaPendingSecretEncrypted, mfaKey);
    const validateTotpTokenFn = deps.validateTotpToken || validateTotpToken;
    const { valid, counter } = validateTotpTokenFn(secretBase32, String(body.code || ""));

    if (!valid) {
      await auditRecorder.record(
        { correlationId: user.id, actorType: "user", actorId: user.id, organizationId: null, action: "mfa.enroll.confirm", targetType: "user", targetId: user.id, outcome: "failure" },
        deps
      );
      return json(401, { error: "Incorrect code. Try again." });
    }

    const generateRecoveryCodesFn = deps.generateRecoveryCodes || generateRecoveryCodes;
    const recoveryCodes = generateRecoveryCodesFn(RECOVERY_CODE_COUNT);

    user.mfaEnabled = true;
    user.mfaSecretEncrypted = user.mfaPendingSecretEncrypted;
    delete user.mfaPendingSecretEncrypted;
    user.mfaRecoveryCodeHashes = recoveryCodes.map(hashRecoveryCode);
    user.mfaEnrolledAt = new Date().toISOString();
    user.mfaLastUsedCounter = counter; // seeds anti-replay tracking so this same confirm code can't also be replayed against mfa-verify.js
    await setJSONFn("users", userKey, user);

    await auditRecorder.record(
      { correlationId: user.id, actorType: "user", actorId: user.id, organizationId: null, action: "mfa.enroll.confirm", targetType: "user", targetId: user.id, outcome: "success" },
      deps
    );

    const createSessionFn = deps.createSession || createSession;
    const { token, expiresAt } = await createSessionFn(user.id, user.role);
    const maxAge = Math.floor((expiresAt - Date.now()) / 1000);

    return json(
      200,
      {
        message: "Two-factor authentication is now enabled. Save these recovery codes somewhere safe -- they will not be shown again.",
        recoveryCodes,
        user: { id: user.id, name: user.name, email: user.email, role: user.role, verified: !!user.verified },
      },
      { "Set-Cookie": [sessionCookie(token, maxAge), clearMfaPendingCookie()] }
    );
  }

  return json(400, { error: 'action must be "start" or "confirm".' });
};
