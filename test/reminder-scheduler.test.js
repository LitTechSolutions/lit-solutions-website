const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/reminder-scheduler");

const NOW = () => new Date("2026-07-14T00:00:00.000Z");

function routingFakeSql({ reminders = [], memberships = [] } = {}) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("lifecycle_reminders") && text.includes("SELECT")) return reminders;
    if (text.includes("organization_memberships")) return memberships;
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeStore(usersByKey) {
  return (name) => {
    if (name !== "users") throw new Error(`unexpected store name: ${name}`);
    return {
      list: async () => ({ blobs: Object.keys(usersByKey).map((key) => ({ key })) }),
      get: async (key) => usersByKey[key],
    };
  };
}

function reminderRow(overrides = {}) {
  // 6 days out from NOW -- within the default 30-day evaluateReminder() window.
  return { id: "r1", organization_id: "org-a", subject_id: "asset-1", subject_type: "warranty", expires_at: "2026-07-20T00:00:00.000Z", sent: false, ...overrides };
}

test("sends a reminder email to the organization's owner and marks it sent", async () => {
  const sql = routingFakeSql({ reminders: [reminderRow()], memberships: [{ user_id: "user-owner-1" }] });
  const store = fakeStore({ "owner@example.com": { id: "user-owner-1", email: "owner@example.com", name: "Owner" } });
  const sentEmails = [];
  const sendEmail = async (input) => {
    sentEmails.push(input);
    return { sent: true };
  };

  const result = await handler({}, {}, { sql, store, sendEmail, now: NOW });

  assert.equal(JSON.parse(result.body).sentCount, 1);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "owner@example.com");
  assert.match(sentEmails[0].subject, /warranty/);
  assert.ok(sql.calls.some((c) => /UPDATE lifecycle_reminders/.test(c.text)), "should mark the reminder sent");
});

test("does not mark a reminder sent when the email fails to send, so it can retry on the next run", async () => {
  const sql = routingFakeSql({ reminders: [reminderRow()], memberships: [{ user_id: "user-owner-1" }] });
  const store = fakeStore({ "owner@example.com": { id: "user-owner-1", email: "owner@example.com", name: "Owner" } });
  const sendEmail = async () => ({ sent: false, reason: "provider error 500" });

  const result = await handler({}, {}, { sql, store, sendEmail, now: NOW });

  const body = JSON.parse(result.body);
  assert.equal(body.sentCount, 0);
  assert.equal(body.skippedCount, 1);
  assert.ok(!sql.calls.some((c) => /UPDATE lifecycle_reminders/.test(c.text)), "must not mark sent when delivery failed");
});

test("skips a reminder when no active org_owner membership exists for its organization", async () => {
  const sql = routingFakeSql({ reminders: [reminderRow()], memberships: [] });
  const store = fakeStore({});
  let emailsSent = 0;
  const sendEmail = async () => {
    emailsSent += 1;
    return { sent: true };
  };

  const result = await handler({}, {}, { sql, store, sendEmail, now: NOW });

  assert.equal(emailsSent, 0);
  const body = JSON.parse(result.body);
  assert.equal(body.sentCount, 0);
  assert.equal(body.skippedCount, 1);
});

test("skips a reminder when the resolved owner id has no matching user record", async () => {
  const sql = routingFakeSql({ reminders: [reminderRow()], memberships: [{ user_id: "user-ghost" }] });
  const store = fakeStore({}); // no matching blob for user-ghost
  let emailsSent = 0;
  const sendEmail = async () => {
    emailsSent += 1;
    return { sent: true };
  };

  const result = await handler({}, {}, { sql, store, sendEmail, now: NOW });

  assert.equal(emailsSent, 0);
  assert.equal(JSON.parse(result.body).skippedCount, 1);
});

test("does nothing when there are no due reminders", async () => {
  const sql = routingFakeSql({ reminders: [], memberships: [] });
  const store = fakeStore({});
  let emailsSent = 0;
  const sendEmail = async () => {
    emailsSent += 1;
    return { sent: true };
  };

  const result = await handler({}, {}, { sql, store, sendEmail, now: NOW });

  assert.equal(emailsSent, 0);
  assert.deepEqual(JSON.parse(result.body), { totalDue: 0, sentCount: 0, skippedCount: 0 });
});

test("exports a daily schedule for Netlify's scheduled-function trigger", () => {
  const { config } = require("../netlify/functions/reminder-scheduler");
  assert.equal(config.schedule, "@daily");
});
