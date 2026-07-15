// checklists.js -- HTTP endpoint for F046 (Security Readiness) and F047
// (Account Protection & MFA Checklist), which already share one
// persistence module (checklistStore.js) and one scoring engine
// (src/policy/readinessChecklist.js).
//
// Session 20 owner decision #3: customer/staff data split. Customers can
// answer/comment on their own org's customer-facing items and submit
// for review; staff assess any item, verify, or return for changes.
// GET's response shape depends on WHO is asking -- a customer role gets
// getChecklistForCustomer()'s shielded view (customer-audience items
// only, no staffNote/staffVerified), platform_admin gets
// getChecklistForStaff()'s full view. This endpoint never decides what
// a customer may see -- that filtering lives in checklistStore.js so
// there's exactly one place a leak could happen, not one per caller.
//
// Routes:
//   POST  /checklists -- create a checklist DEFINITION (global, not
//                         org-scoped -- platform_admin, platform.configure)
//   GET   /checklists?organizationId=&checklistDefinitionId= -- fetch the
//                         checklist. platform_admin (customer.administer)
//                         gets the full staff view; org_owner/org_member/
//                         read_only_customer (checklist.view) get the
//                         customer-shielded view. Omit checklistDefinitionId
//                         to list all checklist definitions instead
//                         ({ definitions: [{id, title}] }) -- definitions
//                         are global config, this is just a discovery
//                         list, same auth as the single-checklist fetch.
//   PATCH /checklists -- one of four actions selected by body.action:
//     "customerAnswer" -- { organizationId, checklistDefinitionId, itemKey, met, comment? }
//                          (org_owner/org_member, checklist.answer)
//     "submit"          -- { organizationId, checklistDefinitionId }
//                          "Submitted for review." (org_owner/org_member, checklist.answer)
//     "staffAssess"     -- { organizationId, checklistDefinitionId, itemKey, met?, staffNote?, staffVerified }
//                          (platform_admin, customer.administer)
//     "review"          -- { organizationId, checklistDefinitionId, reviewAction: "return"|"verify", reviewNote? }
//                          (platform_admin, customer.administer)

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const {
  createChecklistDefinition,
  listChecklistDefinitions,
  recordCustomerAnswer,
  recordStaffAssessment,
  submitChecklistForReview,
  reviewChecklistSubmission,
  getChecklistForCustomer,
  getChecklistForStaff,
} = require("../../src/db/checklistStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "POST") return handleCreateDefinition(event, deps);
  if (event.httpMethod === "PATCH") return handlePatch(event, deps);
  if (event.httpMethod === "GET") return handleGet(event, deps);
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

async function handleGet(event, deps) {
  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;
  const checklistDefinitionId = event.queryStringParameters && event.queryStringParameters.checklistDefinitionId;
  if (!organizationId) {
    return json(400, { error: "organizationId is required." });
  }

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  // No checklistDefinitionId -- list mode. Checklist definitions are
  // global config (not org-scoped), so this doesn't fetch anything
  // org-specific, but still requires a real signed-in org membership
  // (organizationId + checklist.view/customer.administer) to reach --
  // there is no reason to expose "what checklists exist" to a caller
  // who isn't otherwise a legitimate Care Hub user.
  if (!checklistDefinitionId) {
    const isStaffList = auth.authContext.actorRole === "platform_admin";
    const listDeny = denyResponseFor(auth.authContext, organizationId, isStaffList ? "customer.administer" : "checklist.view");
    if (listDeny) return listDeny;
    const definitions = await listChecklistDefinitions(deps);
    return json(200, { definitions });
  }

  const isStaff = auth.authContext.actorRole === "platform_admin";
  const deny = denyResponseFor(auth.authContext, organizationId, isStaff ? "customer.administer" : "checklist.view");
  if (deny) return deny;

  try {
    if (isStaff) {
      const result = await getChecklistForStaff(organizationId, checklistDefinitionId, deps);
      return json(200, result);
    }
    const result = await getChecklistForCustomer(organizationId, checklistDefinitionId, deps);
    return json(200, result);
  } catch (err) {
    return json(404, { error: err.message });
  }
}

async function handlePatch(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  if (!["customerAnswer", "submit", "staffAssess", "review"].includes(body.action)) {
    return json(400, { error: 'action must be one of "customerAnswer", "submit", "staffAssess", "review".' });
  }

  const { organizationId, checklistDefinitionId } = body;
  if (!organizationId || !checklistDefinitionId) {
    return json(400, { error: "organizationId and checklistDefinitionId are required." });
  }

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const isStaffAction = body.action === "staffAssess" || body.action === "review";
  const deny = denyResponseFor(auth.authContext, organizationId, isStaffAction ? "customer.administer" : "checklist.answer");
  if (deny) return deny;

  try {
    if (body.action === "customerAnswer") {
      const { itemKey, met, comment } = body;
      if (!itemKey || typeof met !== "boolean") return json(400, { error: "itemKey and a boolean met are required." });
      await recordCustomerAnswer(organizationId, checklistDefinitionId, auth.session.userId, { itemKey, met, comment }, deps);
      return json(200, { message: "Answer recorded." });
    }

    if (body.action === "submit") {
      const submission = await submitChecklistForReview(organizationId, checklistDefinitionId, auth.session.userId, deps);
      return json(200, { message: "Submitted for review.", submission });
    }

    if (body.action === "staffAssess") {
      const { itemKey, met, staffNote, staffVerified } = body;
      if (!itemKey || typeof staffVerified !== "boolean") return json(400, { error: "itemKey and a boolean staffVerified are required." });
      await recordStaffAssessment(organizationId, checklistDefinitionId, auth.session.userId, { itemKey, met, staffNote, staffVerified }, deps);
      return json(200, { message: "Assessment recorded." });
    }

    // "review"
    const { reviewAction, reviewNote } = body;
    if (!["return", "verify"].includes(reviewAction)) return json(400, { error: 'review requires reviewAction: "return" or "verify".' });
    const submission = await reviewChecklistSubmission(organizationId, checklistDefinitionId, auth.session.userId, { action: reviewAction, reviewNote }, deps);
    return json(200, { message: reviewAction === "return" ? "Returned for changes." : "Verified.", submission });
  } catch (err) {
    return json(400, { error: err.message });
  }
}
