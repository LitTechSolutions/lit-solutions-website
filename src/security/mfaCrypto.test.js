const test = require("node:test");
const assert = require("node:assert/strict");
const {
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
} = require("./mfaCrypto");

const KEY = "a".repeat(64); // 32 bytes hex
const OTHER_KEY = "b".repeat(64);

test("encryptSecret/decryptSecret round-trips the plaintext", () => {
  const encrypted = encryptSecret("JBSWY3DPEHPK3PXP", KEY);
  assert.equal(decryptSecret(encrypted, KEY), "JBSWY3DPEHPK3PXP");
});

test("encryptSecret produces a different ciphertext each call (random IV)", () => {
  const a = encryptSecret("same-secret", KEY);
  const b = encryptSecret("same-secret", KEY);
  assert.notEqual(a, b);
});

test("decryptSecret with the wrong key throws rather than returning garbage", () => {
  const encrypted = encryptSecret("JBSWY3DPEHPK3PXP", KEY);
  assert.throws(() => decryptSecret(encrypted, OTHER_KEY));
});

test("decryptSecret rejects a tampered ciphertext (GCM auth tag fails)", () => {
  const encrypted = encryptSecret("JBSWY3DPEHPK3PXP", KEY);
  const [iv, tag, ciphertext] = encrypted.split(":");
  const tampered = `${iv}:${tag}:${ciphertext.slice(0, -2)}00`;
  assert.throws(() => decryptSecret(tampered, KEY));
});

test("resolveKey rejects a key that isn't 64 hex chars", () => {
  assert.throws(() => encryptSecret("x", "too-short"));
  assert.throws(() => encryptSecret("x", "g".repeat(64))); // not valid hex
});

test("generateRecoveryCodes returns the requested count, each in XXXXX-XXXXX shape", () => {
  const codes = generateRecoveryCodes(10);
  assert.equal(codes.length, 10);
  for (const code of codes) {
    assert.match(code, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  }
});

test("generateRecoveryCodes never produces ambiguous characters (0/O/1/I)", () => {
  const codes = generateRecoveryCodes(50).join("");
  assert.doesNotMatch(codes, /[01OI]/);
});

test("generateRecoveryCodes with an injected randomBytes is deterministic", () => {
  let call = 0;
  const fixedBytes = () => Buffer.from([call++ % 256, 1, 2, 3, 4]);
  const codes = generateRecoveryCodes(1, { randomBytes: fixedBytes });
  assert.equal(codes.length, 1);
});

test("hashRecoveryCode/verifyRecoveryCode round-trip, case- and whitespace-insensitive", () => {
  const codes = generateRecoveryCodes(1);
  const code = codes[0];
  const hash = hashRecoveryCode(code);
  assert.equal(verifyRecoveryCode(code, hash), true);
  assert.equal(verifyRecoveryCode(code.toLowerCase(), hash), true);
  assert.equal(verifyRecoveryCode(`  ${code}  `, hash), true);
});

test("verifyRecoveryCode rejects a wrong code", () => {
  const hash = hashRecoveryCode("AAAAA-AAAAA");
  assert.equal(verifyRecoveryCode("BBBBB-BBBBB", hash), false);
});

test("verifyRecoveryCode never throws on a malformed stored hash", () => {
  assert.equal(verifyRecoveryCode("AAAAA-AAAAA", "not-hex"), false);
  assert.equal(verifyRecoveryCode("AAAAA-AAAAA", undefined), false);
});
