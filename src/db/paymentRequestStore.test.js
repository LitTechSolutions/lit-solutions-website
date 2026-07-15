const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPaymentRequestsForSchedule,
  getPaymentRequestById,
  applyPaymentStatusTransition,
  listPaymentRequestsForSubject,
} = require("./paymentRequestStore");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
let idCounter = 0;
const SEQUENTIAL_ID = () => `pr-${++idCounter}`;

function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return cannedRows;
  };
  tag.calls = calls;
  return tag;
}

function paymentRequestRow(overrides = {}) {
  return {
    id: "pr-1",
    organization_id: "org-a",
    subject_type: "scope",
    subject_id: "scope-1",
    amount_ref: "scope-1:full",
    status: "requested",
    created_at: "2026-07-14T12:00:00.000Z",
    provider_reference: null,
    ...overrides,
  };
}

test("work below $500 creates a single full_upfront payment request row", async () => {
  idCounter = 0;
  const sql = fakeSql();
  const result = await createPaymentRequestsForSchedule(
    { organizationId: "org-a", subjectType: "scope", subjectId: "scope-1", amountRefPrefix: "scope-1", totalAmount: 200 },
    { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID }
  );
  assert.equal(result.scheduleType, "full_upfront");
  assert.equal(result.paymentRequests.length, 1);
  assert.equal(result.paymentRequests[0].amountRef, "scope-1:full");
  assert.equal(result.paymentRequests[0].amount, 200);
  assert.equal(sql.calls.length, 1);
  assert.match(sql.calls[0].text, /INSERT INTO payment_requests/);
});

test("work at or above $500 creates two payment request rows: deposit and balance", async () => {
  idCounter = 0;
  const sql = fakeSql();
  const result = await createPaymentRequestsForSchedule(
    { organizationId: "org-a", subjectType: "scope", subjectId: "scope-1", amountRefPrefix: "scope-1", totalAmount: 1000 },
    { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID }
  );
  assert.equal(result.scheduleType, "deposit_balance");
  assert.equal(result.paymentRequests.length, 2);
  assert.equal(result.paymentRequests[0].amountRef, "scope-1:deposit");
  assert.equal(result.paymentRequests[0].amount, 500);
  assert.equal(result.paymentRequests[1].amountRef, "scope-1:balance");
  assert.equal(result.paymentRequests[1].amount, 500);
  assert.equal(sql.calls.length, 2);
});

test("third-party expenses are always a single full_upfront row regardless of amount", async () => {
  idCounter = 0;
  const sql = fakeSql();
  const result = await createPaymentRequestsForSchedule(
    { organizationId: "org-a", subjectType: "change_order", subjectId: "co-1", amountRefPrefix: "co-1", totalAmount: 900, isThirdPartyExpense: true },
    { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID }
  );
  assert.equal(result.scheduleType, "full_upfront");
  assert.equal(result.paymentRequests.length, 1);
});

test("no raw dollar amount is ever written to the database -- only the opaque amount_ref", async () => {
  idCounter = 0;
  const sql = fakeSql();
  await createPaymentRequestsForSchedule(
    { organizationId: "org-a", subjectType: "scope", subjectId: "scope-1", amountRefPrefix: "scope-1", totalAmount: 1000 },
    { sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID }
  );
  for (const call of sql.calls) {
    assert.equal(call.values.includes(500), false, "a dollar figure leaked into a bound SQL parameter");
  }
});

test("getPaymentRequestById returns null for no match", async () => {
  const sql = fakeSql([]);
  assert.equal(await getPaymentRequestById("nope", { sql }), null);
});

test("applyPaymentStatusTransition allows requested -> paid and persists it", async () => {
  const sql = fakeSql([paymentRequestRow({ status: "requested" })]);
  const updated = await applyPaymentStatusTransition("pr-1", "paid", { sql });
  assert.equal(updated.status, "paid");
  assert.equal(sql.calls.length, 2, "1 SELECT (fetch current) + 1 UPDATE");
  assert.match(sql.calls[1].text, /UPDATE payment_requests/);
});

test("applyPaymentStatusTransition rejects an illegal transition (e.g. requested -> reconciled)", async () => {
  const sql = fakeSql([paymentRequestRow({ status: "requested" })]);
  await assert.rejects(() => applyPaymentStatusTransition("pr-1", "reconciled", { sql }));
  assert.equal(sql.calls.length, 1, "only the fetch happened, no UPDATE on an illegal transition");
});

test("applyPaymentStatusTransition throws for a nonexistent payment request", async () => {
  const sql = fakeSql([]);
  await assert.rejects(() => applyPaymentStatusTransition("nope", "paid", { sql }), /no payment request/);
});

test("applyPaymentStatusTransition records a providerReference when supplied", async () => {
  const sql = fakeSql([paymentRequestRow({ status: "requested" })]);
  const updated = await applyPaymentStatusTransition("pr-1", "paid", { sql, providerReference: "square-txn-123" });
  assert.equal(updated.providerReference, "square-txn-123");
  assert.equal(sql.calls[1].values.includes("square-txn-123"), true);
});

test("listPaymentRequestsForSubject orders by created_at", async () => {
  const sql = fakeSql([paymentRequestRow({ id: "pr-1" }), paymentRequestRow({ id: "pr-2", amount_ref: "scope-1:balance" })]);
  const list = await listPaymentRequestsForSubject("scope", "scope-1", { sql });
  assert.equal(list.length, 2);
  assert.match(sql.calls[0].text, /ORDER BY created_at/);
});
