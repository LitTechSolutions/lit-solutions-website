// website-designer.js -- receives Website Designer submissions in one of
// two stages, persists each as a lead record, and emails Dylan.
// Public/unauthenticated (like the contact form), rate-limited against
// spam/abuse.
//
// STAGE "quick" -- sent the moment a customer accepts the on-screen price,
// before any long-form content brief. Minimal required fields (package,
// businessName, customerName, email, phone, preferredContact) so a lead
// reaches Dylan's inbox with as little friction as possible.
//   POST { stage: "quick", package, businessName, customerName, email, phone,
//          preferredContact, subtotal, estimateTotal, heroesDiscount,
//          bundledCategories: [category], bundleSavings,
//          optionalSelected: [{title, price}], premiumSelected: [title] }
//
// STAGE "full" -- sent only if the customer opts in, from the prompt shown
// right after the quick quote. Carries the full content brief plus the
// client-generated PDF summary, and references the earlier quick lead (if
// any) via quickLeadId so the two can be matched up in Dylan's inbox.
//   POST { stage: "full", quickLeadId, package, businessName, customerName,
//          email, phone, preferredContact, domain, notes, subtotal,
//          estimateTotal, heroesDiscount, bundledCategories: [category],
//          bundleSavings, optionalSelected: [{title, price}],
//          premiumSelected: [title], pdfBase64, pdfFilename,
//          brief: { description, industry, serviceArea, servicesList, brandColors,
//                   styleReferences, addressHours, socialLinks, launchDate, desiredDomain,
//                   staff, testimonials, faq, blog, gallery, pricing, booking, newsletter, sms },
//          logo: {filename, content} | null, photos: [{filename, content}] }
//
// `brief` is the content actually needed to start building (not just scope/
// price) -- description/industry/serviceArea/servicesList are required;
// everything else is optional or only sent when its triggering feature is
// selected (see CONTENT_BRIEF_TRIGGER_TITLES in js/website-designer.js).
//
// Requests with no `stage` (or an unrecognized one) are treated as "full"
// for backward compatibility with any already-open tab running older
// client JS.

const { json, rateLimited } = require("./_lib/auth_utils");
const { setJSON, getJSON } = require("./_lib/blob_store");
const { sendEmail } = require("./_lib/email");
const STARTER_CATALOG = require("../../starter-catalog.json");
const BUSINESS_CATALOG = require("../../business-catalog.json");

// Matches js/website-designer.js's own constants exactly (see that file's
// HEROES_DISCOUNT_RATE/BUNDLE_DISCOUNT_RATE/BUNDLE_MIN_ITEMS) -- kept as a
// separate copy here rather than a shared import, since the client bundle
// and this function are built/deployed independently and duplicating three
// small constants is far less risky than adding a build-time coupling
// between them for a static site with no build step.
const HEROES_DISCOUNT_RATE = 0.15;
const BUNDLE_DISCOUNT_RATE = 0.10;
const BUNDLE_MIN_ITEMS = 2;
const PRICE_MISMATCH_TOLERANCE = 2; // dollars -- absorbs float/rounding slack, not real discrepancies

// Independently recomputes the expected subtotal/bundle-savings/total from
// the catalog + the customer's actual selections, as a cross-check against
// whatever numbers the client submitted. This never blocks or alters a
// submission -- a customer's quote should never fail to reach Dylan over
// this -- it only flags a lead so a manipulated or buggy total doesn't
// silently look legitimate in his inbox.
function recomputeEstimate(pkg, optionalSelected, bundledCategories, heroesDiscount) {
  const catalog = pkg === "business" ? BUSINESS_CATALOG : STARTER_CATALOG;
  const basePrice = Number(catalog.base_price) || 0;
  const selectedTitles = new Set(
    (Array.isArray(optionalSelected) ? optionalSelected : []).map((f) => f && f.title).filter(Boolean)
  );
  let rawOptionalSum = 0;
  const categoryTotals = {};
  for (const cat of catalog.categories || []) {
    let subtotal = 0, itemCount = 0, selectedCount = 0;
    for (const item of cat.items || []) {
      if (item.priority !== "C") continue;
      itemCount += 1;
      if (selectedTitles.has(item.title)) {
        selectedCount += 1;
        subtotal += Number(item.price) || 0;
        rawOptionalSum += Number(item.price) || 0;
      }
    }
    categoryTotals[cat.category] = { subtotal, itemCount, selectedCount };
  }
  let bundleSavings = 0;
  for (const catName of Array.isArray(bundledCategories) ? bundledCategories : []) {
    const t = categoryTotals[catName];
    if (t && t.itemCount >= BUNDLE_MIN_ITEMS && t.selectedCount === t.itemCount) {
      bundleSavings += t.subtotal * BUNDLE_DISCOUNT_RATE;
    }
  }
  const subtotal = basePrice + rawOptionalSum - bundleSavings;
  const total = heroesDiscount ? subtotal * (1 - HEROES_DISCOUNT_RATE) : subtotal;
  return {
    subtotal: Math.round(subtotal),
    bundleSavings: Math.round(bundleSavings),
    total: Math.round(total),
  };
}

// Compares the client-submitted figures against the independent recompute
// and returns a flag object to merge into the lead record -- absent
// entirely when everything matches, so most leads carry no extra noise.
function priceMismatchFlag(pkg, record) {
  const expected = recomputeEstimate(pkg, record.optionalSelected, record.bundledCategories, record.heroesDiscount);
  const mismatched =
    Math.abs(expected.total - record.estimateTotal) > PRICE_MISMATCH_TOLERANCE ||
    Math.abs(expected.subtotal - record.subtotal) > PRICE_MISMATCH_TOLERANCE ||
    Math.abs(expected.bundleSavings - record.bundleSavings) > PRICE_MISMATCH_TOLERANCE;
  if (!mismatched) return {};
  return {
    priceMismatch: true,
    expectedSubtotal: expected.subtotal,
    expectedBundleSavings: expected.bundleSavings,
    expectedEstimateTotal: expected.total,
  };
}

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

// The client only ever sends raw base64 content + a filename (no MIME type,
// no data: URI prefix -- see fileToBase64() in js/website-designer.js), and
// this endpoint is public/unauthenticated, so the `accept="image/..."`
// attribute on the file inputs is a UI hint only, not a real guarantee.
// Sniff the actual file-format signature server-side before ever attaching
// it to an outbound email, so this can't be used to relay arbitrary file
// content through the business's email sender. isRecognizedImage lives in
// _lib/file_signatures.js so admin-images.js and documents.js can share the
// exact same check instead of a looser MIME-prefix regex.
const { isRecognizedImage } = require("./_lib/file_signatures");

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

const PREFERRED_CONTACT_VALUES = ["phone", "text", "email"];
const PREFERRED_CONTACT_LABELS = { phone: "Phone call", text: "Text message", email: "Email" };

function newLeadId() {
  return "WD-" + Date.now().toString(36).toUpperCase() + "-" + require("crypto").randomBytes(3).toString("hex").toUpperCase();
}

// Stage "quick" -- fired the moment a customer accepts the on-screen price.
// Deliberately minimal: no brief, no PDF, no attachments -- just enough to
// get a lead into Dylan's inbox with as little friction for the customer
// as possible. The full project-details form (stage "full") is optional
// and comes later, if at all.
async function handleQuickSubmission(body, ip) {
  const { package: pkg, businessName, customerName, email, phone, preferredContact } = body;

  if (pkg !== "starter" && pkg !== "business") return json(400, { error: "Invalid package." });
  if (!businessName || !businessName.trim()) return json(400, { error: "Business name is required." });
  if (!customerName || !customerName.trim()) return json(400, { error: "Your name is required." });
  if (!email || !EMAIL_RE.test(email)) return json(400, { error: "A valid email is required." });
  if (!phone || !phone.trim()) return json(400, { error: "Phone is required." });
  if (!PREFERRED_CONTACT_VALUES.includes(preferredContact)) {
    return json(400, { error: "Please choose a preferred contact method." });
  }

  const id = newLeadId();
  const record = {
    id, stage: "quick", package: pkg, businessName: businessName.trim(), customerName: customerName.trim(),
    email: email.toLowerCase().trim(), phone: phone.trim(), preferredContact,
    subtotal: Number(body.subtotal) || 0, estimateTotal: Number(body.estimateTotal) || 0,
    heroesDiscount: !!body.heroesDiscount,
    bundledCategories: Array.isArray(body.bundledCategories) ? body.bundledCategories : [],
    bundleSavings: Number(body.bundleSavings) || 0,
    optionalSelected: Array.isArray(body.optionalSelected) ? body.optionalSelected : [],
    premiumSelected: Array.isArray(body.premiumSelected) ? body.premiumSelected : [],
    completedFull: false, createdAt: Date.now(), ip,
  };
  Object.assign(record, priceMismatchFlag(pkg, record));
  await setJSON("leads", id, record);

  const optionalRows = record.optionalSelected.length
    ? record.optionalSelected.map((f) => `<li>${esc(f.title)} -- $${Number(f.price) || 0}</li>`).join("")
    : "<li>(none)</li>";
  const premiumRows = record.premiumSelected.length
    ? record.premiumSelected.map((t) => `<li>${esc(t)} -- custom quote</li>`).join("")
    : "<li>(none)</li>";

  const html = `
    <h2>Quick quote request -- ${esc(id)}</h2>
    ${record.priceMismatch ? `<p style="background:#FDECEA;border:1px solid #D93F3F;color:#A32E2E;padding:.6rem .9rem;border-radius:6px;">
      <strong>⚠ Price mismatch:</strong> the submitted total doesn't match what we'd calculate from the selections below
      (expected ~$${record.expectedEstimateTotal.toLocaleString()}, submitted $${record.estimateTotal.toLocaleString()}).
      Double-check this one before treating the number as final.</p>` : ""}
    <p>No project details yet -- this customer accepted the on-screen price and sent their contact info. They may add full project details separately; if they do, you'll get a second email referencing this same ID.</p>
    <p><strong>Package:</strong> ${pkg === "business" ? "Business ($1,299 starting)" : "Starter ($699 starting)"}</p>
    <p><strong>Business:</strong> ${esc(record.businessName)}<br>
       <strong>Contact:</strong> ${esc(record.customerName)}<br>
       <strong>Email:</strong> ${esc(record.email)}<br>
       <strong>Phone:</strong> ${esc(record.phone)}<br>
       <strong>Preferred contact method:</strong> ${esc(PREFERRED_CONTACT_LABELS[preferredContact] || preferredContact)}</p>

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
    <p style="color:#666;font-size:.85rem;">Submitted ${new Date(record.createdAt).toLocaleString("en-US")} from IP ${esc(ip)}.
    Full record saved in Netlify Blobs under "leads" / ${esc(id)}.</p>
  `;

  const result = await sendEmail({
    to: "dylan@lit-solutions.tech",
    subject: `Quick quote request -- ${pkg === "business" ? "Business" : "Starter"} -- ${record.businessName}`,
    html,
  });

  return json(201, { id, emailSent: result.sent });
}

// Stage "full" -- the original submission shape, sent only if the customer
// opts in to the complete content brief after their quick quote.
async function handleFullSubmission(body, ip) {
  const {
    package: pkg, businessName, customerName, email, phone, preferredContact, domain, notes,
    subtotal, estimateTotal, heroesDiscount, bundledCategories, bundleSavings,
    optionalSelected, premiumSelected, pdfBase64, pdfFilename,
    brief, logo, photos, quickLeadId,
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
  if (cleanLogo && !isRecognizedImage(cleanLogo.content, { allowSvg: true })) {
    return json(400, { error: "Logo file must be a PNG, JPEG, WEBP, or SVG image." });
  }
  const cleanPhotos = Array.isArray(photos) ? photos.filter((p) => p && p.content) : [];
  if (cleanPhotos.length > MAX_PHOTOS) return json(400, { error: `Please attach at most ${MAX_PHOTOS} photos.` });
  if (cleanPhotos.some((p) => p.content.length > MAX_IMAGE_BASE64_LENGTH)) {
    return json(400, { error: "One of the attached photos is too large or invalid." });
  }
  if (cleanPhotos.some((p) => !isRecognizedImage(p.content))) {
    return json(400, { error: "One of the attached photos isn't a recognized image file (PNG, JPEG, or WEBP)." });
  }
  const totalAttachmentsLength = (pdfBase64 ? pdfBase64.length : 0) +
    (cleanLogo ? cleanLogo.content.length : 0) +
    cleanPhotos.reduce((sum, p) => sum + p.content.length, 0);
  if (totalAttachmentsLength > MAX_TOTAL_ATTACHMENTS_BASE64_LENGTH) {
    return json(400, { error: "Attachments are too large altogether -- please remove a photo or two and resubmit." });
  }

  const id = newLeadId();
  const cleanQuickLeadId = typeof quickLeadId === "string" && /^WD-/.test(quickLeadId) ? quickLeadId : null;
  const record = {
    id, stage: "full", quickLeadId: cleanQuickLeadId,
    package: pkg, businessName: businessName.trim(), customerName: customerName.trim(),
    email: email.toLowerCase().trim(), phone: phone.trim(),
    preferredContact: PREFERRED_CONTACT_VALUES.includes(preferredContact) ? preferredContact : null,
    domain: (domain || "").trim(),
    notes: (notes || "").trim(), subtotal: Number(subtotal) || 0, estimateTotal: Number(estimateTotal) || 0,
    heroesDiscount: !!heroesDiscount,
    bundledCategories: Array.isArray(bundledCategories) ? bundledCategories : [],
    bundleSavings: Number(bundleSavings) || 0,
    optionalSelected: Array.isArray(optionalSelected) ? optionalSelected : [],
    premiumSelected: Array.isArray(premiumSelected) ? premiumSelected : [],
    brief: cleanBrief, hasLogo: !!cleanLogo, photoCount: cleanPhotos.length,
    createdAt: Date.now(), ip,
  };
  Object.assign(record, priceMismatchFlag(pkg, record));
  await setJSON("leads", id, record);
  if (cleanQuickLeadId) {
    const quickRecord = await getJSON("leads", cleanQuickLeadId);
    if (quickRecord) await setJSON("leads", cleanQuickLeadId, { ...quickRecord, completedFull: true, fullLeadId: id });
  }

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
    <h2>Full project details -- ${esc(id)}</h2>
    ${record.priceMismatch ? `<p style="background:#FDECEA;border:1px solid #D93F3F;color:#A32E2E;padding:.6rem .9rem;border-radius:6px;">
      <strong>⚠ Price mismatch:</strong> the submitted total doesn't match what we'd calculate from the selections below
      (expected ~$${record.expectedEstimateTotal.toLocaleString()}, submitted $${record.estimateTotal.toLocaleString()}).
      Double-check this one before treating the number as final.</p>` : ""}
    ${cleanQuickLeadId ? `<p>Follow-up to the quick quote sent earlier -- see "leads" / ${esc(cleanQuickLeadId)}.</p>` : ""}
    <p><strong>Package:</strong> ${pkg === "business" ? "Business ($1,299 starting)" : "Starter ($699 starting)"}</p>
    <p><strong>Business:</strong> ${esc(record.businessName)}<br>
       <strong>Contact:</strong> ${esc(record.customerName)}<br>
       <strong>Email:</strong> ${esc(record.email)}<br>
       <strong>Phone:</strong> ${esc(record.phone)}<br>
       <strong>Preferred contact method:</strong> ${esc(PREFERRED_CONTACT_LABELS[record.preferredContact] || "(not given)")}<br>
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
    subject: `Full project details -- ${pkg === "business" ? "Business" : "Starter"} -- ${record.businessName}`,
    html,
    attachments,
  });

  return json(201, { id, emailSent: result.sent });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || "unknown";
  if (await rateLimited("website-designer", ip, 8, 3600)) {
    return json(429, { error: "Too many submissions. Please call 636-426-0289 or email dylan@lit-solutions.tech directly." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid submission." }); }

  return body.stage === "quick" ? handleQuickSubmission(body, ip) : handleFullSubmission(body, ip);
};

// Exported for node:test coverage of the pricing/discount math (F016) --
// doesn't change anything Netlify actually invokes, which only ever calls
// exports.handler.
exports.recomputeEstimate = recomputeEstimate;
exports.priceMismatchFlag = priceMismatchFlag;
