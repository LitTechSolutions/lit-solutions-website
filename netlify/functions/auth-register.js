// auth-register.js -- account registration. Open to anyone (customers
// self-register for the customer portal at myaccount.html), rate-limited
// against spam/abuse. Every new account defaults to role "customer" and
// has zero admin/staff capability -- there's no self-service path to
// "admin" here, on purpose. The one and only admin account (Dylan, for
// admin.html) is created the same way and then promoted by hand via the
// Netlify Blobs dashboard -- see README_ADMIN_SETUP.md.
//
// New accounts start unverified and can't sign in (see auth-login.js)
// until they click the link in the verification email -- the main
// defense against bot/junk registrations, on top of the rate limit below.
// If RESEND_API_KEY/EMAIL_FROM aren't configured yet, the email is logged
// instead of sent -- see auth-verify-email.js and README_ADMIN_SETUP.md
// for how to verify an account by hand in the meantime.
//
// POST { email, password, name }

const { hashPassword, json, rateLimited } = require("./_lib/auth_utils");
const { getJSON, setJSON } = require("./_lib/blob_store");
const { sendVerificationEmail } = require("./_lib/verification");
const { sendEmail } = require("./_lib/email");

// Shown for both a brand-new registration and an already-registered email --
// deliberately identical, so the response itself can't be used to check
// whether a given address already has an account (see auth-password-reset.js
// for the same pattern on that endpoint).
const GENERIC_MESSAGE = "If this email can be registered, check your inbox for next steps.";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || "unknown";
  if (await rateLimited("register", ip, 10, 3600)) {
    return json(429, { error: "Too many registration attempts. Try again later." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }
  const { email, password, name } = body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "A valid email is required." });
  if (!password || password.length < 10) return json(400, { error: "Password must be at least 10 characters." });
  if (!name || !name.trim()) return json(400, { error: "Name is required." });

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
  };
  await setJSON("users", key, user);
  await sendVerificationEmail(event, user);

  return json(201, { message: GENERIC_MESSAGE });
};
