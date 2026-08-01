// hero-status.js -- American Heroes Discount eligibility, held on the account.
//
// The discount can't be self-applied. A customer asks for it, Dylan verifies
// them the way heroes-pricing.html promises (in person, a redacted copy, or a
// licence number checked with the issuing body), and only then does the
// account carry a verified status that the pricing engine will honour.
//
// Deliberately NOT collected here: any document. terms.html section 10 and
// privacy.html both commit to never receiving an unredacted DD-214, LES or
// anything else carrying an SSN, and the surest way to keep that promise is
// to have no upload field at all. This endpoint records a request and a
// category; the verification itself happens in a conversation.
//
// Routes:
//   GET    /hero-status                      the caller's own status
//   POST   /hero-status {category, note}     request eligibility
//   PATCH  /hero-status {customerEmail, decision, category}   admin only
//   GET    /hero-status?pending=true         admin: the verification queue

const { readCookie, getSession, json, rateLimited } = require("./_lib/auth_utils");
const { getJSON, setJSON, store } = require("./_lib/blob_store");
const { sendEmail } = require("./_lib/email");

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "dylan@lit-solutions.tech";

// Mirrors the categories published on heroes-pricing.html.
const CATEGORIES = [
  "Active duty military",
  "Veteran",
  "Teacher",
  "First responder",
  "Doctor",
  "TSA agent",
  "Police",
  "Firefighter",
  "FFL holder (Virginia)",
];

const STATES = ["none", "pending", "verified", "declined"];

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function publicStatus(user) {
  const h = (user && user.heroStatus) || {};
  const state = STATES.includes(h.state) ? h.state : "none";
  return {
    state,
    category: h.category || null,
    requestedAt: h.requestedAt || null,
    decidedAt: h.decidedAt || null,
    // What the customer is told, in the same words on every surface.
    label:
      state === "verified" ? "American Heroes Discount active"
      : state === "pending" ? "American Heroes Discount — awaiting verification"
      : state === "declined" ? "We couldn't verify your eligibility"
      : null,
    categories: CATEGORIES,
  };
}

/** The single source of truth for whether a discount applies. */
function isVerifiedHero(user) {
  return !!(user && user.heroStatus && user.heroStatus.state === "verified");
}

async function findUserByEmail(email) {
  return getJSON("users", String(email || "").toLowerCase());
}

exports.handler = async (event, context, deps = {}) => {
  const readCookieFn = deps.readCookie || readCookie;
  const getSessionFn = deps.getSession || getSession;
  const sendEmailFn = deps.sendEmail || sendEmail;

  const token = readCookieFn(event, "lts_session");
  const session = token ? await getSessionFn(token) : null;
  if (!session) return json(401, { error: "Sign in required." });

  const isAdmin = session.role === "admin";
  const selfEmail = String(session.email || "").toLowerCase();

  if (event.httpMethod === "GET") {
    if (event.queryStringParameters && event.queryStringParameters.pending === "true") {
      if (!isAdmin) return json(403, { error: "Admin access required." });
      const s = store("users");
      const { blobs } = await s.list();
      const queue = [];
      for (const b of blobs) {
        const u = await getJSON("users", b.key);
        if (u && u.heroStatus && u.heroStatus.state === "pending") {
          queue.push({
            email: u.email, name: u.name,
            category: u.heroStatus.category,
            note: u.heroStatus.note || "",
            requestedAt: u.heroStatus.requestedAt,
          });
        }
      }
      queue.sort((a, b) => String(a.requestedAt).localeCompare(String(b.requestedAt)));
      return json(200, { pending: queue });
    }

    const user = await findUserByEmail(selfEmail);
    return json(200, { status: publicStatus(user) });
  }

  if (event.httpMethod === "POST") {
    if (await rateLimited("hero-request", session.userId, 5, 3600)) {
      return json(429, { error: "Too many requests. Give us a call instead." });
    }
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid JSON" }); }

    const category = CATEGORIES.find((c) => c === body.category);
    if (!category) return json(400, { error: "Choose the category that applies to you." });

    const user = await findUserByEmail(selfEmail);
    if (!user) return json(404, { error: "Account not found." });
    if (isVerifiedHero(user)) return json(200, { status: publicStatus(user) });

    user.heroStatus = {
      state: "pending",
      category,
      note: String(body.note || "").trim().slice(0, 1000),
      requestedAt: (deps.now ? deps.now() : new Date()).toISOString(),
    };
    await setJSON("users", selfEmail, user);

    await sendEmailFn({
      to: ADMIN_EMAIL,
      subject: `Heroes Discount request — ${category} — ${esc(user.email)}`,
      html:
        `<p><strong>${esc(user.name || user.email)}</strong> has asked for the American Heroes Discount.</p>` +
        `<p>Category: <strong>${esc(category)}</strong><br>Account: ${esc(user.email)}</p>` +
        (user.heroStatus.note ? `<p>Their note: ${esc(user.heroStatus.note)}</p>` : "") +
        `<p>Verify them the way the Heroes page promises — in person, a copy with the SSN and date of birth blacked out, ` +
        `or a licence number we check with the issuing body. <strong>Do not accept an unredacted DD-214 or LES.</strong></p>` +
        `<p>Their cart shows full price until you approve it.</p>`,
    });

    await sendEmailFn({
      to: user.email,
      subject: "We've got your Heroes Discount request — Little Technical Solutions LLC",
      html:
        `<p>Thanks — we'll be in touch to confirm your eligibility, usually within one business day.</p>` +
        `<p>Once it's confirmed, the discount applies automatically at checkout and stays on your account, ` +
        `so you'll never have to prove it twice.</p>` +
        `<p><strong>We will not ask you to email us anything carrying your Social Security number.</strong> ` +
        `We verify in person, from a copy with the sensitive fields blacked out, or from a licence number we check directly.</p>`,
    });

    return json(200, { status: publicStatus(user) });
  }

  if (event.httpMethod === "PATCH") {
    if (!isAdmin) return json(403, { error: "Admin access required." });
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid JSON" }); }

    const email = String(body.customerEmail || "").toLowerCase().trim();
    if (!email) return json(400, { error: "customerEmail is required." });
    if (!["verified", "declined", "none"].includes(body.decision)) {
      return json(400, { error: "decision must be verified, declined or none." });
    }

    const user = await findUserByEmail(email);
    if (!user) return json(404, { error: "No account with that email." });

    const category = CATEGORIES.find((c) => c === body.category) || (user.heroStatus && user.heroStatus.category) || null;
    user.heroStatus = {
      state: body.decision,
      category: body.decision === "verified" ? category : (user.heroStatus && user.heroStatus.category) || null,
      requestedAt: (user.heroStatus && user.heroStatus.requestedAt) || null,
      decidedAt: (deps.now ? deps.now() : new Date()).toISOString(),
      decidedBy: session.userId,
    };
    await setJSON("users", email, user);

    if (body.decision === "verified") {
      await sendEmailFn({
        to: user.email,
        subject: "Your American Heroes Discount is active — Little Technical Solutions LLC",
        html:
          `<p>You're verified — thank you for what you do.</p>` +
          `<p><strong>15% off one-time work and 5% off monthly plans</strong> now applies automatically at checkout. ` +
          `It's on your account permanently, so you won't be asked to prove it again.</p>`,
      });
    } else if (body.decision === "declined") {
      await sendEmailFn({
        to: user.email,
        subject: "About your Heroes Discount request — Little Technical Solutions LLC",
        html:
          `<p>We weren't able to confirm eligibility from what we had. That's very often just a missing detail rather than a no ` +
          `— give us a call on 804-309-0968 and we'll sort it out.</p>`,
      });
    }

    return json(200, { status: publicStatus(user) });
  }

  return json(405, { error: "Method not allowed" });
};

module.exports.CATEGORIES = CATEGORIES;
module.exports.isVerifiedHero = isVerifiedHero;
module.exports.publicStatus = publicStatus;
