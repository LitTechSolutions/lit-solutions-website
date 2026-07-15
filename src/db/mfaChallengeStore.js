const crypto = require("node:crypto");
const { getSql } = require("./pgClient");

function hashChallengeToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function createMfaEnrollmentChallenge({ token, userId, enrollmentId, expiresAt }, deps = {}) {
  const sql = deps.sql || getSql();
  const tokenHash = hashChallengeToken(token);
  await sql`
    WITH invalidated AS (
      UPDATE mfa_enrollment_challenges
      SET consumed_at = ${new Date().toISOString()}
      WHERE user_id = ${userId} AND consumed_at IS NULL
    )
    INSERT INTO mfa_enrollment_challenges (token_hash, user_id, enrollment_id, expires_at, created_at)
    VALUES (${tokenHash}, ${userId}, ${enrollmentId}, ${expiresAt}, ${new Date().toISOString()})
  `;
}

async function claimMfaEnrollmentChallenge({ token, userId, enrollmentId }, deps = {}) {
  const sql = deps.sql || getSql();
  const tokenHash = hashChallengeToken(token);
  const rows = await sql`
    UPDATE mfa_enrollment_challenges
    SET consumed_at = ${new Date().toISOString()}
    WHERE token_hash = ${tokenHash}
      AND user_id = ${userId}
      AND enrollment_id = ${enrollmentId}
      AND consumed_at IS NULL
      AND expires_at >= ${new Date().toISOString()}
    RETURNING token_hash
  `;
  return rows.length === 1;
}

async function deleteMfaEnrollmentChallenge(token, deps = {}) {
  const sql = deps.sql || getSql();
  await sql`DELETE FROM mfa_enrollment_challenges WHERE token_hash = ${hashChallengeToken(token)} AND consumed_at IS NULL`;
}

module.exports = {
  hashChallengeToken,
  createMfaEnrollmentChallenge,
  claimMfaEnrollmentChallenge,
  deleteMfaEnrollmentChallenge,
};
