const test = require("node:test");
const assert = require("node:assert/strict");
const { TOTP, Secret } = require("otpauth");
const { generateTotpSecret, buildOtpauthUri, verifyTotpCode } = require("./totp");

const FIXED_TS = 1752580800000; // 2026-07-15T12:00:00.000Z

function codeFor(secretBase32, timestamp) {
  const totp = new TOTP({ digits: 6, period: 30, secret: Secret.fromBase32(secretBase32) });
  return totp.generate({ timestamp });
}

test("generateTotpSecret returns a base32 string", () => {
  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]+=*$/);
  assert.ok(secret.length >= 32);
});

test("generateTotpSecret produces a different secret each call", () => {
  assert.notEqual(generateTotpSecret(), generateTotpSecret());
});

test("buildOtpauthUri embeds the issuer and account label", () => {
  const secret = generateTotpSecret();
  const uri = buildOtpauthUri(secret, "dylan@lit-solutions.tech");
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /issuer=LTS/);
  assert.match(uri, /secret=/);
});

test("verifyTotpCode accepts the correct current code", () => {
  const secret = generateTotpSecret();
  const code = codeFor(secret, FIXED_TS);
  assert.equal(verifyTotpCode(secret, code, { timestamp: FIXED_TS }), true);
});

test("verifyTotpCode rejects an incorrect code", () => {
  const secret = generateTotpSecret();
  assert.equal(verifyTotpCode(secret, "000000", { timestamp: FIXED_TS }), false);
});

test("verifyTotpCode tolerates one period of clock skew (window: 1)", () => {
  const secret = generateTotpSecret();
  const codeOnePeriodAgo = codeFor(secret, FIXED_TS - 30_000);
  assert.equal(verifyTotpCode(secret, codeOnePeriodAgo, { timestamp: FIXED_TS, window: 1 }), true);
});

test("verifyTotpCode rejects a code from two periods away with the default window", () => {
  const secret = generateTotpSecret();
  const codeTwoPeriodsAgo = codeFor(secret, FIXED_TS - 60_000);
  assert.equal(verifyTotpCode(secret, codeTwoPeriodsAgo, { timestamp: FIXED_TS }), false);
});

test("verifyTotpCode rejects malformed input without throwing", () => {
  const secret = generateTotpSecret();
  assert.equal(verifyTotpCode(secret, "abc", { timestamp: FIXED_TS }), false);
  assert.equal(verifyTotpCode(secret, "12345", { timestamp: FIXED_TS }), false);
  assert.equal(verifyTotpCode(secret, "", { timestamp: FIXED_TS }), false);
  assert.equal(verifyTotpCode(secret, undefined, { timestamp: FIXED_TS }), false);
});

test("a wrong secret never validates the right code", () => {
  const secretA = generateTotpSecret();
  const secretB = generateTotpSecret();
  const code = codeFor(secretA, FIXED_TS);
  assert.equal(verifyTotpCode(secretB, code, { timestamp: FIXED_TS }), false);
});
