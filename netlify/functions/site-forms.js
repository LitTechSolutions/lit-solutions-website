// site-forms.js -- handles the marketing site's 4 simple public forms
// (contact, booking request, newsletter signup, new-client intake) via a
// single "form" discriminator, replacing native Netlify Forms entirely.
//
// Netlify Forms' AJAX pattern (fetch POST to "/") depends on Netlify's
// deploy-time form-detection claiming the request before netlify.toml's
// redirect rules are evaluated. This site's catch-all `/* -> /404.html`
// redirect (no method restriction) was winning that race instead -- every
// one of these 4 forms failed with a plain 404, and no submission ever
// reached Dylan. Real Netlify Function paths (/.netlify/functions/*) are
// a reserved prefix Netlify always routes to the function first,
// regardless of custom redirects -- exactly what website-designer.js
// already relies on -- so moving these 4 forms onto the same mechanism
// sidesteps the redirect-vs-Forms race entirely, rather than reordering
// redirect rules and hoping Netlify's forms-detection cooperates.
//
// Public/unauthenticated, rate-limited, honeypot-checked server-side (the
// client-side honeypot checks in js/main.js/js/intake.js are a UX nicety,
// not the real defense -- a bot posting directly to this endpoint would
// skip that entirely). Every submission is persisted to the "inquiries"
// Blobs store AND emailed to Dylan, persisted first so a transient email
// outage never silently loses a submission.
//
//   POST { form: "contact", name, email, message }
//     -> 201 { id, emailSent }
//   POST { form: "booking", name, email?, phone?, serviceType, preferredDate,
//          preferredTime, note? }  (at least one of email/phone required)
//     -> 201 { id, emailSent }
//   POST { form: "newsletter", email }
//     -> 201 { id, emailSent }
//   POST { form: "intake", fullName, businessName, email, phone, addressCity,
//          referralSource, contactMethod, bestTime, govContractingInterest,
//          services: [string], generalNotes,
//          -- required only if services includes "Website Services":
//          currentWebsite, requestedDomain, businessDescription,
//          targetCustomers, mustHavePages, mustHaveFeatures, stylePreference,
//          inspirationSites, existingContent, photosImagery, hasLogo,
//          hasContent, hasDomain, timeline, budgetRange,
//          -- required only if govContractingInterest is truthy:
//          ueiNumber, naicsCodes, samGovInfo, certifications,
//          additionalNotes }  (always optional)
//     -> 201 { id, emailSent }
//   400 { error }  -- validation failure (client already blocks these; this
//                     is a defense-in-depth backstop, not the primary UX)
//   429 { error }  -- rate limited

const crypto = require("crypto");
const { json, rateLimited } = require("./_lib/auth_utils");
const { setJSON } = require("./_lib/blob_store");
const { sendEmail: sendEmailReal } = require("./_lib/email");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SERVICE_TYPES = ["Website Design & Development", "Computer Repair", "Networking", "Cybersecurity", "Small Business IT", "Not sure yet"];
const PREFERRED_TIMES = ["Morning (8am–12pm)", "Afternoon (12–5pm)", "Evening (5–7pm)", "No preference"];
const INTAKE_SERVICES = ["Website Services", "Computer Services", "Networking", "Cybersecurity", "Small Business IT", "Not sure yet"];

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escList(s) {
  return esc(s).replace(/\n/g, "<br>");
}
function trimmed(v) {
  return typeof v === "string" ? v.trim() : "";
}
function newId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function handleContact(body, ip, deps) {
  const name = trimmed(body.name);
  const email = trimmed(body.email);
  const message = trimmed(body.message);
  if (!name) return json(400, { error: "Name is required." });
  if (!email || !EMAIL_RE.test(email)) return json(400, { error: "A valid email is required." });
  if (!message) return json(400, { error: "A message is required." });
  if (body.botField) return json(201, { id: null, emailSent: false }); // honeypot: pretend success, do nothing

  const id = newId("CONTACT");
  const record = { id, form: "contact", name, email: email.toLowerCase(), message, createdAt: Date.now(), ip };
  await deps.setJSON("inquiries", id, record);

  const html = `
    <h2>New contact message -- ${esc(id)}</h2>
    <p><strong>Name:</strong> ${esc(name)}<br><strong>Email:</strong> ${esc(email)}</p>
    <p><strong>Message:</strong><br>${escList(message)}</p>
    <p style="color:#666;font-size:.85rem;">Submitted ${new Date(record.createdAt).toLocaleString("en-US")} from IP ${esc(ip)}.</p>
  `;
  const result = await deps.sendEmail({ to: "dylan@lit-solutions.tech", subject: `Contact form -- ${name}`, html });
  return json(201, { id, emailSent: result.sent });
}

async function handleBooking(body, ip, deps) {
  const name = trimmed(body.name);
  const email = trimmed(body.email);
  const phone = trimmed(body.phone);
  const serviceType = trimmed(body.serviceType);
  const preferredDate = trimmed(body.preferredDate);
  const preferredTime = trimmed(body.preferredTime);
  const note = trimmed(body.note);

  if (!name) return json(400, { error: "Name is required." });
  if (!email && !phone) return json(400, { error: "Enter at least one -- email or phone." });
  if (email && !EMAIL_RE.test(email)) return json(400, { error: "Please enter a valid email." });
  if (!SERVICE_TYPES.includes(serviceType)) return json(400, { error: "Please choose what you need." });
  if (!preferredDate) return json(400, { error: "A preferred date is required." });
  if (!PREFERRED_TIMES.includes(preferredTime)) return json(400, { error: "Please choose a preferred time." });
  if (body.botField) return json(201, { id: null, emailSent: false });

  const id = newId("BOOKING");
  const record = {
    id, form: "booking", name, email: email.toLowerCase(), phone, serviceType, preferredDate, preferredTime, note,
    createdAt: Date.now(), ip,
  };
  await deps.setJSON("inquiries", id, record);

  const html = `
    <h2>New consultation request -- ${esc(id)}</h2>
    <p><strong>Name:</strong> ${esc(name)}<br>
       ${email ? `<strong>Email:</strong> ${esc(email)}<br>` : ""}
       ${phone ? `<strong>Phone:</strong> ${esc(phone)}<br>` : ""}
       <strong>Service:</strong> ${esc(serviceType)}<br>
       <strong>Preferred date:</strong> ${esc(preferredDate)}<br>
       <strong>Preferred time:</strong> ${esc(preferredTime)}</p>
    ${note ? `<p><strong>Notes:</strong><br>${escList(note)}</p>` : ""}
    <p style="color:#666;font-size:.85rem;">Submitted ${new Date(record.createdAt).toLocaleString("en-US")} from IP ${esc(ip)}.</p>
  `;
  const result = await deps.sendEmail({ to: "dylan@lit-solutions.tech", subject: `Consultation request -- ${name}`, html });
  return json(201, { id, emailSent: result.sent });
}

async function handleNewsletter(body, ip, deps) {
  const email = trimmed(body.email);
  if (!email || !EMAIL_RE.test(email)) return json(400, { error: "A valid email is required." });
  if (body.botField) return json(201, { id: null, emailSent: false });

  const id = newId("NEWSLETTER");
  const record = { id, form: "newsletter", email: email.toLowerCase(), createdAt: Date.now(), ip };
  await deps.setJSON("inquiries", id, record);

  const html = `<h2>New newsletter signup</h2><p>${esc(email)}</p>
    <p style="color:#666;font-size:.85rem;">Submitted ${new Date(record.createdAt).toLocaleString("en-US")} from IP ${esc(ip)}.</p>`;
  const result = await deps.sendEmail({ to: "dylan@lit-solutions.tech", subject: `Newsletter signup -- ${email}`, html });
  return json(201, { id, emailSent: result.sent });
}

// Field labels used only in the "missing fields" 400 error and the outbound
// email -- kept in one place so the two never drift apart.
const INTAKE_ALWAYS_FIELDS = [
  ["fullName", "Full Name"], ["businessName", "Business / Organization"], ["email", "Email Address"],
  ["phone", "Phone Number"], ["addressCity", "Service Address or City"], ["referralSource", "How did you hear about us?"],
  ["contactMethod", "Preferred contact method"], ["bestTime", "Best time to reach you"], ["generalNotes", "Briefly describe what you need"],
];
const INTAKE_WEBSITE_FIELDS = [
  ["currentWebsite", "Current website"], ["requestedDomain", "Requested domain"], ["businessDescription", "Business description"],
  ["targetCustomers", "Typical customers"], ["mustHavePages", "Must-have pages"], ["mustHaveFeatures", "Must-have features"],
  ["stylePreference", "Style preference"], ["inspirationSites", "Inspiration sites"], ["existingContent", "Existing content"],
  ["photosImagery", "Photos/imagery"], ["hasLogo", "Do you have a logo?"], ["hasContent", "Is content ready?"],
  ["hasDomain", "Own a domain?"], ["timeline", "Target timeline"], ["budgetRange", "Budget range"],
];
const INTAKE_GOVCONTRACT_FIELDS = [
  ["ueiNumber", "UEI"], ["naicsCodes", "NAICS code(s)"], ["samGovInfo", "SAM.gov info"], ["certifications", "Certifications"],
];

async function handleIntake(body, ip, deps) {
  const clean = {};
  for (const [key] of INTAKE_ALWAYS_FIELDS) clean[key] = trimmed(body[key]);
  const services = Array.isArray(body.services) ? body.services.filter((s) => INTAKE_SERVICES.includes(s)) : [];
  const govContractingInterest = !!body.govContractingInterest;

  const missing = INTAKE_ALWAYS_FIELDS.filter(([key]) => !clean[key]).map(([, label]) => label);
  if (!services.length) missing.push("What do you need help with?");
  if (clean.email && !EMAIL_RE.test(clean.email)) return json(400, { error: "A valid email is required." });

  const wantsWebsite = services.includes("Website Services");
  for (const [key] of INTAKE_WEBSITE_FIELDS) clean[key] = trimmed(body[key]);
  if (wantsWebsite) missing.push(...INTAKE_WEBSITE_FIELDS.filter(([key]) => !clean[key]).map(([, label]) => label));

  for (const [key] of INTAKE_GOVCONTRACT_FIELDS) clean[key] = trimmed(body[key]);
  if (govContractingInterest) missing.push(...INTAKE_GOVCONTRACT_FIELDS.filter(([key]) => !clean[key]).map(([, label]) => label));

  if (missing.length) return json(400, { error: `Please fill in: ${missing.join(", ")}.` });
  if (body.botField) return json(201, { id: null, emailSent: false });

  const additionalNotes = trimmed(body.additionalNotes);
  const id = newId("INTAKE");
  const record = {
    id, form: "intake", ...clean, services, govContractingInterest, additionalNotes, createdAt: Date.now(), ip,
  };
  await deps.setJSON("inquiries", id, record);

  const websiteRows = wantsWebsite ? INTAKE_WEBSITE_FIELDS.map(([key, label]) => `<p><strong>${esc(label)}:</strong><br>${escList(clean[key])}</p>`).join("") : "";
  const govRows = govContractingInterest ? INTAKE_GOVCONTRACT_FIELDS.map(([key, label]) => `<p><strong>${esc(label)}:</strong> ${esc(clean[key])}</p>`).join("") : "";
  const html = `
    <h2>New client intake -- ${esc(id)}</h2>
    <p><strong>Name:</strong> ${esc(clean.fullName)}<br>
       <strong>Business:</strong> ${esc(clean.businessName)}<br>
       <strong>Email:</strong> ${esc(clean.email)}<br>
       <strong>Phone:</strong> ${esc(clean.phone)}<br>
       <strong>Service address/city:</strong> ${esc(clean.addressCity)}<br>
       <strong>Heard about us via:</strong> ${esc(clean.referralSource)}<br>
       <strong>Preferred contact:</strong> ${esc(clean.contactMethod)} &nbsp; <strong>Best time:</strong> ${esc(clean.bestTime)}</p>
    <p><strong>Services needed:</strong> ${esc(services.join(", "))}</p>
    <p><strong>What they need:</strong><br>${escList(clean.generalNotes)}</p>
    ${websiteRows ? `<h3>Website Project Details</h3>${websiteRows}` : ""}
    ${govContractingInterest ? `<h3>Government Contracting</h3>${govRows}` : ""}
    ${additionalNotes ? `<p><strong>Anything else:</strong><br>${escList(additionalNotes)}</p>` : ""}
    <p style="color:#666;font-size:.85rem;">Submitted ${new Date(record.createdAt).toLocaleString("en-US")} from IP ${esc(ip)}.</p>
  `;
  const result = await deps.sendEmail({ to: "dylan@lit-solutions.tech", subject: `New client intake -- ${clean.businessName || clean.fullName}`, html });
  return json(201, { id, emailSent: result.sent });
}

const HANDLERS = { contact: handleContact, booking: handleBooking, newsletter: handleNewsletter, intake: handleIntake };

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const rateLimitedFn = deps.rateLimited || rateLimited;
  const setJSONFn = deps.setJSON || setJSON;
  const sendEmailFn = deps.sendEmail || sendEmailReal;

  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || "unknown";
  if (await rateLimitedFn("site-forms", ip, 10, 3600)) {
    return json(429, { error: "Too many submissions. Please call 804-309-0968 or email dylan@lit-solutions.tech directly." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid submission." }); }

  const handlerFn = HANDLERS[body.form];
  if (!handlerFn) return json(400, { error: "Unknown form." });

  return handlerFn(body, ip, { setJSON: setJSONFn, sendEmail: sendEmailFn });
};
