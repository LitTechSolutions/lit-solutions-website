// reminder-scheduler.js -- scheduled job for F048/F037 (Warranty/
// License/Domain/SSL Lifecycle Reminders). reminderStore.js's
// listDueReminders()/markReminderSent() already existed and already run
// every due reminder through the pure evaluateReminder() engine -- the
// piece that never existed was anything actually calling them on a
// schedule. This is that piece, plus resolving who to email and sending
// it.
//
// Netlify Scheduled Functions: `exports.config.schedule` below is what
// registers the cron trigger at deploy time (read by Netlify, not this
// codebase) -- this function is never invoked over HTTP. "@daily" runs
// once a day; the reminder window itself (evaluateReminder's default
// 30-day threshold) tolerates a daily cadence fine.
//
// Only the organization's org_owner is notified, matching Approvals'
// "the owner is the customer's authorized decision-maker" precedent --
// org_member/read_only_customer are never the intended recipient of a
// billing/lifecycle notice.
//
// A reminder is marked sent ONLY when the email actually sends
// (reminderStore.js's own documented contract: "a delivery failure
// doesn't silently lose the reminder") -- a transient email-provider
// failure, or email simply not being configured yet, leaves it in the
// due queue to retry on the next run instead of disappearing.

const { listDueReminders, markReminderSent } = require("../../src/db/reminderStore");
const { getOrganizationOwnerUserId } = require("../../src/db/membershipStore");
const { store } = require("./_lib/blob_store");
const { sendEmail } = require("./_lib/email");
const { json } = require("./_lib/auth_utils");

// Same "scan every user blob for a matching id" shape as account.js's/
// messages.js's/mfa-manage.js's own findUserById -- this codebase has no
// shared users-by-id lookup to import instead, and each caller
// duplicates this small scan locally rather than introducing one.
async function findUserById(uid, deps) {
  const storeFn = deps.store || store;
  const usersStore = storeFn("users");
  const { blobs } = await usersStore.list();
  for (const b of blobs) {
    const u = await usersStore.get(b.key, { type: "json" });
    if (u && u.id === uid) return u;
  }
  return null;
}

function reminderEmailHtml(reminder) {
  const expiresLabel = new Date(reminder.expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return (
    `<p>This is a reminder that your ${reminder.subjectType} (reference: ${reminder.subjectId}) is expiring on ${expiresLabel}.</p>` +
    `<p>Sign in to the Care Hub to review this, or reply to this email if you have any questions.</p>`
  );
}

exports.config = { schedule: "@daily" };

exports.handler = async (event, context, deps = {}) => {
  const dueReminders = await listDueReminders(deps);
  const sendEmailFn = deps.sendEmail || sendEmail;

  let sentCount = 0;
  let skippedCount = 0;

  for (const reminder of dueReminders) {
    const ownerUserId = await getOrganizationOwnerUserId(reminder.organizationId, deps);
    if (!ownerUserId) {
      skippedCount += 1;
      continue;
    }

    const owner = await findUserById(ownerUserId, deps);
    if (!owner || !owner.email) {
      skippedCount += 1;
      continue;
    }

    const result = await sendEmailFn({
      to: owner.email,
      subject: `Reminder: your ${reminder.subjectType} expires soon`,
      html: reminderEmailHtml(reminder),
    });

    if (!result.sent) {
      skippedCount += 1;
      continue;
    }

    await markReminderSent(reminder.id, deps);
    sentCount += 1;
  }

  return json(200, { totalDue: dueReminders.length, sentCount, skippedCount });
};
