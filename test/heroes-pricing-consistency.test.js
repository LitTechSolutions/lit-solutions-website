// Static consistency check for heroes-pricing.html (F016, closing out the
// remaining half of F035): every "was $X / now $Y" pair on that page is
// hand-typed prose, not computed -- so nothing catches it if a price
// changes on pricing.html but the matching Heroes Discount row is never
// updated to match. This test
// re-derives the expected discounted price from the "was" price and the
// documented rate (15% one-time, 5% on the two items explicitly marked
// "5% off" in their own label) and asserts it against what's actually
// printed on the page.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const HEROES_DISCOUNT_RATE = 0.15; // matches js/website-designer.js + netlify/functions/website-designer.js
const RECURRING_DISCOUNT_RATE = 0.05; // matches heroes.web_item7/biz_item6's own "(5% off ...)" labels

const html = fs.readFileSync(path.join(__dirname, "..", "heroes-pricing.html"), "utf8");

// One <li>...</li> per priced item; each contains a price-was <s> tag and a
// "now" dollar figure somewhere after it in the same list item.
const LI_RE = /<li>.*?<\/li>/gs;
const WAS_RE = /class="price-was">\$([\d,]+)(?:\/\w+)?<\/s>/;
const NOW_RE = /<\/s>\s*(?:Starting at\s*)?\$([\d,]+)(?:\/\w+)?/;

function parsePricedItems(source) {
  const items = [];
  for (const li of source.match(LI_RE) || []) {
    const wasMatch = li.match(WAS_RE);
    const nowMatch = li.match(NOW_RE);
    if (!wasMatch || !nowMatch) continue; // e.g. items with no price-was (nothing to cross-check)
    const nameMatch = li.match(/class="price-item-name">([^<]+)/);
    items.push({
      key: nameMatch ? nameMatch[1].trim() : li.slice(0, 60),
      was: Number(wasMatch[1].replace(/,/g, "")),
      now: Number(nowMatch[1].replace(/,/g, "")),
      isRecurring: /5% off/.test(li),
    });
  }
  return items;
}

test("heroes-pricing.html has at least the expected number of priced Heroes Discount rows", () => {
  const items = parsePricedItems(html);
  assert.ok(items.length >= 20, `expected >= 20 priced rows, found ${items.length}`);
});

test("every hand-typed Heroes Discount price matches was * (1 - rate), rounded to the nearest dollar", () => {
  const items = parsePricedItems(html);
  const mismatches = [];
  for (const item of items) {
    const rate = item.isRecurring ? RECURRING_DISCOUNT_RATE : HEROES_DISCOUNT_RATE;
    const expected = Math.round(item.was * (1 - rate));
    if (Math.abs(expected - item.now) > 1) {
      mismatches.push(`${item.key}: was $${item.was}, printed $${item.now}, expected ~$${expected} at ${rate * 100}% off`);
    }
  }
  assert.deepEqual(mismatches, []);
});
