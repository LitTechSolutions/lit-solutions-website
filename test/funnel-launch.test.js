const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("the two approved funnels have dedicated indexable landing pages", () => {
  const home = read("home-tech-visit.html");
  const websites = read("local-business-websites.html");
  const sitemap = read("sitemap.xml");

  assert.match(home, /<link rel="canonical" href="https:\/\/lit-solutions\.tech\/home-tech-visit">/);
  assert.match(websites, /<link rel="canonical" href="https:\/\/lit-solutions\.tech\/local-business-websites">/);
  assert.match(sitemap, /https:\/\/lit-solutions\.tech\/home-tech-visit/);
  assert.match(sitemap, /https:\/\/lit-solutions\.tech\/local-business-websites/);
});

test("home tech funnel leads with price and offers call, text, and form actions", () => {
  const home = read("home-tech-visit.html");
  assert.match(home, /\$79/);
  assert.match(home, /href="tel:\+18043090968"/);
  assert.match(home, /href="sms:\+18043090968"/);
  assert.match(home, /intake\.html\?service=home-tech/);
  assert.doesNotMatch(home, /data-cart-link|checkout|add to cart/i);
});

test("website funnel is private-sector, consultation-led, and separate from consumer help", () => {
  const websites = read("local-business-websites.html");
  assert.match(websites, /Request the free review/);
  assert.match(websites, /intake\.html\?service=local-website-review/);
  assert.match(websites, /auto, marine, home-service, hospitality, cleaning, and professional-service/i);
  assert.doesNotMatch(websites, /government contractor|DoD contractor|CAGE|UEI|NAICS/i);
  assert.doesNotMatch(websites, /data-cart-link|checkout|add to cart/i);
});

test("focused CTAs are wired for conversion measurement", () => {
  for (const file of ["index.html", "home-tech-visit.html", "local-business-websites.html"]) {
    const source = read(file);
    assert.match(source, /data-track-(?:cta|label)=/i, `${file} needs an explicit tracked CTA`);
  }
  const intake = read("js/intake.js");
  assert.match(intake, /LTS_TRACK\('form_submit'/);
});
