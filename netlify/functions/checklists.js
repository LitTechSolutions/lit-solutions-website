// checklists.js -- HTTP endpoint for F046 (Security Readiness) and F047
// (Account Protection & MFA Checklist), which already share one
// persistence module (checklistStore.js) and one scoring engine
// (src/policy/readinessChecklist.js).
//
// Routes:
//   POST /checklists -- create a checklist DEFINITION (global, not
//                        org-scoped -- platform_admin, platform.configure)
//   PATCH /checklists -- record an org's response to one checklist item
//                        (platform_admin, customer.administer -- staff
//                        assesses readiness, not customer self-report,
//                        per this session's documented assumption)
//   GET  /checklists?organizationId=&checklistDefinitionId= -- fetch the
//                        scored result (all customer roles, checklist.view)

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const { createChecklistDefinition, recordChecklistResponse, getChecklistScore } = require("../../src/db/checklistStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "POST") return handleCreateDefinition(event, deps);
  if (event.httpMethod === "PATCH") return handleRecordResponse(event, deps);
  if (event.httpMethod === "GET") return handleScore(event, deps);
  return json(405, { error: "Method not allowed" });
};

async function handleCreateDefinition(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { title, items } = body;
  if (!title || !items) return json(400, { error: "title and items are required." });

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "platform.configure");
  if (deny) return deny;

  try {
    const definition = await createChecklistDefinition({ title, items }, deps);
    return json(201, { definition });
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function handleRecordResponse(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { organizationId, checklistDefinitionId, itemKey, met } = body;
  if (!organizationId || !checklistDefinitionId || !itemKey || typeof met !== "boolean") {
    return json(400, { error: "organizationId, checklistDefinitionId, itemKey, and a boolean met are required." });
  }

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "customer.administer");
  if (deny) return deny;

  try {
    await recordChecklistResponse(organizationId, checklistDefinitionId, { itemKey, met }, deps);
    return json(200, { message: "Response recorded." });
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function handleScore(event, deps) {
  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;
  const checklistDefinitionId = event.queryStringParameters && event.queryStringParameters.checklistDefinitionId;
  if (!organizationId || !checklistDefinitionId) {
    return json(400, { error: "organizationId and checklistDefinitionId are required." });
  }

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, organizationId, "checklist.view");
  if (deny) return deny;

  try {
    const score = await getChecklistScore(organizationId, checklistDefinitionId, deps);
    return json(200, { score });
  } catch (err) {
    return json(404, { error: err.message });
  }
}
