// F044 -- IT Support Request & Remote/On-Site Classification. Persists
// the outcome of the pure src/policy/itSupportClassification.js call
// against a specific ticket, same "persist one engine's decision" shape
// as ticketWorkflowStore.js's triage/priority/assignment functions.

const { getSql } = require("./pgClient");
const { classifyHandling } = require("../policy/itSupportClassification");
const { createAuditRecorder } = require("../audit/auditLog");
const { createPgAuditSink } = require("./pgAuditSink");

function resolveAuditRecorder(deps) {
  return deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));
}

/**
 * @param {string} ticketId
 * @param {import("../domain/itSupportRequest").ITSupportSignals} signals
 * @param {{ sql?: Function, now?: () => Date, auditRecorder?: object, actorId?: string }} [deps]
 * @returns {Promise<{ ticketId: string, classification: string, reason: string }>}
 */
async function recordItSupportClassification(ticketId, signals, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const auditRecorder = resolveAuditRecorder(deps);
  const result = classifyHandling(signals);

  await sql`
    INSERT INTO it_support_classifications (ticket_id, classification, requires_physical_access, safety_risk, decided_at)
    VALUES (${ticketId}, ${result.classification}, ${signals.requiresPhysicalAccess}, ${signals.safetyRisk}, ${now().toISOString()})
    ON CONFLICT (ticket_id) DO UPDATE SET classification = EXCLUDED.classification, requires_physical_access = EXCLUDED.requires_physical_access, safety_risk = EXCLUDED.safety_risk, decided_at = EXCLUDED.decided_at
  `;

  await auditRecorder.record(
    {
      correlationId: ticketId,
      actorType: "user",
      actorId: deps.actorId || "system",
      organizationId: null,
      action: "it_support.classify",
      targetType: "ticket",
      targetId: ticketId,
      outcome: "success",
      metadata: { classification: result.classification },
    },
    deps
  );

  return { ticketId, classification: result.classification, reason: result.reason };
}

module.exports = { recordItSupportClassification };
