// auth-password-reset.js -- single-use, expiring reset tokens.
//
// POST { action: "request", email }
//   -> always 200 (doesn't reveal whether the email is registered), stores
//      a single-use token. Wire SEND_RESET_EMAIL to a real provider if you
//      want this delivered automatically -- until then, generate the link
//      and send it yourself (see README_ADMIN_SETUP.md).
// POST { action: "confirm", token, newPassword }
//   -> validates the token, sets the new password, revokes existing
//      sessions (rotation on privilege change).

const { hashPassword, createSingleUseToken, verify, revokeAllSessionsForUser, json, rateLimited } = require("./_lib/auth_utils");
const { getJSON, setJSON, store } = require("./_lib/blob_store");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || "unknown";
  if (await rateLimited("password-reset", ip, 6, 900)) {
    return json(429, { error: "Too many requests. Try again later." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }

  if (body.action === "request") {
    const email = (body.email || "").toLowerCase();
    const user = await getJSON("users", email);
    if (user) {
      const resetToken = createSingleUseToken("password-reset", user.id);
      await setJSON("tokens", resetToken, { type: "password-reset", userId: user.id, used: false });
      // SEND_RESET_EMAIL: email a link like
      // https://{domain}/admin.html#reset?token=<resetToken> to `email` here.
      // Until that's wired up, find the token in the Netlify Blobs dashboard
      // (Site > Blobs > "tokens" store, most recent key) and build the link
      // yourself.
    }
    return json(200, { message: "If that email is registered, a reset link has been generated." });
  }

  if (body.action === "confirm") {
    const { token, newPassword } = body;
    if (!newPassword || newPassword.length < 10) return json(400, { error: "Password must be at least 10 characters." });
    const decoded = verify(token);
    if (!decoded || decoded.type !== "password-reset") return json(400, { error: "Invalid or expired reset link." });
    const record = await getJSON("tokens", token);
    if (!record || record.used) return json(400, { error: "This reset link has already been used." });

    const usersStore = store("users");
    const { blobs } = await usersStore.list();
    let matchedKey = null;
    for (const b of blobs) {
      const u = await usersStore.get(b.key, { type: "json" });
      if (u && u.id === decoded.uid) { matchedKey = b.key; break; }
    }
    if (!matchedKey) return json(400, { error: "Account not found." });

    const user = await getJSON("users", matchedKey);
    user.passwordHash = await hashPassword(newPassword);
    await setJSON("users", matchedKey, user);
    record.used = true;
    await setJSON("tokens", token, record);
    await revokeAllSessionsForUser(user.id);

    return json(200, { message: "Password updated. Sign in with your new password." });
  }

  return json(400, { error: "Unknown action." });
};
