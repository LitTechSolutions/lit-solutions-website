const test = require("node:test");
const assert = require("node:assert/strict");
const { shapeAuditEvent, createAuditRecorder, createInMemoryAuditSink } = require("./auditLog");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "audit-fixed-id";

function baseInput(overrides = {}) {
  return {
    correlationId: "corr-1",
    actorType: "user",
    actorId: "user-1",
    actorRole: "org_owner",
    organizationId: "org-a",
    action: "member.invite",
    outcome: "success",
    ...overrides,
  };
}

test("shapeAuditEvent fills id and occurredAt when not provided", () => {
  const event = shapeAuditEvent(baseInput(), { now: FIXED_NOW, idGenerator: FIXED_ID });
  assert.equal(event.id, "audit-fixed-id");
  assert.equal(event.occurredAt, "2026-07-14T12:00:00.000Z");
});

test("shapeAuditEvent rejects an event missing a required field", () => {
  assert.throws(() => shapeAuditEvent(baseInput({ action: undefined })), /action is required/);
});

test("shapeAuditEvent rejects an invalid outcome", () => {
  assert.throws(() => shapeAuditEvent(baseInput({ outcome: "maybe" })), /outcome must be/);
});

test("shapeAuditEvent rejects metadata containing a nested object (no arbitrary payloads)", () => {
  assert.throws(
    () => shapeAuditEvent(baseInput({ metadata: { nested: { oops: true } } })),
    /must be a string, number, boolean, or null/
  );
});

test("shapeAuditEvent accepts organizationId: null for platform-level events", () => {
  const event = shapeAuditEvent(baseInput({ organizationId: null, action: "staff.administer" }), {
    now: FIXED_NOW,
    idGenerator: FIXED_ID,
  });
  assert.equal(event.organizationId, null);
});

test("createAuditRecorder rejects a sink without write()", () => {
  assert.throws(() => createAuditRecorder({}), /must implement write/);
});

test("createAuditRecorder shapes, validates, and writes through to the sink", async () => {
  const sink = createInMemoryAuditSink();
  const recorder = createAuditRecorder(sink);
  const event = await recorder.record(baseInput(), { now: FIXED_NOW, idGenerator: FIXED_ID });

  assert.equal(sink.events.length, 1);
  assert.deepEqual(sink.events[0], event);
  assert.equal(event.organizationId, "org-a");
});

test("createAuditRecorder never writes an event that fails validation", async () => {
  const sink = createInMemoryAuditSink();
  const recorder = createAuditRecorder(sink);
  await assert.rejects(() => recorder.record(baseInput({ outcome: "maybe" })));
  assert.equal(sink.events.length, 0);
});

test("denied authorization decisions are representable as audit events (integration with rbac.js's decision shape)", () => {
  const { authorize } = require("../policy/rbac");
  const decision = authorize({ actorRole: "org_member", action: "change_order.approve", actorOrgId: "org-a", resourceOrgId: "org-a" });
  const event = shapeAuditEvent(
    baseInput({
      action: "change_order.approve",
      outcome: decision.allowed ? "success" : "denied",
      metadata: { reason: decision.reason },
    }),
    { now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(event.outcome, "denied");
  assert.equal(event.metadata.reason, decision.reason);
});
