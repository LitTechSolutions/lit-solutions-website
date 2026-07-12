// auth-login.js -- secure sign-in: hashed credentials, HttpOnly Secure
// SameSite session cookie, rate-limited. Unverified accounts (see
// auth-register.js / auth-verify-email.js) are blocked from signing in at
// all -- the main point of email verification is exactly this gate.

const { verifyPassword, createSession, sessionCookie, json, rateLimited } = require("./_lib/auth_utils");
const { getJSON } = require("./_lib/blob_store");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || "unknown";
  if (await rateLimited("login", ip, 8, 300)) {
    return json(429, { error: "Too many sign-in attempts. Try again in a few minutes." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }
  const { email, password } = body;
  if (!email || !password) return json(400, { error: "Email and password are required." });

  const user = await getJSON("users", email.toLowerCase());
  // Constant-shape response whether or not the user exists, to avoid
  // leaking which emails are registered.
  const genericError = json(401, { error: "Incorrect email or password." });
  if (!user) return genericError;

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return genericError;

  if (!user.verified) {
    return json(403, { error: "Please verify your email before signing in.", code: "unverified" });
  }

  const { token, expiresAt } = await createSession(user.id, user.role);
  const maxAge = Math.floor((expiresAt - Date.now()) / 1000);

  return json(200,
    { message: "Signed in.", user: { id: user.id, name: user.name, email: user.email, role: user.role, verified: !!user.verified } },
    { "Set-Cookie": sessionCookie(token, maxAge) }
  );
};
