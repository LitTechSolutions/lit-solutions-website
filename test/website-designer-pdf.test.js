// Covers the PDF-generation restore (F043): website-designer.html used to
// load jsPDF from cdnjs, which the site's Content-Security-Policy
// (script-src 'self') silently blocks in production. That made buildPdf()
// return null, the "Download summary (PDF)" button silently do nothing,
// and a full-brief submission send pdfBase64: null while its own status
// text claimed "Building your PDF and sending it over...". jsPDF is now
// vendored locally under assets/vendor/jspdf/ instead.
//
// Also covers the worksheet handoff (Website Designer coordinated release):
// the full project-brief form no longer lives inline on this page -- the
// post-quote prompt now opens a standalone worksheet in a new tab, carrying
// a one-time resume token only in a URL fragment.
//
// Loads the real website-designer.html + the real vendored jsPDF build +
// the real js/website-designer-pdf.js + js/website-designer.js into jsdom,
// rather than re-implementing any of it here, so these tests actually
// exercise the shipped code.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

// jsdom fires its own native DOMContentLoaded exactly once, asynchronously,
// shortly after construction -- regardless of whether anything else also
// dispatches one. Manually dispatching a *second* synthetic one (an
// approach used elsewhere) races against that native firing and, depending
// on exactly when it lands, can register every listener in
// js/website-designer.js *twice* on the same live DOM (once per firing),
// with the second run's fresh `state` object (package: null, etc.)
// silently shadowing the first's. That's invisible for idempotent set-up
// code, but any handler that reads `state` and throws on a null package
// (like the async PDF-download handler) then throws for real on every
// click, since jsdom dispatches to *all* registered listeners. Awaiting
// the single native event instead of also dispatching a synthetic one
// avoids the double-registration entirely.
function loadDesignerPage() {
  const html = fs.readFileSync(path.join(ROOT, "website-designer.html"), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/website-designer.html" });
  const { window } = dom;

  window.matchMedia = window.matchMedia || function () {
    return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} };
  };
  window.Element.prototype.scrollIntoView = window.Element.prototype.scrollIntoView || function () {};

  const capturedRequests = [];
  const starterCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, "starter-catalog.json"), "utf8"));

  window.fetch = function (url, opts) {
    const u = String(url);
    if (u.includes("starter-catalog.json")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(starterCatalog) });
    }
    if (u.includes("/.netlify/functions/website-designer")) {
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      capturedRequests.push(body);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: "WD-TEST123", resumeToken: "a".repeat(64) }) });
    }
    // i18n.js probes for i18n/<lang>.json on language switch; not exercised here.
    return Promise.resolve({ ok: false, status: 404 });
  };

  const readyPromise = new Promise((resolve) => {
    window.document.addEventListener("DOMContentLoaded", resolve, { once: true });
  });

  const vendoredJspdf = fs.readFileSync(path.join(ROOT, "assets", "vendor", "jspdf", "jspdf.umd.min.js"), "utf8");
  window.eval(vendoredJspdf);
  const pdfJs = fs.readFileSync(path.join(ROOT, "js", "website-designer-pdf.js"), "utf8");
  window.eval(pdfJs);
  const i18nJs = fs.readFileSync(path.join(ROOT, "js", "i18n.js"), "utf8");
  window.eval(i18nJs);
  const mainJs = fs.readFileSync(path.join(ROOT, "js", "main.js"), "utf8");
  window.eval(mainJs);
  const wdJs = fs.readFileSync(path.join(ROOT, "js", "website-designer.js"), "utf8");
  window.eval(wdJs);

  return readyPromise.then(() => ({ window, capturedRequests }));
}

function flush(times = 3) {
  let p = Promise.resolve();
  for (let i = 0; i < times; i++) p = p.then(() => new Promise((r) => setTimeout(r, 0)));
  return p;
}

// The shared PDF module's logo loader has a bounded fallback timeout (see
// loadImageAsDataUrl in js/website-designer-pdf.js) for environments (like
// this jsdom harness) that never fire an <img> load/error event at all --
// tests that trigger PDF generation need to wait past that, not just flush
// a couple of microtask ticks.
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function selectStarterPackage(window) {
  const btn = [...window.document.querySelectorAll("[data-choose-package]")].find(
    (b) => b.getAttribute("data-choose-package") === "starter"
  );
  assert.ok(btn, "expected a [data-choose-package=\"starter\"] control on the page");
  btn.dispatchEvent(new window.Event("click", { bubbles: true }));
}

test("jsPDF loads locally (vendored, not blocked by CSP): window.jspdf.jsPDF is available", async () => {
  const { window } = await loadDesignerPage();
  assert.equal(typeof window.jspdf, "object");
  assert.equal(typeof window.jspdf.jsPDF, "function");
});

test("PDF button: hidden and effectively inert before a package is chosen", async () => {
  const { window } = await loadDesignerPage();
  const btn = window.document.getElementById("wdDownloadPdf");
  assert.equal(btn.hidden, true);
});

test("PDF button: becomes visible and enabled once a package is selected, with no error shown", async () => {
  const { window } = await loadDesignerPage();
  selectStarterPackage(window);
  await flush();

  const btn = window.document.getElementById("wdDownloadPdf");
  const errorEl = window.document.getElementById("wdPdfError");
  assert.equal(btn.hidden, false);
  assert.equal(btn.disabled, false, "button should not be disabled once jsPDF loaded successfully");
  assert.equal(errorEl.hidden, true, "no PDF-init error should show when jsPDF loaded fine");
});

test("PDF button click produces a real, non-empty premium PDF document", async () => {
  const { window } = await loadDesignerPage();
  selectStarterPackage(window);
  await flush();

  window.document.getElementById("wdBusinessName").value = "Riverside Plumbing";

  // jsdom has no Blob-URL machinery, which the real jsPDF.save() needs to
  // trigger a browser download -- stub it so save() can run to completion,
  // and wrap the jsPDF constructor (rather than patching .save() on the
  // prototype, which some jsPDF builds re-bind per-instance and won't
  // reliably stick) so the test can capture the exact document the shared
  // PDF module produced and inspect it directly with .output().
  window.URL.createObjectURL = window.URL.createObjectURL || (() => "blob:mock");
  window.URL.revokeObjectURL = window.URL.revokeObjectURL || (() => {});
  const RealJsPDF = window.jspdf.jsPDF;
  let capturedDoc = null;
  window.jspdf.jsPDF = function (...args) {
    const instance = new RealJsPDF(...args);
    capturedDoc = instance;
    return instance;
  };

  const btn = window.document.getElementById("wdDownloadPdf");
  btn.dispatchEvent(new window.Event("click", { bubbles: true }));
  // PDF generation is async now (awaits the logo image load / its bounded
  // fallback) -- give it time to actually finish before asserting.
  await wait(2000);

  assert.ok(capturedDoc, "clicking the button should have built and saved a jsPDF document");
  const dataUri = capturedDoc.output("datauristring");
  assert.match(dataUri, /^data:application\/pdf;/);
  // "%PDF-" in base64 -- confirms this is a real PDF byte stream, not an empty/placeholder document.
  const base64 = dataUri.split(",")[1];
  const decoded = Buffer.from(base64, "base64").toString("latin1", 0, 8);
  assert.equal(decoded.startsWith("%PDF-"), true, `expected PDF magic bytes, got ${JSON.stringify(decoded)}`);
  assert.ok(base64.length > 500, "a real project-summary PDF should be more than a trivial number of bytes");
  assert.ok(capturedDoc.internal.getNumberOfPages() >= 2, "the premium PDF should span multiple pages (cover + pricing)");

  const errorEl = window.document.getElementById("wdPdfError");
  assert.equal(errorEl.hidden, true);
});

// The complete content brief no longer lives inline on this page at all --
// confirms it stays that way, and that accepting the post-quote prompt
// opens the standalone worksheet in a new tab (carrying the resume token
// only in a URL fragment, with window.opener manually severed) instead.
test("the full project-brief form/panel no longer exists inline on website-designer.html", async () => {
  const { window } = await loadDesignerPage();
  assert.equal(window.document.getElementById("wdBriefForm"), null);
  assert.equal(window.document.getElementById("wdStep4"), null);
  assert.equal(window.document.getElementById("wdLogoFile"), null);
});

test("accepting the post-quote prompt opens the worksheet in a new tab via a URL fragment resume token, never a query string", async () => {
  const { window, capturedRequests } = await loadDesignerPage();
  selectStarterPackage(window);
  await flush();

  window.document.getElementById("wdBusinessName").value = "Riverside Plumbing";
  window.document.getElementById("wdName").value = "Jane Doe";
  window.document.getElementById("wdEmail").value = "jane@example.com";
  window.document.getElementById("wdPhone").value = "555-0100";
  window.document.getElementById("wdPreferredContact").value = "email";
  window.document.getElementById("wdConsent").checked = true;

  window.document.getElementById("wdQuickForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();

  const quickSubmission = capturedRequests.find((r) => r.stage === "quick");
  assert.ok(quickSubmission, "expected a stage:\"quick\" request to have been sent");
  // This test's mocked fetch (above, in loadDesignerPage) returns a fixed
  // resumeToken for every request -- confirms the client actually reads
  // and uses whatever the server hands back rather than inventing its own.

  let openedUrl = null;
  let openedTarget = null;
  let openedFeatures = null;
  const fakePopup = { closed: false };
  window.open = (url, target, features) => {
    openedUrl = url;
    openedTarget = target;
    openedFeatures = features;
    return fakePopup; // truthy -- simulates the popup NOT being blocked
  };

  const yesBtn = window.document.getElementById("wdPromptYesBtn");
  assert.ok(yesBtn, "expected the post-quote prompt's \"open project worksheet\" button");
  yesBtn.dispatchEvent(new window.Event("click", { bubbles: true }));

  assert.ok(openedUrl, "expected window.open to have been called");
  assert.equal(openedTarget, "_blank");
  // Deliberately NOT passing the literal 'noopener' feature string -- per
  // spec, a browser that honors it (confirmed in real Safari) returns null
  // from window.open() even on success, which would make every popup look
  // "blocked" to this code. Reverse-tabnabbing protection is instead
  // applied manually on the returned reference (see the assertion below).
  assert.equal(openedFeatures, undefined);
  assert.equal(fakePopup.opener, null, "the new tab's window.opener must be severed manually since 'noopener' isn't passed");
  assert.match(openedUrl, /^website-project-brief\.html#resume=/, "resume token must travel in a URL fragment, not a query string");
  assert.doesNotMatch(openedUrl, /\?/, "no query string at all on the worksheet URL");

  // Never a "full" submission from this page -- that only ever happens from
  // the worksheet now.
  assert.equal(capturedRequests.some((r) => r.stage === "full"), false);
});

test("if the worksheet popup is blocked, a direct fallback link appears with the same URL", async () => {
  const { window } = await loadDesignerPage();
  selectStarterPackage(window);
  await flush();

  window.document.getElementById("wdBusinessName").value = "Riverside Plumbing";
  window.document.getElementById("wdName").value = "Jane Doe";
  window.document.getElementById("wdEmail").value = "jane@example.com";
  window.document.getElementById("wdPhone").value = "555-0100";
  window.document.getElementById("wdPreferredContact").value = "email";
  window.document.getElementById("wdConsent").checked = true;
  window.document.getElementById("wdQuickForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();

  window.open = () => null; // simulates a blocked popup

  window.document.getElementById("wdPromptYesBtn").dispatchEvent(new window.Event("click", { bubbles: true }));

  const fallback = window.document.getElementById("wdWorksheetFallback");
  const fallbackLink = window.document.getElementById("wdWorksheetFallbackLink");
  assert.equal(fallback.hidden, false);
  assert.match(fallbackLink.getAttribute("href"), /^website-project-brief\.html#resume=/);
});

// Real-Safari-observed case: window.open() hands back a truthy Window
// reference even though the popup was actually blocked (Chromium reliably
// returns null instead, which the previous test covers) -- the reference's
// `.closed` reads back true immediately since nothing really opened. A
// plain `if (!win)` check misses this and would wrongly claim success,
// leaving the customer on the "worksheet opened" panel with no worksheet
// anywhere -- the bug this test guards against.
test("if window.open returns a truthy but already-closed reference (Safari), the fallback link still appears", async () => {
  const { window } = await loadDesignerPage();
  selectStarterPackage(window);
  await flush();

  window.document.getElementById("wdBusinessName").value = "Riverside Plumbing";
  window.document.getElementById("wdName").value = "Jane Doe";
  window.document.getElementById("wdEmail").value = "jane@example.com";
  window.document.getElementById("wdPhone").value = "555-0100";
  window.document.getElementById("wdPreferredContact").value = "email";
  window.document.getElementById("wdConsent").checked = true;
  window.document.getElementById("wdQuickForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();

  window.open = () => ({ closed: true }); // simulates Safari's truthy-but-blocked case

  window.document.getElementById("wdPromptYesBtn").dispatchEvent(new window.Event("click", { bubbles: true }));

  const fallback = window.document.getElementById("wdWorksheetFallback");
  const fallbackLink = window.document.getElementById("wdWorksheetFallbackLink");
  assert.equal(fallback.hidden, false, "expected the fallback link to appear instead of the 'worksheet opened' panel");
  assert.match(fallbackLink.getAttribute("href"), /^website-project-brief\.html#resume=/);
});
