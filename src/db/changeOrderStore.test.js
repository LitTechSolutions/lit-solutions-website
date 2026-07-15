const test = require("node:test");
const assert = require("node:assert/strict");
const { createChangeOrder, getChangeOrderById } = require("./changeOrderStore");

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

test("createChangeOrder validates and inserts, then creates a paired change_order approval", async () => {
  idCounter = 0;
  const sql = fakeSql();
  const { changeOrder, approval } = await createChangeOrder(
    {
      organizationId: "org-a",
      originalScopeId: "scope-1",
      description: "Add a booking calendar to the homepage",
      addedLineItems: [{ description: "Booking calendar integration", quantity: 1, priceRef: "priceRef-3" }],
      createdBy: "user-tech-1",
    },
    { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID }
  );

  assert.equal(changeOrder.originalScopeId, "scope-1");
  assert.equal(approval.subjectType, "change_order");
  assert.equal(approval.subjectId, changeOrder.id);
  assert.equal(approval.status, "pending");
  assert.equal(sql.calls.length, 2, "1 INSERT for change_orders, 1 for the paired approval_requests row");
  assert.match(sql.calls[0].text, /INSERT INTO change_orders/);
  assert.match(sql.calls[1].text, /INSERT INTO approval_requests/);
});

test("createChangeOrder rejects invalid line items before inserting anything (fail before either write)", async () => {
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
  const sql = fakeSql();
  const { changeOrder } = await createChangeOrder(
    { organizationId: "org-a", originalScopeId: "scope-1", description: "x", addedLineItems: [{ description: "y", quantity: 1, priceRef: "ref-1" }], createdBy: "u" },
    { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID }
  );
  assert.equal("status" in changeOrder, false, "ChangeOrder has no status field of its own -- approval state lives only on the paired ApprovalRequest");
});

test("getChangeOrderById returns null for no match", async () => {
  const sql = fakeSql([]);
  assert.equal(await getChangeOrderById("nope", { sql }), null);
});
