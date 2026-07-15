// organizations.js -- HTTP endpoint for F001 (Customer Organization
// Provisioning). Thin adapter over src/db/organizationStore.js; every
// validation decision still happens in src/domain/organization.js.
//
// Routes:
//   POST   /organizations           -- create an organization
//                                       (platform_admin only, organization.create --
//                                       no owning org exists yet, so this uses
//                                       authenticatePlatformAction(), not authenticateForOrg())
//   GET    /organizations?organizationId=... -- view an organization
//                                       (platform_admin or org_owner, organization.view)
//   PATCH  /organizations           -- change status (platform_admin only,
//                                       organization.suspend covers any status change)
//
// See care_hub_auth.js's module comment for why organization.create is
// the one action that can't go through authenticateForOrg() -- there is
// no organizationId to authenticate against until the org already exists.

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const { createOrganization, getOrganizationById, updateOrganizationStatus } = require("../../src/db/organizationStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "POST") return handleCreate(event, deps);
  if (event.httpMethod === "GET") return handleGet(event, deps);
  if (event.httpMethod === "PATCH") return handleStatusChange(event, deps);
  return json(405, { error: "Method not allowed" });
};

async function handleCreate(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "organization.create");
  if (deny) return deny;

  try {
    const organization = await createOrganization({ ...body, createdBy: auth.session.userId }, deps);
    return json(201, { organization });
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function handleGet(event, deps) {
  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, organizationId, "organization.view");
  if (deny) return deny;

  const organization = await getOrganizationById(organizationId, deps);
  if (!organization) return json(404, { error: "Organization not found." });
  return json(200, { organization });
}

async function handleStatusChange(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { organizationId, status } = body;
  if (!status) return json(400, { error: "status is required." });

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, organizationId, "organization.suspend");
  if (deny) return deny;

  try {
    await updateOrganizationStatus(organizationId, status, deps);
    const organization = await getOrganizationById(organizationId, deps);
    return json(200, { organization });
  } catch (err) {
    return json(400, { error: err.message });
  }
}
