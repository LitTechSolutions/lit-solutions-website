const test = require("node:test");
const assert = require("node:assert/strict");
const { createNextVersion } = require("./scopeVersioning");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "scope-v2-id";

function scope(overrides = {}) {
  return {
    id: "scope-v1-id",
    organizationId: "org-a",
    ticketId: "ticket-1",
    version: 1,
    status: "sent",
    assumptions: ["Standard business hours access"],
    exclusions: ["Content writing"],
    lineItems: [{ description: "Homepage redesign", quantity: 1, priceRef: "priceRef-1" }],
    createdAt: "2026-07-01T00:00:00.000Z",
    createdBy: "user-tech-1",
    ...overrides,
  };
}

test("creates a new version with incremented version number and draft status", () => {
  const { next } = createNextVersion(scope(), { lineItems: scope().lineItems }, { now: FIXED_NOW, idGenerator: FIXED_ID });
  assert.equal(next.version, 2);
  assert.equal(next.status, "draft");
  assert.equal(next.id, "scope-v2-id");
});

test("marks the previous version as superseded without mutating it in place", () => {
  const original = scope();
  const { supersededPrevious } = createNextVersion(original, {}, { now: FIXED_NOW, idGenerator: FIXED_ID });
  assert.equal(supersededPrevious.status, "superseded");
  assert.equal(original.status, "sent", "original object must not be mutated");
});

test("cannot version an already-superseded scope", () => {
  assert.throws(
    () => createNextVersion(scope({ status: "superseded" }), {}, { now: FIXED_NOW, idGenerator: FIXED_ID }),
    /already superseded/
  );
});

test("applies updates (new line items) to the next version", () => {
  const newLineItems = [{ description: "Extra page", quantity: 1, priceRef: "priceRef-2" }];
  const { next } = createNextVersion(scope(), { lineItems: newLineItems }, { now: FIXED_NOW, idGenerator: FIXED_ID });
  assert.deepEqual(next.lineItems, newLineItems);
});

test("rejects a line item without a priceRef (no raw dollar amounts)", () => {
  assert.throws(() =>
    createNextVersion(scope(), { lineItems: [{ description: "x", quantity: 1, priceRef: "" }] }, { now: FIXED_NOW, idGenerator: FIXED_ID })
  );
});
