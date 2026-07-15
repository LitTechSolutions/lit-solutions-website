// entitlements.js -- HTTP endpoint for F049 (Service Plan, Entitlement &
// Usage Tracking). Thin adapter over src/db/entitlementStore.js; the
// actual "does this fit the allowance" decision stays entirely in the
// pure src/policy/entitlementCheck.js, called from inside recordUsage().
//
// Routes:
//   POST /entitlements -- record usage against an org's plan allowance
//                          (platform_admin, billing.reconcile -- usage is
//                          logged by staff when work is performed, not
//                          self-reported by the customer)
//   GET  /entitlements?organizationId=&planKey=&usageKey= -- view current
//                          usage vs. the plan limit (all customer roles,
//                          entitlement.view)

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const { recordUsage, getEntitlementLimit, getConsumedForPeriod, resolvePeriodStart } = require("../../src/db/entitlementStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "POST") return handleRecordUsage(event, deps);
  if (event.httpMethod === "GET") return handleView(event, deps);
  return json(405, { error: "Method not allowed" });
};

async function handleRecordUsage(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { organizationId, planKey, usageKey, amount } = body;
  if (!organizationId || !planKey || !usageKey || typeof amount !== "number") {
    return json(400, { error: "organizationId, planKey, usageKey, and a numeric amount are required." });
  }

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "billing.reconcile");
  if (deny) return deny;

  try {
    const result = await recordUsage({ organizationId, planKey, usageKey, amount }, deps);
    return json(result.recorded ? 201 : 409, result);
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function handleView(event, deps) {
  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;
  const planKey = event.queryStringParameters && event.queryStringParameters.planKey;
  const usageKey = event.queryStringParameters && event.queryStringParameters.usageKey;
  if (!organizationId || !planKey || !usageKey) {
    return json(400, { error: "organizationId, planKey, and usageKey are required." });
  }

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, organizationId, "entitlement.view");
  if (deny) return deny;

  const limit = await getEntitlementLimit(planKey, usageKey, deps);
  if (!limit) return json(404, { error: "No entitlement limit configured for this plan/usage pair." });

  const now = deps.now || (() => new Date());
  const periodStart = resolvePeriodStart(limit.resetPeriod, now);
  const consumed = await getConsumedForPeriod(organizationId, planKey, usageKey, periodStart, deps);
  const remaining = limit.resetPeriod === "unlimited" ? null : Math.max(limit.limit - consumed, 0);

  return json(200, { limit, consumed, remaining, periodStart });
}
