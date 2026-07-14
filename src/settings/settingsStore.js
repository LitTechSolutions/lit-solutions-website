// F056 -- System Settings, Feature Flags & Content Configuration.
// Not owner-blocked. Pure document logic, storage-agnostic (see
// blobsSettingsStore.js for the Netlify Blobs adapter) -- centralizes
// non-secret configuration per SYS-ARC-008, matching the existing
// `content` store's whole-record-replace pattern (content.js) rather than
// inventing a new persistence style.

const { assertValidSetting, assertValidFeatureFlag } = require("../domain/settings");

/**
 * @typedef {Object} SettingsDocument
 * @property {Record<string, import("../domain/settings").SettingRecord>} settings
 * @property {Record<string, import("../domain/settings").FeatureFlag>} featureFlags
 * @property {number} version
 * @property {string} updatedAt
 * @property {string} updatedBy
 */

/**
 * @returns {SettingsDocument}
 */
function createEmptyDocument() {
  return { settings: {}, featureFlags: {}, version: 0, updatedAt: null, updatedBy: null };
}

/**
 * @param {SettingsDocument} document
 * @param {Omit<import("../domain/settings").SettingRecord, "updatedAt" | "version">} input
 * @param {{ now?: () => Date }} [deps]
 * @returns {SettingsDocument}
 */
function applySettingUpdate(document, input, deps = {}) {
  const now = deps.now || (() => new Date());
  const nextVersion = (document.settings[input.key]?.version || 0) + 1;
  const candidate = { ...input, updatedAt: now().toISOString(), version: nextVersion };
  assertValidSetting(candidate);
  return {
    ...document,
    settings: { ...document.settings, [candidate.key]: candidate },
    version: document.version + 1,
    updatedAt: candidate.updatedAt,
    updatedBy: candidate.updatedBy,
  };
}

/**
 * @param {SettingsDocument} document
 * @param {Omit<import("../domain/settings").FeatureFlag, "updatedAt">} input
 * @param {{ now?: () => Date }} [deps]
 * @returns {SettingsDocument}
 */
function applyFeatureFlagUpdate(document, input, deps = {}) {
  const now = deps.now || (() => new Date());
  const candidate = { ...input, updatedAt: now().toISOString() };
  assertValidFeatureFlag(candidate);
  return {
    ...document,
    featureFlags: { ...document.featureFlags, [candidate.key]: candidate },
    version: document.version + 1,
    updatedAt: candidate.updatedAt,
    updatedBy: candidate.updatedBy,
  };
}

/**
 * @param {SettingsDocument} document
 * @param {string} key
 * @returns {import("../domain/settings").SettingRecord | undefined}
 */
function getSetting(document, key) {
  return document.settings[key];
}

/**
 * Feature flags default OFF when not present -- fail closed, consistent
 * with default-deny elsewhere in this codebase (rbac.js).
 * @param {SettingsDocument} document
 * @param {string} key
 * @returns {boolean}
 */
function isFeatureEnabled(document, key) {
  return document.featureFlags[key]?.enabled === true;
}

module.exports = { createEmptyDocument, applySettingUpdate, applyFeatureFlagUpdate, getSetting, isFeatureEnabled };
