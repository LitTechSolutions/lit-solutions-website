// Covers the resume-token security model added for the standalone
// project-details worksheet (website-project-brief.html): a quick-quote
// lead's record now carries only a SHA-256 hash of a one-time resume
// token, never the raw token itself, checked with a timing-safe
// comparison, expiring after 24h, and single-use (spent the moment a full
// submission using it succeeds). See netlify/functions/website-designer.js
// for the implementation these tests exercise directly (no mocking --
// generateResumeToken/hashResumeToken/resumeTokenValid have no I/O).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  generateResumeToken,
  hashResumeToken,
  resumeTokenValid,
} = require("../netlify/functions/website-designer");

function freshRecord(overrides) {
  const token = generateResumeToken();
  return {
    token,
    record: Object.assign(
      {
        id: "WD-FAKE1",
        resumeTokenHash: hashResumeToken(token),
        resumeTokenExpiresAt: Date.now() + 60_000,
        resumeTokenUsed: false,
      },
      overrides
    ),
  };
}

test("generateResumeToken produces a long, unguessable, unique hex string", () => {
  const a = generateResumeToken();
  const b = generateResumeToken();
  assert.equal(typeof a, "string");
  assert.match(a, /^[0-9a-f]{64}$/, "expected 32 raw bytes hex-encoded (64 hex chars)");
  assert.notEqual(a, b, "two generated tokens must never collide in practice");
});

test("only the hash is ever what's compared -- the raw token itself never equals its own hash", () => {
  const token = generateResumeToken();
  const hash = hashResumeToken(token);
  assert.notEqual(token, hash);
  assert.match(hash, /^[0-9a-f]{64}$/, "SHA-256 digest hex-encoded is 64 hex chars");
});

test("resumeTokenValid: the correct token against its own record's hash validates", () => {
  const { token, record } = freshRecord();
  assert.equal(resumeTokenValid(record, token), true);
});

test("resumeTokenValid: a wrong/guessed token is rejected", () => {
  const { record } = freshRecord();
  assert.equal(resumeTokenValid(record, generateResumeToken()), false);
  assert.equal(resumeTokenValid(record, ""), false);
  assert.equal(resumeTokenValid(record, "not-even-hex"), false);
});

test("resumeTokenValid: an expired token is rejected even if it's otherwise correct", () => {
  const { token, record } = freshRecord({ resumeTokenExpiresAt: Date.now() - 1 });
  assert.equal(resumeTokenValid(record, token), false);
});

test("resumeTokenValid: a token already marked used (single-use, spent) is rejected", () => {
  const { token, record } = freshRecord({ resumeTokenUsed: true });
  assert.equal(resumeTokenValid(record, token), false);
});

test("resumeTokenValid: a missing/unknown record (e.g. lead id doesn't exist) is rejected", () => {
  assert.equal(resumeTokenValid(null, generateResumeToken()), false);
  assert.equal(resumeTokenValid(undefined, generateResumeToken()), false);
});

test("resumeTokenValid: a record with no resumeTokenHash at all (e.g. a pre-token legacy record) is rejected", () => {
  assert.equal(resumeTokenValid({ id: "WD-OLD1" }, generateResumeToken()), false);
});

test("cross-lead isolation: a token valid for one lead's record is never valid against a different lead's record", () => {
  const leadA = freshRecord({ id: "WD-AAAA1" });
  const leadB = freshRecord({ id: "WD-BBBB1" });
  assert.equal(resumeTokenValid(leadA.record, leadA.token), true);
  assert.equal(resumeTokenValid(leadB.record, leadB.token), true);
  // A's token doesn't validate against B's record and vice versa, even
  // though both records are otherwise well-formed and unexpired.
  assert.equal(resumeTokenValid(leadA.record, leadB.token), false);
  assert.equal(resumeTokenValid(leadB.record, leadA.token), false);
});

test("a predictable/guessable lead id alone is never sufficient -- the record's own stored hash still gates access", () => {
  // Simulates an attacker who knows (or guesses) a real quickLeadId format
  // but not the token: build a record exactly as the server would, then
  // confirm every token except the one actually issued for it fails.
  const { record } = freshRecord({ id: "WD-KX3F9A-1B2C3D" });
  for (let i = 0; i < 25; i += 1) {
    assert.equal(resumeTokenValid(record, generateResumeToken()), false);
  }
});
