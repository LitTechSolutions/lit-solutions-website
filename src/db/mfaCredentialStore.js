const { getSql } = require("./pgClient");

async function claimMfaTotpCounter({ userId, counter }, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`
    INSERT INTO mfa_totp_counters (user_id, last_counter, updated_at)
    VALUES (${userId}, ${counter}, ${new Date().toISOString()})
    ON CONFLICT (user_id) DO UPDATE
      SET last_counter = EXCLUDED.last_counter,
          updated_at = EXCLUDED.updated_at
      WHERE mfa_totp_counters.last_counter < EXCLUDED.last_counter
    RETURNING last_counter
  `;
  return rows.length === 1;
}

async function syncMfaRecoveryCodeHashes({ userId, codeHashes }, deps = {}) {
  const sql = deps.sql || getSql();
  const hashes = Array.from(new Set(Array.isArray(codeHashes) ? codeHashes : []));
  if (hashes.length === 0) return;
  await sql`
    INSERT INTO mfa_recovery_codes (user_id, code_hash)
    SELECT ${userId}, value
    FROM jsonb_array_elements_text(${JSON.stringify(hashes)}::jsonb) AS value
    ON CONFLICT (user_id, code_hash) DO NOTHING
  `;
}

async function claimMfaRecoveryCode({ userId, codeHash }, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`
    UPDATE mfa_recovery_codes
    SET used_at = ${new Date().toISOString()}
    WHERE user_id = ${userId}
      AND code_hash = ${codeHash}
      AND used_at IS NULL
    RETURNING code_hash
  `;
  return rows.length === 1;
}

async function clearMfaCredentials(userId, deps = {}) {
  const sql = deps.sql || getSql();
  await sql`
    WITH counters AS (
      DELETE FROM mfa_totp_counters WHERE user_id = ${userId}
    )
    DELETE FROM mfa_recovery_codes WHERE user_id = ${userId}
  `;
}

module.exports = {
  claimMfaTotpCounter,
  syncMfaRecoveryCodeHashes,
  claimMfaRecoveryCode,
  clearMfaCredentials,
};
