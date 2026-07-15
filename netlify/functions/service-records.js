// service-records.js -- HTTP endpoint for F010 (Service & Project Record
// Management). Thin adapter over src/db/serviceRecordStore.js.
// Service records are staff-provisioned (a new engagement is opened by
// admin, not self-served by a customer), reusing the existing
// customer.administer capability rather than inventing a new one.
//
// Routes:
//   POST  /service-records -- create a record (platform_admin, customer.administer)
//   GET   /service-records?organizationId= -- list records (all customer
//                                              roles, service_record.view)
//   PATCH /service-records -- update status (platform_admin, customer.administer)

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const { createServiceRecord, listServiceRecordsForOrganization, updateServiceRecordStatus } = require("../../src/db/serviceRecordStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "POST") return handleCreate(event, deps);
  if (event.httpMethod === "GET") return handleList(event, deps);
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
  const { organizationId, category, title } = body;
  if (!organizationId || !category || !title) {
    return json(400, { error: "organizationId, category, and title are required." });
  }

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "customer.administer");
  if (deny) return deny;

  try {
    const record = await createServiceRecord({ organizationId, category, title, createdBy: auth.session.userId }, { ...deps, actorId: auth.session.userId });
    return json(201, { record });
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function handleList(event, deps) {
  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;
  if (!organizationId) return json(400, { error: "organizationId is required." });

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, organizationId, "service_record.view");
  if (deny) return deny;

  const records = await listServiceRecordsForOrganization(organizationId, deps);
  return json(200, { records });
}

async function handleStatusChange(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { recordId, status } = body;
  if (!recordId || !status) return json(400, { error: "recordId and status are required." });

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "customer.administer");
  if (deny) return deny;

  try {
    await updateServiceRecordStatus(recordId, status, { ...deps, actorId: auth.session.userId });
    return json(200, { message: "Status updated." });
  } catch (err) {
    return json(400, { error: err.message });
  }
}
