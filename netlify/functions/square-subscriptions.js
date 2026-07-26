// square-subscriptions.js -- staff-facing side of the Square webhook
// integration (see netlify/functions/square-webhook.js for the inbound half).
//
// The webhook deliberately never creates an organization: when a deposit
// clears, the customer has paid us but has no Care Hub presence, and
// terms.html section 18 says the Care Hub is invitation-only. Every Square
// subscription therefore lands unlinked, and this endpoint is where a human
// turns "money arrived" into "org X is subscribed".
//
// Routes:
//   GET  /square-subscriptions?unlinked=true    -- the onboarding work queue
//                                                  (platform_admin, billing.reconcile)
//   GET  /square-subscriptions?organizationId=  -- Square links for one org
//                                                  (org members, subscription.view)
//   POST /square-subscriptions                  -- link a Square subscription to an
//                                                  org, creating the internal record
//                                                  (platform_admin, billing.reconcile)

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const {
  listUnlinkedSubscriptions,
  listLinksForOrganization,
  linkToOrganization,
} = require("../../src/db/squareSubscriptionLinkStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "GET") return handleList(event, deps);
  if (event.httpMethod === "POST") return handleLink(event, deps);
  return json(405, { error: "Method not allowed" });
};

async function handleList(event, deps) {
  const params = event.queryStringParameters || {};

  // The unlinked queue spans every tenant, so it's platform-admin only --
  // there is no single organization to scope it to.
  if (params.unlinked === "true") {
    const auth = await authenticatePlatformAction(event, deps);
    if (!auth.ok) return auth.response;
    const deny = denyResponseFor(auth.authContext, null, "billing.reconcile");
    if (deny) return deny;

    const links = await listUnlinkedSubscriptions(deps);
    return json(200, { links });
  }

  const organizationId = params.organizationId;
  if (!organizationId) return json(400, { error: "organizationId or unlinked=true is required." });

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;
  const deny = denyResponseFor(auth.authContext, organizationId, "subscription.view");
  if (deny) return deny;

  const links = await listLinksForOrganization(organizationId, deps);
  return json(200, { links });
}

async function handleLink(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { squareSubscriptionId, organizationId, planKey } = body;
  if (!squareSubscriptionId || !organizationId || !planKey) {
    return json(400, { error: "squareSubscriptionId, organizationId and planKey are required." });
  }

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;
  const deny = denyResponseFor(auth.authContext, null, "billing.reconcile");
  if (deny) return deny;

  try {
    const subscription = await linkToOrganization(
      { squareSubscriptionId, organizationId, planKey },
      { ...deps, actorId: auth.session.userId }
    );
    return json(201, { subscription });
  } catch (err) {
    // "already linked" / "no Square subscription" / "claimed by another
    // request" are all caller-correctable, not server faults.
    return json(400, { error: err.message });
  }
}
