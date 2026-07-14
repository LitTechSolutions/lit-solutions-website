// F008 -- Audit Trail & Security Event Logging.
//
// Pure event-shaping + a storage-agnostic sink interface. Not owner-blocked
// and foundational (SYS-NFR-020): every later function that performs a
// privileged, financial, contractual, security, deletion, or configuration
// action should call `recordAuditEvent()` through a sink built here, so
// switching the primary data store later (OWNER_DECISIONS.md #1) only means
// swapping the sink adapter, not touching every call site.

const crypto = require("node:crypto");
const { assertValidAuditEvent } = require("../domain/auditEvent");

/**
 * @typedef {Object} AuditSink
 * @property {(event: import("../domain/auditEvent").AuditEvent) => Promise<void>} write
 */

/**
 * Fill in server-generated fields (id, occurredAt) and validate the result.
 * Callers supply everything that can't be safely defaulted (actor, action,
 * outcome, org, target, metadata).
 *
 * @param {Omit<import("../domain/auditEvent").AuditEvent, "id" | "occurredAt"> & { id?: string, occurredAt?: string }} input
 * @param {{ now?: () => Date, idGenerator?: () => string }} [deps] - Injectable for deterministic tests.
 * @returns {import("../domain/auditEvent").AuditEvent}
 */
function shapeAuditEvent(input, deps = {}) {
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());
  const event = {
    ...input,
    id: input.id || idGenerator(),
    occurredAt: input.occurredAt || now().toISOString(),
  };
  assertValidAuditEvent(event);
  return event;
}

/**
 * @param {AuditSink} sink
 * @returns {{ record: (input: Parameters<typeof shapeAuditEvent>[0], deps?: Parameters<typeof shapeAuditEvent>[1]) => Promise<import("../domain/auditEvent").AuditEvent> }}
 */
function createAuditRecorder(sink) {
  if (!sink || typeof sink.write !== "function") {
    throw new Error("createAuditRecorder: sink must implement write(event)");
  }
  return {
    async record(input, deps) {
      const event = shapeAuditEvent(input, deps);
      await sink.write(event);
      return event;
    },
  };
}

/**
 * In-memory sink for tests and for any call site that wants to batch
 * events before a real sink is wired up. Not for production use.
 * @returns {AuditSink & { events: import("../domain/auditEvent").AuditEvent[] }}
 */
function createInMemoryAuditSink() {
  const events = [];
  return {
    events,
    async write(event) {
      events.push(event);
    },
  };
}

module.exports = { shapeAuditEvent, createAuditRecorder, createInMemoryAuditSink };
