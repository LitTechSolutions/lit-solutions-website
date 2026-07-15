const test = require("node:test");
const assert = require("node:assert/strict");
const { createTicket, getTicketById, listTicketsForOrganization, transitionTicket, mapRowToTicket } = require("./ticketStore");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "ticket-fixed-id";

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

function ticketRow(overrides = {}) {
  return {
    id: "ticket-1",
    organization_id: "org-a",
    category: "website_change",
    subject: "Update hours",
    description: "Our hours changed",
    status: "submitted",
    details: null,
    submitted_at: "2026-07-01T00:00:00.000Z",
    submitted_by: "user-1",
    updated_at: "2026-07-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

// Integration: createTicket goes through shapeTicketSubmission(), so the
// placeholder-junk rejection (audit finding F018) applies here too.
test("integration: createTicket rejects a placeholder-junk detail value via ticketSubmission.js", async () => {
  const sql = fakeSql();
  await assert.rejects(
    () =>
      createTicket(
        { organizationId: "org-a", category: "it_support", subject: "x", description: "y", submittedBy: "u", details: { deviceType: "n/a" } },
        { sql, now: FIXED_NOW, idGenerator: FIXED_ID }
      ),
    /placeholder value/
  );
  assert.equal(sql.calls.length, 0, "must not insert when submission shaping rejects the input");
});

test("createTicket shapes and inserts a valid submission", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const ticket = await createTicket(
    { organizationId: "org-a", category: "website_change", subject: "Update hours", description: "Our hours changed", submittedBy: "user-1" },
    { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder }
  );
  assert.equal(ticket.status, "submitted");
  assert.match(sql.calls[0].text, /INSERT INTO tickets/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "ticket.create");
  assert.equal(auditRecorder.events[0].actorId, "user-1");
});

test("getTicketById returns null for no match", async () => {
  const sql = fakeSql([]);
  assert.equal(await getTicketById("nope", { sql }), null);
});

test("listTicketsForOrganization scopes by organization", async () => {
  const sql = fakeSql([ticketRow()]);
  const tickets = await listTicketsForOrganization("org-a", { sql });
  assert.equal(tickets.length, 1);
  assert.match(sql.calls[0].text, /WHERE organization_id/);
});

// Integration: transitionTicket goes through the pure ticketLifecycle.js
// state machine.
test("integration: transitionTicket allows a legal transition, persists it, and audits the actor", async () => {
  const sql = fakeSql([ticketRow({ status: "submitted" })]);
  const auditRecorder = fakeAuditRecorder();
  const result = await transitionTicket("ticket-1", "triaged", "tech-1", { sql, now: FIXED_NOW, auditRecorder });
  assert.equal(result.status, "triaged");
  assert.match(sql.calls[1].text, /UPDATE tickets/);
  assert.match(sql.calls[1].text, /status = .* AND version =/);
  assert.match(sql.calls[1].text, /INSERT INTO audit_events/);
  assert.match(sql.calls[1].text, /FROM changed/);
});

test("integration: transitionTicket refuses an illegal transition without persisting or auditing", async () => {
  const sql = fakeSql([ticketRow({ status: "submitted" })]);
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(() => transitionTicket("ticket-1", "closed", "tech-1", { sql, now: FIXED_NOW, auditRecorder }), /cannot move from/);
  assert.equal(sql.calls.length, 1, "only the SELECT ran, no UPDATE");
  assert.equal(auditRecorder.events.length, 0);
});

test("transitionTicket throws for a nonexistent ticket", async () => {
  const sql = fakeSql([]);
  await assert.rejects(() => transitionTicket("nope", "triaged", "tech-1", { sql, now: FIXED_NOW }), /no ticket/);
});

test("mapRowToTicket omits details when null", () => {
  const mapped = mapRowToTicket(ticketRow());
  assert.equal("details" in mapped, false);
});
