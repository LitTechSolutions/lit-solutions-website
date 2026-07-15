const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hashChallengeToken,
  createMfaEnrollmentChallenge,
  claimMfaEnrollmentChallenge,
  deleteMfaEnrollmentChallenge,
} = require("./mfaChallengeStore");

function fakeSql(rows = []) {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return rows;
  };
  sql.calls = calls;
  return sql;
}

test("hashChallengeToken never stores the raw emailed credential", () => {
  const hash = hashChallengeToken("secret-token");
  assert.equal(hash.length, 64);
  assert.notEqual(hash, "secret-token");
});

test("create stores only the token hash, binds an enrollment, and invalidates older challenges", async () => {
  const sql = fakeSql();
  await createMfaEnrollmentChallenge({ token: "secret-token", userId: "admin-1", enrollmentId: "11111111-1111-4111-8111-111111111111", expiresAt: "2026-07-15T12:30:00.000Z" }, { sql });
  assert.match(sql.calls[0].text, /SET consumed_at/);
  assert.match(sql.calls[0].text, /INSERT INTO mfa_enrollment_challenges/);
  assert.match(sql.calls[0].text, /enrollment_id/);
  assert.equal(sql.calls[0].values.includes("secret-token"), false);
  assert.ok(sql.calls[0].values.includes(hashChallengeToken("secret-token")));
});

test("claim is one conditional UPDATE and succeeds only when one row is returned", async () => {
  const successSql = fakeSql([{ token_hash: hashChallengeToken("token") }]);
  assert.equal(await claimMfaEnrollmentChallenge({ token: "token", userId: "admin-1", enrollmentId: "11111111-1111-4111-8111-111111111111" }, { sql: successSql }), true);
  assert.match(successSql.calls[0].text, /consumed_at IS NULL/);
  assert.match(successSql.calls[0].text, /expires_at >=/);
  assert.match(successSql.calls[0].text, /enrollment_id/);
  assert.match(successSql.calls[0].text, /RETURNING token_hash/);

  const losingSql = fakeSql([]);
  assert.equal(await claimMfaEnrollmentChallenge({ token: "token", userId: "admin-1", enrollmentId: "11111111-1111-4111-8111-111111111111" }, { sql: losingSql }), false);
});

test("delete removes only an unconsumed hashed challenge", async () => {
  const sql = fakeSql();
  await deleteMfaEnrollmentChallenge("token", { sql });
  assert.match(sql.calls[0].text, /DELETE FROM mfa_enrollment_challenges/);
  assert.match(sql.calls[0].text, /consumed_at IS NULL/);
  assert.equal(sql.calls[0].values.includes("token"), false);
});
