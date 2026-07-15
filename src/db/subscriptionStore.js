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
const { createAuditRecorder } = require("../audit/auditLog");
const { createPgAuditSink } = require("./pgAuditSink");
const { shapeAuditEvent } = require("../audit/auditLog");

function resolveAuditRecorder(deps) {
  return deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));
}

/**
 * @param {{ organizationId: string, planKey: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string, actorId?: string, auditRecorder?: object }} [deps]
 * @returns {Promise<import("../domain/subscription").Subscription>}
 */
async function createSubscription(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());
  const auditRecorder = resolveAuditRecorder(deps);

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

  await auditRecorder.record(
    {
      correlationId: subscription.id,
      actorType: "user",
      actorId: deps.actorId || "system",
      organizationId: subscription.organizationId,
      action: "subscription.create",
      targetType: "subscription",
      targetId: subscription.id,
      outcome: "success",
      metadata: { planKey: subscription.planKey },
    },
    deps
  );

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
 * @param {{ sql?: Function, now?: () => Date, actorId?: string, auditRecorder?: object }} [deps]
 * @returns {Promise<import("../domain/subscription").Subscription>}
 */
async function applySubscriptionStatusTransition(id, nextStatus, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const auditRecorder = resolveAuditRecorder(deps);

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

  const auditEvent = shapeAuditEvent({
    correlationId: id,
    actorType: "user",
    actorId: deps.actorId || "system",
    organizationId: current.organizationId,
    action: "subscription.transition",
    targetType: "subscription",
    targetId: id,
    outcome: "success",
    metadata: { fromStatus: current.status, toStatus: nextStatus },
  }, { now: () => new Date(timestamp), idGenerator: deps.auditIdGenerator });
  const changed = await sql`
    WITH changed AS (
      UPDATE subscriptions SET status = ${nextStatus}, paused_at = ${pausedAt}, cancelled_at = ${cancelledAt}
      WHERE id = ${id} AND status = ${current.status}
      RETURNING *
    ), audited AS (
      INSERT INTO audit_events (id, correlation_id, occurred_at, actor_type, actor_id, actor_role, organization_id, action, target_type, target_id, outcome, metadata)
      SELECT ${auditEvent.id}, ${auditEvent.correlationId}, ${auditEvent.occurredAt}, ${auditEvent.actorType}, ${auditEvent.actorId}, ${auditEvent.actorRole || null}, ${auditEvent.organizationId}, ${auditEvent.action}, ${auditEvent.targetType}, ${auditEvent.targetId}, ${auditEvent.outcome}, ${JSON.stringify(auditEvent.metadata)}
      FROM changed RETURNING id
    )
    SELECT changed.* FROM changed INNER JOIN audited ON TRUE
  `;
  if (changed.length === 0) throw new Error("applySubscriptionStatusTransition: subscription changed by another request");

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
