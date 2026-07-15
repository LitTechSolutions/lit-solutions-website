const test = require("node:test");
const assert = require("node:assert/strict");
const { assertValidConsentRecord, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } = require("./consent");

function record(overrides = {}) {
  return {
    id: "consent-1", userId: "user-1", organizationId: null, consentType: "terms_privacy",
    granted: true, occurredAt: "2026-07-15T00:00:00.000Z",
    termsVersion: CURRENT_TERMS_VERSION, privacyVersion: CURRENT_PRIVACY_VERSION,
    ...overrides,
  };
}

test("accepts a valid terms_privacy consent record", () => {
  assert.doesNotThrow(() => assertValidConsentRecord(record()));
});

test("rejects terms_privacy consent recorded as granted:false -- it is a required gate, never inferred", () => {
  assert.throws(() => assertValidConsentRecord(record({ granted: false })), /explicitly granted/);
});

test("rejects terms_privacy consent missing termsVersion or privacyVersion", () => {
  assert.throws(() => assertValidConsentRecord(record({ termsVersion: undefined })));
  assert.throws(() => assertValidConsentRecord(record({ privacyVersion: undefined })));
});

test("accepts a declined marketing consent record (granted:false is valid for optional consent types)", () => {
  assert.doesNotThrow(() => assertValidConsentRecord(record({ consentType: "marketing", granted: false, termsVersion: undefined, privacyVersion: undefined })));
});

test("accepts a granted remote_access consent record", () => {
  assert.doesNotThrow(() => assertValidConsentRecord(record({ consentType: "remote_access", granted: true, termsVersion: undefined, privacyVersion: undefined })));
});

test("rejects an unknown consentType", () => {
  assert.throws(() => assertValidConsentRecord(record({ consentType: "bogus" })));
});

test("rejects a non-boolean granted value", () => {
  assert.throws(() => assertValidConsentRecord(record({ granted: "yes" })));
});
