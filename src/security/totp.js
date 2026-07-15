// totp.js -- thin wrapper around otpauth (RFC 6238 TOTP), the
// well-maintained third-party implementation the Session 20 directive
// requires in place of hand-rolling this with just Node crypto. otpauth's
// only dependency is @noble/hashes, a widely-audited, zero-dependency
// crypto primitives library (used by viem, noble-curves, and other
// security-sensitive projects) -- a minimal, reviewed dependency
// footprint rather than a large auth framework.
//
// Every function here takes its inputs explicitly (no reads from
// process.env, no implicit clock) so this stays unit-testable and has no
// opinion about where the secret is stored -- that's mfaCrypto.js
// (encryption at rest) and the endpoint layer's job.

const { TOTP, Secret } = require("otpauth");

const ISSUER = "LTS Business Care Hub";
const DIGITS = 6;
const PERIOD = 30;
const DEFAULT_VALIDATION_WINDOW = 1; // +/- 1 period (30s) of clock skew tolerance

/**
 * @param {{ randomBytes?: (n: number) => Uint8Array }} [deps]
 * @returns {string} base32-encoded secret, ready to encrypt at rest
 */
function generateTotpSecret(deps = {}) {
  const secret = deps.randomBytes ? new Secret({ buffer: deps.randomBytes(20) }) : new Secret({ size: 20 });
  return secret.base32;
}

function buildTotp(secretBase32, accountLabel) {
  return new TOTP({
    issuer: ISSUER,
    label: accountLabel,
    algorithm: "SHA1", // widest authenticator-app compatibility (Google/Microsoft/Authy all assume SHA1 by default)
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secretBase32),
  });
}

/**
 * @param {string} secretBase32
 * @param {string} accountLabel - shown in the authenticator app, e.g. the admin's email
 * @returns {string} otpauth:// URI for QR-code enrollment
 */
function buildOtpauthUri(secretBase32, accountLabel) {
  return buildTotp(secretBase32, accountLabel).toString();
}

/**
 * @param {string} secretBase32
 * @param {string} token - the 6-digit code the user typed
 * @param {{ window?: number, timestamp?: number }} [options]
 * @returns {boolean}
 */
function verifyTotpCode(secretBase32, token, options = {}) {
  if (typeof token !== "string" || !/^\d{6}$/.test(token.trim())) return false;
  const totp = buildTotp(secretBase32, "verify");
  const delta = totp.validate({
    token: token.trim(),
    window: options.window ?? DEFAULT_VALIDATION_WINDOW,
    ...(options.timestamp !== undefined ? { timestamp: options.timestamp } : {}),
  });
  return delta !== null;
}

module.exports = { generateTotpSecret, buildOtpauthUri, verifyTotpCode, DIGITS, PERIOD };
