// auth_utils.js -- hashed credentials + secure sessions (sign-in), single-use
// expiring tokens (password reset), session rotation/revocation, and rate
// limiting on sign-in/register/reset.
//
// Deliberately stdlib-only: Node's built-in crypto.scrypt for password
// hashing and HMAC-SHA256 for session/reset tokens, instead of adding
// bcryptjs/jsonwebtoken as dependencies.
//
// Requires env var LTS_SESSION_SECRET to be set in Netlify (Site settings >
// Environment variables). Generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);
const { getJSON, setJSON } = require("./blob_store");

const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours
const RESET_TOKEN_TTL_SECONDS = 60 * 30; // 30 minutes, single-use

function getSecret() {
  const s = process.env.LTS_SESSION_SECRET;
  if (!s) throw new Error("LTS_SESSION_SECRET is not set in this site's environment variables.");
  return s;
}

// ---- password hashing (scrypt) ----
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split(":");
  if (scheme !== "scrypt") return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scrypt(password, salt, 64);
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

// ---- signed tokens (session cookies + password-reset links) ----
function sign(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verify(token) {
  if (!token || token.indexOf(".") === -1) return null;
  const [payload, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  let obj;
  try { obj = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch (e) { return null; }
  if (obj.exp && Date.now() > obj.exp) return null;
  return obj;
}

async function createSession(userId, role) {
  const sessionId = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  await setJSON("sessions", sessionId, { userId, role, expiresAt });
  const token = sign({ sid: sessionId, exp: expiresAt });
  return { token, expiresAt };
}

async function getSession(token) {
  const decoded = verify(token);
  if (!decoded || !decoded.sid) return null;
  const session = await getJSON("sessions", decoded.sid);
  if (!session || Date.now() > session.expiresAt) return null;
  return { sessionId: decoded.sid, ...session };
}

async function revokeSession(token) {
  const decoded = verify(token);
  if (!decoded || !decoded.sid) return;
  const { deleteKey } = require("./blob_store");
  await deleteKey("sessions", decoded.sid);
}

async function revokeAllSessionsForUser(userId) {
  // Rotate/revoke sessions on privilege change (e.g. password reset).
  const { store, deleteKey } = require("./blob_store");
  const sessionsStore = store("sessions");
  const { blobs } = await sessionsStore.list();
  for (const b of blobs) {
    const session = await sessionsStore.get(b.key, { type: "json" });
    if (session && session.userId === userId) await deleteKey("sessions", b.key);
  }
}

function createSingleUseToken(type, userId, ttlSeconds) {
  const ttl = ttlSeconds || RESET_TOKEN_TTL_SECONDS;
  return sign({ type, uid: userId, exp: Date.now() + ttl * 1000, jti: crypto.randomBytes(8).toString("hex") });
}

// ---- cookies ----
function sessionCookie(token, maxAgeSeconds) {
  return `lts_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function clearSessionCookie() {
  return "lts_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

function readCookie(event, name) {
  const header = (event.headers && (event.headers.cookie || event.headers.Cookie)) || "";
  const match = header.split(";").map((c) => c.trim()).find((c) => c.startsWith(name + "="));
  return match ? match.slice(name.length + 1) : null;
}

// ---- HTTP response helpers ----
function json(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(body),
  };
}

// ---- rate limiting ----
async function rateLimited(action, ip, limit, windowSeconds) {
  const key = `${action}:${ip || "unknown"}`;
  const now = Date.now();
  const entry = (await getJSON("ratelimit", key)) || { count: 0, windowStart: now };
  if (now - entry.windowStart > windowSeconds * 1000) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  await setJSON("ratelimit", key, entry);
  return entry.count > limit;
}

module.exports = {
  hashPassword, verifyPassword, createSession, getSession, revokeSession,
  revokeAllSessionsForUser, createSingleUseToken, verify, sessionCookie,
  clearSessionCookie, readCookie, json, rateLimited,
};
