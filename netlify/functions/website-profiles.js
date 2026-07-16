// website-profiles.js -- HTTP endpoint for F031 (Website Profile &
// Ownership Registry). Thin adapter over src/db/websiteProfileStore.js.
// Provisioned by staff (customer.administer), same pattern as
// service-records.js.
//
// Routes:
//   POST  /website-profiles -- create a profile (platform_admin, customer.administer)
//   GET   /website-profiles?organizationId= -- list profiles (all customer
//                                              roles, website_profile.view)
//   PATCH /website-profiles -- update a profile's primaryUrl/domainRegistrar/
//                                hostingProvider (platform_admin, customer.administer)

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const { createWebsiteProfile, listWebsiteProfilesForOrganization, updateWebsiteProfile } = require("../../src/db/websiteProfileStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "POST") return handleCreate(event, deps);
  if (event.httpMethod === "GET") return handleList(event, deps);
  if (event.httpMethod === "PATCH") return handleUpdate(event, deps);
  return json(405, { error: "Method not allowed" });
};

async function handleCreate(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { organizationId, primaryUrl, domainRegistrar, hostingProvider } = body;
  if (!organizationId || !primaryUrl) {
    return json(400, { error: "organizationId and primaryUrl are required." });
  }

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "customer.administer");
  if (deny) return deny;

  try {
    const profile = await createWebsiteProfile({ organizationId, primaryUrl, domainRegistrar, hostingProvider }, { ...deps, actorId: auth.session.userId });
    return json(201, { profile });
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function handleList(event, deps) {
  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;
  if (!organizationId) return json(400, { error: "organizationId is required." });

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, organizationId, "website_profile.view");
  if (deny) return deny;

  const profiles = await listWebsiteProfilesForOrganization(organizationId, deps);
  return json(200, { profiles });
}

async function handleUpdate(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { profileId, primaryUrl, domainRegistrar, hostingProvider } = body;
  if (!profileId) return json(400, { error: "profileId is required." });
  if (primaryUrl === undefined && domainRegistrar === undefined && hostingProvider === undefined) {
    return json(400, { error: "At least one of primaryUrl, domainRegistrar, or hostingProvider is required." });
  }

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "customer.administer");
  if (deny) return deny;

  try {
    const profile = await updateWebsiteProfile(profileId, { primaryUrl, domainRegistrar, hostingProvider }, { ...deps, actorId: auth.session.userId });
    return json(200, { profile });
  } catch (err) {
    return json(400, { error: err.message });
  }
}
