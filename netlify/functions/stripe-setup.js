// stripe-setup.js -- one-time Stripe wiring, done from the admin dashboard
// instead of by hand in the Stripe dashboard.
//
// Why this exists. Creating the webhook endpoint by hand means getting several
// things right at once: the exact function URL, the exact event names,
// the test/live mode matching the secret key, and then copying the signing
// secret across without transcription errors. Every one of those is a silent
// failure -- the only symptom of any of them is an order stuck forever on
// "Waiting on payment", with a 401 buried in a Stripe log nobody thinks to
// open. So the key that is ALREADY in Netlify's environment does the work,
// and reports back what it did.
//
// Security shape, deliberately:
//   * Admin session required. Nothing here is reachable by a customer.
//   * The secret key is never read, returned, or logged. keyMode() reports
//     only "test" or "live" from the documented prefix.
//   * The signing secret IS returned, once, to the admin who asked for it --
//     it is the whole point, they have to paste it into Netlify, and this is
//     exactly what Stripe's own dashboard does behind a "Reveal" button.
//     It is never stored here.
//
// What this deliberately does NOT do: set the Netlify environment variable.
// That needs Netlify credentials, which are a different blast radius
// entirely, and an env var that this code could rewrite is an env var that a
// bug in this code could rewrite. Copying one value across is a fair trade.
//
// Routes (admin only):
//   GET  /stripe-setup                          what's configured, what isn't
//   POST /stripe-setup {action:"create-webhook"} create it, return the secret

const { readCookie, getSession, json, rateLimited } = require("./_lib/auth_utils");
const {
  listWebhookEndpoints, createWebhookEndpoint, deleteWebhookEndpoint,
  expireCheckoutSession,
} = require("./_lib/stripe_api");
const { resolveStripe } = require("./_lib/stripe_config");
const { getJSON, setJSON, store } = require("./_lib/blob_store");

// The events the handler actually implements. Kept here rather than duplicated
// as prose in a runbook, so the endpoint we create and the events we handle
// cannot drift apart.
const REQUIRED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
  "charge.dispute.created",
];

const WEBHOOK_PATH = "/.netlify/functions/stripe-webhook";

function siteOrigin(event) {
  const host = (event.headers && (event.headers["x-forwarded-host"] || event.headers.host)) || "lit-solutions.tech";
  const proto = (event.headers && event.headers["x-forwarded-proto"]) || "https";
  return `${proto}://${host}`;
}

/** Everything an endpoint could be wrong about, named individually. */
function assess(endpoint, wantUrl) {
  const events = endpoint.enabled_events || [];
  const coversAll = events.includes("*") || REQUIRED_EVENTS.every((e) => events.includes(e));
  return {
    id: endpoint.id,
    url: endpoint.url,
    status: endpoint.status,
    livemode: endpoint.livemode,
    urlMatches: endpoint.url === wantUrl,
    missingEvents: events.includes("*") ? [] : REQUIRED_EVENTS.filter((e) => !events.includes(e)),
    coversAll,
    healthy: endpoint.url === wantUrl && coversAll && endpoint.status === "enabled",
  };
}

exports.handler = async (event, context, deps = {}) => {
  const readCookieFn = deps.readCookie || readCookie;
  const getSessionFn = deps.getSession || getSession;
  const listFn = deps.listWebhookEndpoints || listWebhookEndpoints;
  const createFn = deps.createWebhookEndpoint || createWebhookEndpoint;
  const deleteFn = deps.deleteWebhookEndpoint || deleteWebhookEndpoint;
  const expireFn = deps.expireCheckoutSession || expireCheckoutSession;
  const getJSONFn = deps.getJSON || getJSON;
  const setJSONFn = deps.setJSON || setJSON;
  const storeFn = deps.store || store;
  const resolveFn = deps.resolveStripe || resolveStripe;

  const token = readCookieFn(event, "lts_session");
  const session = token ? await getSessionFn(token) : null;
  if (!session) return json(401, { error: "Sign in required." });
  if (session.role !== "admin") return json(403, { error: "Admin access required." });

  const wantUrl = `${siteOrigin(event)}${WEBHOOK_PATH}`;
  const cfg = resolveFn();
  const mode = cfg.mode;

  // No usable key: say which variable, in which mode, and stop. Everything
  // below this point talks to Stripe and would only produce a worse error.
  if (!cfg.ok) {
    return json(200, {
      keyMode: cfg.actualKeyMode === "missing" ? "missing" : "mismatch",
      mode,
      declaredMode: cfg.declaredMode,
      keyVar: cfg.keyVar,
      secretVar: cfg.secretVar,
      available: cfg.available,
      problems: cfg.problems,
      blocker: cfg.blocker,
      ready: false,
      webhookUrl: wantUrl,
      requiredEvents: REQUIRED_EVENTS,
      endpoints: [],
      advice: cfg.blocker ||
        `${cfg.keyVar} isn't set. Add it in Netlify under Site configuration -> Environment variables, ` +
        `then trigger a redeploy -- Netlify only picks up new variables on a build.`,
    });
  }

  /* ------------------------------------------------------------ inspect -- */
  if (event.httpMethod === "GET") {
    let endpoints = [];
    let listError = null;
    try {
      const res = await listFn();
      endpoints = (res.data || []).map((e) => assess(e, wantUrl));
    } catch (err) {
      listError = String(err.message || err).slice(0, 300);
    }

    const match = endpoints.find((e) => e.urlMatches) || null;

    // An endpoint in the other mode is invisible to this key -- Stripe scopes
    // webhook endpoints per mode -- so "no endpoint found" while a live one
    // exists is expected and shouldn't read as a broken setup.
    const modeMismatchedEndpoint = !!(match && match.livemode !== (mode === "live"));

    return json(200, {
      keyMode: mode,
      mode,
      declaredMode: cfg.declaredMode,
      keyVar: cfg.keyVar,
      secretVar: cfg.secretVar,
      available: cfg.available,
      problems: cfg.problems,
      webhookSecretSet: !!cfg.webhookSecret,
      modeMismatchedEndpoint,
      webhookUrl: wantUrl,
      requiredEvents: REQUIRED_EVENTS,
      endpoints,
      match,
      ready: !!(match && match.healthy) && !!cfg.webhookSecret,
      listError,
      // The mode mismatch is the single most common way this setup fails, and
      // it has no other visible symptom, so it gets its own field.
      advice: listError
        ? "Stripe rejected the key. If it was revoked or mistyped, replace STRIPE_SECRET_KEY in Netlify and redeploy."
        : match && match.healthy && !cfg.webhookSecret
          ? `The endpoint is correct, but ${cfg.secretVar} isn't set in Netlify, so every delivery will be rejected. Recreate below to get a fresh signing secret.`
        : match && match.healthy
          ? `A ${mode}-mode endpoint is wired up correctly. If deliveries still 401, ${cfg.secretVar} in Netlify belongs to a different endpoint.`
          : match
            ? "An endpoint exists at the right URL but isn't subscribed to everything we handle. Recreate it below."
            : `No endpoint points at this site yet. Creating one below will make it a ${mode}-mode endpoint, matching your key.`,
    });
  }

  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  if (await rateLimited("stripe-setup", session.userId, 10, 3600)) {
    return json(429, { error: "Too many attempts. Try again shortly." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid JSON" }); }

  /* ------------------------------------------------------------- create -- */
  if (body.action === "create-webhook") {
    if (mode === "live") {
      return json(403, {
        error: "Create the live webhook in Stripe Workbench. Live credentials should not have permission to create or delete webhook endpoints.",
      });
    }
    let existing = [];
    try {
      const res = await listFn();
      existing = (res.data || []).map((e) => assess(e, wantUrl));
    } catch (err) {
      return json(502, { error: `Stripe rejected the key: ${String(err.message || err).slice(0, 200)}` });
    }

    const already = existing.find((e) => e.urlMatches);
    if (already && already.healthy && !body.replace) {
      return json(200, {
        created: false,
        alreadyCorrect: true,
        endpoint: already,
        // Stripe only shows a signing secret at creation. Say so rather than
        // let them assume this screen can hand it back on demand.
        note: "This endpoint is already correct. Stripe only reveals a signing secret when an endpoint is " +
          "created, so if you don't have it, either copy it from the Stripe dashboard or replace the endpoint.",
      });
    }

    // Replacing beats editing: a wrong-mode or wrong-events endpoint has a
    // secret we may not hold anyway, and a fresh one gives us a secret we can
    // hand over in the same breath.
    if (already && body.replace) {
      try { await deleteFn(already.id); } catch { /* deleting is best-effort */ }
    }

    let created;
    try {
      created = await createFn({ url: wantUrl, enabledEvents: REQUIRED_EVENTS });
    } catch (err) {
      return json(502, { error: `Couldn't create the endpoint: ${String(err.message || err).slice(0, 200)}` });
    }

    return json(200, {
      created: true,
      keyMode: mode,
      secretVar: cfg.secretVar,
      endpointId: created.id,
      url: created.url,
      livemode: created.livemode,
      // Returned once, to the admin who asked, and stored nowhere.
      signingSecret: created.secret || null,
      nextSteps: [
        `Copy the signing secret below into Netlify as ${cfg.secretVar} (Site configuration -> Environment variables).`,
        `Trigger a redeploy -- Netlify only picks up a new variable on a build.`,
        `Run "npm run stripe:check". A 401 from the webhook is the correct answer: it means the secret is set and it rejected a bogus signature.`,
      ],
      warning: created.secret
        ? "This is the only time Stripe will show this secret. Copy it now."
        : "Stripe didn't return a signing secret. Reveal it on the endpoint's page in the Stripe dashboard.",
    });
  }

  /* ------------------------------------------------ emergency shutdown -- */
  if (body.action === "expire-open-sessions") {
    const listing = await storeFn("orders").list();
    const candidates = [];
    for (const blob of (listing.blobs || [])) {
      const order = await getJSONFn("orders", blob.key);
      if (!order || !order.stripeSessionId) continue;
      if (!["awaiting_payment", "payment_processing", "checkout_failed"].includes(order.status)) continue;
      candidates.push(order);
    }

    const expired = [];
    const failed = [];
    for (const order of candidates.slice(0, 100)) {
      try {
        await expireFn(order.stripeSessionId);
        order.status = "checkout_expired";
        order.stripeSessionExpiredAt = new Date().toISOString();
        order.updatedAt = order.stripeSessionExpiredAt;
        await setJSONFn("orders", order.id, order);
        expired.push(order.id);
      } catch (err) {
        failed.push({ orderId: order.id, reason: String(err.message || err).slice(0, 180) });
      }
    }
    return json(200, {
      inspected: candidates.length,
      expiredCount: expired.length,
      failedCount: failed.length,
      expiredOrderIds: expired,
      failures: failed,
      note: "New checkout must also remain disabled in Netlify; expiring sessions only closes links that were already issued.",
    });
  }

  return json(400, { error: "Unknown action." });
};

module.exports.REQUIRED_EVENTS = REQUIRED_EVENTS;
module.exports.WEBHOOK_PATH = WEBHOOK_PATH;
module.exports.assess = assess;
