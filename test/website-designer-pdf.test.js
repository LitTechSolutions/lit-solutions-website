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
    return Promise.resolve({ ok: false, status: 404 });
  };

  const readyPromise = new Promise((resolve) => {
    window.document.addEventListener("DOMContentLoaded", resolve, { once: true });
  });

  const vendoredJspdf = fs.readFileSync(path.join(ROOT, "assets", "vendor", "jspdf", "jspdf.umd.min.js"), "utf8");
  window.eval(vendoredJspdf);
  const pdfJs = fs.readFileSync(path.join(ROOT, "js", "website-designer-pdf.js"), "utf8");
  window.eval(pdfJs);
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


// Regression: selectionPayload() always computed selectedBundles correctly
// (the quick-quote PDF built on this page was never wrong), but the quick-
// submission network payload omitted it entirely, so it never reached the
// lead record -- meaning the standalone worksheet's later "resume" fetch
// had no way to know which bundles were selected, and its own PDF always
// showed "(none selected)". Confirms the field now makes it into the
// outbound request that's actually persisted server-side.


// Real-Safari-observed case: window.open() hands back a truthy Window
// reference even though the popup was actually blocked (Chromium reliably
// returns null instead, which the previous test covers) -- the reference's
// `.closed` reads back true immediately since nothing really opened. A
// plain `if (!win)` check misses this and would wrongly claim success,
// leaving the customer on the "worksheet opened" panel with no worksheet
// anywhere -- the bug this test guards against.

/* ---------------------------------------------------------- add to cart -- */

test("the page ends in a purchase, not a contact form", async () => {
  // It used to collect name, email, phone and preferred contact method and
  // promise a follow-up -- a configurator acting as a lead magnet. Every one
  // of those fields is gone, and so is the self-attested Heroes checkbox
  // (eligibility lives on the account and is verified before payment).
  const html = fs.readFileSync(path.join(__dirname, "..", "website-designer.html"), "utf8");
  for (const gone of ["wdBusinessName", "wdName", "wdEmail", "wdPhone", "wdPreferredContact",
                      "wdConsent", "wdHeroesDiscount", "wdCustomRequest", 'id="wdQuickForm"']) {
    assert.ok(!html.includes(gone), `${gone} should no longer exist on the page`);
  }
  assert.ok(html.includes('id="wdAddToCart"'), "the page must offer Add to cart");
  assert.ok(html.includes("half now, half at launch"), "the 50/50 split must be stated before checkout");
});

test("Add to cart prices the build server-side and never trusts the page's total", async () => {
  const { window } = await loadDesignerPage();
  selectStarterPackage(window);
  await flush();

  let posted = null;
  window.fetch = async (url, opts) => {
    posted = { url: String(url), body: JSON.parse(opts.body) };
    return { ok: true, status: 201, json: async () => ({
      quoteId: "q" + "a".repeat(20), cartKey: "quote:q" + "a".repeat(20), totalCents: 69900,
    }) };
  };
  // Stand in for the cart module. jsdom won't allow window.location to be
  // replaced, so the navigation itself isn't asserted here -- landing the
  // quote id in the cart is the part that matters, and the redirect is one
  // line immediately after it.
  const added = [];
  window.LTS_CART = { add: (k) => { added.push(k); return true; } };

  window.document.getElementById("wdAddToCart").click();
  await flush();

  assert.ok(posted, "a quote should have been requested");
  assert.match(posted.url, /designer-quote/);
  assert.equal(posted.body.package, "starter");
  assert.ok(Array.isArray(posted.body.optionalSelected));

  // The selections go up; the PRICE does not. A cart that could name its own
  // total would be the cart telling us what to charge.
  assert.equal(posted.body.total, undefined, "the page must not tell the server what to charge");
  assert.equal(posted.body.estimateTotal, undefined);
  assert.equal(posted.body.subtotal, undefined);
  // Eligibility is decided by the account record, never by this page.
  assert.equal(posted.body.heroesDiscount, undefined);

  assert.deepEqual(added, ["quote:q" + "a".repeat(20)], "the quote id should land in the cart");
});
