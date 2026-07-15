// activity-timeline.js -- HTTP endpoint for F017 (Unified Activity
// Timeline). Thin adapter: fetches one organization's raw event stream
// from src/db/activityEventStore.js, then runs it through the existing
// pure src/timeline/activityTimeline.js buildTimeline() -- which is what
// actually decides customer-visibility filtering, sorting, and the
// bounded page size (SYS-API-005). This endpoint decides nothing about
// timeline content itself.
//
// Routes:
//   GET /activity-timeline?organizationId=&limit= -- all three customer
//                           roles, history.view (extended from
//                           read_only_customer-only to all three this
//                           session -- see rbac.js's Session 19 note).
//                           Technician/platform_admin do NOT have
//                           history.view -- staff already have F051's
//                           work-queue.js for cross-ticket visibility;
//                           this is deliberately a customer-facing view.

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, denyResponseFor } = require("./_lib/care_hub_auth");
const { listActivityEventsForOrganization } = require("../../src/db/activityEventStore");
const { buildTimeline } = require("../../src/timeline/activityTimeline");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;
  if (!organizationId) return json(400, { error: "organizationId is required." });

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, organizationId, "history.view");
  if (deny) return deny;

  const rawLimit = event.queryStringParameters && event.queryStringParameters.limit;
  const limit = rawLimit ? Number(rawLimit) : undefined;

  const events = await listActivityEventsForOrganization(organizationId, deps);
  const timeline = buildTimeline([events], { organizationId, viewerRole: auth.authContext.actorRole, limit });
  return json(200, { timeline });
};
