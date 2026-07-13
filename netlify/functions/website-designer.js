// website-designer.js -- receives a completed Website Designer submission
// (package, selected features, live estimate, customer details, and a
// client-generated PDF summary), persists it as a lead record, and emails
// Dylan the PDF attachment. Public/unauthenticated (like the contact form),
// rate-limited against spam/abuse.
//
// POST { package, businessName, customerName, email, phone, domain, notes,
//        subtotal, estimateTotal, heroesDiscount, bundledCategories: [category],
//        bundleSavings, optionalSelected: [{title, price}],
//        premiumSelected: [title], pdfBase64, pdfFilename }

const { json, rateLimited } = require("./_lib/auth_utils");
const { setJSON } = require("./_lib/blob_store");
const { sendEmail } = require("./_lib/email");

const MAX_PDF_BASE64_LENGTH = 3 * 1024 * 1024; // ~2.2MB decoded, generous for a text-only summary PDF
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || "unknown";
  if (await rateLimited("website-designer", ip, 8, 3600)) {
    return json(429, { error: "Too many submissions. Please call 636-426-0289 or email dylan@lit-solutions.tech directly." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid submission." } ); }

  const {
    package: pkg, businessName, customerName, email, phone, domain, notes,
    subtotal, estimateTotal, heroesDiscount, bundledCategories, bundleSavings,
    optionalSelected, premiumSelected, pdfBase64, pdfFilename,
  } = body;

  if (pkg !== "starter" && pkg !== "business") return json(400, { error: "Invalid package." });
  if (!businessName || !businessName.trim()) return json(400, { error: "Business name is required." });
  if (!customerName || !customerName.trim()) return json(400, { error: "Your name is required." });
  if (!email || !EMAIL_RE.test(email)) return json(400, { error: "A valid email is required." });
  if (!phone || !phone.trim()) return json(400, { error: "Phone is required." });
  if (pdfBase64 && pdfBase64.length > MAX_PDF_BASE64_LENGTH) return json(400, { error: "Submission too large." });

  const id = "WD-" + Date.now().toString(36).toUpperCase() + "-" + require("crypto").randomBytes(3).toString("hex").toUpperCase();
  const record = {
    id, package: pkg, businessName: businessName.trim(), customerName: customerName.trim(),
    email: email.toLowerCase().trim(), phone: phone.trim(), domain: (domain || "").trim(),
    notes: (notes || "").trim(), subtotal: Number(subtotal) || 0, estimateTotal: Number(estimateTotal) || 0,
    heroesDiscount: !!heroesDiscount,
    bundledCategories: Array.isArray(bundledCategories) ? bundledCategories : [],
    bundleSavings: Number(bundleSavings) || 0,
    optionalSelected: Array.isArray(optionalSelected) ? optionalSelected : [],
    premiumSelected: Array.isArray(premiumSelected) ? premiumSelected : [],
    createdAt: Date.now(), ip,
  };
  await setJSON("leads", id, record);

  const optionalRows = record.optionalSelected.length
    ? record.optionalSelected.map((f) => `<li>${esc(f.title)} -- $${Number(f.price) || 0}</li>`).join("")
    : "<li>(none)</li>";
  const premiumRows = record.premiumSelected.length
    ? record.premiumSelected.map((t) => `<li>${esc(t)} -- custom quote</li>`).join("")
    : "<li>(none)</li>";

  const html = `
    <h2>New Website Designer submission -- ${esc(id)}</h2>
    <p><strong>Package:</strong> ${pkg === "business" ? "Business ($1,299 starting)" : "Starter ($699 starting)"}</p>
    <p><strong>Business:</strong> ${esc(record.businessName)}<br>
       <strong>Contact:</strong> ${esc(record.customerName)}<br>
       <strong>Email:</strong> ${esc(record.email)}<br>
       <strong>Phone:</strong> ${esc(record.phone)}<br>
       <strong>Current domain:</strong> ${esc(record.domain) || "(none)"}</p>
    <p><strong>Estimated starting total:</strong> $${record.estimateTotal.toLocaleString()}${
      record.heroesDiscount
        ? ` <span style="color:#0A7A6D;">(subtotal $${record.subtotal.toLocaleString()}, less 15% American Heroes Discount -- pending verification)</span>`
        : ""
    }</p>
    ${record.bundledCategories.length
      ? `<p><strong>Category bundles applied (10% each):</strong> ${esc(record.bundledCategories.join(", "))} -- saving $${record.bundleSavings.toLocaleString()}</p>`
      : ""
    }
    <p><strong>Optional features selected:</strong></p>
    <ul>${optionalRows}</ul>
    <p><strong>Premium add-ons requested (custom quote):</strong></p>
    <ul>${premiumRows}</ul>
    <p><strong>Notes:</strong> ${esc(record.notes) || "(none)"}</p>
    <p style="color:#666;font-size:.85rem;">Submitted ${new Date(record.createdAt).toLocaleString("en-US")} from IP ${esc(ip)}.
    Full record saved in Netlify Blobs under "leads" / ${esc(id)}.</p>
  `;

  const attachments = pdfBase64
    ? [{ filename: pdfFilename || `website-designer-${id}.pdf`, content: pdfBase64 }]
    : [];

  const result = await sendEmail({
    to: "dylan@lit-solutions.tech",
    subject: `New Website Designer submission -- ${pkg === "business" ? "Business" : "Starter"} -- ${record.businessName}`,
    html,
    attachments,
  });

  return json(201, { id, emailSent: result.sent });
};
