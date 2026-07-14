const test = require("node:test");
const assert = require("node:assert/strict");
const { createReminder, listDueReminders, markReminderSent } = require("./reminderStore");

const FIXED_ID = () => "reminder-fixed-id";
const NOW = () => new Date("2026-07-14T00:00:00.000Z");

function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return cannedRows;
  };
  tag.calls = calls;
  return tag;
}

function reminderRow(overrides = {}) {
  return { id: "r1", organization_id: "org-a", subject_id: "asset-1", subject_type: "warranty", expires_at: "2026-07-20T00:00:00.000Z", sent: false, ...overrides };
}

test("createReminder validates and inserts as not sent", async () => {
  const sql = fakeSql();
  const reminder = await createReminder({ organizationId: "org-a", subjectId: "asset-1", subjectType: "warranty", expiresAt: "2026-08-01T00:00:00.000Z" }, { sql, idGenerator: FIXED_ID });
  assert.equal(reminder.sent, false);
  assert.match(sql.calls[0].text, /INSERT INTO lifecycle_reminders/);
});

// Integration: F037 reuse -- an ssl_certificate subject type works identically.
test("createReminder accepts F037's ssl_certificate subject type (engine reuse)", async () => {
  const sql = fakeSql();
  const reminder = await createReminder({ organizationId: "org-a", subjectId: "profile-1", subjectType: "ssl_certificate", expiresAt: "2026-08-01T00:00:00.000Z" }, { sql, idGenerator: FIXED_ID });
  assert.equal(reminder.subjectType, "ssl_certificate");
});

// Integration: listDueReminders runs the pure evaluateReminder() engine over fetched rows.
test("integration: listDueReminders returns only reminders within the window via lifecycleReminders.js", async () => {
  const sql = fakeSql([
    reminderRow({ id: "due-soon", expires_at: "2026-07-20T00:00:00.000Z" }), // 6 days out, within default 30-day window
    reminderRow({ id: "far-future", expires_at: "2027-01-01T00:00:00.000Z" }),
  ]);
  const due = await listDueReminders({ sql, now: NOW });
  assert.equal(due.length, 1);
  assert.equal(due[0].id, "due-soon");
});

test("integration: listDueReminders excludes already-sent reminders at the query level", async () => {
  const sql = fakeSql([]);
  await listDueReminders({ sql, now: NOW });
  assert.match(sql.calls[0].text, /sent = false/);
});

test("markReminderSent issues an UPDATE", async () => {
  const sql = fakeSql();
  await markReminderSent("r1", { sql });
  assert.match(sql.calls[0].text, /UPDATE lifecycle_reminders/);
});
