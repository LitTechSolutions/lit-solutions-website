// technology-assets.js -- HTTP endpoint for F043 (Technology Asset
// Inventory) and F041 (Backup & Restore Point Tracking) -- persisted
// together in src/db/assetStore.js, so exposed together here too.
//
// Routes:
//   POST  /technology-assets -- create an asset OR record a backup,
//                                selected by body.kind ("asset" | "backup")
//                                (platform_admin, customer.administer)
//   GET   /technology-assets?organizationId= -- list an org's assets
//                                (all customer roles, asset.view)
//   PATCH /technology-assets -- mark a backup restore-verified
//                                (platform_admin, customer.administer)

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const { createTechnologyAsset, listTechnologyAssets, recordBackup, markBackupRestoreVerified } = require("../../src/db/assetStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "POST") return handleCreate(event, deps);
  if (event.httpMethod === "GET") return handleList(event, deps);
  if (event.httpMethod === "PATCH") return handleVerifyBackup(event, deps);
  return json(405, { error: "Method not allowed" });
};

async function handleCreate(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { kind, organizationId } = body;
  if (!organizationId || !["asset", "backup"].includes(kind)) {
    return json(400, { error: 'organizationId and kind ("asset" or "backup") are required.' });
  }

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "customer.administer");
  if (deny) return deny;

  try {
    if (kind === "asset") {
      const { type, label, warrantyExpiresAt, licenseExpiresAt } = body;
      if (!type || !label) return json(400, { error: "type and label are required for an asset." });
      const asset = await createTechnologyAsset({ organizationId, type, label, warrantyExpiresAt, licenseExpiresAt }, deps);
      return json(201, { asset });
    }
    const { websiteProfileId, category, location } = body;
    if (!websiteProfileId || !category || !location) {
      return json(400, { error: "websiteProfileId, category, and location are required for a backup." });
    }
    const backup = await recordBackup({ organizationId, websiteProfileId, category, location }, deps);
    return json(201, { backup });
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function handleList(event, deps) {
  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;
  if (!organizationId) return json(400, { error: "organizationId is required." });

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, organizationId, "asset.view");
  if (deny) return deny;

  const assets = await listTechnologyAssets(organizationId, deps);
  return json(200, { assets });
}

async function handleVerifyBackup(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { backupId } = body;
  if (!backupId) return json(400, { error: "backupId is required." });

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "customer.administer");
  if (deny) return deny;

  await markBackupRestoreVerified(backupId, deps);
  return json(200, { message: "Backup marked restore-verified." });
}
