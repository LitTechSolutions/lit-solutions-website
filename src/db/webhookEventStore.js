// F057 -- Integrations, Webhooks & API Connectivity. Logs every
// verification attempt (success or failure) through the existing pure
// src/webhooks/webhookVerification.js -- this module never decides
// whether a signature is valid, it only records what
// verifyWebhookSignature() decided, satisfying SYS-API-008's "verify
// provider identity before acknowledging business success" with an
// audit-adjacent trail. No real provider integration exists yet
// (confirmed Session 0), so nothing calls this in production today --
// it's ready for whichever provider integrates first.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { verifyWebhookSignature } = require("../webhooks/webhookVerification");

/**
 * @param {string} provider
 * @param {{ payload: string, timestamp: number, signature: string, secret: string }} input
 * @param {string} [eventType]
 * @param {{ sql?: Function, now?: () => Date, toleranceSeconds?: number, idGenerator?: () => string }} [deps]
 * @returns {Promise<{ valid: boolean, reason: string }>}
 */
async function verifyAndLogWebhook(provider, input, eventType, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

  const result = verifyWebhookSignature(input, deps);

  await sql`
    INSERT INTO webhook_events (id, provider, received_at, verified, verification_reason, event_type)
    VALUES (${idGenerator()}, ${provider}, ${now().toISOString()}, ${result.valid}, ${result.reason}, ${eventType || null})
  `;

  return result;
}

/**
 * @param {string} provider
 * @param {{ sql?: Function, limit?: number }} [deps]
 * @returns {Promise<Array<{ id: string, provider: string, receivedAt: string, verified: boolean, verificationReason: string, eventType: string | null }>>}
 */
async function listRecentWebhookEvents(provider, deps = {}) {
  const sql = deps.sql || getSql();
  const limit = deps.limit ?? 100;
  const rows = await sql`
    SELECT * FROM webhook_events
    WHERE provider = ${provider}
    ORDER BY received_at DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    receivedAt: new Date(row.received_at).toISOString(),
    verified: row.verified,
    verificationReason: row.verification_reason,
    eventType: row.event_type,
  }));
}

module.exports = { verifyAndLogWebhook, listRecentWebhookEvents };
