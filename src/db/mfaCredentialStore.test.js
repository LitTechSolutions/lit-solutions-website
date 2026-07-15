const test = require("node:test");
const assert = require("node:assert/strict");
const {
  claimMfaTotpCounter,
  syncMfaRecoveryCodeHashes,
  claimMfaRecoveryCode,
  clearMfaCredentials,
} = require("./mfaCredentialStore");

function fakeSql(rows = []) {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return rows;
  };
  sql.calls = calls;
  return sql;
}

test("TOTP counter claim is an atomic monotonic upsert", async () => {
  const sql = fakeSql([{ last_counter: 1000 }]);
  assert.equal(await claimMfaTotpCounter({ userId: "u1", counter: 1000 }, { sql }), true);
  assert.match(sql.calls[0].text, /ON CONFLICT \(user_id\) DO UPDATE/);
  assert.match(sql.calls[0].text, /last_counter < EXCLUDED\.last_counter/);
  assert.match(sql.calls[0].text, /RETURNING last_counter/);
});

test("TOTP counter claim loses when no row is returned", async () => {
  assert.equal(await claimMfaTotpCounter({ userId: "u1", counter: 1000 }, { sql: fakeSql([]) }), false);
});

test("recovery hashes are inserted without reviving consumed rows", async () => {
  const sql = fakeSql([]);
  await syncMfaRecoveryCodeHashes({ userId: "u1", codeHashes: ["a", "a", "b"] }, { sql });
  assert.match(sql.calls[0].text, /ON CONFLICT \(user_id, code_hash\) DO NOTHING/);
  assert.equal(sql.calls[0].values[1], JSON.stringify(["a", "b"]));
});

test("recovery code claim conditionally marks one unused hash", async () => {
  const sql = fakeSql([{ code_hash: "hash" }]);
  assert.equal(await claimMfaRecoveryCode({ userId: "u1", codeHash: "hash" }, { sql }), true);
  assert.match(sql.calls[0].text, /used_at IS NULL/);
  assert.match(sql.calls[0].text, /RETURNING code_hash/);
});

test("clearing MFA removes counters and recovery credentials together", async () => {
  const sql = fakeSql([]);
  await clearMfaCredentials("u1", { sql });
  assert.match(sql.calls[0].text, /DELETE FROM mfa_totp_counters/);
  assert.match(sql.calls[0].text, /DELETE FROM mfa_recovery_codes/);
});
