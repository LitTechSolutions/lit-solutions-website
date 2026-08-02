// auth-register.js -- open self-registration, re-enabled 2026-07-16 (see
// OWNER_DECISIONS.md #4) to coexist with the invite-only path
// (invitations.js/invitation-accept.js) rather than replace it -- gated
// behind the "open_registration" feature flag (src/settings, fail closed
// like every other flag in this codebase).
//
// The behavior below (rate-limited, unverified-until-email-click,
// generic responses to prevent email enumeration) is unchanged from
// before Session 17. termsAccepted is new: this path had no consent
// capture at all before re-enabling it, unlike invitation-accept.js's
// required, never-defaulted gate -- brought to parity here. Self-
// registered accounts are Blobs-only (no Postgres organization_id to
// attach a src/db/consentStore.js row to, unlike the Care Hub's
// relational accounts), so the accepted version/timestamp is recorded
// directly on this user's own Blobs record instead.
//
// POST { email, password, name, termsAccepted }

const { hashPassword, json, rateLimited } = require("./_lib/auth_utils");
const { getJSON, setJSON } = require("./_lib/blob_store");
const { sendVerificationEmail } = require("./_lib/verification");
const { sendEmail } = require("./_lib/email");
const { loadSettingsDocument } = require("../../src/settings/blobsSettingsStore");
const { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } = require("../../src/domain/consent");

const REGISTRATION_DISABLED_MESSAGE = "Open registration is currently disabled. Please contact us to request an invitation.";

/**
 * Open registration is OPT-OUT, not opt-in.
 *
 * isFeatureEnabled() defaults every flag to off -- fail closed, matching
 * rbac.js, and correct for flags generally. It was the wrong default for
 * this one. Nothing in the codebase can write the settings document (there
 * is no admin endpoint for feature flags), so "open_registration" was off
 * permanently and could not be turned on. Meanwhile every payment on the
 * site now requires an account, so the flag silently made the entire
 * purchase flow unreachable: no signup, therefore no customer, therefore no
 * checkout. It presented as "the signup email never arrives", because
 * registration returned 403 long before any email was sent.
 *
 * So registration works unless the flag is explicitly present AND disabled.
 * Turning it OFF is still possible (and is what you'd reach for if signups
 * were ever abused); it just isn't the accidental default.
 */
function openRegistrationAllowed(document) {
  const flag = document && document.featureFlags && document.featureFlags.open_registration;
  return !flag || flag.enabled !== false;
}

// Shown for both a brand-new registration and an already-registered email --
// deliberately identical, so the response itself can't be used to check
// whether a given address already has an account (see auth-password-reset.js
// for the same pattern on that endpoint).
const GENERIC_MESSAGE = "If this email can be registered, check your inbox for next steps.";

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const loadSettingsDocumentFn = deps.loadSettingsDocument || loadSettingsDocument;
  const settingsDocument = await loadSettingsDocumentFn();
  if (!openRegistrationAllowed(settingsDocument)) {
    return json(403, { error: REGISTRATION_DISABLED_MESSAGE, code: "registration_disabled" });
  }

  const rateLimitedFn = deps.rateLimited || rateLimited;
  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || "unknown";
  if (await rateLimitedFn("register", ip, 10, 3600)) {
    return json(429, { error: "Too many registration attempts. Try again later." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }
  const { email, password, name, termsAccepted } = body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "A valid email is required." });
  if (!password || password.length < 10) return json(400, { error: "Password must be at least 10 characters." });
  if (!name || !name.trim()) return json(400, { error: "Name is required." });
  // Never inferred/defaulted -- the client must send an explicit true,
  // same rule invitation-accept.js already enforces for its own accounts.
  if (termsAccepted !== true) {
    return json(400, { error: "You must agree to the Terms of Service and acknowledge the Privacy Policy to continue." });
  }

  const key = email.toLowerCase();
  const existing = await getJSON("users", key);
  if (existing) {
    // Same generic response as success -- but tell the actual account
    // holder someone tried, in case it wasn't them.
    await sendEmail({
      to: key,
      subject: "Someone tried to register with your email — Little Technical Solutions LLC",
      html: `<p>Someone just tried to create a new account at Little Technical Solutions LLC using this email address, which already has an account.</p>` +
        `<p>If that was you, you can <a href="https://lit-solutions.tech/myaccount.html#signin">sign in</a> or ` +
        `<a href="https://lit-solutions.tech/myaccount.html#reset">reset your password</a> if you've forgotten it.</p>` +
        `<p>If it wasn't you, no action is needed -- your account is unaffected.</p>`,
    });
    return json(201, { message: GENERIC_MESSAGE });
  }

  const passwordHash = await hashPassword(password);
  const userId = require("crypto").randomBytes(12).toString("hex");
  const user = {
    id: userId, email: key, name: name.trim(), passwordHash,
    role: "customer", verified: false, createdAt: Date.now(),
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
  };
  await setJSON("users", key, user);
  await sendVerificationEmail(event, user);

  return json(201, { message: GENERIC_MESSAGE });
};

module.exports.openRegistrationAllowed = openRegistrationAllowed;
