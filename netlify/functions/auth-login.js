// auth-login.js -- secure sign-in: hashed credentials, HttpOnly Secure
// SameSite session cookie, rate-limited. Unverified accounts (see
// auth-register.js / auth-verify-email.js) are blocked from signing in at
// all -- the main point of email verification is exactly this gate.
//
// Session 20 MFA: platform_admin ("admin" role) accounts never get a
// real session cookie directly from this endpoint anymore. Once the
// password checks out, this issues a short-lived pre-authentication
// token (lts_mfa_pending cookie, 5 minutes) and tells the caller whether
// to go to mfa-enroll.js (no TOTP set up yet -- mandatory at next
// successful login, per the Session 20 directive) or mfa-verify.js
// (already enrolled). The real lts_session cookie is only ever set by
// those two endpoints, after a valid TOTP code or recovery code.
// Customer/staff accounts are unaffected -- MFA is platform_admin-only
// in this first release.

const { verifyPassword, createSession, sessionCookie, createSingleUseToken, mfaPendingCookie, MFA_PENDING_TTL_SECONDS, json, rateLimited } = require("./_lib/auth_utils");
const { getJSON } = require("./_lib/blob_store");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const rateLimitedFn = deps.rateLimited || rateLimited;
  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || "unknown";
  if (await rateLimitedFn("login", ip, 8, 300)) {
    return json(429, { error: "Too many sign-in attempts. Try again in a few minutes." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }
  const { email, password } = body;
  if (!email || !password) return json(400, { error: "Email and password are required." });

  const getJSONFn = deps.getJSON || getJSON;
  const user = await getJSONFn("users", email.toLowerCase());
  // Constant-shape response whether or not the user exists, to avoid
  // leaking which emails are registered.
  const genericError = json(401, { error: "Incorrect email or password." });
  if (!user) return genericError;

  const verifyPasswordFn = deps.verifyPassword || verifyPassword;
  const ok = await verifyPasswordFn(password, user.passwordHash);
  if (!ok) return genericError;

  if (!user.verified) {
    return json(403, { error: "Please verify your email before signing in.", code: "unverified" });
  }

  if (user.role === "admin") {
    const createSingleUseTokenFn = deps.createSingleUseToken || createSingleUseToken;
    const preAuthToken = createSingleUseTokenFn("mfa_pending", user.id, MFA_PENDING_TTL_SECONDS);
    const enrollmentRequired = !user.mfaEnabled;
    return json(
      200,
      {
        mfaRequired: true,
        enrollmentRequired,
        message: enrollmentRequired
          ? "Two-factor authentication is required for administrator accounts. Set it up to continue."
          : "Enter your authenticator app code to continue.",
      },
      { "Set-Cookie": mfaPendingCookie(preAuthToken, MFA_PENDING_TTL_SECONDS) }
    );
  }

  const createSessionFn = deps.createSession || createSession;
  const { token, expiresAt } = await createSessionFn(user.id, user.role);
  const maxAge = Math.floor((expiresAt - Date.now()) / 1000);

  return json(200,
    { message: "Signed in.", user: { id: user.id, name: user.name, email: user.email, role: user.role, verified: !!user.verified } },
    { "Set-Cookie": sessionCookie(token, maxAge) }
  );
};
