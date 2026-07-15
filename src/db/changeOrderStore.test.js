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

test("createChangeOrder validates and inserts, then creates a paired change_order approval", async () => {
  idCounter = 0;
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const { changeOrder, approval } = await createChangeOrder(
    {
      organizationId: "org-a",
      originalScopeId: "scope-1",
      description: "Add a booking calendar to the homepage",
      addedLineItems: [{ description: "Booking calendar integration", quantity: 1, priceRef: "priceRef-3" }],
      createdBy: "user-tech-1",
    },
    { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID, actorId: "user-tech-1", auditRecorder }
  );

  assert.equal(changeOrder.originalScopeId, "scope-1");
  assert.equal(approval.subjectType, "change_order");
  assert.equal(approval.subjectId, changeOrder.id);
  assert.equal(approval.status, "pending");
  assert.equal(sql.calls.length, 2, "1 INSERT for change_orders, 1 for the paired approval_requests row");
  assert.match(sql.calls[0].text, /INSERT INTO change_orders/);
  assert.match(sql.calls[1].text, /INSERT INTO approval_requests/);
  assert.equal(auditRecorder.events.length, 2, "one event for the paired approval request (created first), one for the change order itself (same auditRecorder threaded through, no duplicate fallback sink)");
  assert.equal(auditRecorder.events[0].action, "approval.create");
  assert.equal(auditRecorder.events[0].actorId, "user-tech-1");
  assert.equal(auditRecorder.events[1].action, "change_order.create");
  assert.equal(auditRecorder.events[1].actorId, "user-tech-1");
  assert.deepEqual(auditRecorder.events[1].metadata, { approvalId: approval.id, originalScopeId: "scope-1" });
});

test("createChangeOrder rejects invalid line items before inserting anything (fail before either write)", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(() =>
    createChangeOrder(
      { organizationId: "org-a", originalScopeId: "scope-1", description: "x", addedLineItems: [{ description: "y", quantity: 1, priceRef: "" }], createdBy: "u" },
      { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID, auditRecorder }
    )
  );
  assert.equal(sql.calls.length, 0);
  assert.equal(auditRecorder.events.length, 0);
});

test("no change order can exist approved without going through the shared approval workflow -- structural guarantee", async () => {
  // There is no "approved" field or shortcut on ChangeOrder itself --
  // approval status lives entirely on the paired ApprovalRequest, which
  // only transitions through approvalWorkflow.js. This test documents
  // that structural fact rather than testing new behavior.
  idCounter = 0;
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const { changeOrder } = await createChangeOrder(
    { organizationId: "org-a", originalScopeId: "scope-1", description: "x", addedLineItems: [{ description: "y", quantity: 1, priceRef: "ref-1" }], createdBy: "u" },
    { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID, auditRecorder }
  );
  assert.equal("status" in changeOrder, false, "ChangeOrder has no status field of its own -- approval state lives only on the paired ApprovalRequest");
});

test("getChangeOrderById returns null for no match", async () => {
  const sql = fakeSql([]);
  assert.equal(await getChangeOrderById("nope", { sql }), null);
});

test("listChangeOrdersForOrganization orders by created_at DESC", async () => {
  const sql = fakeSql([{ id: "co-1", organization_id: "org-a", original_scope_id: "scope-1", description: "x", added_line_items: [], created_at: "2026-07-01T00:00:00.000Z", created_by: "u" }]);
  const list = await listChangeOrdersForOrganization("org-a", { sql });
  assert.equal(list.length, 1);
  assert.match(sql.calls[0].text, /ORDER BY created_at DESC/);
});
