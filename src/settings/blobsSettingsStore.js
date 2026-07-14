// Netlify Blobs-backed persistence for the F056 settings document. New
// store "care_hub_settings", single key "current" -- whole-document
// replace, mirroring content.js's existing pattern for CMS content rather
// than inventing a new persistence style.

const { getJSON, setJSON } = require("../../netlify/functions/_lib/blob_store.js");
const { createEmptyDocument } = require("./settingsStore");

const SETTINGS_STORE = "care_hub_settings";
const CURRENT_KEY = "current";

/**
 * @returns {Promise<import("./settingsStore").SettingsDocument>}
 */
async function loadSettingsDocument() {
  const stored = await getJSON(SETTINGS_STORE, CURRENT_KEY);
  return stored || createEmptyDocument();
}

/**
 * @param {import("./settingsStore").SettingsDocument} document
 * @returns {Promise<void>}
 */
async function saveSettingsDocument(document) {
  await setJSON(SETTINGS_STORE, CURRENT_KEY, document);
}

module.exports = { loadSettingsDocument, saveSettingsDocument, SETTINGS_STORE };
