// website-designer.js -- receives a completed Website Designer submission
// (package, selected features, live estimate, customer details, and a
// client-generated PDF summary), persists it as a lead record, and emails
// Dylan the PDF attachment. Public/unauthenticated (like the contact form),
// rate-limited against spam/abuse.
//
// POST { package, businessName, customerName, email, phone, domain, notes,
//        subtotal, estimateTotal, heroesDiscount, bundledCategories: [category],
//        bundleSavings, optionalSelected: [{title, price}],
//        premiumSelected: [title], pdfBase64, pdfFilename,
//        brief: { description, industry, serviceArea, servicesList, brandColors,
//                 styleReferences, addressHours, socialLinks, launchDate, desiredDomain,
//                 staff, testimonials, faq, blog, gallery, pricing, booking, newsletter, sms },
//        logo: {filename, content} | null, photos: [{filename, content}] }
//
// `brief` is the content actually needed to start building (not just scope/
// price) -- description/industry/serviceArea/servicesList are required;
// everything else is optional or only sent when its triggering feature is
// selected (see CONTENT_BRIEF_TRIGGER_TITLES in js/website-designer.js).

const { json, rateLimited } = require("./_lib/auth_utils");
const { setJSON } = require("./_lib/blob_store");
const { sendEmail } = require("./_lib/email");

const MAX_PDF_BASE64_LENGTH = 3 * 1024 * 1024; // ~2.2MB decoded, generous for a text-only summary PDF
const MAX_IMAGE_BASE64_LENGTH = 6 * 1024 * 1024; // ~4.4MB decoded, generous for one logo/photo up to ~4MB raw
const MAX_PHOTOS = 4;
const MAX_TOTAL_ATTACHMENTS_BASE64_LENGTH = 20 * 1024 * 1024; // ~15MB decoded combined, keeps total email payload reasonable
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BRIEF_CONTENT_LABELS = {
  staff: "Team/staff", testimonials: "Testimonials", faq: "FAQ", blog: "Blog topics",
  gallery: "Gallery/portfolio", pricing: "Pricing", booking: "Booking details",
  newsletter: "Newsletter platform", sms: "SMS notifications",
};

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function escList(s) {
  return esc(s).replace(/\n/g, "<br>");
}

function briefField(v) {
  return String(v || "").trim();
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
    brief, logo, photos,
  } = body;

  if (pkg !== "starter" && pkg !== "business") return json(400, { error: "Invalid package." });
  if (!businessName || !businessName.trim()) return json(400, { error: "Business name is required." });
  if (!customerName || !customerName.trim()) return json(400, { error: "Your name is required." });
  if (!email || !EMAIL_RE.test(email)) return json(400, { error: "A valid email is required." });
  if (!phone || !phone.trim()) return json(400, { error: "Phone is required." });
  if (pdfBase64 && pdfBase64.length > MAX_PDF_BASE64_LENGTH) return json(400, { error: "Submission too large." });

  const rawBrief = brief && typeof brief === "object" ? brief : {};
  const cleanBrief = {
    description: briefField(rawBrief.description), industry: briefField(rawBrief.industry),
    serviceArea: briefField(rawBrief.serviceArea), servicesList: briefField(rawBrief.servicesList),
    brandColors: briefField(rawBrief.brandColors), styleReferences: briefField(rawBrief.styleReferences),
    addressHours: briefField(rawBrief.addressHours), socialLinks: briefField(rawBrief.socialLinks),
    launchDate: briefField(rawBrief.launchDate), desiredDomain: briefField(rawBrief.desiredDomain),
    staff: briefField(rawBrief.staff), testimonials: briefField(rawBrief.testimonials), faq: briefField(rawBrief.faq),
    blog: briefField(rawBrief.blog), gallery: briefField(rawBrief.gallery), pricing: briefField(rawBrief.pricing),
    booking: briefField(rawBrief.booking), newsletter: briefField(rawBrief.newsletter), sms: briefField(rawBrief.sms),
  };
  if (!cleanBrief.description) return json(400, { error: "A description of your business is required." });
  if (!cleanBrief.industry) return json(400, { error: "Your industry/type of business is required." });
  if (!cleanBrief.serviceArea) return json(400, { error: "Your service area is required." });
  if (!cleanBrief.servicesList) return json(400, { error: "A list of your services or products is required." });

  const cleanLogo = logo && typeof logo === "object" && logo.content ? logo : null;
  if (cleanLogo && cleanLogo.content.length > MAX_IMAGE_BASE64_LENGTH) {
    return json(400, { error: "Logo file is too large or invalid." });
  }
  const cleanPhotos = Array.isArray(photos) ? photos.filter((p) => p && p.content) : [];
  if (cleanPhotos.length > MAX_PHOTOS) return json(400, { error: `Please attach at most ${MAX_PHOTOS} photos.` });
  if (cleanPhotos.some((p) => p.content.length > MAX_IMAGE_BASE64_LENGTH)) {
    return json(400, { error: "One of the attached photos is too large or invalid." });
  }
  const totalAttachmentsLength = (pdfBase64 ? pdfBase64.length : 0) +
    (cleanLogo ? cleanLogo.content.length : 0) +
    cleanPhotos.reduce((sum, p) => sum + p.content.length, 0);
  if (totalAttachmentsLength > MAX_TOTAL_ATTACHMENTS_BASE64_LENGTH) {
    return json(400, { error: "Attachments are too large altogether -- please remove a photo or two and resubmit." });
  }

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
    brief: cleanBrief, hasLogo: !!cleanLogo, photoCount: cleanPhotos.length,
    createdAt: Date.now(), ip,
  };
  await setJSON("leads", id, record);

  const optionalRows = record.optionalSelected.length
    ? record.optionalSelected.map((f) => `<li>${esc(f.title)} -- $${Number(f.price) || 0}</li>`).join("")
    : "<li>(none)</li>";
  const premiumRows = record.premiumSelected.length
    ? record.premiumSelected.map((t) => `<li>${esc(t)} -- custom quote</li>`).join("")
    : "<li>(none)</li>";

  const briefOptionalRows = [
    cleanBrief.desiredDomain ? `<p><strong>Desired domain:</strong> ${esc(cleanBrief.desiredDomain)}</p>` : "",
    cleanBrief.brandColors ? `<p><strong>Brand colors:</strong> ${esc(cleanBrief.brandColors)}</p>` : "",
    cleanBrief.styleReferences ? `<p><strong>Style references:</strong> ${esc(cleanBrief.styleReferences)}</p>` : "",
    cleanBrief.addressHours ? `<p><strong>Address/hours:</strong><br>${escList(cleanBrief.addressHours)}</p>` : "",
    cleanBrief.socialLinks ? `<p><strong>Social links:</strong><br>${escList(cleanBrief.socialLinks)}</p>` : "",
    cleanBrief.launchDate ? `<p><strong>Preferred launch date:</strong> ${esc(cleanBrief.launchDate)}</p>` : "",
  ].join("");

  const contentDetailRows = Object.keys(BRIEF_CONTENT_LABELS)
    .filter((k) => cleanBrief[k])
    .map((k) => `<p><strong>${esc(BRIEF_CONTENT_LABELS[k])}:</strong><br>${escList(cleanBrief[k])}</p>`)
    .join("");

  const html = `
    <h2>New Website Designer submission -- ${esc(id)}</h2>
    <p><strong>Package:</strong> ${pkg === "business" ? "Business ($1,299 starting)" : "Starter ($699 starting)"}</p>
    <p><strong>Business:</strong> ${esc(record.businessName)}<br>
       <strong>Contact:</strong> ${esc(record.customerName)}<br>
       <strong>Email:</strong> ${esc(record.email)}<br>
       <strong>Phone:</strong> ${esc(record.phone)}<br>
       <strong>Current domain:</strong> ${esc(record.domain) || "(none)"}</p>

    <h3>Business brief</h3>
    <p><strong>What they do:</strong> ${escList(cleanBrief.description)}</p>
    <p><strong>Industry:</strong> ${esc(cleanBrief.industry)} &nbsp; <strong>Service area:</strong> ${esc(cleanBrief.serviceArea)}</p>
    <p><strong>Services/products:</strong><br>${escList(cleanBrief.servicesList)}</p>
    ${briefOptionalRows}
    <p><strong>Logo attached:</strong> ${cleanLogo ? "yes" : "no"} &nbsp; <strong>Photos attached:</strong> ${cleanPhotos.length}</p>

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
    ${contentDetailRows ? `<h3>Content details</h3>${contentDetailRows}` : ""}
    <p><strong>Notes:</strong> ${esc(record.notes) || "(none)"}</p>
    <p style="color:#666;font-size:.85rem;">Submitted ${new Date(record.createdAt).toLocaleString("en-US")} from IP ${esc(ip)}.
    Full record saved in Netlify Blobs under "leads" / ${esc(id)}.</p>
  `;

  const attachments = [];
  if (pdfBase64) attachments.push({ filename: pdfFilename || `website-designer-${id}.pdf`, content: pdfBase64 });
  if (cleanLogo) attachments.push({ filename: cleanLogo.filename || "logo", content: cleanLogo.content });
  cleanPhotos.forEach((p, i) => attachments.push({ filename: p.filename || `photo-${i + 1}`, content: p.content }));

  const result = await sendEmail({
    to: "dylan@lit-solutions.tech",
    subject: `New Website Designer submission -- ${pkg === "business" ? "Business" : "Starter"} -- ${record.businessName}`,
    html,
    attachments,
  });

  return json(201, { id, emailSent: result.sent });
};
