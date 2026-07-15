// invitation-accept.js -- HTTP endpoint for F002's public activation
// half. No session required (that's the point -- this is how a
// brand-new user gets one) and no admin authorization either; the
// single-use invitation token IS the authorization. Registration is
// invite-only at launch (OWNER_DECISIONS.md #4) -- auth-register.js's
// open self-registration stays behind a disabled feature flag, so this
// is the only real path to a new Care Hub account right now.
//
// Routes:
//   GET  /invitation-accept?token=... -- peek (email/role/org name/expiry)
//                                          before asking for a password,
//                                          without creating anything
//   POST /invitation-accept -- { token, name, password, termsAccepted, marketingConsent }
//                                activates the account
//
// Rate-limited by IP on both routes (brute-force/enumeration defense,
// same rateLimited() helper auth-login.js already uses) -- token guessing
// is the only realistic attack surface here, since the token itself
// carries all the authorization.

const crypto = require("node:crypto");
const { json, rateLimited, hashPassword } = require("./_lib/auth_utils");
const { getJSON: realGetJSON, setJSON: realSetJSON } = require("./_lib/blob_store");
const { acceptInvitation, getInvitationByTokenHash } = require("../../src/db/invitationStore");
const { hashInvitationToken } = require("../../src/policy/invitationLifecycle");
const { getOrganizationById } = require("../../src/db/organizationStore");
const { createMembership } = require("../../src/db/membershipStore");
const { recordConsent } = require("../../src/db/consentStore");
const { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } = require("../../src/domain/consent");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod === "GET") return handlePeek(event, deps);
  if (event.httpMethod === "POST") return handleActivate(event, deps);
  return json(405, { error: "Method not allowed" });
};

function clientIp(event) {
  return event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || "unknown";
}

async function handlePeek(event, deps) {
  const rateLimitedFn = deps.rateLimited || rateLimited;
  const ip = clientIp(event);
  if (await rateLimitedFn("invitation-peek", ip, 30, 300)) {
    return json(429, { error: "Too many attempts. Try again in a few minutes." });
  }

  const token = event.queryStringParameters && event.queryStringParameters.token;
  if (!token) return json(400, { error: "token is required." });

  const invitation = await getInvitationByTokenHash(hashInvitationToken(token), deps);
  const GENERIC_ERROR = json(404, { error: "This invitation link is invalid or has expired." });
  if (!invitation || invitation.status !== "pending" || new Date(invitation.expiresAt).getTime() <= Date.now()) {
    return GENERIC_ERROR;
  }

  const organization = await getOrganizationById(invitation.organizationId, deps);
  return json(200, {
    email: invitation.email,
    role: invitation.role,
    organizationName: organization ? organization.name : null,
    expiresAt: invitation.expiresAt,
  });
}

async function handleActivate(event, deps) {
  const rateLimitedFn = deps.rateLimited || rateLimited;
  const ip = clientIp(event);
  if (await rateLimitedFn("invitation-accept", ip, 10, 300)) {
    return json(429, { error: "Too many attempts. Try again in a few minutes." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON" });
  }
  const { token, name, password, termsAccepted, marketingConsent } = body;
  if (!token || !name || !name.trim() || !password) {
    return json(400, { error: "token, name, and password are required." });
  }
  if (password.length < 10) {
    return json(400, { error: "Password must be at least 10 characters." });
  }
  // The consent checkbox is unchecked by default (OWNER_DECISIONS.md #5) --
  // the server never infers acceptance; the client must have sent an
  // explicit true.
  if (termsAccepted !== true) {
    return json(400, { error: "You must agree to the Terms of Service and acknowledge the Privacy Policy to continue." });
  }

  const hashPasswordFn = deps.hashPassword || hashPassword;
  const getJSON = deps.getJSON || realGetJSON;
  const setJSON = deps.setJSON || realSetJSON;
  const idGenerator = deps.idGenerator || (() => crypto.randomBytes(12).toString("hex"));

  let invitation;
  try {
    invitation = await acceptInvitation(token, deps);
  } catch (err) {
    return json(400, { error: err.message });
  }

  // A Blobs user with this email may already exist (e.g. re-invited to a
  // second organization) -- reuse it rather than creating a duplicate
  // account; only a fresh invitee gets a brand-new Blobs user record.
  const key = invitation.email.toLowerCase();
  let user = await getJSON("users", key);
  if (!user) {
    const passwordHash = await hashPasswordFn(password);
    user = {
      id: idGenerator(),
      email: key,
      name: name.trim(),
      passwordHash,
      role: "customer",
      // The invitation link itself, delivered to this exact email address,
      // is the email-ownership proof -- no separate verification email is
      // sent (unlike auth-register.js's open self-registration path).
      verified: true,
      createdAt: Date.now(),
    };
    await setJSON("users", key, user);
  }

  await createMembership({ organizationId: invitation.organizationId, userId: user.id, role: invitation.role, status: "active", invitedBy: invitation.invitedBy }, deps);

  await recordConsent({ userId: user.id, organizationId: invitation.organizationId, consentType: "terms_privacy", granted: true, termsVersion: CURRENT_TERMS_VERSION, privacyVersion: CURRENT_PRIVACY_VERSION, ipAddress: ip }, deps);
  await recordConsent({ userId: user.id, organizationId: invitation.organizationId, consentType: "marketing", granted: marketingConsent === true, ipAddress: ip }, deps);

  // No session cookie is issued here -- sign in separately via
  // auth-login.js, keeping this endpoint's only side effects "prove the
  // token, create the account," not "also start a session."
  return json(201, { message: "Account activated. Please sign in.", email: user.email });
}
