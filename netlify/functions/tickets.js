// tickets.js -- HTTP endpoint for F019 (ticket submission) and F023/F029
// (ticket lifecycle). Thin adapter over src/db/ticketStore.js: every
// validation and transition decision still happens in
// src/policy/ticketSubmission.js and src/policy/ticketLifecycle.js, this
// file's only job is authenticating the caller, authorizing the specific
// action via care_hub_auth.js, and translating HTTP <-> the store's
// existing shape.
//
// Routes (method-dispatched on this single function, matching the
// existing single-file-per-resource convention used by messages.js,
// documents.js, etc.):
//   POST   /tickets           -- create a ticket (customer: request.submit)
//   GET    /tickets?organizationId=... -- list tickets for an org
//                                          (customer: request.view, staff: ticket.view)
//   PATCH  /tickets           -- transition a ticket's status
//                                 (staff only: ticket.work, requires assignment)
//
// Netlify always calls exports.handler with (event, context) -- the
// optional third `deps` argument is never supplied in production and
// every handler below defaults it to {}, so this is purely a test seam
// (same override pattern as every src/db/* store), not a behavior
// change. It's what makes this endpoint unit-testable against the real
// live database without needing live Netlify Blobs infrastructure for
// the session layer.

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, denyResponseFor } = require("./_lib/care_hub_auth");
const { createTicket, listTicketsForOrganization, transitionTicket } = require("../../src/db/ticketStore");
const { getAssignedTechnician } = require("../../src/db/ticketWorkflowStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "POST") return handleCreate(event, deps);
  if (event.httpMethod === "GET") return handleList(event, deps);
  if (event.httpMethod === "PATCH") return handleTransition(event, deps);
  return json(405, { error: "Method not allowed" });
};

async function handleCreate(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }

  const auth = await authenticateForOrg(event, body.organizationId, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, body.organizationId, "request.submit");
  if (deny) return deny;

  try {
    const ticket = await createTicket({ ...body, submittedBy: auth.session.userId }, deps);
    return json(201, { ticket });
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function handleList(event, deps) {
  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  // "ticket.view" is org-scoped-per-resource for technician (rbac.js
  // requires `assigned: true` for THIS ticket, not "list everything in
  // an org") -- there's no real assignment fact for a list of many
  // tickets, so this endpoint honestly cannot authorize a technician's
  // list request; it isn't the right tool for staff-wide visibility.
  // src/admin/workQueueViewModel.js (F051) already exists for that and
  // just needs its own endpoint -- not built yet, tracked as follow-up.
  const action = auth.authContext.actorRole === "technician" ? "ticket.view" : "request.view";
  const deny = denyResponseFor(auth.authContext, organizationId, action, { assigned: false });
  if (deny) return deny;

  const tickets = await listTicketsForOrganization(organizationId, deps);
  return json(200, { tickets });
}

async function handleTransition(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { ticketId, organizationId, nextStatus } = body;
  if (!ticketId || !nextStatus) {
    return json(400, { error: "ticketId and nextStatus are required." });
  }

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const assignedTechnicianId = auth.authContext.actorRole === "technician" ? await getAssignedTechnician(ticketId, deps) : null;
  const assigned = auth.authContext.actorRole === "technician" ? assignedTechnicianId === auth.session.userId : undefined;

  const deny = denyResponseFor(auth.authContext, organizationId, "ticket.work", { assigned });
  if (deny) return deny;

  try {
    const ticket = await transitionTicket(ticketId, nextStatus, deps);
    return json(200, { ticket });
  } catch (err) {
    return json(400, { error: err.message });
  }
}
