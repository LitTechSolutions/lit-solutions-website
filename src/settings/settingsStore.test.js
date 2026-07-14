const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createEmptyDocument,
  applySettingUpdate,
  applyFeatureFlagUpdate,
  getSetting,
  isFeatureEnabled,
} = require("./settingsStore");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");

test("createEmptyDocument starts at version 0 with no settings or flags", () => {
  const doc = createEmptyDocument();
  assert.equal(doc.version, 0);
  assert.deepEqual(doc.settings, {});
  assert.deepEqual(doc.featureFlags, {});
});

test("applySettingUpdate adds a new setting and increments document version", () => {
  const doc = createEmptyDocument();
  const next = applySettingUpdate(
    doc,
    { key: "care_hub.support_email", value: "support@lit-solutions.tech", valueType: "string", description: "Support inbox", updatedBy: "user-1" },
    { now: FIXED_NOW }
  );
  assert.equal(next.version, 1);
  assert.equal(getSetting(next, "care_hub.support_email").value, "support@lit-solutions.tech");
  assert.equal(getSetting(next, "care_hub.support_email").version, 1);
});

test("applySettingUpdate increments the individual setting's version on repeat updates", () => {
  let doc = createEmptyDocument();
  doc = applySettingUpdate(doc, { key: "care_hub.support_email", value: "a@x.com", valueType: "string", description: "d", updatedBy: "user-1" }, { now: FIXED_NOW });
  doc = applySettingUpdate(doc, { key: "care_hub.support_email", value: "b@x.com", valueType: "string", description: "d", updatedBy: "user-1" }, { now: FIXED_NOW });
  assert.equal(getSetting(doc, "care_hub.support_email").version, 2);
  assert.equal(getSetting(doc, "care_hub.support_email").value, "b@x.com");
});

test("applySettingUpdate rejects a value that looks like a secret", () => {
  const doc = createEmptyDocument();
  assert.throws(
    () => applySettingUpdate(doc, { key: "care_hub.api_key", value: "sk-abc123", valueType: "string", description: "d", updatedBy: "user-1" }, { now: FIXED_NOW }),
    /looks like a secret/
  );
});

test("applySettingUpdate rejects a value/valueType mismatch", () => {
  const doc = createEmptyDocument();
  assert.throws(
    () => applySettingUpdate(doc, { key: "care_hub.max_edits", value: "5", valueType: "number", description: "d", updatedBy: "user-1" }, { now: FIXED_NOW }),
    /does not match declared valueType/
  );
});

test("applyFeatureFlagUpdate adds a flag, defaults are fail-closed until set", () => {
  const doc = createEmptyDocument();
  assert.equal(isFeatureEnabled(doc, "care_hub.ticket_submission_enabled"), false);

  const next = applyFeatureFlagUpdate(doc, { key: "care_hub.ticket_submission_enabled", enabled: true, updatedBy: "user-1" }, { now: FIXED_NOW });
  assert.equal(isFeatureEnabled(next, "care_hub.ticket_submission_enabled"), true);
});

test("applyFeatureFlagUpdate requires updatedBy (audited configuration change, SYS-NFR-020)", () => {
  const doc = createEmptyDocument();
  assert.throws(() => applyFeatureFlagUpdate(doc, { key: "x", enabled: true }, { now: FIXED_NOW }), /updatedBy is required/);
});

test("unknown feature flag key is treated as disabled, not an error (fail closed)", () => {
  const doc = createEmptyDocument();
  assert.equal(isFeatureEnabled(doc, "never_configured"), false);
});
