// auth-password-reset.js -- single-use, expiring reset tokens, emailed to
// the account holder the same way auth-register.js/auth-verify-email.js
// email their verification links (see _lib/verification.js -- this file
// follows that exact pattern rather than a separate one).
//
// POST { action: "request", email, page? }
//   -> always 200 (doesn't reveal whether the email is registered), stores
//      a single-use token and emails a {page}.html#reset?token=... link to
//      the account (best-effort -- see _lib/email.js's no-op behavior when
//      RESEND_API_KEY/EMAIL_FROM aren't configured). `page` is "myaccount"
//      (default, customers) or "admin" (staff, via admin.html's own
//      reset-request view) -- only those two values are accepted, so the
//      link always lands on a real page in this site.
// POST { action: "confirm", token, newPassword }
//   -> validates the token, sets the new password, revokes existing
//      sessions (rotation on privilege change).

const { hashPassword, createSingleUseToken, verify, revokeAllSessionsForUser, json, rateLimited } = require("./_lib/auth_utils");
const { getJSON, setJSON, store } = require("./_lib/blob_store");
const { sendEmail } = require("./_lib/email");
const { siteOrigin } = require("./_lib/verification");

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
      const page = body.page === "admin" ? "admin" : "myaccount";
      const link = `${siteOrigin(event)}/${page}.html#reset?token=${resetToken}`;
      await sendEmail({
        to: user.email,
        subject: "Reset your password — Little Technical Solutions LLC",
        html: `<p>Hi ${user.name},</p>` +
          `<p>Click the link below to set a new password for your account at Little Technical Solutions LLC:</p>` +
          `<p><a href="${link}">${link}</a></p>` +
          `<p>This link is single-use and expires in 30 minutes. If you didn't request this, you can ignore this email -- your password won't be changed.</p>`,
      });
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
