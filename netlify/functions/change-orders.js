// change-orders.js -- HTTP endpoint for F027 (Change Order Approval &
// Rejection), authoring half. Deciding a change order (approve/reject)
// already happens through approvals.js (Session 16), since
// changeOrderStore.createChangeOrder() pairs every change order with a
// real ApprovalRequest -- this endpoint only creates and reads the
// change order record itself.
//
// Routes:
//   POST /change-orders -- create a change order against an existing
//                           scope (technician, change_order.create,
//                           requires being assigned to the scope's ticket)
//   GET  /change-orders?organizationId=&changeOrderId= -- fetch one
//        /change-orders?organizationId= -- list all for an org
//        (org_owner/org_member/read_only_customer/technician, change_order.view)

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, denyResponseFor } = require("./_lib/care_hub_auth");
const { createChangeOrder, getChangeOrderById, listChangeOrdersForOrganization } = require("../../src/db/changeOrderStore");
const { getScopeById } = require("../../src/db/scopeOfWorkStore");
const { getAssignedTechnician } = require("../../src/db/ticketWorkflowStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "POST") return handleCreate(event, deps);
  if (event.httpMethod === "GET") return handleGet(event, deps);
  return json(405, { error: "Method not allowed" });
};

async function handleCreate(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { organizationId, originalScopeId, description, addedLineItems } = body;
  if (!organizationId || !originalScopeId || !description || !addedLineItems) {
    return json(400, { error: "organizationId, originalScopeId, description, and addedLineItems are required." });
  }

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const scope = await getScopeById(originalScopeId, deps);
  if (!scope) return json(404, { error: "Original scope of work not found." });

  let assigned;
  if (auth.authContext.actorRole === "technician") {
    const assignedTechnicianId = await getAssignedTechnician(scope.ticketId, deps);
    assigned = assignedTechnicianId !== null && assignedTechnicianId === auth.session.userId;
  }
  const deny = denyResponseFor(auth.authContext, organizationId, "change_order.create", { assigned });
  if (deny) return deny;

  try {
    const { changeOrder, approval } = await createChangeOrder({ organizationId, originalScopeId, description, addedLineItems, createdBy: auth.session.userId }, { ...deps, actorId: auth.session.userId });
    return json(201, { changeOrder, approval });
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function handleGet(event, deps) {
  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;
  const changeOrderId = event.queryStringParameters && event.queryStringParameters.changeOrderId;
  if (!organizationId) return json(400, { error: "organizationId is required." });

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  // No `assigned` fact is passed here -- same honest limitation as
  // tickets.js's GET (Session 15): a technician's org-scope check is
  // always per-resource, so this endpoint cannot authorize a technician
  // for a single-changeOrderId fetch either without first resolving
  // that change order's scope/ticket. Customer roles are unaffected.
  const deny = denyResponseFor(auth.authContext, organizationId, "change_order.view");
  if (deny) return deny;

  if (changeOrderId) {
    const changeOrder = await getChangeOrderById(changeOrderId, organizationId, deps);
    if (!changeOrder) return json(404, { error: "Change order not found." });
    return json(200, { changeOrder });
  }

  const changeOrders = await listChangeOrdersForOrganization(organizationId, deps);
  return json(200, { changeOrders });
}
