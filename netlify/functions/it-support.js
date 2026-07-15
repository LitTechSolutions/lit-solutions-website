// it-support.js -- HTTP endpoint for F044 (IT Support Request &
// Remote/On-Site Classification). Thin adapter over
// src/db/itSupportStore.js; the classification decision itself stays in
// src/policy/itSupportClassification.js.
//
// Routes:
//   POST /it-support -- classify a ticket's handling (remote/on-site/
//                        escalate) (technician, ticket.work, requires
//                        being assigned to the ticket -- same gate as
//                        tickets.js's PATCH)

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, denyResponseFor } = require("./_lib/care_hub_auth");
const { recordItSupportClassification } = require("../../src/db/itSupportStore");
const { getAssignedTechnician } = require("../../src/db/ticketWorkflowStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { organizationId, ticketId, requiresPhysicalAccess, safetyRisk } = body;
  if (!organizationId || !ticketId || typeof requiresPhysicalAccess !== "boolean" || typeof safetyRisk !== "boolean") {
    return json(400, { error: "organizationId, ticketId, requiresPhysicalAccess, and safetyRisk are required." });
  }

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const assignedTechnicianId = auth.authContext.actorRole === "technician" ? await getAssignedTechnician(ticketId, deps) : null;
  const assigned = auth.authContext.actorRole === "technician" ? assignedTechnicianId === auth.session.userId : undefined;

  const deny = denyResponseFor(auth.authContext, organizationId, "ticket.work", { assigned });
  if (deny) return deny;

  try {
    const result = await recordItSupportClassification(ticketId, { requiresPhysicalAccess, safetyRisk }, { ...deps, actorId: auth.session.userId });
    return json(201, { classification: result });
  } catch (err) {
    return json(400, { error: err.message });
  }
};
