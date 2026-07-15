// mfaCrypto.js -- symmetric encryption for TOTP secrets at rest, and
// one-time recovery code generation/hashing. Pure functions: the caller
// supplies the key and any randomness source, so this is unit-testable
// without touching process.env or a real CSPRNG (see mfaCrypto.test.js).
//
// TOTP secrets are encrypted (reversible) rather than hashed, because the
// server must recover the plaintext secret to compute the next valid
// code -- unlike a password, this is not a "never need it back" value.
// Recovery codes are the opposite: high-entropy, single-use, generated
// by the server (never user-chosen), so only their hash is ever stored,
// matching the Session 20 directive's "Store recovery codes hashed."

const crypto = require("node:crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // bytes, recommended for GCM

/**
 * @param {string} keyHex - 32-byte key, hex-encoded (64 hex chars) -- MFA_ENCRYPTION_KEY.
 * @returns {Buffer}
 */
function resolveKey(keyHex) {
  if (typeof keyHex !== "string" || keyHex.length !== 64 || !/^[0-9a-f]+$/i.test(keyHex)) {
    throw new Error("mfaCrypto: encryption key must be a 64-character hex string (32 bytes) -- see MFA_ENCRYPTION_KEY in DEPLOYMENT_PLAN.md");
  }
  return Buffer.from(keyHex, "hex");
}

/**
 * @param {string} plaintext
 * @param {string} keyHex
 * @param {{ randomBytes?: (n: number) => Buffer }} [deps]
 * @returns {string} "iv:authTag:ciphertext", all hex-encoded
 */
function encryptSecret(plaintext, keyHex, deps = {}) {
  const key = resolveKey(keyHex);
  const randomBytesFn = deps.randomBytes || crypto.randomBytes;
  const iv = randomBytesFn(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * @param {string} encoded - output of encryptSecret()
 * @param {string} keyHex
 * @returns {string} plaintext
 */
function decryptSecret(encoded, keyHex) {
  const key = resolveKey(keyHex);
  const parts = typeof encoded === "string" ? encoded.split(":") : [];
  if (parts.length !== 3) throw new Error("mfaCrypto: malformed encrypted secret");
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}

const RECOVERY_CODE_GROUPS = 2;
const RECOVERY_CODE_GROUP_LENGTH = 5;
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I -- avoids transcription errors

/**
 * @param {number} count
 * @param {{ randomBytes?: (n: number) => Buffer }} [deps]
 * @returns {string[]} plaintext codes, e.g. "XKQJ2-9RTZP" -- shown to the caller exactly once
 */
function generateRecoveryCodes(count, deps = {}) {
  const randomBytesFn = deps.randomBytes || crypto.randomBytes;
  const codes = [];
  for (let i = 0; i < count; i++) {
    const groups = [];
    for (let g = 0; g < RECOVERY_CODE_GROUPS; g++) {
      const bytes = randomBytesFn(RECOVERY_CODE_GROUP_LENGTH);
      let group = "";
      for (let b = 0; b < RECOVERY_CODE_GROUP_LENGTH; b++) {
        group += RECOVERY_CODE_ALPHABET[bytes[b] % RECOVERY_CODE_ALPHABET.length];
      }
      groups.push(group);
    }
    codes.push(groups.join("-"));
  }
  return codes;
}

/**
 * @param {string} code - plaintext recovery code, as the user typed it
 * @returns {string} sha256 hex digest -- deliberately fast (not scrypt):
 *   recovery codes are high-entropy server-generated random values, not
 *   user-chosen low-entropy passwords, so slow hashing buys no defense
 *   against guessing and only adds latency.
 */
function hashRecoveryCode(code) {
  return crypto.createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

/**
 * @param {string} code
 * @param {string} hash
 * @returns {boolean}
 */
function verifyRecoveryCode(code, hash) {
  const candidate = Buffer.from(hashRecoveryCode(code), "hex");
  const expected = Buffer.from(String(hash || ""), "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function normalizeRecoveryCode(code) {
  return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
}

module.exports = { encryptSecret, decryptSecret, generateRecoveryCodes, hashRecoveryCode, verifyRecoveryCode };
