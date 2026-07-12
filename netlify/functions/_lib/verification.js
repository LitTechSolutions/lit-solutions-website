// verification.js -- shared helper for sending the "verify your email"
// link, used by both auth-register.js (on signup) and
// auth-verify-email.js (on resend). Kept separate from those two so
// neither has to duplicate the token-creation + email-composition logic.

const { createSingleUseToken } = require("./auth_utils");
const { setJSON } = require("./blob_store");
const { sendEmail } = require("./email");

const VERIFY_TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours -- longer than the
// 30-minute password-reset default, since there's less urgency/security
// risk in someone verifying an account a few hours late than there is in a
// stale password-reset link staying valid.

function siteOrigin(event) {
  const host = (event.headers && (event.headers["x-forwarded-host"] || event.headers.host)) || "lit-solutions.tech";
  const proto = (event.headers && event.headers["x-forwarded-proto"]) || "https";
  return `${proto}://${host}`;
}

async function sendVerificationEmail(event, user) {
  const token = createSingleUseToken("verify-email", user.id, VERIFY_TOKEN_TTL_SECONDS);
  await setJSON("tokens", token, { type: "verify-email", userId: user.id, used: false });
  const link = `${siteOrigin(event)}/myaccount.html#verify?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: "Verify your email — Little Technical Solutions LLC",
    html: `<p>Hi ${user.name},</p>` +
      `<p>Click the link below to verify your email and finish setting up your account at Little Technical Solutions LLC:</p>` +
      `<p><a href="${link}">${link}</a></p>` +
      `<p>This link is single-use and expires in 24 hours. If you didn't request this, you can ignore this email.</p>`,
  });
}

module.exports = { sendVerificationEmail, siteOrigin };
