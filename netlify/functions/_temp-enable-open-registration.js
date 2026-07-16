// TEMPORARY (2026-07-16). One-time-use script to flip the
// open_registration feature flag now that it's actually being enabled --
// no admin UI/endpoint exists yet to do this the normal way (F056 was
// never built beyond the pure document logic in src/settings/). Gated
// behind a random token embedded only in this file, never reused
// elsewhere, so it isn't a meaningful open endpoint even for the short
// time it exists. DELETE THIS FILE immediately after one successful call
// -- it is not meant to be a permanent part of the site.

const { json } = require("./_lib/auth_utils");
const { loadSettingsDocument, saveSettingsDocument } = require("../../src/settings/blobsSettingsStore");
const { applyFeatureFlagUpdate, isFeatureEnabled } = require("../../src/settings/settingsStore");

const ONE_TIME_TOKEN = "f0cd3e87a19cd12ca41a001d4d6632becae1eb059a257630";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }
  if (body.token !== ONE_TIME_TOKEN) return json(403, { error: "Not authorized." });

  const doc = await loadSettingsDocument();
  const next = applyFeatureFlagUpdate(
    doc,
    { key: "open_registration", enabled: true, updatedBy: "dylan-manual-2026-07-16" },
    { now: () => new Date() }
  );
  await saveSettingsDocument(next);

  return json(200, {
    message: "open_registration flag enabled.",
    version: next.version,
    confirmedEnabled: isFeatureEnabled(next, "open_registration"),
  });
};
