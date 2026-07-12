// auth-verify-email.js -- confirms the single-use link sent by
// auth-register.js, and lets an unverified user request a fresh one if the
// first email never arrived (or 24 hours passed).
//
// POST { action: "confirm", token }  -> marks the account verified
// POST { action: "resend", email }   -> always 200 (doesn't reveal whether
//                                       the email is registered), re-sends
//                                       if that account exists and isn't
//                                       verified yet

const { verify, json, rateLimited } = require("./_lib/auth_utils");
const { getJSON, setJSON, store } = require("./_lib/blob_store");
const { sendVerificationEmail } = require("./_lib/verification");

exports.handler = async (event) => {
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

  if (body.action === "resend") {
    const email = (body.email || "").toLowerCase();
    const user = await getJSON("users", email);
    if (user && !user.verified) {
      await sendVerificationEmail(event, user);
    }
    return json(200, { message: "If that email is registered and not yet verified, a new verification link has been sent." });
  }

  return json(400, { error: "Unknown action." });
};
