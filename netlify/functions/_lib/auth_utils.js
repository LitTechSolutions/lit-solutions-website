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

// MFA_PENDING_TTL_SECONDS: the short-lived pre-authentication window
// between password verification and TOTP/recovery-code verification
// (Session 20 directive requirement). Deliberately a SEPARATE cookie
// from lts_session -- a pre-auth token must never be usable anywhere a
// real session is accepted, so mfa-enroll.js/mfa-verify.js only ever
// read lts_mfa_pending, and every other Care Hub endpoint only ever
// reads lts_session. Distinct cookie names is the whole enforcement
// mechanism; there is no third state a single cookie could ambiguously
// represent.
const MFA_PENDING_TTL_SECONDS = 300; // 5 minutes

function mfaPendingCookie(token, maxAgeSeconds) {
  return `lts_mfa_pending=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function clearMfaPendingCookie() {
  return "lts_mfa_pending=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

function readCookie(event, name) {
  const header = (event.headers && (event.headers.cookie || event.headers.Cookie)) || "";
  const match = header.split(";").map((c) => c.trim()).find((c) => c.startsWith(name + "="));
  return match ? match.slice(name.length + 1) : null;
}

// ---- HTTP response helpers ----
// extraHeaders.["Set-Cookie"] may be a single string (the common case) or
// an array of strings when a response needs to set/clear more than one
// cookie at once (Session 20: mfa-enroll.js/mfa-manage.js setting a real
// session while clearing the pre-auth one). A single Set-Cookie header
// cannot carry multiple cookies joined by a comma -- Set-Cookie's own
// Expires attribute legally contains commas, making that ambiguous -- so
// multiple values go in Netlify's multiValueHeaders instead, the
// AWS-Lambda-proxy-compatible mechanism Netlify Functions actually reads
// for repeated headers.
function json(statusCode, body, extraHeaders) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const multiValueHeaders = {};

  for (const [name, value] of Object.entries(extraHeaders || {})) {
    if (Array.isArray(value)) {
      multiValueHeaders[name] = value;
    } else {
      headers[name] = value;
    }
  }

  const response = { statusCode, headers, body: JSON.stringify(body) };
  if (Object.keys(multiValueHeaders).length > 0) response.multiValueHeaders = multiValueHeaders;
  return response;
}

// ---- rate limiting ----
// Known limitation (docs/audit F027, accepted as-is): this read-then-write
// is not atomic, so truly concurrent requests in the same window can each
// read the same `count` before either write lands, letting a determined
// attacker exceed `limit` by a small margin under heavy concurrency. Netlify
// Blobs' Store API (checked against @netlify/blobs 8.2.0) has no
// conditional/compare-and-swap write to close this without a larger
// redesign (e.g. a distributed counter or a different backing store) --
// disproportionate for what this guards (abuse throttling, not a hard
// security boundary), so this is accepted rather than reworked.
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
  mfaPendingCookie, clearMfaPendingCookie, MFA_PENDING_TTL_SECONDS,
};
