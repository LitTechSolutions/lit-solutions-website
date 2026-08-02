// Completes administrator sign-in using the emailed code issued by
// auth-login.js. Challenges are short-lived, single-use, and limited to six
// guesses. Only this successful exchange creates the real session cookie.

const crypto = require("node:crypto");
const {
  createSession, sessionCookie, clearMfaPendingCookie, json, rateLimited,
} = require("./_lib/auth_utils");
const { getJSON, setJSON } = require("./_lib/blob_store");
const { findUserById } = require("./_lib/users");
const { hashCode } = require("./auth-login");

const MAX_ATTEMPTS = 6;

function safeEqualHex(aHex, bHex) {
  try {
    const a = Buffer.from(String(aHex || ""), "hex");
    const b = Buffer.from(String(bHex || ""), "hex");
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || "unknown";
  const rateLimitedFn = deps.rateLimited || rateLimited;
  if (await rateLimitedFn("admin-code-verify", ip, 12, 600)) {
    return json(429, { error: "Too many code attempts. Start sign-in again in a few minutes." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (_) { return json(400, { error: "Invalid JSON" }); }
  const challengeId = String(body.challengeId || "").trim();
  const code = String(body.code || "").replace(/\D/g, "");
  if (!/^[a-f0-9]{20,80}$/i.test(challengeId) || !/^\d{6}$/.test(code)) {
    return json(400, { error: "Enter the six-digit code from your email." });
  }

  const getJSONFn = deps.getJSON || getJSON;
  const setJSONFn = deps.setJSON || setJSON;
  const rec = await getJSONFn("admin-login", challengeId);
  const now = deps.now ? deps.now() : Date.now();
  const generic = "That code is incorrect or has expired. Start sign-in again if you need a new one.";
  if (!rec || rec.used || !rec.userId || now > Number(rec.expiresAt || 0) || Number(rec.attempts || 0) >= MAX_ATTEMPTS) {
    return json(401, { error: generic });
  }

  const hashCodeFn = deps.hashCode || hashCode;
  if (!safeEqualHex(hashCodeFn(challengeId, code), rec.codeHash)) {
    rec.attempts = Number(rec.attempts || 0) + 1;
    await setJSONFn("admin-login", challengeId, rec);
    return json(401, { error: generic, attemptsRemaining: Math.max(0, MAX_ATTEMPTS - rec.attempts) });
  }

  const findUserByIdFn = deps.findUserById || findUserById;
  const user = await findUserByIdFn(rec.userId);
  if (!user || user.role !== "admin" || !user.verified) return json(401, { error: generic });

  rec.used = true;
  rec.usedAt = now;
  await setJSONFn("admin-login", challengeId, rec);

  const createSessionFn = deps.createSession || createSession;
  const { token, expiresAt } = await createSessionFn(user.id, user.role);
  const maxAge = Math.max(1, Math.floor((expiresAt - now) / 1000));
  return json(200, {
    message: "Signed in securely.",
    user: { id: user.id, name: user.name, email: user.email, role: user.role, verified: !!user.verified },
  }, { "Set-Cookie": [sessionCookie(token, maxAge), clearMfaPendingCookie()] });
};

module.exports.safeEqualHex = safeEqualHex;
module.exports.MAX_ATTEMPTS = MAX_ATTEMPTS;
