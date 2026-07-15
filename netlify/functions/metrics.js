// metrics.js -- HTTP endpoint for F054 (Operational Analytics &
// Conversion Metrics). Thin adapter over src/db/metricsStore.js; all
// aggregation stays in the pure src/analytics/operationalMetrics.js.
// Genuinely cross-organization (an operational dashboard, not a
// per-customer view), same shape as work-queue.js -- platform_admin
// only, via the new metrics.view capability (deliberately unscoped).
//
// Routes:
//   GET /metrics?from=&to= -- aggregated counts by type and by day
//                             (platform_admin, metrics.view)

const { json } = require("./_lib/auth_utils");
const { authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const { getMetricsSummary } = require("../../src/db/metricsStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  const from = event.queryStringParameters && event.queryStringParameters.from;
  const to = event.queryStringParameters && event.queryStringParameters.to;
  if (!from || !to) return json(400, { error: "from and to are required." });

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "metrics.view");
  if (deny) return deny;

  const summary = await getMetricsSummary({ from, to }, deps);
  return json(200, { summary });
};
