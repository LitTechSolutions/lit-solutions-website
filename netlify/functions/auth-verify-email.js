// auth-verify-email.js -- confirms a new account, by either the 6-digit code
// or the single-use link sent by auth-register.js, and lets an unverified
// user request a fresh one if the first email never arrived.
//
// POST { action: "confirm", token }             -> verify by link
// POST { action: "confirm-code", email, code }  -> verify by code, and sign in
// POST { action: "resend", email }              -> always 200 (doesn't reveal
//                                                  whether the email is
//                                                  registered)
//
// Why the code path also signs the user in, and the link path doesn't: the
// code exists for the purchase flow, where someone is mid-checkout with a cart
// in this tab. Verifying and then showing a sign-in form would make them type
// the password they set ninety seconds ago for no security gain -- they have
// just proven control of the mailbox, which is the stronger claim. A link, by
// contrast, can be clicked from anywhere, including a forwarded email, so it
// stays verification-only.

const { verify, createSession, sessionCookie, json, rateLimited } = require("./_lib/auth_utils");
const { getJSON, setJSON, store } = require("./_lib/blob_store");
const { sendVerificationEmail, checkCode } = require("./_lib/verification");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || "unknown";
  if (await rateLimited("verify-email", ip, 10, 900)) {
    return json(429, { error: "Too many attempts. Try again later." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }

  if (body.action === "confirm") {
    const decoded = verify(body.token);
    if (!decoded || decoded.type !== "verify-email") return json(400, { error: "Invalid or expired verification link." });
    const record = await getJSON("tokens", body.token);
    if (!record || record.used) return json(400, { error: "This verification link has already been used." });

    const usersStore = store("users");
    const { blobs } = await usersStore.list();
    let matchedKey = null;
    for (const b of blobs) {
      const u = await usersStore.get(b.key, { type: "json" });
      if (u && u.id === decoded.uid) { matchedKey = b.key; break; }
    }
    if (!matchedKey) return json(400, { error: "Account not found." });

    const user = await getJSON("users", matchedKey);
    user.verified = true;
    await setJSON("users", matchedKey, user);
    record.used = true;
    await setJSON("tokens", body.token, record);

    return json(200, { message: "Email verified. You can sign in now." });
  }

  if (body.action === "confirm-code") {
    const email = String(body.email || "").toLowerCase().trim();
    const code = String(body.code || "").trim();
    if (!email || !code) return json(400, { error: "Email and code are required." });

    const user = await getJSON("users", email);
    // Same generic failure whether the account is unknown or the code is
    // wrong -- otherwise this becomes a way to test which emails are
    // registered.
    if (!user) return json(400, { error: "That code isn't right, or it has expired." });
    if (user.verified) return json(200, { message: "Already verified. Please sign in.", alreadyVerified: true });

    const result = await (deps.checkCode || checkCode)(user.id, code, deps);
    if (!result.ok) {
      // Attempt-limit and expiry reasons are safe to surface here: the caller
      // has already demonstrated a real, unverified account.
      return json(400, { error: result.reason || "That code isn't right, or it has expired." });
    }

    user.verified = true;
    await setJSON("users", email, user);

    const createSessionFn = deps.createSession || createSession;
    const { token, expiresAt } = await createSessionFn(user.id, user.role);
    const maxAge = Math.floor((expiresAt - Date.now()) / 1000);

    return json(200,
      { message: "Email verified.", user: { id: user.id, name: user.name, email: user.email, role: user.role, verified: true } },
      { "Set-Cookie": sessionCookie(token, maxAge) }
    );
  }

  if (body.action === "resend") {
    const email = (body.email || "").toLowerCase();
    const user = await getJSON("users", email);
    if (user && !user.verified) {
      await sendVerificationEmail(event, user, deps);
    }
    return json(200, { message: "If that email is registered and not yet verified, a new code has been sent." });
  }

  return json(400, { error: "Unknown action." });
};
