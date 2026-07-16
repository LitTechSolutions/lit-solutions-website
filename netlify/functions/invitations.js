// invitations.js -- HTTP endpoint for F002 (Customer Invitation & Account
// Activation), admin-management half. Registration is invite-only at
// launch (OWNER_DECISIONS.md #4) -- this is the ONLY way a Care Hub
// customer account gets created; see invitation-accept.js for the public
// activation half. Thin adapter over src/db/invitationStore.js; every
// lifecycle decision still happens in src/policy/invitationLifecycle.js.
//
// Routes (platform_admin only -- legacy "admin" session role, customer.
// administer, matches the existing capability rbac.js already grants for
// managing customer accounts; no new rbac.js action needed):
//   POST   /invitations -- create an invitation for {organizationId, email, role}
//   GET    /invitations?organizationId=... -- list invitations for an org
//   PATCH  /invitations -- { invitationId, action: "revoke" | "resend" }

const { json } = require("./_lib/auth_utils");
const { authenticatePlatformAction, denyResponseFor } = require("./_lib/care_hub_auth");
const { sendEmail } = require("./_lib/email");
const { siteOrigin } = require("./_lib/verification");
const { createInvitation, listInvitationsForOrganization, revokeInvitation, resendInvitation } = require("../../src/db/invitationStore");

// Staff (technician) accounts are provisioned out of band, not through
// this customer-facing invitation flow (see src/domain/invitation.js's
// module comment) -- platform_admin/automated_service are already
// rejected by assertValidInvitation itself.
const INVITABLE_ROLES = ["org_owner", "org_member", "read_only_customer"];

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "POST") return handleCreate(event, deps);
  if (event.httpMethod === "GET") return handleList(event, deps);
  if (event.httpMethod === "PATCH") return handleAction(event, deps);
  return json(405, { error: "Method not allowed" });
};

async function handleCreate(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { organizationId, email, role } = body;
  if (!organizationId || !email || !role) {
    return json(400, { error: "organizationId, email, and role are required." });
  }
  if (!INVITABLE_ROLES.includes(role)) {
    return json(400, { error: `role must be one of ${INVITABLE_ROLES.join(", ")}.` });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: "A valid email is required." });
  }

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "customer.administer");
  if (deny) return deny;

  try {
    const { invitation, token } = await createInvitation({ organizationId, email, role, invitedBy: auth.session.userId }, deps);
    await sendInvitationEmail(event, invitation, token, deps);
    return json(201, { invitation });
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function handleList(event, deps) {
  const organizationId = event.queryStringParameters && event.queryStringParameters.organizationId;
  if (!organizationId) return json(400, { error: "organizationId is required." });

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "customer.administer");
  if (deny) return deny;

  const invitations = await listInvitationsForOrganization(organizationId, deps);
  return json(200, { invitations });
}

async function handleAction(event, deps) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { invitationId, action } = body;
  if (!invitationId || !["revoke", "resend"].includes(action)) {
    return json(400, { error: 'invitationId and action ("revoke" or "resend") are required.' });
  }

  const auth = await authenticatePlatformAction(event, deps);
  if (!auth.ok) return auth.response;

  const deny = denyResponseFor(auth.authContext, null, "customer.administer");
  if (deny) return deny;

  try {
    if (action === "revoke") {
      const invitation = await revokeInvitation(invitationId, auth.session.userId, deps);
      return json(200, { invitation });
    }
    const { invitation, token } = await resendInvitation(invitationId, deps);
    await sendInvitationEmail(event, invitation, token, deps);
    return json(200, { invitation });
  } catch (err) {
    return json(400, { error: err.message });
  }
}

async function sendInvitationEmail(event, invitation, token, deps) {
  const sendEmailFn = deps.sendEmail || sendEmail;
  // Care Hub invitations create Care Hub (Postgres/organization-based)
  // accounts, a different account system from the legacy Blobs-based
  // myaccount.html -- this must land in the Care Hub React app, not the
  // legacy site. Was previously wired to a myaccount.html hash route
  // that was never built (a copy-paste leftover from before the Care Hub
  // frontend existed) -- the link has never actually worked.
  const link = `${siteOrigin(event)}/care-hub/invite?token=${token}`;
  await sendEmailFn({
    to: invitation.email,
    subject: "You're invited to the Little Technical Solutions LLC Care Hub",
    html:
      `<p>You've been invited to activate a Care Hub account.</p>` +
      `<p><a href="${link}">${link}</a></p>` +
      `<p>This link is single-use and expires in 7 days. If you weren't expecting this invitation, you can ignore this email.</p>`,
  });
}
