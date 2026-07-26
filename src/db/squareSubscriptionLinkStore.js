// Square subscription webhook consumption.
//
// Square is the source of truth for whether a website subscription is being
// paid for; this module is the bridge between its events and the Care Hub's
// own subscription lifecycle.
//
// The deliberate design decision here: a webhook NEVER creates an
// organization. When the deposit clears, the customer has paid us money and
// has no Care Hub presence at all -- no name we trust, no verified identity,
// and terms.html section 18 states the Care Hub is invitation-only. Minting an
// org from webhook data would produce a junk tenant for every test payment and
// skip onboarding entirely.
//
// So every Square subscription lands in square_subscription_links immediately,
// unlinked, and appears on a staff work queue. Linking it to an organization
// is a human step, and only at that point does an internal `subscriptions`
// record exist and the existing state machine take over.
//
// Idempotency matters more here than in most stores: Square retries until it
// receives a 2xx, and (unlike Stripe) its signature covers no timestamp, so
// event-id deduplication is the only replay defence available.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { createSubscription, applySubscriptionStatusTransition, getSubscriptionById } = require("./subscriptionStore");
const { createAuditRecorder } = require("../audit/auditLog");
const { createPgAuditSink } = require("./pgAuditSink");

// Square's subscription statuses -> our three-state lifecycle.
// DEACTIVATED is Square's "we stopped billing it" state, which for our
// purposes is a pause, not a cancellation: cancelled is terminal in
// src/policy/subscriptionLifecycle.js and cannot be reactivated in place, so
// mapping a recoverable state onto it would strand the record.
const STATUS_MAP = {
  ACTIVE: "active",
  PENDING: "active",
  PAUSED: "paused",
  DEACTIVATED: "paused",
  CANCELED: "cancelled",
  CANCELLED: "cancelled",
};

function mapSquareStatus(squareStatus) {
  if (typeof squareStatus !== "string") return null;
  return STATUS_MAP[squareStatus.toUpperCase()] || null;
}

function resolveAuditRecorder(deps) {
  return deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));
}

/**
 * Extracts the bits we care about from a Square webhook envelope. Square nests
 * the interesting object under data.object.<type>, and the shape varies by
 * event, so this normalises rather than letting every caller dig.
 *
 * @param {object} body - Parsed Square webhook body.
 * @returns {{ eventId: string|null, eventType: string|null, subscription: object|null }}
 */
function parseSquareEvent(body) {
  if (!body || typeof body !== "object") return { eventId: null, eventType: null, subscription: null };
  const object = (body.data && body.data.object) || {};
  const subscription = object.subscription || (body.type && String(body.type).startsWith("subscription") ? object : null);
  return {
    eventId: typeof body.event_id === "string" ? body.event_id : null,
    eventType: typeof body.type === "string" ? body.type : null,
    subscription: subscription && typeof subscription === "object" ? subscription : null,
  };
}

/**
 * True if we've already handled this Square event id. Square retries on
 * anything that isn't a 2xx, so redelivery is normal, not exceptional.
 *
 * @param {string} eventId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<boolean>}
 */
async function hasProcessedEvent(eventId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`
    SELECT 1 FROM webhook_events
    WHERE provider = 'square' AND provider_event_id = ${eventId} AND verified = true
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Records that a Square event was received and verified. The unique partial
 * index on (provider, provider_event_id) makes the insert itself the
 * idempotency guard, so a redelivery racing the first delivery loses rather
 * than being applied twice.
 *
 * @param {{ eventId: string, eventType: string, verified: boolean, reason: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string }} [deps]
 * @returns {Promise<{ recorded: boolean }>} recorded=false means a duplicate.
 */
async function recordEvent(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

  const rows = await sql`
    INSERT INTO webhook_events (id, provider, received_at, verified, verification_reason, event_type, provider_event_id)
    VALUES (${idGenerator()}, 'square', ${now().toISOString()}, ${input.verified}, ${input.reason}, ${input.eventType || null}, ${input.eventId || null})
    ON CONFLICT (provider, provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING
    RETURNING id
  `;
  return { recorded: rows.length > 0 };
}

/**
 * Upserts the link row for a Square subscription and, when it is already
 * linked to an organization, drives our internal subscription to match.
 *
 * @param {{ subscription: object, eventType: string }} input
 * @param {{ sql?: Function, now?: () => Date, actorId?: string, auditRecorder?: object }} [deps]
 * @returns {Promise<{ squareSubscriptionId: string, mappedStatus: string|null, linked: boolean, transitioned: boolean, note: string }>}
 */
async function applySubscriptionEvent(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const sub = input.subscription || {};
  const squareId = sub.id;
  if (typeof squareId !== "string" || squareId.length === 0) {
    return { squareSubscriptionId: null, mappedStatus: null, linked: false, transitioned: false, note: "event carried no subscription id" };
  }

  const mappedStatus = mapSquareStatus(sub.status);
  const timestamp = now().toISOString();

  const rows = await sql`
    INSERT INTO square_subscription_links (
      square_subscription_id, square_customer_id, square_plan_variation_id,
      square_status, first_seen_at, last_event_at, last_event_type
    ) VALUES (
      ${squareId}, ${sub.customer_id || null}, ${sub.plan_variation_id || null},
      ${sub.status || "UNKNOWN"}, ${timestamp}, ${timestamp}, ${input.eventType || null}
    )
    ON CONFLICT (square_subscription_id) DO UPDATE SET
      square_status = EXCLUDED.square_status,
      square_customer_id = COALESCE(EXCLUDED.square_customer_id, square_subscription_links.square_customer_id),
      square_plan_variation_id = COALESCE(EXCLUDED.square_plan_variation_id, square_subscription_links.square_plan_variation_id),
      last_event_at = EXCLUDED.last_event_at,
      last_event_type = EXCLUDED.last_event_type
    RETURNING *
  `;
  const link = rows[0] || {};

  // Not yet onboarded: the row sits on the staff work queue and nothing else
  // happens. This is the normal path for a brand-new customer.
  if (!link.organization_id || !link.subscription_id) {
    return {
      squareSubscriptionId: squareId,
      mappedStatus,
      linked: false,
      transitioned: false,
      note: "awaiting staff link to an organization",
    };
  }

  if (!mappedStatus) {
    return { squareSubscriptionId: squareId, mappedStatus: null, linked: true, transitioned: false, note: `unmapped Square status "${sub.status}"` };
  }

  const current = await getSubscriptionById(link.subscription_id, { sql });
  if (!current) {
    return { squareSubscriptionId: squareId, mappedStatus, linked: true, transitioned: false, note: "linked subscription record is missing" };
  }
  if (current.status === mappedStatus) {
    return { squareSubscriptionId: squareId, mappedStatus, linked: true, transitioned: false, note: "already in that status" };
  }

  try {
    await applySubscriptionStatusTransition(link.subscription_id, mappedStatus, {
      sql,
      now,
      actorId: deps.actorId || "square-webhook",
      auditRecorder: deps.auditRecorder,
    });
    return { squareSubscriptionId: squareId, mappedStatus, linked: true, transitioned: true, note: `moved to ${mappedStatus}` };
  } catch (err) {
    // An illegal transition (cancelled is terminal) is a real business fact,
    // not a delivery failure -- swallowing it here keeps us returning 2xx so
    // Square stops retrying an event that will never succeed.
    return { squareSubscriptionId: squareId, mappedStatus, linked: true, transitioned: false, note: `transition refused: ${err.message}` };
  }
}

/**
 * Staff action: attach a Square subscription to an organization and create the
 * internal subscription record. This is the human onboarding step the webhook
 * deliberately does not perform.
 *
 * @param {{ squareSubscriptionId: string, organizationId: string, planKey: string }} input
 * @param {{ sql?: Function, now?: () => Date, actorId?: string, idGenerator?: () => string, auditRecorder?: object }} [deps]
 * @returns {Promise<import("../domain/subscription").Subscription>}
 */
async function linkToOrganization(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const auditRecorder = resolveAuditRecorder(deps);

  const existing = await sql`SELECT * FROM square_subscription_links WHERE square_subscription_id = ${input.squareSubscriptionId}`;
  if (existing.length === 0) throw new Error(`linkToOrganization: no Square subscription "${input.squareSubscriptionId}"`);
  if (existing[0].organization_id) throw new Error("linkToOrganization: already linked to an organization");

  const subscription = await createSubscription(
    { organizationId: input.organizationId, planKey: input.planKey },
    { sql, now, actorId: deps.actorId, idGenerator: deps.idGenerator, auditRecorder }
  );

  await sql`
    UPDATE subscriptions SET provider_subscription_reference = ${input.squareSubscriptionId}
    WHERE id = ${subscription.id}
  `;

  const updated = await sql`
    UPDATE square_subscription_links
    SET organization_id = ${input.organizationId}, subscription_id = ${subscription.id}, linked_at = ${now().toISOString()}
    WHERE square_subscription_id = ${input.squareSubscriptionId} AND organization_id IS NULL
    RETURNING square_subscription_id
  `;
  if (updated.length === 0) throw new Error("linkToOrganization: link claimed by another request");

  // Square may have moved the subscription on (paused, cancelled) while it sat
  // unlinked, so reconcile immediately rather than waiting for the next event.
  const squareStatus = mapSquareStatus(existing[0].square_status);
  if (squareStatus && squareStatus !== "active") {
    try {
      await applySubscriptionStatusTransition(subscription.id, squareStatus, { sql, now, actorId: deps.actorId || "square-webhook", auditRecorder });
      return { ...subscription, status: squareStatus, providerSubscriptionReference: input.squareSubscriptionId };
    } catch { /* leave active; the mismatch is visible on the link row */ }
  }
  return { ...subscription, providerSubscriptionReference: input.squareSubscriptionId };
}

/**
 * @param {{ sql?: Function, limit?: number }} [deps]
 * @returns {Promise<object[]>} Square subscriptions with no organization yet.
 */
async function listUnlinkedSubscriptions(deps = {}) {
  const sql = deps.sql || getSql();
  const limit = deps.limit ?? 100;
  const rows = await sql`
    SELECT * FROM square_subscription_links
    WHERE organization_id IS NULL
    ORDER BY first_seen_at DESC
    LIMIT ${limit}
  `;
  return rows.map(mapRowToLink);
}

/**
 * @param {string} organizationId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<object[]>}
 */
async function listLinksForOrganization(organizationId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM square_subscription_links WHERE organization_id = ${organizationId} ORDER BY first_seen_at DESC`;
  return rows.map(mapRowToLink);
}

function mapRowToLink(row) {
  return {
    squareSubscriptionId: row.square_subscription_id,
    squareCustomerId: row.square_customer_id || undefined,
    squarePlanVariationId: row.square_plan_variation_id || undefined,
    squareStatus: row.square_status,
    mappedStatus: mapSquareStatus(row.square_status),
    customerEmail: row.customer_email || undefined,
    customerName: row.customer_name || undefined,
    organizationId: row.organization_id || undefined,
    subscriptionId: row.subscription_id || undefined,
    firstSeenAt: row.first_seen_at ? new Date(row.first_seen_at).toISOString() : undefined,
    lastEventAt: row.last_event_at ? new Date(row.last_event_at).toISOString() : undefined,
    lastEventType: row.last_event_type || undefined,
    linkedAt: row.linked_at ? new Date(row.linked_at).toISOString() : undefined,
  };
}

module.exports = {
  STATUS_MAP,
  mapSquareStatus,
  parseSquareEvent,
  hasProcessedEvent,
  recordEvent,
  applySubscriptionEvent,
  linkToOrganization,
  listUnlinkedSubscriptions,
  listLinksForOrganization,
  mapRowToLink,
};
