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
//   -> validates the 6-digit code against the pending secret. If a
//      confirmation email can be dispatched, MFA is NOT activated yet --
//      see the Session 20 step 10/8 addendum below -- and the response is
//      { pendingEmailConfirmation: true }. Only if email delivery fails
//      (not configured, or a genuine provider error) does this fall back
//      to the original behavior: activate immediately, generate one-time
//      recovery codes (shown once, stored hashed), upgrade the pre-auth
//      cookie to a real session, and clear the pending cookie.
// POST { action: "verify-email", token }
//   -> consumes the single-use link from the confirmation email and
//      completes activation (same effect as the old immediate-activation
//      path). Does NOT require the pre-auth cookie -- the email link
//      itself is the credential, since the browser that clicks it may not
//      be the one that started enrollment.
//
// Every enrollment step is audited (mfa.enroll.start / mfa.enroll.link_sent
// / mfa.enroll.confirm success and failure) per the Session 20 directive.
//
// Security-review addendum (Session 20 step 10, Critical finding;
// resolved Session 20 step 8): the original design's only precondition
// for enrollment was possession of the short-lived pre-auth cookie, which
// auth-login.js issues to anyone who supplies the correct password --
// there was no secondary check on WHO gets to be the first person to
// enroll a device, so a leaked/phished password alone was enough to
// hijack enrollment and lock the real owner out. This is now fixed with a
// real preventive control, not just a notification: when email delivery
// is configured and succeeds, activation is deferred until the account
// owner clicks a single-use, 30-minute link sent to their own inbox --
// an attacker with only the password can no longer complete enrollment
// unless they also control that inbox. The fallback to immediate
// activation ONLY fires when the confirmation email genuinely could not
// be sent (unconfigured RESEND_API_KEY/EMAIL_FROM, or a real provider
// failure) -- this is deliberate: MFA is mandatory for platform_admin, so
// a hard requirement on email would risk permanently locking every admin
// out the moment email breaks. The fallback path still fires the
// best-effort "MFA was just enabled" notification from step 8 so the
// gap stays visible in audit-log.js rather than silent.

const {
  verify,
  createSession,
  sessionCookie,
  clearMfaPendingCookie,
  createSingleUseToken,
  json,
  rateLimited,
} = require("./_lib/auth_utils");
const { getJSON, setJSON, store } = require("./_lib/blob_store");
const { siteOrigin } = require("./_lib/verification");
const { generateTotpSecret, buildOtpauthUri, validateTotpToken } = require("../../src/security/totp");
const { encryptSecret, decryptSecret, generateRecoveryCodes, hashRecoveryCode } = require("../../src/security/mfaCrypto");
const { createAuditRecorder } = require("../../src/audit/auditLog");
const { createPgAuditSink } = require("../../src/db/pgAuditSink");
const { sendEmail } = require("./_lib/email");

const RECOVERY_CODE_COUNT = 10;
const MFA_ENROLL_VERIFY_TTL_SECONDS = 60 * 30; // 30 minutes -- matches the password-reset link convention

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

/**
 * Shared activation step -- flips MFA on, generates and hashes recovery
 * codes, issues a real session, and returns the response shape both the
 * fallback-immediate-activation path (in "confirm") and the
 * email-confirmed path ("verify-email") need. `counter` seeds anti-replay
 * tracking (src/security/totp.js's validateTotpToken() result from
 * whichever code originally proved possession of the authenticator).
 */
async function activateMfa({ user, userKey, counter, deps }) {
  const setJSONFn = deps.setJSON || setJSON;
  const generateRecoveryCodesFn = deps.generateRecoveryCodes || generateRecoveryCodes;
  const recoveryCodes = generateRecoveryCodesFn(RECOVERY_CODE_COUNT);

  user.mfaEnabled = true;
  user.mfaSecretEncrypted = user.mfaPendingSecretEncrypted;
  delete user.mfaPendingSecretEncrypted;
  delete user.mfaPendingCounter;
  user.mfaRecoveryCodeHashes = recoveryCodes.map(hashRecoveryCode);
  user.mfaEnrolledAt = new Date().toISOString();
  user.mfaLastUsedCounter = counter;
  await setJSONFn("users", userKey, user);

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

/**
 * action: "verify-email" -- consumes the single-use confirmation link.
 * Deliberately does NOT require the lts_mfa_pending cookie: the browser
 * clicking an emailed link is very often not the same browser/device that
 * started enrollment, so the signed, single-use token in the URL is the
 * only credential this step can rely on (same pattern as
 * auth-password-reset.js's "confirm" action).
 */
async function handleVerifyEmail(event, body, deps) {
  const verifyFn = deps.verify || verify;
  const getJSONFn = deps.getJSON || getJSON;
  const setJSONFn = deps.setJSON || setJSON;
  const findUserByIdFn = deps.findUserById || findUserById;
  const rateLimitedFn = deps.rateLimited || rateLimited;
  const auditRecorder = deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));

  const token = body.token;
  if (!token) return json(400, { error: "token is required." });

  const ip = (event.headers && (event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"])) || "unknown";
  if (await rateLimitedFn("mfa-enroll-verify-email", ip, 10, 900)) {
    return json(429, { error: "Too many attempts. Try again later." });
  }

  const decoded = verifyFn(token);
  if (!decoded || decoded.type !== "mfa_enroll_verify" || !decoded.uid) {
    return json(400, { error: "Invalid or expired confirmation link." });
  }
  const record = await getJSONFn("tokens", token);
  if (!record || record.used) {
    return json(400, { error: "This confirmation link has already been used or has expired." });
  }

  const found = await findUserByIdFn(decoded.uid, deps);
  if (!found) return json(400, { error: "Account not found." });
  const { key: userKey, user } = found;

  if (user.mfaEnabled) {
    return json(400, { error: "Two-factor authentication is already enabled on this account." });
  }
  if (!user.mfaPendingSecretEncrypted || typeof user.mfaPendingCounter !== "number") {
    return json(400, { error: "No enrollment confirmation is pending. Start over from the sign-in page." });
  }

  record.used = true;
  await setJSONFn("tokens", token, record);

  const counter = user.mfaPendingCounter;
  const response = await activateMfa({ user, userKey, counter, deps });

  await auditRecorder.record(
    {
      correlationId: user.id,
      actorType: "user",
      actorId: user.id,
      organizationId: null,
      action: "mfa.enroll.confirm",
      targetType: "user",
      targetId: user.id,
      outcome: "success",
      metadata: { viaEmailConfirmation: true },
    },
    deps
  );

  return response;
}

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }

  if (body.action === "verify-email") return handleVerifyEmail(event, body, deps);

  const pending = await resolvePendingAuth(event, deps);
  if (!pending) return json(401, { error: "No pending sign-in. Please sign in again." });

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

    // TOTP proven -- stash the counter for whichever path (email
    // confirmation or fallback) actually activates MFA, then try to
    // require an out-of-band email confirmation before granting access.
    user.mfaPendingCounter = counter;
    await setJSONFn("users", userKey, user);

    const createSingleUseTokenFn = deps.createSingleUseToken || createSingleUseToken;
    const siteOriginFn = deps.siteOrigin || siteOrigin;
    const confirmToken = createSingleUseTokenFn("mfa_enroll_verify", user.id, MFA_ENROLL_VERIFY_TTL_SECONDS);
    await setJSONFn("tokens", confirmToken, { type: "mfa_enroll_verify", userId: user.id, used: false });
    const link = `${siteOriginFn(event)}/care-hub/mfa/enroll-verify?token=${confirmToken}`;

    const sendEmailFn = deps.sendEmail || sendEmail;
    const delivery = await sendEmailFn({
      to: user.email,
      subject: "Confirm two-factor authentication setup",
      html:
        `<p>Someone just entered a valid code to set up two-factor authentication on your Little Technical Solutions LLC Care Hub account (${user.email}).</p>` +
        `<p>Click the link below within 30 minutes to finish turning it on:</p>` +
        `<p><a href="${link}">${link}</a></p>` +
        `<p><strong>If this wasn't you</strong>, someone else may have your password -- do not click the link, and contact us immediately at dylan@lit-solutions.tech or 636-426-0289.</p>`,
    });

    if (delivery.sent) {
      await auditRecorder.record(
        { correlationId: user.id, actorType: "system", actorId: "system", organizationId: null, action: "mfa.enroll.link_sent", targetType: "user", targetId: user.id, outcome: "success" },
        deps
      );
      return json(200, {
        pendingEmailConfirmation: true,
        message: "We emailed a confirmation link to finish enabling two-factor authentication. It expires in 30 minutes.",
      });
    }

    // Email couldn't be sent (unconfigured, or a genuine provider
    // failure) -- fall back to immediate activation rather than risk
    // locking mandatory platform_admin MFA behind a notification that can
    // never arrive. Still audit the gap and still fire the best-effort
    // "MFA was just enabled" notification from step 8, so this stays
    // visible instead of silent.
    await auditRecorder.record(
      {
        correlationId: user.id,
        actorType: "system",
        actorId: "system",
        organizationId: null,
        action: "mfa.enroll.link_sent",
        targetType: "user",
        targetId: user.id,
        outcome: "failure",
        metadata: { reason: String(delivery.reason || "unknown") },
      },
      deps
    );

    const response = await activateMfa({ user, userKey, counter, deps });

    await auditRecorder.record(
      { correlationId: user.id, actorType: "user", actorId: user.id, organizationId: null, action: "mfa.enroll.confirm", targetType: "user", targetId: user.id, outcome: "success", metadata: { immediateFallback: true } },
      deps
    );

    const notifyDelivery = await sendEmailFn({
      to: user.email,
      subject: "Two-factor authentication was just enabled on your account",
      html:
        `<p>Two-factor authentication was just enabled on your Little Technical Solutions LLC Care Hub account (${user.email}).</p>` +
        `<p>If this was you, no action is needed.</p>` +
        `<p><strong>If this wasn't you</strong>, someone else may have your password -- contact us immediately at dylan@lit-solutions.tech or 636-426-0289.</p>`,
    });
    await auditRecorder.record(
      {
        correlationId: user.id,
        actorType: "system",
        actorId: "system",
        organizationId: null,
        action: "mfa.enroll.notification",
        targetType: "user",
        targetId: user.id,
        outcome: notifyDelivery.sent ? "success" : "failure",
        metadata: notifyDelivery.sent ? {} : { reason: String(notifyDelivery.reason || "unknown") },
      },
      deps
    );

    return response;
  }

  return json(400, { error: 'action must be "start", "confirm", or "verify-email".' });
};
