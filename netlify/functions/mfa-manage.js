// mfa-manage.js -- disable or reset TOTP MFA on an already-authenticated
// platform_admin account. Unlike mfa-enroll.js/mfa-verify.js (reached via
// the short-lived pre-auth cookie, before a real session exists), this
// requires a REAL lts_session cookie -- you must already be fully signed
// in to change your own MFA configuration -- plus password
// reauthentication (Session 20 directive: "Require password
// reauthentication before resetting or disabling MFA").
//
// Because MFA is mandatory for platform_admin (owner decision #2),
// "disable" and "reset" have the same effect on state -- clear the
// secret and recovery codes, forcing re-enrollment at the next login,
// same mechanism as first-time setup -- but are audited under distinct
// action names so the audit log preserves the caller's actual intent
// (deliberately turning it off vs. recovering from a lost device).
//
// All other active sessions are revoked, matching account.js's existing
// "rotate on privilege change" rule -- an MFA reset is exactly the kind
// of security-sensitive account change that rule exists for.
//
// POST { action: "disable" | "reset", password }

const {
  readCookie,
  getSession,
  verifyPassword,
  revokeAllSessionsForUser,
  json,
  rateLimited,
} = require("./_lib/auth_utils");
const { setJSON, store } = require("./_lib/blob_store");
const { createAuditRecorder } = require("../../src/audit/auditLog");
const { createPgAuditSink } = require("../../src/db/pgAuditSink");
const { sendEmail } = require("./_lib/email");

const ACTION_TO_AUDIT_EVENT = { disable: "mfa.disable", reset: "mfa.reset" };

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

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const readCookieFn = deps.readCookie || readCookie;
  const getSessionFn = deps.getSession || getSession;
  const token = readCookieFn(event, "lts_session");
  const session = token ? await getSessionFn(token) : null;
  if (!session) return json(401, { error: "Sign in required." });
  if (session.role !== "admin") return json(403, { error: "Platform admin access required." });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }
  const auditEventAction = ACTION_TO_AUDIT_EVENT[body.action];
  if (!auditEventAction) return json(400, { error: 'action must be "disable" or "reset".' });
  if (!body.password) return json(400, { error: "password is required to change MFA settings." });

  const rateLimitedFn = deps.rateLimited || rateLimited;
  if (await rateLimitedFn("mfa-manage", session.userId, 8, 300)) {
    return json(429, { error: "Too many attempts. Try again in a few minutes." });
  }

  const findUserByIdFn = deps.findUserById || findUserById;
  const found = await findUserByIdFn(session.userId, deps);
  if (!found) return json(400, { error: "Account not found." });
  const { key: userKey, user } = found;

  const auditRecorder = deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));
  const verifyPasswordFn = deps.verifyPassword || verifyPassword;
  const passwordOk = await verifyPasswordFn(body.password, user.passwordHash);
  if (!passwordOk) {
    await auditRecorder.record(
      { correlationId: user.id, actorType: "user", actorId: user.id, organizationId: null, action: auditEventAction, targetType: "user", targetId: user.id, outcome: "failure" },
      deps
    );
    return json(401, { error: "Incorrect password." });
  }

  user.mfaEnabled = false;
  delete user.mfaSecretEncrypted;
  delete user.mfaPendingSecretEncrypted;
  user.mfaRecoveryCodeHashes = [];
  delete user.mfaEnrolledAt;

  const setJSONFn = deps.setJSON || setJSON;
  await setJSONFn("users", userKey, user);

  await auditRecorder.record(
    { correlationId: user.id, actorType: "user", actorId: user.id, organizationId: null, action: auditEventAction, targetType: "user", targetId: user.id, outcome: "success" },
    deps
  );

  const sendEmailFn = deps.sendEmail || sendEmail;
  const delivery = await sendEmailFn({
    to: user.email,
    subject: "Two-factor authentication was just turned off on your account",
    html:
      `<p>Two-factor authentication was just ${body.action === "disable" ? "disabled" : "reset"} on your Little Technical Solutions LLC Care Hub account (${user.email}). You'll be asked to set it up again next time you sign in.</p>` +
      `<p>If this was you, no action is needed. All other active sessions on this account have been signed out.</p>` +
      `<p><strong>If this wasn't you</strong>, someone else may have your password -- contact us immediately at dylan@lit-solutions.tech or 636-426-0289.</p>`,
  });
  await auditRecorder.record(
    {
      correlationId: user.id,
      actorType: "system",
      actorId: "system",
      organizationId: null,
      action: `${auditEventAction}.notification`,
      targetType: "user",
      targetId: user.id,
      outcome: delivery.sent ? "success" : "failure",
      metadata: delivery.sent ? {} : { reason: String(delivery.reason || "unknown") },
    },
    deps
  );

  const revokeAllSessionsForUserFn = deps.revokeAllSessionsForUser || revokeAllSessionsForUser;
  await revokeAllSessionsForUserFn(user.id);

  return json(200, { message: "Two-factor authentication has been reset. Sign in again to set it up." });
};
