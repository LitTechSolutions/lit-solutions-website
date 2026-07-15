-- Server-recorded, expiring, atomically consumed MFA enrollment challenges.
-- Raw emailed tokens are never stored; only SHA-256 hashes are persisted.

CREATE TABLE mfa_enrollment_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  enrollment_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ
);

CREATE INDEX idx_mfa_enrollment_challenges_user
  ON mfa_enrollment_challenges(user_id, expires_at DESC);

-- Database-authoritative replay protection. Blob user records remain a
-- compatibility mirror, but these conditional writes decide which request wins.
CREATE TABLE mfa_totp_counters (
  user_id TEXT PRIMARY KEY,
  last_counter BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mfa_recovery_codes (
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, code_hash)
);

CREATE INDEX idx_mfa_recovery_codes_unused
  ON mfa_recovery_codes(user_id)
  WHERE used_at IS NULL;
