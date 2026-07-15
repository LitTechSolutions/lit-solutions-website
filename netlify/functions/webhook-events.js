// webhook-events.js -- HTTP endpoint for F057 (Integrations, Webhooks &
// API Connectivity). Thin adapter over src/db/webhookEventStore.js.
// verifyAndLogWebhook() is meant to be called by a real provider's
// inbound webhook (not built yet -- no real provider is integrated, per
// Session 0's discovery), so it isn't exposed here; this endpoint is the
// admin-facing READ side -- reviewing the verification log, which
// reuses the existing audit.review capability (a webhook verification
// log is exactly the kind of security-adjacent event trail audit.review
// already covers).
//
// Routes:
//   GET /webhook-events?provider= -- list recent verification attempts
//                                     for a provider (platform_admin, audit.review)

const { json } = require("./_lib/auth_utils");
const { authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const { listRecentWebhookEvents } = require("../../src/db/webhookEventStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  const provider = event.queryStringParameters && event.queryStringParameters.provider;
  if (!provider) return json(400, { error: "provider is required." });

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "audit.review");
  if (deny) return deny;

  const events = await listRecentWebhookEvents(provider, deps);
  return json(200, { events });
};
