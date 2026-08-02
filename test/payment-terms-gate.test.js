// Covers the checkout terms-gate (F011): an unchecked
// consent checkbox must block every "pay-btn"/"pay-btn-sm" link until
// checked, never precheck itself, and re-lock if unchecked again. Loads
// the real cart.html + js/main.js into jsdom rather than re-implementing
// the gating logic here, so this test actually exercises the shipped code.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

function loadCheckoutPage() {
  const html = fs.readFileSync(path.join(__dirname, "..", "cart.html"), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/cart.html" });
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
  const window = loadCheckoutPage();
  const checkbox = window.document.getElementById("agreeTerms");
  assert.equal(checkbox.checked, false);
});

test("terms-gate: checkbox has an accessible label linking Terms and Privacy Policy", () => {
  const window = loadCheckoutPage();
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
  const window = loadCheckoutPage();
  const btn = window.document.querySelector(".pay-btn");
  const warning = window.document.getElementById("termsWarning");
  assert.equal(warning.classList.contains("is-visible"), false, "warning should start hidden");

  const evt = new window.MouseEvent("click", { bubbles: true, cancelable: true });
  btn.dispatchEvent(evt);

  assert.equal(evt.defaultPrevented, true, "click must be prevented while unchecked");
  assert.equal(warning.classList.contains("is-visible"), true);
  assert.equal(window.document.getElementById("termsAgreeBlock").classList.contains("needs-attention"), true);
});

test("terms-gate: checking the box unlocks every gated button", () => {
  const window = loadCheckoutPage();
  const checkbox = window.document.getElementById("agreeTerms");
  const buttons = Array.from(window.document.querySelectorAll(".pay-btn, .pay-btn-sm"));
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
  const window = loadCheckoutPage();
  const checkbox = window.document.getElementById("agreeTerms");
  const buttons = Array.from(window.document.querySelectorAll(".pay-btn, .pay-btn-sm"));

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

test("one-time vs. recurring is distinguished before the customer pays", () => {
  // This used to read payment.html's "One-Time Payment" / "Subscriptions"
  // headings. That page is gone -- billing lives in the cart and the account
  // now -- but the requirement behind it stands: nobody should reach a
  // payment button without knowing what recurs. The cart's own summary is
  // what carries that, so assert on the code that renders it.
  const cart = fs.readFileSync(path.join(__dirname, "..", "cart.html"), "utf8");
  assert.match(cart, /Charged today/, "the cart must state what is taken today");
  assert.match(cart, /Then every month/, "the cart must state what recurs");
  assert.match(cart, /Balance at launch/, "the cart must state what is still owed later");
  // Stripe bills the first month immediately, so today's figure exceeds the
  // deposit. Saying so is the difference between a clear charge and a
  // surprise one.
  assert.match(cart, /includes your first month/i,
    "the cart must explain why today's total is more than the deposit");
});
