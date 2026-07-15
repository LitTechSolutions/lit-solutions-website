// ticket-workflow.js -- HTTP endpoint for F020 (triage), F021
// (priority), and F022 (assignment) -- three related "record the
// outcome of an engine's decision against a ticket" concerns already
// persisted together in src/db/ticketWorkflowStore.js. This endpoint
// covers manual/supervisory re-triage, re-scoring, and re-assignment --
// initial triage/priority/assignment normally happens automatically as
// part of ticket submission, not through this endpoint. Dispatch actions
// like this are a platform_admin/supervisory concern, reusing the
// existing staff.administer capability rather than inventing a new one.
//
// Routes:
//   POST /ticket-workflow -- one of three actions selected by
//                             body.action ("triage" | "prioritize" | "assign")
//                             (platform_admin, staff.administer)

const { json } = require("./_lib/auth_utils");
const { authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const { recordTriageResult, recordPriorityAssessment, recordAssignment } = require("../../src/db/ticketWorkflowStore");
const { getTicketById } = require("../../src/db/ticketStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  if (!["triage", "prioritize", "assign"].includes(body.action)) {
    return json(400, { error: 'action must be one of "triage", "prioritize", "assign".' });
  }

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "staff.administer");
  if (deny) return deny;

  try {
    if (body.action === "triage") {
      const { ticketId, rules } = body;
      if (!ticketId || !rules) return json(400, { error: "ticketId and rules are required." });
      const ticket = await getTicketById(ticketId, deps);
      if (!ticket) return json(404, { error: "Ticket not found." });
      const result = await recordTriageResult(rules, ticket, auth.session.userId, deps);
      return json(201, { result });
    }
    if (body.action === "prioritize") {
      const { ticketId, inputs } = body;
      if (!ticketId || !inputs) return json(400, { error: "ticketId and inputs are required." });
      const ticket = await getTicketById(ticketId, deps);
      if (!ticket) return json(404, { error: "Ticket not found." });
      const assessment = await recordPriorityAssessment(ticketId, inputs, ticket.organizationId, auth.session.userId, deps);
      return json(201, { assessment });
    }
    const { ticketId, organizationId, candidates } = body;
    if (!ticketId || !organizationId || !candidates) {
      return json(400, { error: "ticketId, organizationId, and candidates are required." });
    }
    const assignment = await recordAssignment(candidates, organizationId, ticketId, auth.session.userId, deps);
    return json(201, { assignment });
  } catch (err) {
    return json(400, { error: err.message });
  }
};
