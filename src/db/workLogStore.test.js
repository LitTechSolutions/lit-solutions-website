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

test("recordTimeEntry validates and inserts", async () => {
  const sql = fakeSql();
  const entry = await recordTimeEntry({ ticketId: "t1", technicianUserId: "tech-1", minutes: 30 }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID });
  assert.equal(entry.minutes, 30);
  assert.match(sql.calls[0].text, /INSERT INTO time_entries/);
});

test("recordTimeEntry rejects non-positive minutes before querying", async () => {
  const sql = fakeSql();
  await assert.rejects(() => recordTimeEntry({ ticketId: "t1", technicianUserId: "tech-1", minutes: 0 }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID }));
  assert.equal(sql.calls.length, 0);
});

test("recordInternalNote always persists customerVisible: false", async () => {
  const sql = fakeSql();
  const note = await recordInternalNote({ ticketId: "t1", authorUserId: "tech-1", body: "Diagnosed the issue" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID });
  assert.equal(note.customerVisible, false);
  assert.ok(sql.calls[0].values.includes(false));
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
