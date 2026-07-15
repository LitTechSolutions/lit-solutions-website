// subscriptions.js -- HTTP endpoint for F052 (Subscription & Billing
// Plan Management). Thin adapter over src/db/subscriptionStore.js; the
// lifecycle state machine stays in src/policy/subscriptionLifecycle.js.
//
// Routes:
//   POST  /subscriptions -- start a subscription (platform_admin, billing.reconcile)
//   GET   /subscriptions?organizationId= -- list an org's subscriptions
//                                            (all customer roles, subscription.view)
//   PATCH /subscriptions -- transition status: active/paused/cancelled
//                            (platform_admin, billing.reconcile)

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const { createSubscription, listSubscriptionsForOrganization, applySubscriptionStatusTransition } = require("../../src/db/subscriptionStore");

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
  const { organizationId, planKey } = body;
  if (!organizationId || !planKey) return json(400, { error: "organizationId and planKey are required." });

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "billing.reconcile");
  if (deny) return deny;

  try {
    const subscription = await createSubscription({ organizationId, planKey }, { ...deps, actorId: auth.session.userId });
    return json(201, { subscription });
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function handleList(event, deps) {
  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;
  if (!organizationId) return json(400, { error: "organizationId is required." });

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, organizationId, "subscription.view");
  if (deny) return deny;

  const subscriptions = await listSubscriptionsForOrganization(organizationId, deps);
  return json(200, { subscriptions });
}

async function handleTransition(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { subscriptionId, nextStatus } = body;
  if (!subscriptionId || !nextStatus) return json(400, { error: "subscriptionId and nextStatus are required." });

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "billing.reconcile");
  if (deny) return deny;

  try {
    const subscription = await applySubscriptionStatusTransition(subscriptionId, nextStatus, { ...deps, actorId: auth.session.userId });
    return json(200, { subscription });
  } catch (err) {
    return json(400, { error: err.message });
  }
}
