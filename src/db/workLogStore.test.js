const test = require("node:test");
const assert = require("node:assert/strict");
const { recordTimeEntry, recordInternalNote, getTotalMinutesForTicket, mapRowToTimeEntry } = require("./workLogStore");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "worklog-fixed-id";

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

test("recordTimeEntry validates and inserts", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const entry = await recordTimeEntry({ ticketId: "t1", technicianUserId: "tech-1", minutes: 30 }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder, actorId: "tech-1" });
  assert.equal(entry.minutes, 30);
  assert.match(sql.calls[0].text, /INSERT INTO time_entries/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "work_log.time_entry");
  assert.equal(auditRecorder.events[0].actorId, "tech-1");
});

test("recordTimeEntry rejects non-positive minutes before querying", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(() => recordTimeEntry({ ticketId: "t1", technicianUserId: "tech-1", minutes: 0 }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder }));
  assert.equal(sql.calls.length, 0);
  assert.equal(auditRecorder.events.length, 0);
});

test("recordInternalNote always persists customerVisible: false", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const note = await recordInternalNote({ ticketId: "t1", authorUserId: "tech-1", body: "Diagnosed the issue" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder, actorId: "tech-1" });
  assert.equal(note.customerVisible, false);
  assert.ok(sql.calls[0].values.includes(false));
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "work_log.internal_note");
  assert.equal(auditRecorder.events[0].actorId, "tech-1");
});

// Integration: fetched rows feed into the pure timeTracking.js aggregator.
test("integration: getTotalMinutesForTicket aggregates persisted entries via timeTracking.js", async () => {
  const sql = fakeSql([
    { id: "te1", ticket_id: "t1", technician_user_id: "tech-1", minutes: 30, recorded_at: "2026-07-01T00:00:00.000Z", note: null },
    { id: "te2", ticket_id: "t1", technician_user_id: "tech-2", minutes: 15, recorded_at: "2026-07-02T00:00:00.000Z", note: null },
  ]);
  const total = await getTotalMinutesForTicket("t1", { sql });
  assert.equal(total, 45);
});

test("getTotalMinutesForTicket returns 0 for a ticket with no entries", async () => {
  const sql = fakeSql([]);
  assert.equal(await getTotalMinutesForTicket("t1", { sql }), 0);
});

test("mapRowToTimeEntry omits note when null", () => {
  const mapped = mapRowToTimeEntry({ id: "te1", ticket_id: "t1", technician_user_id: "tech-1", minutes: 30, recorded_at: "2026-07-01T00:00:00.000Z", note: null });
  assert.equal("note" in mapped, false);
});
