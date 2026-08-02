// auth-login.js -- secure sign-in: hashed credentials, HttpOnly Secure
// SameSite session cookie, rate-limited. Unverified accounts (see
// auth-register.js / auth-verify-email.js) are blocked from signing in at
// all -- the main point of email verification is exactly this gate.
//
// Administrator accounts use an emailed six-digit code as their second
// factor. A correct password creates a short-lived, single-use challenge;
// auth-admin-code.js is the only endpoint that can exchange that challenge
// for a real session. Customer/staff accounts still receive a session here.

const crypto = require("node:crypto");
const { verifyPassword, createSession, sessionCookie, json, rateLimited } = require("./_lib/auth_utils");
const { getJSON, setJSON } = require("./_lib/blob_store");
const { sendEmail } = require("./_lib/email");

const ADMIN_CODE_TTL_SECONDS = 10 * 60;

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function hashCode(challengeId, code) {
  const secret = process.env.LTS_SESSION_SECRET;
  if (!secret) throw new Error("LTS_SESSION_SECRET is not set.");
  return crypto.createHmac("sha256", secret).update(`${challengeId}.${code}`).digest("hex");
}

function maskedEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!domain) return "your email address";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

function esc(value) {
  return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

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
    if (await rateLimitedFn("admin-code-send", user.id, 5, 3600)) {
      return json(429, { error: "Too many security codes requested. Try again later." });
    }

    const challengeId = (deps.challengeId || (() => crypto.randomBytes(18).toString("hex")))();
    const code = (deps.generateCode || generateCode)();
    const now = deps.now ? deps.now() : Date.now();
    const hashCodeFn = deps.hashCode || hashCode;
    const setJSONFn = deps.setJSON || setJSON;
    await setJSONFn("admin-login", challengeId, {
      userId: user.id,
      email: user.email,
      codeHash: hashCodeFn(challengeId, code),
      createdAt: now,
      expiresAt: now + ADMIN_CODE_TTL_SECONDS * 1000,
      attempts: 0,
      used: false,
    });

    const sendEmailFn = deps.sendEmail || sendEmail;
    const sent = await sendEmailFn({
      to: user.email,
      subject: `${code} is your LTS admin sign-in code`,
      html:
        `<p>Hi ${esc(user.name || "there")},</p>` +
        `<p>Use this one-time code to finish signing in to the Little Technical Solutions admin workspace:</p>` +
        `<p style="font-size:32px;font-weight:750;letter-spacing:7px;margin:24px 0;color:#0b2b54;">${code}</p>` +
        `<p>The code expires in 10 minutes and can only be used once.</p>` +
        `<p style="font-size:13px;color:#666;margin-top:28px;">If you did not try to sign in, change your password and contact support. Never share this code.</p>`,
    });

    if (!sent || sent.sent !== true) {
      // Fail closed: an admin must never receive a session because email is
      // unavailable. The unusable challenge expires automatically.
      return json(503, { error: "We couldn't send your security code. Please try again shortly." });
    }

    return json(200, {
      emailCodeRequired: true,
      challengeId,
      maskedEmail: maskedEmail(user.email),
      expiresInSeconds: ADMIN_CODE_TTL_SECONDS,
      message: `We sent a security code to ${maskedEmail(user.email)}.`,
    });
  }

  const createSessionFn = deps.createSession || createSession;
  const { token, expiresAt } = await createSessionFn(user.id, user.role);
  const maxAge = Math.floor((expiresAt - Date.now()) / 1000);

  return json(200,
    { message: "Signed in.", user: { id: user.id, name: user.name, email: user.email, role: user.role, verified: !!user.verified } },
    { "Set-Cookie": sessionCookie(token, maxAge) }
  );
};

module.exports.generateCode = generateCode;
module.exports.hashCode = hashCode;
module.exports.maskedEmail = maskedEmail;
module.exports.ADMIN_CODE_TTL_SECONDS = ADMIN_CODE_TTL_SECONDS;
