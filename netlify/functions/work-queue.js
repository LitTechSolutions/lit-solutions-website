// work-queue.js -- HTTP endpoint for F051 (Admin Operations Dashboard &
// Work Queue). Thin adapter over src/db/workQueueQuery.js's
// fetchWorkQueue(), which is the one legitimate cross-organization query
// in this codebase.
//
// This is also the follow-up promised in Session 15's tickets.js: that
// endpoint's GET correctly refuses to authorize a technician's request to
// "list every ticket in an org" (rbac.js's technician ticket.view/
// ticket.work is always per-RESOURCE -- an `assigned` fact, never an
// unscoped capability; see rbac.test.js's regression guard requiring
// every technician capability to be in ORG_SCOPED_ACTIONS). Rather than
// fabricate an `assigned: true` this endpoint can't back up, F051's
// aggregate dashboard got its own honest rbac.js action --
// "workqueue.view" -- granted only to platform_admin and deliberately
// NOT in ORG_SCOPED_ACTIONS, since there is no single owning
// organization for a cross-org summary. This is a genuinely different
// capability from day-to-day ticket work, not a workaround.
//
// Routes:
//   GET /work-queue -- platform_admin only (legacy "admin" session role,
//                        workqueue.view). No query parameters; genuinely
//                        spans every organization by design.

const { json } = require("./_lib/auth_utils");
const { authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const { fetchWorkQueue } = require("../../src/db/workQueueQuery");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "workqueue.view");
  if (deny) return deny;

  const workQueue = await fetchWorkQueue(deps);
  return json(200, { workQueue });
};
