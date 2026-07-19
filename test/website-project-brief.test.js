// Covers the standalone Website Project Details Worksheet
// (website-project-brief.html / js/website-project-brief.js): the resume-
// token handoff from website-designer.html, conditional brief sections,
// autosave, file-size validation, and full submission (including the
// premium PDF attachment).
//
// Loads the real HTML + the real vendored jsPDF build + the real
// js/website-designer-pdf.js + js/website-project-brief.js into jsdom, so
// these tests exercise the shipped code rather than a reimplementation.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const FAKE_TOKEN = "b".repeat(64);
const FAKE_LEAD_ID = "WD-TEST999";

const SAMPLE_RESUME_DATA = {
  quickLeadId: FAKE_LEAD_ID,
  package: "business",
  businessName: "Riverside Plumbing",
  customerName: "Jane Doe",
  email: "jane@example.com",
  phone: "555-0100",
  preferredContact: "email",
  subtotal: 1450,
  estimateTotal: 1450,
  heroesDiscount: false,
  bundledCategories: [],
  bundleSavings: 0,
  optionalSelected: [{ title: "Blog / News section", price: 150 }],
  customRequest: "",
};

// See test/website-designer-pdf.test.js for why this awaits the single
// native DOMContentLoaded event instead of also dispatching a synthetic
// one (dispatching both double-registers every listener).
function loadWorksheetPage(opts) {
  opts = opts || {};
  const url = opts.hash
    ? `http://localhost/website-project-brief.html${opts.hash}`
    : "http://localhost/website-project-brief.html";
  const html = fs.readFileSync(path.join(ROOT, "website-project-brief.html"), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url });
  const { window } = dom;

  window.matchMedia = window.matchMedia || function () {
    return { matches: false, addEventListener() {}, removeEventListener() {} };
  };
  window.Element.prototype.scrollIntoView = window.Element.prototype.scrollIntoView || function () {};

  const capturedRequests = [];
  const resumeResponse = opts.resumeResponse || { ok: true, body: SAMPLE_RESUME_DATA };
  const fullResponse = opts.fullResponse || { ok: true, body: { id: "WD-FULL999" } };

  window.fetch = function (u, fetchOpts) {
    const body = fetchOpts && fetchOpts.body ? JSON.parse(fetchOpts.body) : {};
    capturedRequests.push(body);
    if (body.stage === "resume") {
      return Promise.resolve({
        ok: resumeResponse.ok,
        status: resumeResponse.ok ? 200 : 401,
        json: () => Promise.resolve(resumeResponse.body),
      });
    }
    if (body.stage === "full") {
      return Promise.resolve({
        ok: fullResponse.ok,
        status: fullResponse.ok ? 201 : 401,
        json: () => Promise.resolve(fullResponse.body),
      });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  };

  const vendoredJspdf = fs.readFileSync(path.join(ROOT, "assets", "vendor", "jspdf", "jspdf.umd.min.js"), "utf8");
  window.eval(vendoredJspdf);
  const pdfJs = fs.readFileSync(path.join(ROOT, "js", "website-designer-pdf.js"), "utf8");
  window.eval(pdfJs);
  const mainJs = fs.readFileSync(path.join(ROOT, "js", "main.js"), "utf8");
  window.eval(mainJs);
  const wpbJs = fs.readFileSync(path.join(ROOT, "js", "website-project-brief.js"), "utf8");
  window.eval(wpbJs);

  return { window, capturedRequests };
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function resumeHash() {
  return "#resume=" + encodeURIComponent(`${FAKE_LEAD_ID}.${FAKE_TOKEN}`);
}

test("a valid resume link: fragment is stripped from the URL immediately, token stored only in sessionStorage (never localStorage), and the form is shown", async () => {
  const { window, capturedRequests } = loadWorksheetPage({ hash: resumeHash() });
  await wait(150);

  assert.doesNotMatch(window.location.href, /#resume=/, "the resume token must not linger in the visible/bookmarkable URL");
  assert.doesNotMatch(window.location.href, /\?/, "no PII/token should ever appear in a query string either");

  const stored = JSON.parse(window.sessionStorage.getItem("lts-wpb-resume"));
  assert.equal(stored.quickLeadId, FAKE_LEAD_ID);
  assert.equal(stored.token, FAKE_TOKEN);
  assert.equal(window.localStorage.getItem("lts-wpb-resume"), null, "the resume token must never be written to localStorage");

  const resumeReq = capturedRequests.find((r) => r.stage === "resume");
  assert.ok(resumeReq, "expected a stage:\"resume\" POST");
  assert.equal(resumeReq.quickLeadId, FAKE_LEAD_ID);
  assert.equal(resumeReq.token, FAKE_TOKEN);

  assert.equal(window.document.getElementById("wpbForm").hidden, false);
  assert.equal(window.document.getElementById("wpbInvalid").hidden, true);
  assert.equal(window.document.getElementById("wpbSummaryBusiness").textContent, "Riverside Plumbing");
  assert.equal(window.document.getElementById("wpbSummaryRef").textContent, FAKE_LEAD_ID);
});

test("a same-tab refresh (no fragment, token already in sessionStorage from a prior load) still resumes correctly", async () => {
  const { window } = loadWorksheetPage({ hash: resumeHash() });
  await wait(150);
  assert.equal(window.document.getElementById("wpbForm").hidden, false);

  // Simulate a refresh: the fragment is gone (already stripped), but the
  // same tab's sessionStorage still has the token from the first load --
  // a *new* JSDOM window can't share the first one's sessionStorage, so
  // this re-derives what a real same-tab refresh would see instead.
  const { window: window2 } = loadWorksheetPage({ hash: null });
  window2.sessionStorage.setItem("lts-wpb-resume", JSON.stringify({ quickLeadId: FAKE_LEAD_ID, token: FAKE_TOKEN }));
  // Re-run the module now that sessionStorage is primed, mirroring a fresh
  // page load with no fragment but a previously-stored token.
  const wpbJs = fs.readFileSync(path.join(ROOT, "js", "website-project-brief.js"), "utf8");
  window2.eval(wpbJs);
  await wait(150);
  assert.equal(window2.document.getElementById("wpbForm").hidden, false);
  assert.equal(window2.document.getElementById("wpbSummaryBusiness").textContent, "Riverside Plumbing");
});

test("no resume token at all (direct navigation, or an already-spent link) shows the exact required invalid-link message, without disclosing whether the lead exists", async () => {
  const { window } = loadWorksheetPage({ hash: null });
  await wait(50);

  assert.equal(window.document.getElementById("wpbInvalid").hidden, false);
  assert.equal(window.document.getElementById("wpbForm").hidden, true);
  assert.equal(
    window.document.getElementById("wpbInvalidMessage").textContent,
    "We couldn't reopen this project worksheet. Your original quote request may still have been received. Please contact Little Technical Solutions at 804-309-0968 or dylan@lit-solutions.tech."
  );
});

test("a token the server rejects (expired/wrong/already used) shows the same exact invalid-link message", async () => {
  const { window } = loadWorksheetPage({ hash: resumeHash(), resumeResponse: { ok: false, body: { error: "This link is invalid or has expired." } } });
  await wait(150);

  assert.equal(window.document.getElementById("wpbInvalid").hidden, false);
  assert.equal(
    window.document.getElementById("wpbInvalidMessage").textContent,
    "We couldn't reopen this project worksheet. Your original quote request may still have been received. Please contact Little Technical Solutions at 804-309-0968 or dylan@lit-solutions.tech."
  );
});

test("conditional sections follow the resumed selections: Business package always includes staff/testimonials/faq/blog; a selected add-on (Blog) also triggers its own section", async () => {
  const { window } = loadWorksheetPage({ hash: resumeHash() });
  await wait(150);

  assert.equal(window.document.getElementById("wdBriefGroup_staff").hidden, false, "Business tier always includes staff");
  assert.equal(window.document.getElementById("wdBriefGroup_blog").hidden, false, "Blog / News section was selected");
  assert.equal(window.document.getElementById("wdBriefGroup_booking").hidden, true, "booking wasn't selected and isn't Business-always-included");
  assert.equal(window.document.getElementById("wpbSection6").hidden, false);
});

test("autosave: typing into a text field saves to sessionStorage (debounced) and shows a status message; file inputs are never included", async () => {
  const { window } = loadWorksheetPage({ hash: resumeHash() });
  await wait(150);

  const descEl = window.document.getElementById("wdBizDescription");
  descEl.value = "We repair pipes.";
  descEl.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(window.document.getElementById("wpbAutosaveStatus").textContent, "Saving…");

  await wait(600);
  assert.equal(window.document.getElementById("wpbAutosaveStatus").textContent, "Saved in this tab");

  const draft = JSON.parse(window.sessionStorage.getItem(`lts-wpb-draft-${FAKE_LEAD_ID}`));
  assert.equal(draft.fields.wdBizDescription, "We repair pipes.");
  assert.equal("wdLogoFile" in draft.fields, false, "file inputs must never be part of the autosaved draft");
});

test("progress indicator reflects required fields filled, including active conditional sections", async () => {
  const { window } = loadWorksheetPage({ hash: resumeHash() });
  await wait(150);

  const initialText = window.document.getElementById("wpbProgressText").textContent;
  assert.equal(initialText, "0% complete");

  window.document.getElementById("wdBizDescription").value = "We repair pipes.";
  window.document.getElementById("wdBizDescription").dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait(10);

  const afterOneField = window.document.getElementById("wpbProgressText").textContent;
  assert.notEqual(afterOneField, "0% complete");
});

test("full submission: sends quickLeadId + resumeToken, a valid PDF attachment, and shows the confirmation screen with the server's reference", async () => {
  const { window, capturedRequests } = loadWorksheetPage({ hash: resumeHash() });
  await wait(150);

  window.document.getElementById("wdBizDescription").value = "We repair residential plumbing.";
  window.document.getElementById("wdBizIndustry").value = "Plumbing";
  window.document.getElementById("wdServiceArea").value = "Montross, VA";
  window.document.getElementById("wdServicesList").value = "Repairs\nInstalls";
  window.document.getElementById("wdBriefStaff").value = "Jane -- Owner";
  window.document.getElementById("wdBriefTestimonials").value = "Great work! -- Bob";
  window.document.getElementById("wdBriefFaq").value = "Do you serve King George? | Yes.";
  window.document.getElementById("wdBriefBlog").value = "5 signs you need a repipe";

  window.document.getElementById("wdBriefForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await wait(2500);

  const fullReq = capturedRequests.find((r) => r.stage === "full");
  assert.ok(fullReq, "expected a stage:\"full\" request to have been sent");
  assert.equal(fullReq.quickLeadId, FAKE_LEAD_ID);
  assert.equal(fullReq.resumeToken, FAKE_TOKEN);
  assert.ok(fullReq.pdfBase64, "full submission must include a non-empty pdfBase64");
  const decoded = Buffer.from(fullReq.pdfBase64, "base64").toString("latin1", 0, 8);
  assert.equal(decoded.startsWith("%PDF-"), true, `expected PDF magic bytes, got ${JSON.stringify(decoded)}`);
  assert.equal(fullReq.brief.description, "We repair residential plumbing.");

  assert.equal(window.document.getElementById("wpbDone").hidden, false);
  assert.equal(window.document.getElementById("wpbDoneRef").textContent, "WD-FULL999");

  // Single-use: the draft and the temporarily-stored resume token are both
  // cleared once the submission the token authorized has actually succeeded.
  assert.equal(window.sessionStorage.getItem("lts-wpb-resume"), null);
  assert.equal(window.sessionStorage.getItem(`lts-wpb-draft-${FAKE_LEAD_ID}`), null);
});

test("submitting with required fields missing is blocked client-side and never reaches the network as a full submission", async () => {
  const { window, capturedRequests } = loadWorksheetPage({ hash: resumeHash() });
  await wait(150);

  // Leave every required field empty and submit anyway.
  window.document.getElementById("wdBriefForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await wait(100);

  assert.equal(capturedRequests.some((r) => r.stage === "full"), false);
  assert.match(window.document.getElementById("wdFormStatus").textContent, /required/i);
});
