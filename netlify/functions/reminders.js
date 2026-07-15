// reminders.js -- HTTP endpoint for F048 (Warranty/License Lifecycle
// Reminders) and F037 (Domain/SSL/Subscription Renewal Tracking), which
// already share one persistence module (reminderStore.js) and one pure
// engine (src/reminders/lifecycleReminders.js).
//
// Routes:
//   POST /reminders -- create a reminder for an expiring subject
//                       (platform_admin, customer.administer)
//   GET  /reminders?organizationId= -- list an org's reminders (all
//                       customer roles, reminder.view -- informational,
//                       e.g. "your SSL certificate expires in 12 days")

const { json } = require("./_lib/auth_utils");
const { authenticateForOrg, authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const { createReminder, listRemindersForOrganization } = require("../../src/db/reminderStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "POST") return handleCreate(event, deps);
  if (event.httpMethod === "GET") return handleList(event, deps);
  return json(405, { error: "Method not allowed" });
};

async function handleCreate(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { organizationId, subjectId, subjectType, expiresAt } = body;
  if (!organizationId || !subjectId || !subjectType || !expiresAt) {
    return json(400, { error: "organizationId, subjectId, subjectType, and expiresAt are required." });
  }

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "customer.administer");
  if (deny) return deny;

  try {
    const reminder = await createReminder({ organizationId, subjectId, subjectType, expiresAt }, deps);
    return json(201, { reminder });
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function handleList(event, deps) {
  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;
  if (!organizationId) return json(400, { error: "organizationId is required." });

  const auth = await authenticateForOrg(event, organizationId, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, organizationId, "reminder.view");
  if (deny) return deny;

  const reminders = await listRemindersForOrganization(organizationId, deps);
  return json(200, { reminders });
}
