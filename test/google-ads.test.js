const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const SCRIPT = fs.readFileSync(path.join(ROOT, "js", "google-ads.js"), "utf8");

function load(choice) {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://lit-solutions.tech/plan-standard.html",
    runScripts: "outside-only",
  });
  if (choice) dom.window.localStorage.setItem("lts-ads-measurement-consent", choice);
  dom.window.eval(SCRIPT);
  return dom.window;
}

function layerCalls(window, command) {
  return window.dataLayer.filter((args) => args && args[0] === command);
}

test("Google Ads storage starts denied and personalization always stays off", () => {
  const window = load();
  const consent = layerCalls(window, "consent")[0];
  assert.equal(consent[1], "default");
  assert.equal(consent[2].ad_storage, "denied");
  assert.equal(consent[2].analytics_storage, "denied");
  assert.equal(consent[2].ad_user_data, "denied");
  assert.equal(consent[2].ad_personalization, "denied");

  const config = layerCalls(window, "config")[0];
  assert.equal(config[1], "AW-18337968564");
  assert.equal(config[2].allow_ad_personalization_signals, false);
  assert.equal(config[2].allow_google_signals, false);
  assert.ok(window.document.querySelector('script[data-lts-google-tag="AW-18337968564"]'));
});

test("a visitor can allow measurement without enabling customer-data or personalized ads", () => {
  const window = load();
  assert.equal(window.LTS_ADS_CONSENT(true), "granted");
  assert.equal(window.localStorage.getItem("lts-ads-measurement-consent"), "granted");
  const update = layerCalls(window, "consent").at(-1);
  assert.equal(update[1], "update");
  assert.equal(update[2].ad_storage, "granted");
  assert.equal(update[2].analytics_storage, "granted");
  assert.equal(update[2].ad_user_data, "denied");
  assert.equal(update[2].ad_personalization, "denied");
});

test("essential-only preference remains denied on the next page", () => {
  const first = load();
  first.LTS_ADS_CONSENT(false);
  const second = load("denied");
  const consent = layerCalls(second, "consent")[0];
  assert.equal(consent[2].ad_storage, "denied");
  assert.equal(consent[2].analytics_storage, "denied");
});

test("all public pages load the privacy-aware tag before the main UI", () => {
  const pages = fs.readdirSync(ROOT).filter((name) => name.endsWith(".html"));
  for (const page of pages) {
    const source = fs.readFileSync(path.join(ROOT, page), "utf8");
    const tagAt = source.indexOf('js/google-ads.js');
    const mainAt = source.indexOf('js/main.js');
    assert.ok(tagAt >= 0, `${page} is missing Google Ads consent setup`);
    assert.ok(mainAt > tagAt, `${page} must load consent setup before main.js`);
  }
});
