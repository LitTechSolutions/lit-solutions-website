// scope-of-work.js -- HTTP endpoint for F026 (Scope of Work & Estimate
// Generation). Thin adapter over src/db/scopeOfWorkStore.js; every
// versioning decision still happens in src/policy/scopeVersioning.js.
//
// Routes:
//   POST  /scope-of-work -- create the initial (version 1) scope for a
//                            ticket (technician, scope.create, requires
//                            being assigned to that ticket)
//   GET   /scope-of-work?organizationId=&ticketId= -- list all versions
//                            for a ticket (org_owner/org_member/
//                            read_only_customer/technician, scope.view)
//   PATCH /scope-of-work -- create the next version of an existing scope
//                            (technician, scope.create, same assignment
//                            gate as create)

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, denyResponseFor } = require("./_lib/care_hub_auth");
const { createInitialScope, getScopeById, createNextScopeVersion, listScopeVersionsForTicket } = require("../../src/db/scopeOfWorkStore");
const { getAssignedTechnician } = require("../../src/db/ticketWorkflowStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "POST") return handleCreate(event, deps);
  if (event.httpMethod === "GET") return handleList(event, deps);
  if (event.httpMethod === "PATCH") return handleNextVersion(event, deps);
  return json(405, { error: "Method not allowed" });
};

async function technicianAssignedCheck(authContext, ticketId, deps) {
  if (authContext.actorRole !== "technician") return undefined;
  const assignedTechnicianId = await getAssignedTechnician(ticketId, deps);
  return assignedTechnicianId !== null && assignedTechnicianId === deps.__sessionUserId;
}

async function handleCreate(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { organizationId, ticketId, assumptions, exclusions, lineItems } = body;
  if (!organizationId || !ticketId || !lineItems) {
    return json(400, { error: "organizationId, ticketId, and lineItems are required." });
  }

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const assigned = await technicianAssignedCheck(auth.authContext, ticketId, { ...deps, __sessionUserId: auth.session.userId });
  const deny = denyResponseFor(auth.authContext, organizationId, "scope.create", { assigned });
  if (deny) return deny;

  try {
    const scope = await createInitialScope({ organizationId, ticketId, assumptions, exclusions, lineItems, createdBy: auth.session.userId }, deps);
    return json(201, { scope });
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function handleList(event, deps) {
  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;
  const ticketId = event.queryStringParameters && event.queryStringParameters.ticketId;
  if (!ticketId) return json(400, { error: "ticketId is required." });

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const assigned = await technicianAssignedCheck(auth.authContext, ticketId, { ...deps, __sessionUserId: auth.session.userId });
  const deny = denyResponseFor(auth.authContext, organizationId, "scope.view", { assigned });
  if (deny) return deny;

  const versions = await listScopeVersionsForTicket(ticketId, deps);
  return json(200, { versions });
}

async function handleNextVersion(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { scopeId, organizationId } = body;
  if (!scopeId || !organizationId) {
    return json(400, { error: "scopeId and organizationId are required." });
  }

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const current = await getScopeById(scopeId, deps);
  if (!current) return json(404, { error: "Scope of work not found." });

  const assigned = await technicianAssignedCheck(auth.authContext, current.ticketId, { ...deps, __sessionUserId: auth.session.userId });
  const deny = denyResponseFor(auth.authContext, organizationId, "scope.create", { assigned });
  if (deny) return deny;

  try {
    const next = await createNextScopeVersion(scopeId, { assumptions: body.assumptions, exclusions: body.exclusions, lineItems: body.lineItems }, deps);
    return json(200, { scope: next });
  } catch (err) {
    return json(400, { error: err.message });
  }
}
