// Covers the Square payment/subscription terms-gate (F011): an unchecked
// consent checkbox must block every "pay-btn"/"pay-btn-sm" link until
// checked, never precheck itself, and re-lock if unchecked again. Loads
// the real payment.html + js/main.js into jsdom rather than re-implementing
// the gating logic here, so this test actually exercises the shipped code.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

function loadPaymentPage() {
  const html = fs.readFileSync(path.join(__dirname, "..", "payment.html"), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/payment.html" });
  const { window } = dom;
  // jsdom implements no CSSOM media-query engine, so window.matchMedia is
  // simply absent -- without this stub, js/main.js's very first call to it
  // (prefers-reduced-motion, near the top of the DOMContentLoaded handler)
  // throws and aborts every line after it in that one big handler,
  // including the terms-gate setup this test actually cares about.
  window.matchMedia = window.matchMedia || function () {
    return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} };
  };
  // jsdom doesn't implement layout, so scrollIntoView is absent; the
  // terms-gate's warning path calls it as a side effect this test doesn't
  // otherwise care about.
  window.Element.prototype.scrollIntoView = window.Element.prototype.scrollIntoView || function () {};
  // js/main.js wraps everything in a DOMContentLoaded listener; jsdom's
  // "outside-only" scripts mode means <script src> tags never auto-run, so
  // load and run js/main.js explicitly against this window, then fire the
  // event ourselves once the DOM (already parsed by JSDOM's constructor)
  // is ready.
  const mainJs = fs.readFileSync(path.join(__dirname, "..", "js", "main.js"), "utf8");
  window.eval(mainJs);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true, cancelable: true }));
  return window;
}

test("terms-gate: checkbox is unchecked by default (never prechecked)", () => {
  const window = loadPaymentPage();
  const checkbox = window.document.getElementById("agreeTerms");
  assert.equal(checkbox.checked, false);
});

test("terms-gate: checkbox has an accessible label linking Terms and Privacy Policy", () => {
  const window = loadPaymentPage();
  const checkbox = window.document.getElementById("agreeTerms");
  const label = window.document.querySelector('label[for="agreeTerms"]');
  assert.ok(label, "no <label for=\"agreeTerms\"> found");
  assert.equal(checkbox.getAttribute("disabled"), null);
  assert.equal(checkbox.getAttribute("tabindex"), null, "checkbox must stay in the natural tab order");
  const links = Array.from(label.querySelectorAll("a")).map((a) => a.getAttribute("href"));
  assert.ok(links.includes("terms.html"), "label must link to Terms & Conditions");
  assert.ok(links.includes("privacy.html"), "label must link to the Privacy Policy");
});

test("terms-gate: clicking a pay button while unchecked is blocked and surfaces the warning", () => {
  const window = loadPaymentPage();
  const btn = window.document.querySelector("a.pay-btn");
  const warning = window.document.getElementById("termsWarning");
  assert.equal(warning.classList.contains("is-visible"), false, "warning should start hidden");

  const evt = new window.MouseEvent("click", { bubbles: true, cancelable: true });
  btn.dispatchEvent(evt);

  assert.equal(evt.defaultPrevented, true, "click must be prevented while unchecked");
  assert.equal(warning.classList.contains("is-visible"), true);
  assert.equal(window.document.getElementById("termsAgreeBlock").classList.contains("needs-attention"), true);
});

test("terms-gate: checking the box unlocks every gated button", () => {
  const window = loadPaymentPage();
  const checkbox = window.document.getElementById("agreeTerms");
  const buttons = Array.from(window.document.querySelectorAll("a.pay-btn, a.pay-btn-sm"));
  assert.ok(buttons.length > 0, "expected at least one gated payment button on the page");
  assert.ok(buttons.every((b) => b.classList.contains("is-locked")), "all buttons should start locked");

  checkbox.checked = true;
  checkbox.dispatchEvent(new window.Event("change", { bubbles: true }));

  assert.ok(buttons.every((b) => !b.classList.contains("is-locked")), "all buttons should unlock once checked");

  const evt = new window.MouseEvent("click", { bubbles: true, cancelable: true });
  buttons[0].dispatchEvent(evt);
  assert.equal(evt.defaultPrevented, false, "click must be allowed through once checked");
});

test("terms-gate: unchecking again re-locks every gated button", () => {
  const window = loadPaymentPage();
  const checkbox = window.document.getElementById("agreeTerms");
  const buttons = Array.from(window.document.querySelectorAll("a.pay-btn, a.pay-btn-sm"));

  checkbox.checked = true;
  checkbox.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.ok(buttons.every((b) => !b.classList.contains("is-locked")));

  checkbox.checked = false;
  checkbox.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.ok(buttons.every((b) => b.classList.contains("is-locked")), "unchecking must re-lock every button");

  const evt = new window.MouseEvent("click", { bubbles: true, cancelable: true });
  buttons[0].dispatchEvent(evt);
  assert.equal(evt.defaultPrevented, true, "click must be blocked again after unchecking");
});

test("terms-gate: one-time vs. recurring purchases are clearly distinguished on the page", () => {
  const window = loadPaymentPage();
  const text = window.document.body.textContent;
  assert.ok(/one-time payment/i.test(text), "page must clearly label the one-time payment section");
  assert.ok(/subscription/i.test(text), "page must clearly label the recurring/subscription section");
});
