// F007 -- Terms, Privacy & Consent Acknowledgment. Postgres persistence.
// No pure policy engine sits in front of this one -- there's no state
// machine to enforce (a consent decision is either recorded or it isn't;
// "withdrawing" marketing consent is just recording a new granted:false
// row, never overwriting history) -- so this store's job is purely
// insert-and-validate, matching the domain type's own validation.
//
// One row per DECISION, not per user: consent is re-recorded whenever
// legal terms change or a preference is updated, so a full history of
// what was presented and accepted/declined and when is always
// reconstructable, per OWNER_DECISIONS.md #5 (legal/consent wording).

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidConsentRecord } = require("../domain/consent");

/**
 * @param {{ userId: string, organizationId?: string | null, consentType: import("../domain/consent").ConsentType, granted: boolean, termsVersion?: string, privacyVersion?: string, ipAddress?: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string }} [deps]
 * @returns {Promise<import("../domain/consent").ConsentRecord>}
 */
async function recordConsent(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

  const record = {
    id: idGenerator(),
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    consentType: input.consentType,
    granted: input.granted,
    occurredAt: now().toISOString(),
    ...(input.termsVersion ? { termsVersion: input.termsVersion } : {}),
    ...(input.privacyVersion ? { privacyVersion: input.privacyVersion } : {}),
    ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
  };
  assertValidConsentRecord(record);

  await sql`
    INSERT INTO consent_records (id, user_id, organization_id, consent_type, granted, terms_version, privacy_version, occurred_at, ip_address)
    VALUES (${record.id}, ${record.userId}, ${record.organizationId}, ${record.consentType}, ${record.granted}, ${record.termsVersion || null}, ${record.privacyVersion || null}, ${record.occurredAt}, ${record.ipAddress || null})
  `;
  return record;
}

/**
 * Most recent decision of a given type for a user -- e.g. "is this user's
 * current terms_privacy consent up to date with the live Terms version?"
 *
 * @param {string} userId
 * @param {import("../domain/consent").ConsentType} consentType
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/consent").ConsentRecord | null>}
 */
async function getLatestConsent(userId, consentType, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`
    SELECT * FROM consent_records
    WHERE user_id = ${userId} AND consent_type = ${consentType}
    ORDER BY occurred_at DESC
    LIMIT 1
  `;
  return rows.length > 0 ? mapRowToConsentRecord(rows[0]) : null;
}

/**
 * @param {string} userId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/consent").ConsentRecord[]>}
 */
async function listConsentHistoryForUser(userId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM consent_records WHERE user_id = ${userId} ORDER BY occurred_at DESC`;
  return rows.map(mapRowToConsentRecord);
}

function mapRowToConsentRecord(row) {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    consentType: row.consent_type,
    granted: row.granted,
    occurredAt: new Date(row.occurred_at).toISOString(),
    ...(row.terms_version ? { termsVersion: row.terms_version } : {}),
    ...(row.privacy_version ? { privacyVersion: row.privacy_version } : {}),
    ...(row.ip_address ? { ipAddress: row.ip_address } : {}),
  };
}

module.exports = { recordConsent, getLatestConsent, listConsentHistoryForUser, mapRowToConsentRecord };
