// F049 -- Service Plan, Entitlement & Usage Tracking. Persistence wiring
// the pure src/policy/entitlementCheck.js comparator to two tables:
// entitlement_limits (owner-configured plan terms, one row per
// plan_key+usage_key -- seeded from OWNER_DECISIONS.md #3's approved
// Website Care / Small Business IT limits, never hardcoded here) and
// usage_records (one row per organization+plan+usage_key+period, reset
// on the cadence the limit specifies). Fetch-validate-persist: usage is
// only ever recorded after checkEntitlement() confirms it fits.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidEntitlementLimit } = require("../domain/entitlement");
const { checkEntitlement } = require("../policy/entitlementCheck");

// "total"-reset usage has no natural period boundary, so it accumulates
// into a single fixed period bucket rather than one row per organization
// lifetime edge case.
const TOTAL_PERIOD_START = "1970-01-01T00:00:00.000Z";

/**
 * @param {"monthly" | "total" | "unlimited"} resetPeriod
 * @param {() => Date} now
 * @returns {string}
 */
function resolvePeriodStart(resetPeriod, now) {
  if (resetPeriod === "monthly") {
    const d = now();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  }
  return TOTAL_PERIOD_START;
}

/**
 * Seeds or updates an owner-approved plan limit. Idempotent by
 * (plan_key, usage_key).
 *
 * @param {import("../domain/entitlement").EntitlementLimit} limit
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/entitlement").EntitlementLimit>}
 */
async function upsertEntitlementLimit(limit, deps = {}) {
  const sql = deps.sql || getSql();
  assertValidEntitlementLimit(limit);

  const limitValue = limit.resetPeriod === "unlimited" ? null : limit.limit;
  await sql`
    INSERT INTO entitlement_limits (plan_key, usage_key, limit_value, reset_period)
    VALUES (${limit.planKey}, ${limit.usageKey}, ${limitValue}, ${limit.resetPeriod})
    ON CONFLICT (plan_key, usage_key) DO UPDATE SET limit_value = ${limitValue}, reset_period = ${limit.resetPeriod}
  `;
  return limit;
}

/**
 * @param {string} planKey
 * @param {string} usageKey
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/entitlement").EntitlementLimit | null>}
 */
async function getEntitlementLimit(planKey, usageKey, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM entitlement_limits WHERE plan_key = ${planKey} AND usage_key = ${usageKey}`;
  if (rows.length === 0) return null;
  return mapRowToEntitlementLimit(rows[0]);
}

/**
 * @param {string} organizationId
 * @param {string} planKey
 * @param {string} usageKey
 * @param {string} periodStart
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<number>} consumed, 0 if no usage recorded yet this period
 */
async function getConsumedForPeriod(organizationId, planKey, usageKey, periodStart, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`
    SELECT consumed FROM usage_records
    WHERE organization_id = ${organizationId} AND plan_key = ${planKey} AND usage_key = ${usageKey} AND period_start = ${periodStart}
  `;
  return rows.length > 0 ? rows[0].consumed : 0;
}

/**
 * Checks whether `amount` more usage fits the org's current entitlement,
 * and only persists it if it does. Fetch-validate-persist: never records
 * usage that checkEntitlement() would reject.
 *
 * @param {{ organizationId: string, planKey: string, usageKey: string, amount: number }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string }} [deps]
 * @returns {Promise<{ recorded: boolean, withinLimit: boolean, remaining: number | null, reason: string }>}
 */
async function recordUsage(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

  if (typeof input.amount !== "number" || input.amount <= 0) {
    throw new Error("recordUsage: amount must be a positive number");
  }

  const limit = await getEntitlementLimit(input.planKey, input.usageKey, { sql });
  if (!limit) {
    throw new Error(`recordUsage: no entitlement limit configured for plan "${input.planKey}" usage "${input.usageKey}"`);
  }

  const periodStart = resolvePeriodStart(limit.resetPeriod, now);
  const currentlyConsumed = await getConsumedForPeriod(input.organizationId, input.planKey, input.usageKey, periodStart, { sql });

  const beforeCheck = checkEntitlement(limit, currentlyConsumed);
  if (!beforeCheck.withinLimit) {
    return { recorded: false, ...beforeCheck };
  }
  if (limit.resetPeriod !== "unlimited" && input.amount > beforeCheck.remaining) {
    return {
      recorded: false,
      withinLimit: false,
      remaining: beforeCheck.remaining,
      reason: `recording ${input.amount} would exceed the ${beforeCheck.remaining} "${input.usageKey}" remaining on plan "${input.planKey}"`,
    };
  }

  const newConsumed = currentlyConsumed + input.amount;

  // usage_records has no unique constraint on (org, plan, usage_key, period) to upsert against,
  // so update-if-exists / insert-if-not follows the same fetch-then-write pattern used elsewhere.
  const existing = await sql`
    SELECT id FROM usage_records
    WHERE organization_id = ${input.organizationId} AND plan_key = ${input.planKey} AND usage_key = ${input.usageKey} AND period_start = ${periodStart}
  `;
  if (existing.length > 0) {
    await sql`UPDATE usage_records SET consumed = ${newConsumed} WHERE id = ${existing[0].id}`;
  } else {
    await sql`
      INSERT INTO usage_records (id, organization_id, plan_key, usage_key, consumed, period_start)
      VALUES (${idGenerator()}, ${input.organizationId}, ${input.planKey}, ${input.usageKey}, ${newConsumed}, ${periodStart})
    `;
  }

  const afterCheck = checkEntitlement(limit, newConsumed);
  return { recorded: true, ...afterCheck };
}

function mapRowToEntitlementLimit(row) {
  return {
    planKey: row.plan_key,
    usageKey: row.usage_key,
    limit: row.limit_value,
    resetPeriod: row.reset_period,
  };
}

module.exports = {
  upsertEntitlementLimit,
  getEntitlementLimit,
  getConsumedForPeriod,
  recordUsage,
  resolvePeriodStart,
  mapRowToEntitlementLimit,
};
