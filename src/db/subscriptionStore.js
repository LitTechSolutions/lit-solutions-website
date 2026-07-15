// F052 -- Subscription & Billing Plan Management. Persistence wiring the
// pure src/policy/subscriptionLifecycle.js state machine -- fetch, run
// transitionSubscriptionStatus(), persist only if legal. Plan terms
// (price, cadence, what's included) live outside this module entirely
// (F050 price sheets / OWNER_DECISIONS.md #2, #3); this only tracks which
// org is subscribed to which opaque plan_key and in what lifecycle state.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidSubscription } = require("../domain/subscription");
const { transitionSubscriptionStatus } = require("../policy/subscriptionLifecycle");

/**
 * @param {{ organizationId: string, planKey: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string }} [deps]
 * @returns {Promise<import("../domain/subscription").Subscription>}
 */
async function createSubscription(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

  const subscription = {
    id: idGenerator(),
    organizationId: input.organizationId,
    planKey: input.planKey,
    status: "active",
    startedAt: now().toISOString(),
  };
  assertValidSubscription(subscription);

  await sql`
    INSERT INTO subscriptions (id, organization_id, plan_key, status, started_at)
    VALUES (${subscription.id}, ${subscription.organizationId}, ${subscription.planKey}, ${subscription.status}, ${subscription.startedAt})
  `;
  return subscription;
}

/**
 * @param {string} id
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/subscription").Subscription | null>}
 */
async function getSubscriptionById(id, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM subscriptions WHERE id = ${id}`;
  return rows.length > 0 ? mapRowToSubscription(rows[0]) : null;
}

/**
 * Fetches the current status, validates the transition through the pure
 * subscriptionLifecycle.js state machine, and persists only if legal.
 *
 * @param {string} id
 * @param {import("../domain/subscription").SubscriptionStatus} nextStatus
 * @param {{ sql?: Function, now?: () => Date }} [deps]
 * @returns {Promise<import("../domain/subscription").Subscription>}
 */
async function applySubscriptionStatusTransition(id, nextStatus, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());

  const current = await getSubscriptionById(id, { sql });
  if (!current) {
    throw new Error(`applySubscriptionStatusTransition: no subscription "${id}"`);
  }
  const { allowed, reason } = transitionSubscriptionStatus(current.status, nextStatus);
  if (!allowed) {
    throw new Error(`applySubscriptionStatusTransition: ${reason}`);
  }

  const timestamp = now().toISOString();
  const pausedAt = nextStatus === "paused" ? timestamp : current.pausedAt || null;
  const cancelledAt = nextStatus === "cancelled" ? timestamp : current.cancelledAt || null;

  await sql`
    UPDATE subscriptions SET status = ${nextStatus}, paused_at = ${pausedAt}, cancelled_at = ${cancelledAt}
    WHERE id = ${id}
  `;
  return { ...current, status: nextStatus, pausedAt: pausedAt || undefined, cancelledAt: cancelledAt || undefined };
}

/**
 * @param {string} organizationId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/subscription").Subscription[]>}
 */
async function listSubscriptionsForOrganization(organizationId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM subscriptions WHERE organization_id = ${organizationId} ORDER BY started_at`;
  return rows.map(mapRowToSubscription);
}

function mapRowToSubscription(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    planKey: row.plan_key,
    status: row.status,
    startedAt: new Date(row.started_at).toISOString(),
    pausedAt: row.paused_at ? new Date(row.paused_at).toISOString() : undefined,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : undefined,
    providerSubscriptionReference: row.provider_subscription_reference || undefined,
  };
}

module.exports = {
  createSubscription,
  getSubscriptionById,
  applySubscriptionStatusTransition,
  listSubscriptionsForOrganization,
  mapRowToSubscription,
};
