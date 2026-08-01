// verification.js -- shared helper for sending the "verify your email"
// message, used by both auth-register.js (on signup) and
// auth-verify-email.js (on resend). Kept separate from those two so
// neither has to duplicate the token-creation + email-composition logic.
//
// The email now carries BOTH a 6-digit code and the original single-use link.
// The code is what the purchase flow uses -- someone mid-checkout shouldn't
// have to leave the tab, find their inbox, click a link and land in a fresh
// browser context with their cart back in the old one. The link is kept
// because it still works, costs nothing, and some people reach for it by
// habit. Either verifies the same account; whichever is used first wins.

const crypto = require("node:crypto");
const { createSingleUseToken } = require("./auth_utils");
const { setJSON, getJSON } = require("./blob_store");
const { sendEmail } = require("./email");

const VERIFY_TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours -- longer than the
// 30-minute password-reset default, since there's less urgency/security
// risk in someone verifying an account a few hours late than there is in a
// stale password-reset link staying valid.

// Deliberately much shorter than the link's 24 hours. A 6-digit code is only
// a million possibilities, so its exposure is a function of how long it stays
// live; 30 minutes is ample for someone who is mid-signup.
const VERIFY_CODE_TTL_SECONDS = 60 * 30;
const MAX_CODE_ATTEMPTS = 6;

function siteOrigin(event) {
  const host = (event.headers && (event.headers["x-forwarded-host"] || event.headers.host)) || "lit-solutions.tech";
  const proto = (event.headers && event.headers["x-forwarded-proto"]) || "https";
  return `${proto}://${host}`;
}

// randomInt, not Math.random: short-lived or not, this is a credential.
function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function codeKey(userId) {
  return `verify-code:${userId}`;
}

/**
 * Issues a fresh code, replacing any previous one. Only a hash is persisted --
 * a readable code sitting in the blob store would be a password-equivalent in
 * plain text.
 */
async function issueCode(user, deps = {}) {
  const code = (deps.generateCode || generateCode)();
  const now = deps.now ? deps.now() : new Date();
  await setJSON("tokens", codeKey(user.id), {
    type: "verify-code",
    userId: user.id,
    codeHash: crypto.createHash("sha256").update(code).digest("hex"),
    expiresAt: new Date(now.getTime() + VERIFY_CODE_TTL_SECONDS * 1000).toISOString(),
    attempts: 0,
    used: false,
  });
  return code;
}

/**
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function checkCode(userId, submitted, deps = {}) {
  const now = deps.now ? deps.now() : new Date();
  const rec = await getJSON("tokens", codeKey(userId));
  if (!rec || rec.used) return { ok: false, reason: "That code is no longer valid. Request a new one." };
  if (new Date(rec.expiresAt) < now) return { ok: false, reason: "That code has expired. Request a new one." };
  if ((rec.attempts || 0) >= MAX_CODE_ATTEMPTS) {
    return { ok: false, reason: "Too many incorrect attempts. Request a new code." };
  }

  const submittedHash = crypto.createHash("sha256").update(String(submitted == null ? "" : submitted).trim()).digest("hex");
  const a = Buffer.from(submittedHash, "hex");
  const b = Buffer.from(rec.codeHash, "hex");
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!match) {
    // Record the failure before returning, so brute force stays bounded even
    // if the caller retries in a tight loop.
    rec.attempts = (rec.attempts || 0) + 1;
    await setJSON("tokens", codeKey(userId), rec);
    return { ok: false, reason: "That code isn't right." };
  }

  rec.used = true;
  await setJSON("tokens", codeKey(userId), rec);
  return { ok: true };
}

async function sendVerificationEmail(event, user, deps = {}) {
  const token = createSingleUseToken("verify-email", user.id, VERIFY_TOKEN_TTL_SECONDS);
  await setJSON("tokens", token, { type: "verify-email", userId: user.id, used: false });
  const code = await issueCode(user, deps);
  const link = `${siteOrigin(event)}/myaccount.html#verify?token=${token}`;

  await sendEmail({
    to: user.email,
    subject: `${code} is your verification code — Little Technical Solutions LLC`,
    html:
      `<p>Hi ${user.name},</p>` +
      `<p>Your verification code is:</p>` +
      `<p style="font-size:32px; font-weight:700; letter-spacing:6px; margin:24px 0;">${code}</p>` +
      `<p>Type it into the page you already have open. It expires in 30 minutes.</p>` +
      `<hr style="border:none; border-top:1px solid #e5e5e5; margin:24px 0;">` +
      `<p style="font-size:13px; color:#666;">Prefer a link? <a href="${link}">Verify your email here</a> — single-use, valid for 24 hours.</p>` +
      `<p style="font-size:13px; color:#666;">If you didn't create an account, you can ignore this email.</p>`,
  });
}

module.exports = {
  sendVerificationEmail,
  siteOrigin,
  issueCode,
  checkCode,
  generateCode,
  VERIFY_CODE_TTL_SECONDS,
  MAX_CODE_ATTEMPTS,
};
