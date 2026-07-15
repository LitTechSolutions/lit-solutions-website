// Covers the PDF-generation restore (F043): website-designer.html used to
// load jsPDF from cdnjs, which the site's Content-Security-Policy
// (script-src 'self') silently blocks in production. That made buildPdf()
// return null, the "Download summary (PDF)" button silently do nothing,
// and a full-brief submission send pdfBase64: null while its own status
// text claimed "Building your PDF and sending it over...". jsPDF is now
// vendored locally under assets/vendor/jspdf/ instead.
//
// Loads the real website-designer.html + the real vendored jsPDF build +
// the real js/website-designer.js into jsdom, rather than re-implementing
// buildPdf() here, so this test actually exercises the shipped code.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

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
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: "WD-TEST123" }) });
    }
    // i18n.js probes for i18n/<lang>.json on language switch; not exercised here.
    return Promise.resolve({ ok: false, status: 404 });
  };

  const vendoredJspdf = fs.readFileSync(path.join(ROOT, "assets", "vendor", "jspdf", "jspdf.umd.min.js"), "utf8");
  window.eval(vendoredJspdf);
  const i18nJs = fs.readFileSync(path.join(ROOT, "js", "i18n.js"), "utf8");
  window.eval(i18nJs);
  const mainJs = fs.readFileSync(path.join(ROOT, "js", "main.js"), "utf8");
  window.eval(mainJs);
  const wdJs = fs.readFileSync(path.join(ROOT, "js", "website-designer.js"), "utf8");
  window.eval(wdJs);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true, cancelable: true }));

  return { window, capturedRequests };
}

function flush(times = 3) {
  let p = Promise.resolve();
  for (let i = 0; i < times; i++) p = p.then(() => new Promise((r) => setTimeout(r, 0)));
  return p;
}

function selectStarterPackage(window) {
  const btn = [...window.document.querySelectorAll("[data-choose-package]")].find(
    (b) => b.getAttribute("data-choose-package") === "starter"
  );
  assert.ok(btn, "expected a [data-choose-package=\"starter\"] control on the page");
  btn.dispatchEvent(new window.Event("click", { bubbles: true }));
}

test("jsPDF loads locally (vendored, not blocked by CSP): window.jspdf.jsPDF is available", () => {
  const { window } = loadDesignerPage();
  assert.equal(typeof window.jspdf, "object");
  assert.equal(typeof window.jspdf.jsPDF, "function");
});

test("PDF button: hidden and effectively inert before a package is chosen", () => {
  const { window } = loadDesignerPage();
  const btn = window.document.getElementById("wdDownloadPdf");
  assert.equal(btn.hidden, true);
});

test("PDF button: becomes visible and enabled once a package is selected, with no error shown", async () => {
  const { window } = loadDesignerPage();
  selectStarterPackage(window);
  await flush();

  const btn = window.document.getElementById("wdDownloadPdf");
  const errorEl = window.document.getElementById("wdPdfError");
  assert.equal(btn.hidden, false);
  assert.equal(btn.disabled, false, "button should not be disabled once jsPDF loaded successfully");
  assert.equal(errorEl.hidden, true, "no PDF-init error should show when jsPDF loaded fine");
});

test("PDF button click produces a real, non-empty PDF document", async () => {
  const { window } = loadDesignerPage();
  selectStarterPackage(window);
  await flush();

  window.document.getElementById("wdBusinessName").value = "Riverside Plumbing";

  // jsdom has no Blob-URL machinery, which the real jsPDF.save() needs to
  // trigger a browser download -- stub it so save() can run to completion,
  // and wrap the jsPDF constructor (rather than patching .save() on the
  // prototype, which some jsPDF builds re-bind per-instance and won't
  // reliably stick) so the test can capture the exact document buildPdf()
  // produced and inspect it directly with .output().
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

  assert.ok(capturedDoc, "clicking the button should have built and saved a jsPDF document");
  const dataUri = capturedDoc.output("datauristring");
  assert.match(dataUri, /^data:application\/pdf;/);
  // "%PDF-" in base64 -- confirms this is a real PDF byte stream, not an empty/placeholder document.
  const base64 = dataUri.split(",")[1];
  const decoded = Buffer.from(base64, "base64").toString("latin1", 0, 8);
  assert.equal(decoded.startsWith("%PDF-"), true, `expected PDF magic bytes, got ${JSON.stringify(decoded)}`);
  assert.ok(base64.length > 500, "a real project-summary PDF should be more than a trivial number of bytes");

  const errorEl = window.document.getElementById("wdPdfError");
  assert.equal(errorEl.hidden, true);
});

test("a full-brief submission includes a valid, non-empty PDF in its payload", async () => {
  const { window, capturedRequests } = loadDesignerPage();
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

  const yesBtn = window.document.querySelector('[data-prompt-choice="yes"]');
  assert.ok(yesBtn, "expected the post-quote prompt's \"yes, continue\" button");
  yesBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
  await flush();

  window.document.getElementById("wdBriefForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await flush(5);

  const fullSubmission = capturedRequests.find((r) => r.stage === "full");
  assert.ok(fullSubmission, "expected a stage:\"full\" request to have been sent");
  assert.ok(fullSubmission.pdfBase64, "full submission must include a non-empty pdfBase64");
  const decoded = Buffer.from(fullSubmission.pdfBase64, "base64").toString("latin1", 0, 8);
  assert.equal(decoded.startsWith("%PDF-"), true, `expected PDF magic bytes in submitted pdfBase64, got ${JSON.stringify(decoded)}`);
});
