const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createChecklistDefinition,
  listChecklistDefinitions,
  getChecklistDefinition,
  recordCustomerAnswer,
  recordStaffAssessment,
  submitChecklistForReview,
  reviewChecklistSubmission,
  getChecklistForCustomer,
  getChecklistForStaff,
} = require("./checklistStore");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "checklist-fixed-id";

function fakeAuditRecorder() {
  const events = [];
  return { record: async (input) => { events.push(input); return input; }, events };
}

function definitionRow(overrides = {}) {
  return {
    id: "def-1",
    title: "Security Readiness",
    items: [
      { key: "mfa_enabled", label: "MFA enabled?", weight: 2, audience: "customer" },
      { key: "backups", label: "Backups configured?", weight: 1, audience: "customer" },
      { key: "onsite_review", label: "On-site review completed?", weight: 1, audience: "staff" },
    ],
    ...overrides,
  };
}

function submissionRow(overrides = {}) {
  return {
    organization_id: "org-a",
    checklist_definition_id: "def-1",
    status: "draft",
    submitted_at: null,
    submitted_by: null,
    reviewed_at: null,
    reviewed_by: null,
    review_note: null,
    ...overrides,
  };
}

/**
 * Routes canned rows by which table a query mentions, and lets each
 * table's canned data be swapped mid-test (submission state changes
 * across the store's own sequential fetch-then-write calls). `state`
 * is a live, mutable object the test can reach into.
 */
function routingFakeSql(state) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("checklist_definitions")) return state.definitions || [];
    if (text.includes("checklist_submissions")) return state.submissions || [];
    if (text.includes("checklist_responses")) return state.responses || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

test("createChecklistDefinition validates (requires audience) and inserts", async () => {
  const sql = routingFakeSql({});
  const definition = await createChecklistDefinition(
    { title: "Security Readiness", items: [{ key: "mfa_enabled", label: "MFA enabled?", weight: 2, audience: "customer" }] },
    { sql, idGenerator: FIXED_ID }
  );
  assert.equal(definition.id, "checklist-fixed-id");
  assert.match(sql.calls[0].text, /INSERT INTO checklist_definitions/);
});

test("createChecklistDefinition rejects an item missing audience", async () => {
  const sql = routingFakeSql({});
  await assert.rejects(
    () => createChecklistDefinition({ title: "x", items: [{ key: "a", label: "a", weight: 1 }] }, { sql, idGenerator: FIXED_ID }),
    /audience/
  );
  assert.equal(sql.calls.length, 0);
});

test("listChecklistDefinitions returns id/title pairs only, ordered by title", async () => {
  const sql = routingFakeSql({ definitions: [{ id: "def-2", title: "Zebra Checklist" }, { id: "def-1", title: "Alpha Checklist" }] });
  const list = await listChecklistDefinitions({ sql });
  assert.deepEqual(list, [{ id: "def-2", title: "Zebra Checklist" }, { id: "def-1", title: "Alpha Checklist" }]);
  assert.match(sql.calls[0].text, /ORDER BY title/);
});

test("getChecklistDefinition returns null for a nonexistent id", async () => {
  const sql = routingFakeSql({ definitions: [] });
  assert.equal(await getChecklistDefinition("nope", { sql }), null);
});

test("recordCustomerAnswer rejects an item that doesn't exist on the checklist", async () => {
  const sql = routingFakeSql({ definitions: [definitionRow()] });
  await assert.rejects(
    () => recordCustomerAnswer("org-a", "def-1", "cust-1", { itemKey: "nope", met: true }, { sql, now: FIXED_NOW }),
    /no item "nope"/
  );
});

test("recordCustomerAnswer refuses to answer a staff-audience item", async () => {
  const sql = routingFakeSql({ definitions: [definitionRow()], submissions: [submissionRow()] });
  await assert.rejects(
    () => recordCustomerAnswer("org-a", "def-1", "cust-1", { itemKey: "onsite_review", met: true }, { sql, now: FIXED_NOW }),
    /staff-only/
  );
});

test("recordCustomerAnswer refuses to write while the submission is under review", async () => {
  const sql = routingFakeSql({ definitions: [definitionRow()], submissions: [submissionRow({ status: "submitted" })] });
  await assert.rejects(
    () => recordCustomerAnswer("org-a", "def-1", "cust-1", { itemKey: "mfa_enabled", met: true }, { sql, now: FIXED_NOW }),
    /not editable right now/
  );
});

test("recordCustomerAnswer refuses to write once verified", async () => {
  const sql = routingFakeSql({ definitions: [definitionRow()], submissions: [submissionRow({ status: "verified" })] });
  await assert.rejects(
    () => recordCustomerAnswer("org-a", "def-1", "cust-1", { itemKey: "mfa_enabled", met: true }, { sql, now: FIXED_NOW }),
    /not editable right now/
  );
});

test("recordCustomerAnswer succeeds for a draft submission, inserts, and audits", async () => {
  const sql = routingFakeSql({ definitions: [definitionRow()], submissions: [submissionRow()] });
  const auditRecorder = fakeAuditRecorder();
  await recordCustomerAnswer("org-a", "def-1", "cust-1", { itemKey: "mfa_enabled", met: true, comment: "enabled everywhere" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder });
  const insertCall = sql.calls.find((c) => c.text.includes("INSERT INTO checklist_responses"));
  assert.ok(insertCall);
  assert.ok(insertCall.values.includes(true));
  assert.ok(insertCall.values.includes("enabled everywhere"));
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "checklist.answer");
  assert.equal(auditRecorder.events[0].actorId, "cust-1");
});

test("recordCustomerAnswer succeeds for a returned submission (customer fixing per staff feedback)", async () => {
  const sql = routingFakeSql({ definitions: [definitionRow()], submissions: [submissionRow({ status: "returned", review_note: "please recheck backups" })] });
  await assert.doesNotReject(() =>
    recordCustomerAnswer("org-a", "def-1", "cust-1", { itemKey: "backups", met: true }, { sql, now: FIXED_NOW })
  );
});

test("recordStaffAssessment sets staffVerified/staffNote on a customer item without overwriting the customer's met answer", async () => {
  const sql = routingFakeSql({
    definitions: [definitionRow()],
    submissions: [submissionRow()],
    responses: [{ met: true }], // existing customer answer: met = true
  });
  const auditRecorder = fakeAuditRecorder();
  await recordStaffAssessment("org-a", "def-1", "staff-1", { itemKey: "mfa_enabled", met: false, staffNote: "verified via screenshare", staffVerified: true }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder });
  const insertCall = sql.calls.find((c) => c.text.includes("INSERT INTO checklist_responses"));
  // met stays the customer's true, NOT the staff-supplied false -- audience is "customer"
  assert.ok(insertCall.values.includes(true));
  assert.ok(insertCall.values.includes("verified via screenshare"));
  assert.equal(auditRecorder.events[0].action, "checklist.staff_assess");
});

test("recordStaffAssessment DOES set met for a staff-audience item", async () => {
  const sql = routingFakeSql({ definitions: [definitionRow()], submissions: [submissionRow()], responses: [] });
  await recordStaffAssessment("org-a", "def-1", "staff-1", { itemKey: "onsite_review", met: true, staffVerified: true }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID });
  const insertCall = sql.calls.find((c) => c.text.includes("INSERT INTO checklist_responses"));
  assert.ok(insertCall.values.includes(true));
});

test("recordStaffAssessment rejects an item that doesn't exist", async () => {
  const sql = routingFakeSql({ definitions: [definitionRow()] });
  await assert.rejects(
    () => recordStaffAssessment("org-a", "def-1", "staff-1", { itemKey: "nope", staffVerified: true }, { sql, now: FIXED_NOW }),
    /no item "nope"/
  );
});

test("submitChecklistForReview transitions draft -> submitted and audits", async () => {
  const sql = routingFakeSql({ submissions: [submissionRow({ status: "draft" })] });
  const auditRecorder = fakeAuditRecorder();
  const result = await submitChecklistForReview("org-a", "def-1", "cust-1", { sql, now: FIXED_NOW, auditRecorder });
  assert.equal(result.status, "submitted");
  assert.match(sql.calls.find((c) => c.text.includes("UPDATE checklist_submissions")).text, /status = 'submitted'/);
  assert.equal(auditRecorder.events[0].action, "checklist.submit");
});

test("submitChecklistForReview refuses to submit an already-submitted checklist", async () => {
  const sql = routingFakeSql({ submissions: [submissionRow({ status: "submitted" })] });
  await assert.rejects(() => submitChecklistForReview("org-a", "def-1", "cust-1", { sql, now: FIXED_NOW }), /cannot move from "submitted"/);
});

test("reviewChecklistSubmission requires a reviewNote when returning", async () => {
  const sql = routingFakeSql({ submissions: [submissionRow({ status: "submitted" })] });
  await assert.rejects(
    () => reviewChecklistSubmission("org-a", "def-1", "staff-1", { action: "return" }, { sql, now: FIXED_NOW }),
    /reviewNote is required/
  );
});

test("reviewChecklistSubmission returns a submission for changes with a note, and audits", async () => {
  const sql = routingFakeSql({ submissions: [submissionRow({ status: "submitted" })] });
  const auditRecorder = fakeAuditRecorder();
  const result = await reviewChecklistSubmission("org-a", "def-1", "staff-1", { action: "return", reviewNote: "please recheck backups" }, { sql, now: FIXED_NOW, auditRecorder });
  assert.equal(result.status, "returned");
  assert.equal(result.reviewNote, "please recheck backups");
  assert.equal(auditRecorder.events[0].action, "checklist.return");
});

test("reviewChecklistSubmission verifies a submission, and audits", async () => {
  const sql = routingFakeSql({ submissions: [submissionRow({ status: "submitted" })] });
  const auditRecorder = fakeAuditRecorder();
  const result = await reviewChecklistSubmission("org-a", "def-1", "staff-1", { action: "verify" }, { sql, now: FIXED_NOW, auditRecorder });
  assert.equal(result.status, "verified");
  assert.equal(auditRecorder.events[0].action, "checklist.verify");
});

test("reviewChecklistSubmission verifying after a prior return does NOT leak the stale reviewNote (real bug caught by the Session 20 live smoke test)", async () => {
  // Simulates: submitted -> returned (with a note) -> resubmitted -> verified.
  // `current` fetched inside this call reflects the row as it stood
  // BEFORE this transition -- i.e. it still carries the old reviewNote
  // from the earlier return, even though this "verify" call clears it.
  const sql = routingFakeSql({ submissions: [submissionRow({ status: "submitted", review_note: "please recheck backups" })] });
  const result = await reviewChecklistSubmission("org-a", "def-1", "staff-1", { action: "verify" }, { sql, now: FIXED_NOW });
  assert.equal(result.status, "verified");
  assert.equal("reviewNote" in result, false, "a fresh verify must not carry forward a stale reviewNote from a prior return");
});

test("reviewChecklistSubmission refuses to review a draft (nothing submitted yet)", async () => {
  const sql = routingFakeSql({ submissions: [submissionRow({ status: "draft" })] });
  await assert.rejects(() => reviewChecklistSubmission("org-a", "def-1", "staff-1", { action: "verify" }, { sql, now: FIXED_NOW }), /cannot move from "draft"/);
});

test("getChecklistForCustomer returns only customer-audience items, never staffNote/staffVerified", async () => {
  const sql = routingFakeSql({
    definitions: [definitionRow()],
    responses: [
      { item_key: "mfa_enabled", met: true, comment: "done" },
      { item_key: "onsite_review", met: true, staff_note: "internal only", staff_verified: true },
    ],
    submissions: [submissionRow({ status: "draft" })],
  });
  const result = await getChecklistForCustomer("org-a", "def-1", { sql });
  assert.equal(result.definition.items.length, 2); // only the two customer-audience items
  assert.ok(result.definition.items.every((i) => i.audience === "customer"));
  assert.equal(JSON.stringify(result).includes("internal only"), false);
  assert.equal(JSON.stringify(result).includes("staffVerified"), false);
});

test("getChecklistForCustomer surfaces the review note only when returned", async () => {
  const sqlReturned = routingFakeSql({
    definitions: [definitionRow()],
    responses: [],
    submissions: [submissionRow({ status: "returned", review_note: "please recheck backups" })],
  });
  const returnedResult = await getChecklistForCustomer("org-a", "def-1", { sql: sqlReturned });
  assert.equal(returnedResult.submission.reviewNote, "please recheck backups");

  const sqlSubmitted = routingFakeSql({
    definitions: [definitionRow()],
    responses: [],
    submissions: [submissionRow({ status: "submitted" })],
  });
  const submittedResult = await getChecklistForCustomer("org-a", "def-1", { sql: sqlSubmitted });
  assert.equal(submittedResult.submission.reviewNote, null);
});

test("getChecklistForCustomer throws for a nonexistent definition", async () => {
  const sql = routingFakeSql({ definitions: [] });
  await assert.rejects(() => getChecklistForCustomer("org-a", "nope", { sql }), /no checklist definition/);
});

test("getChecklistForStaff returns every item (both audiences) with staffNote/staffVerified and a computed score", async () => {
  const sql = routingFakeSql({
    definitions: [definitionRow()],
    responses: [
      { item_key: "mfa_enabled", met: true, comment: "done", staff_note: null, staff_verified: true },
      { item_key: "backups", met: false, comment: null, staff_note: null, staff_verified: false },
      { item_key: "onsite_review", met: true, comment: null, staff_note: "checked in person", staff_verified: true },
    ],
    submissions: [submissionRow({ status: "submitted" })],
  });
  const result = await getChecklistForStaff("org-a", "def-1", { sql });
  assert.equal(result.definition.items.length, 3);
  const mfaAnswer = result.answers.find((a) => a.itemKey === "mfa_enabled");
  assert.equal(mfaAnswer.staffVerified, true);
  const onsiteAnswer = result.answers.find((a) => a.itemKey === "onsite_review");
  assert.equal(onsiteAnswer.staffNote, "checked in person");
  // mfa_enabled (2) + onsite_review (1) met = 3, backups (1) unmet -> 3/4
  assert.equal(result.score.score, 0.75);
  assert.equal(result.submission.status, "submitted");
});
