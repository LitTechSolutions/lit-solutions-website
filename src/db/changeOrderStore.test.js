const test = require("node:test");
const assert = require("node:assert/strict");
const { createChangeOrder, getChangeOrderById, listChangeOrdersForOrganization } = require("./changeOrderStore");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
let idCounter = 0;
const SEQUENTIAL_ID = () => `id-${++idCounter}`;

function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return cannedRows;
  };
  tag.calls = calls;
  return tag;
}

function fakeAuditRecorder() {
  const events = [];
  return { record: async (input) => { events.push(input); return input; }, events };
}

test("createChangeOrder validates and inserts the change order and its paired approval in one atomic statement", async () => {
  idCounter = 0;
  const sql = fakeSql([{ ok: 1 }]);
  const { changeOrder, approval } = await createChangeOrder(
    {
      organizationId: "org-a",
      originalScopeId: "scope-1",
      description: "Add a booking calendar to the homepage",
      addedLineItems: [{ description: "Booking calendar integration", quantity: 1, priceRef: "priceRef-3" }],
      createdBy: "user-tech-1",
    },
    { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID, actorId: "user-tech-1" }
  );

  assert.equal(changeOrder.originalScopeId, "scope-1");
  assert.equal(approval.subjectType, "change_order");
  assert.equal(approval.subjectId, changeOrder.id);
  assert.equal(approval.status, "pending");
  assert.equal(sql.calls.length, 1, "change-order insert, approval insert, and both audit events are one indivisible statement (CH-H-02)");
  assert.match(sql.calls[0].text, /INSERT INTO change_orders/);
  assert.match(sql.calls[0].text, /INSERT INTO approval_requests/);
  assert.match(sql.calls[0].text, /INSERT INTO audit_events/);
});

test("createChangeOrder rejects invalid line items before inserting anything (fail before any write)", async () => {
  const sql = fakeSql();
  await assert.rejects(() =>
    createChangeOrder(
      { organizationId: "org-a", originalScopeId: "scope-1", description: "x", addedLineItems: [{ description: "y", quantity: 1, priceRef: "" }], createdBy: "u" },
      { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID }
    )
  );
  assert.equal(sql.calls.length, 0);
});

test("no change order can exist approved without going through the shared approval workflow -- structural guarantee", async () => {
  // There is no "approved" field or shortcut on ChangeOrder itself --
  // approval status lives entirely on the paired ApprovalRequest, which
  // only transitions through approvalWorkflow.js. This test documents
  // that structural fact rather than testing new behavior.
  idCounter = 0;
  const sql = fakeSql([{ ok: 1 }]);
  const { changeOrder } = await createChangeOrder(
    { organizationId: "org-a", originalScopeId: "scope-1", description: "x", addedLineItems: [{ description: "y", quantity: 1, priceRef: "ref-1" }], createdBy: "u" },
    { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID }
  );
  assert.equal("status" in changeOrder, false, "ChangeOrder has no status field of its own -- approval state lives only on the paired ApprovalRequest");
});

test("getChangeOrderById returns null for no match, and scopes the query by organizationId", async () => {
  const sql = fakeSql([]);
  assert.equal(await getChangeOrderById("nope", "org-a", { sql }), null);
  assert.match(
    sql.calls[0].text,
    /organization_id/,
    "SECURITY regression (Session 20 post-step-8): must be scoped by organizationId, not id alone -- otherwise a caller authenticated for one org could read another org's change order for a guessed id"
  );
});

test("listChangeOrdersForOrganization orders by created_at DESC", async () => {
  const sql = fakeSql([{ id: "co-1", organization_id: "org-a", original_scope_id: "scope-1", description: "x", added_line_items: [], created_at: "2026-07-01T00:00:00.000Z", created_by: "u" }]);
  const list = await listChangeOrdersForOrganization("org-a", { sql });
  assert.equal(list.length, 1);
  assert.match(sql.calls[0].text, /ORDER BY created_at DESC/);
});
