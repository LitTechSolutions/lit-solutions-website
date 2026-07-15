const test = require("node:test");
const assert = require("node:assert/strict");
const { recordConsent, getLatestConsent, listConsentHistoryForUser } = require("./consentStore");
const { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } = require("../domain/consent");

const FIXED_NOW = () => new Date("2026-07-15T12:00:00.000Z");
const FIXED_ID = () => "consent-fixed-id";

function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return cannedRows;
  };
  tag.calls = calls;
  return tag;
}

function consentRow(overrides = {}) {
  return {
    id: "consent-1", user_id: "user-1", organization_id: "org-a", consent_type: "terms_privacy",
    granted: true, terms_version: CURRENT_TERMS_VERSION, privacy_version: CURRENT_PRIVACY_VERSION,
    occurred_at: "2026-07-15T12:00:00.000Z", ip_address: "203.0.113.5",
    ...overrides,
  };
}

test("recordConsent validates and inserts a required terms_privacy acceptance", async () => {
  const sql = fakeSql();
  const record = await recordConsent(
    { userId: "user-1", organizationId: "org-a", consentType: "terms_privacy", granted: true, termsVersion: CURRENT_TERMS_VERSION, privacyVersion: CURRENT_PRIVACY_VERSION, ipAddress: "203.0.113.5" },
    { sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(record.granted, true);
  assert.match(sql.calls[0].text, /INSERT INTO consent_records/);
});

test("recordConsent rejects a terms_privacy record that isn't explicitly granted", async () => {
  const sql = fakeSql();
  await assert.rejects(() =>
    recordConsent({ userId: "user-1", consentType: "terms_privacy", granted: false, termsVersion: CURRENT_TERMS_VERSION, privacyVersion: CURRENT_PRIVACY_VERSION }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID })
  );
  assert.equal(sql.calls.length, 0);
});

test("recordConsent accepts a declined optional marketing consent", async () => {
  const sql = fakeSql();
  const record = await recordConsent({ userId: "user-1", consentType: "marketing", granted: false }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID });
  assert.equal(record.granted, false);
});

test("getLatestConsent returns null when no decision has been recorded", async () => {
  const sql = fakeSql([]);
  assert.equal(await getLatestConsent("user-1", "marketing", { sql }), null);
});

test("getLatestConsent returns the most recent decision", async () => {
  const sql = fakeSql([consentRow()]);
  const record = await getLatestConsent("user-1", "terms_privacy", { sql });
  assert.equal(record.granted, true);
  assert.match(sql.calls[0].text, /ORDER BY occurred_at DESC/);
});

test("listConsentHistoryForUser returns full history, newest first", async () => {
  const sql = fakeSql([consentRow(), consentRow({ id: "consent-2", consent_type: "marketing", granted: false })]);
  const history = await listConsentHistoryForUser("user-1", { sql });
  assert.equal(history.length, 2);
});
