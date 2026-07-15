// Unit tests for the core translation engine (js/i18n.js) that every one
// of the 33 public pages depends on -- previously the only i18n coverage
// was a static key-parity check on the JSON dictionaries themselves
// (test/i18n-key-parity.test.js); the engine's actual runtime behavior
// (fallback, data-i18n/-html/-attr application, RTL switching, reverting
// to English) had no test at all. Loads the real js/i18n.js into jsdom
// against a minimal fixture, mocking fetch to serve a canned dictionary,
// rather than re-implementing the lookup/apply logic here.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
<body>
  <div class="lang-bar">
    <span id="langCurrentLabel">ENG</span>
    <div class="nav-dropdown">
      <button class="nav-dropdown-toggle" aria-expanded="false"></button>
      <div class="nav-dropdown-menu">
        <button class="lang-option is-active" data-lang="en">English</button>
        <button class="lang-option" data-lang="ar">العربية</button>
      </div>
    </div>
  </div>
  <p data-i18n="nav.home">Home</p>
  <p data-i18n-html="hero.lede">Hello <strong>world</strong></p>
  <input placeholder="Your name" data-i18n-attr-placeholder="contact.name_placeholder">
  <p data-i18n="missing.key">Fallback text stays</p>
</body>
</html>`;

const AR_DICT = {
  nav: { home: "الرئيسية" },
  hero: { lede: "مرحبا <strong>بالعالم</strong>" },
  contact: { name_placeholder: "اسمك" },
};

function loadI18nEngine(dict) {
  const dom = new JSDOM(FIXTURE_HTML, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/index.html" });
  const { window } = dom;
  window.fetch = function (url) {
    if (url.indexOf("i18n/ar.json") !== -1) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(dict) });
    }
    return Promise.resolve({ ok: false, status: 404 });
  };
  const i18nJs = fs.readFileSync(path.join(__dirname, "..", "js", "i18n.js"), "utf8");
  window.eval(i18nJs);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true, cancelable: true }));
  return window;
}

test("i18n: window.LTS_I18N.t() returns the fallback when English is active (no dict loaded)", () => {
  const window = loadI18nEngine(AR_DICT);
  assert.equal(window.LTS_I18N.getCode(), "en");
  assert.equal(window.LTS_I18N.t("nav.home", "Home (fallback)"), "Home (fallback)");
});

test("i18n: switching language applies data-i18n, data-i18n-html, and data-i18n-attr-* targets", async () => {
  const window = loadI18nEngine(AR_DICT);
  const arButton = window.document.querySelector('.lang-option[data-lang="ar"]');
  arButton.dispatchEvent(new window.Event("click", { bubbles: true }));

  // language load is async (fetch + .then chain); flush microtasks.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(window.document.querySelector('[data-i18n="nav.home"]').textContent, "الرئيسية");
  assert.equal(window.document.querySelector('[data-i18n-html="hero.lede"]').innerHTML, "مرحبا <strong>بالعالم</strong>");
  assert.equal(window.document.querySelector("input").getAttribute("placeholder"), "اسمك");
});

test("i18n: a key missing from the active dict keeps the original (English) text untouched", async () => {
  const window = loadI18nEngine(AR_DICT);
  const arButton = window.document.querySelector('.lang-option[data-lang="ar"]');
  arButton.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(window.document.querySelector('[data-i18n="missing.key"]').textContent, "Fallback text stays");
});

test("i18n: selecting Arabic sets dir=rtl and lang=ar on <html>; selecting English restores dir=ltr", async () => {
  const window = loadI18nEngine(AR_DICT);
  const arButton = window.document.querySelector('.lang-option[data-lang="ar"]');
  arButton.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(window.document.documentElement.dir, "rtl");
  assert.equal(window.document.documentElement.lang, "ar");

  const enButton = window.document.querySelector('.lang-option[data-lang="en"]');
  enButton.dispatchEvent(new window.Event("click", { bubbles: true }));

  assert.equal(window.document.documentElement.dir, "ltr");
  assert.equal(window.document.documentElement.lang, "en");
});

test("i18n: switching back to English restores the original text (no residual translation)", async () => {
  const window = loadI18nEngine(AR_DICT);
  const arButton = window.document.querySelector('.lang-option[data-lang="ar"]');
  arButton.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(window.document.querySelector('[data-i18n="nav.home"]').textContent, "الرئيسية");

  const enButton = window.document.querySelector('.lang-option[data-lang="en"]');
  enButton.dispatchEvent(new window.Event("click", { bubbles: true }));

  assert.equal(window.document.querySelector('[data-i18n="nav.home"]').textContent, "Home");
  assert.equal(window.document.querySelector('[data-i18n-html="hero.lede"]').innerHTML, "Hello <strong>world</strong>");
  assert.equal(window.LTS_I18N.getCode(), "en");
});
