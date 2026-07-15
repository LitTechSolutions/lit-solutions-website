// work-log.js -- HTTP endpoint for F025 (Internal Notes, Time & Cost
// Tracking -- time/notes half, no dollar amounts anywhere here either).
// Thin adapter over src/db/workLogStore.js. Reuses the existing
// worklog.write and note.internal.write technician capabilities --
// both already existed and already fit exactly.
//
// Routes:
//   POST /work-log -- record a time entry OR an internal note, selected
//                      by body.kind ("time" | "note") (technician,
//                      worklog.write / note.internal.write, requires
//                      being assigned to the ticket)
//   GET  /work-log?ticketId= -- total minutes logged for a ticket
//                      (technician only, worklog.write, assigned)

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, denyResponseFor } = require("./_lib/care_hub_auth");
const { recordTimeEntry, recordInternalNote, getTotalMinutesForTicket } = require("../../src/db/workLogStore");
const { getAssignedTechnician } = require("../../src/db/ticketWorkflowStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "POST") return handleCreate(event, deps);
  if (event.httpMethod === "GET") return handleTotal(event, deps);
  return json(405, { error: "Method not allowed" });
};

async function assignedFact(authContext, ticketId, session, deps) {
  if (authContext.actorRole !== "technician") return undefined;
  const assignedTechnicianId = await getAssignedTechnician(ticketId, deps);
  return assignedTechnicianId !== null && assignedTechnicianId === session.userId;
}

async function handleCreate(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { kind, organizationId, ticketId } = body;
  if (!organizationId || !ticketId || !["time", "note"].includes(kind)) {
    return json(400, { error: 'organizationId, ticketId, and kind ("time" or "note") are required.' });
  }

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const assigned = await assignedFact(auth.authContext, ticketId, auth.session, deps);

  if (kind === "time") {
    const { minutes, note } = body;
    if (typeof minutes !== "number") return json(400, { error: "minutes is required for a time entry." });
    const deny = denyResponseFor(auth.authContext, organizationId, "worklog.write", { assigned });
    if (deny) return deny;
    try {
      const entry = await recordTimeEntry({ ticketId, technicianUserId: auth.session.userId, minutes, note }, deps);
      return json(201, { entry });
    } catch (err) {
      return json(400, { error: err.message });
    }
  }

  const { body: noteBody } = body;
  if (!noteBody) return json(400, { error: "body is required for an internal note." });
  const deny = denyResponseFor(auth.authContext, organizationId, "note.internal.write", { assigned });
  if (deny) return deny;
  try {
    const note = await recordInternalNote({ ticketId, authorUserId: auth.session.userId, body: noteBody }, deps);
    return json(201, { note });
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function handleTotal(event, deps) {
  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;
  const ticketId = event.queryStringParameters && event.queryStringParameters.ticketId;
  if (!organizationId || !ticketId) return json(400, { error: "organizationId and ticketId are required." });

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const assigned = await assignedFact(auth.authContext, ticketId, auth.session, deps);
  const deny = denyResponseFor(auth.authContext, organizationId, "worklog.write", { assigned });
  if (deny) return deny;

  const totalMinutes = await getTotalMinutesForTicket(ticketId, deps);
  return json(200, { ticketId, totalMinutes });
}
