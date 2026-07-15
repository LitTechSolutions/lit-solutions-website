-- Migration 002 -- F002 (Customer Invitation & Account Activation) and
-- F007 (Terms, Privacy & Consent Acknowledgment).
--
-- Extends the invitations table (created in 001, unused until now) with
-- the columns a real single-use-token flow needs, and adds a new
-- consent_records table for provable acceptance of legal terms.
--
-- Session 17 decision: registration is invite-only at launch
-- (OWNER_DECISIONS.md #4, resolved). Only a token HASH is ever stored --
-- the raw token exists only in the invitation email and the client
-- request that redeems it, matching auth_utils.js's existing
-- single-use-token pattern for password resets.

ALTER TABLE invitations
  ADD COLUMN token_hash TEXT,
  ADD COLUMN revoked_at TIMESTAMPTZ,
  ADD COLUMN revoked_by TEXT,
  ADD COLUMN resend_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_sent_at TIMESTAMPTZ;

-- Unique only among non-null hashes -- an invitation created before this
-- migration (none exist yet in this database) would have no token_hash;
-- a partial unique index tolerates that instead of requiring a backfill.
CREATE UNIQUE INDEX idx_invitations_token_hash ON invitations(token_hash) WHERE token_hash IS NOT NULL;

-- ============================================================
-- F007 -- Terms, Privacy & Consent Acknowledgment. One row per consent
-- decision (not per user) -- consent is re-recorded whenever legal terms
-- change or a preference is updated, so history is never overwritten.
-- ============================================================

CREATE TABLE consent_records (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id),
  consent_type TEXT NOT NULL CHECK (consent_type IN ('terms_privacy', 'marketing', 'remote_access')),
  granted BOOLEAN NOT NULL,
  terms_version TEXT,
  privacy_version TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  metadata JSONB
);
CREATE INDEX idx_consent_records_user ON consent_records(user_id, consent_type, occurred_at DESC);
