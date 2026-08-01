// project-brief.js -- the form a customer fills in after paying, which is
// what actually lets a build start.
//
// GET  /project-brief?orderId=   -> the field list plus any saved draft
// POST /project-brief {orderId, answers, draft:true}  -> save a draft
// POST /project-brief {orderId, answers}              -> submit
//
// On submit: render a PDF from the stored answers, email it to Dylan,
// file a copy in the customer's own Documents tab, and move the order to
// brief_submitted so the dashboard stops asking.
//
// The PDF is rendered here, from the saved answers -- see _lib/brief_pdf.js
// for why a browser-generated upload was rejected.

const crypto = require("node:crypto");
const { readCookie, getSession, json, rateLimited } = require("./_lib/auth_utils");
const { getJSON, setJSON } = require("./_lib/blob_store");
const { getPlan } = require("./_lib/plan_catalog");
const { renderBriefPdf, BRIEF_FIELDS } = require("./_lib/brief_pdf");
const { sendEmail } = require("./_lib/email");

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "dylan@lit-solutions.tech";
const MAX_FIELD_LENGTH = 4000;

// Everything except these can be left blank -- a brief that refuses to submit
// because someone doesn't yet know their launch date just gets abandoned.
const REQUIRED = ["businessName", "contactName", "businessDescription", "services"];

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function cleanAnswers(raw) {
  const out = {};
  for (const f of BRIEF_FIELDS) {
    const v = raw && raw[f.key];
    out[f.key] = typeof v === "string" ? v.trim().slice(0, MAX_FIELD_LENGTH) : "";
  }
  return out;
}

function answersHtml(answers) {
  return BRIEF_FIELDS.map((f) =>
    `<p style="margin:0 0 14px;"><strong style="display:block;color:#555;font-size:13px;">${esc(f.label)}</strong>` +
    `${esc(answers[f.key] || "—").replace(/\n/g, "<br>")}</p>`
  ).join("");
}

exports.handler = async (event, context, deps = {}) => {
  const readCookieFn = deps.readCookie || readCookie;
  const getSessionFn = deps.getSession || getSession;
  const setJSONFn = deps.setJSON || setJSON;
  const getJSONFn = deps.getJSON || getJSON;
  const sendEmailFn = deps.sendEmail || sendEmail;

  const token = readCookieFn(event, "lts_session");
  const session = token ? await getSessionFn(token) : null;
  if (!session) return json(401, { error: "Sign in required." });

  const orderId = (event.queryStringParameters && event.queryStringParameters.orderId) ||
    (() => { try { return JSON.parse(event.body || "{}").orderId; } catch { return null; } })();
  if (!orderId) return json(400, { error: "orderId is required." });

  const order = await getJSONFn("orders", orderId);
  if (!order) return json(404, { error: "Order not found." });
  if (order.customerId !== session.userId && session.role !== "admin") {
    return json(403, { error: "Not your order." });
  }

  if (event.httpMethod === "GET") {
    return json(200, {
      fields: BRIEF_FIELDS,
      required: REQUIRED,
      answers: order.briefDraft || {},
      submitted: order.status === "brief_submitted",
      submittedAt: order.briefSubmittedAt || null,
    });
  }

  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid JSON" }); }

  // The brief is what starts a build, so it opens as soon as payment is
  // reported rather than waiting for confirmation -- momentum matters more
  // than the small risk of someone filling in a form they haven't paid for.
  // Nothing gets built until the order reaches `paid` regardless.
  if (order.status === "awaiting_payment") {
    return json(409, { error: "This becomes available once your payment is in." });
  }

  const answers = cleanAnswers(body.answers);

  if (body.draft) {
    order.briefDraft = answers;
    await setJSONFn("orders", order.id, order);
    return json(200, { saved: true });
  }

  if (order.status === "brief_submitted") {
    return json(200, { alreadySubmitted: true, submittedAt: order.briefSubmittedAt });
  }

  const missing = REQUIRED.filter((k) => !answers[k]);
  if (missing.length) {
    const labels = missing.map((k) => (BRIEF_FIELDS.find((f) => f.key === k) || {}).label || k);
    return json(400, { error: `Please fill in: ${labels.join(", ")}`, missing });
  }

  if (await rateLimited(event, "project-brief-submit", 5, 3600)) {
    return json(429, { error: "Too many submissions. Give us a call instead." });
  }

  const submittedAt = (deps.now ? deps.now() : new Date()).toISOString();
  const plan = getPlan(order.planKey);
  const customer = { email: order.customerEmail || session.email || "unknown" };

  const pdf = (deps.renderBriefPdf || renderBriefPdf)({
    order: { id: order.id, planKey: order.planKey, planName: plan ? plan.name : order.planKey },
    answers,
    customer,
    submittedAt,
  });

  // File it in the customer's own Documents tab, using the same record shape
  // documents.js writes so it renders there with no special-casing.
  const documentId = crypto.randomBytes(10).toString("hex");
  await setJSONFn("documents", documentId, {
    customerId: order.customerId,
    customerEmail: customer.email,
    title: `Project brief — ${plan ? plan.name : order.planKey}`,
    type: "paperwork",
    amount: "",
    status: "n/a",
    date: submittedAt.slice(0, 10),
    notes: "Submitted through your dashboard. This is the copy we're building from.",
    fileDataUri: `data:application/pdf;base64,${pdf.base64}`,
    fileName: pdf.filename,
    uploadedBy: order.customerId,
    uploadedAt: Date.now(),
  });

  // Dylan's copy: the PDF attached, and the answers inline so it's readable
  // on a phone without opening anything.
  await sendEmailFn({
    to: ADMIN_EMAIL,
    subject: `Project brief submitted — ${plan ? plan.name : order.planKey} — ${customer.email}`,
    html:
      `<p><strong>${esc(customer.email)}</strong> submitted their project brief for <strong>${esc(plan ? plan.name : order.planKey)}</strong>.</p>` +
      `<p style="color:#666;font-size:13px;">Order ${esc(order.id)} · ${esc(new Date(submittedAt).toLocaleString("en-US"))}</p>` +
      `<hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0;">` +
      answersHtml(answers) +
      `<hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0;">` +
      `<p style="color:#666;font-size:13px;">The same brief is attached as a PDF, and filed in the customer's Documents tab.</p>`,
    attachments: [{ filename: pdf.filename, content: pdf.base64 }],
  });

  // Confirmation to the customer, so they know it landed.
  await sendEmailFn({
    to: customer.email,
    subject: "We've got your project brief — Little Technical Solutions LLC",
    html:
      `<p>Thanks — your project brief is in, and a copy is saved in the Documents tab of your account.</p>` +
      `<p>We'll be in touch within one business day to talk it through before anything gets built.</p>`,
    attachments: [{ filename: pdf.filename, content: pdf.base64 }],
  });

  order.status = "brief_submitted";
  order.briefSubmittedAt = submittedAt;
  order.briefAnswers = answers;
  order.briefDocumentId = documentId;
  delete order.briefDraft;
  await setJSONFn("orders", order.id, order);

  return json(200, { submitted: true, submittedAt, documentId });
};

module.exports.BRIEF_FIELDS = BRIEF_FIELDS;
module.exports.REQUIRED = REQUIRED;
