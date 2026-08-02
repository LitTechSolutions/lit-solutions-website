/* Every inline <script> on every page must actually parse.
 *
 * This exists because a sitewide copy edit -- rewording "create an account"
 * to "sign in or create an account if you're new" -- dropped an unescaped
 * apostrophe into a single-quoted JavaScript string in cart.html and took
 * the entire checkout page down. Nothing in the test suite noticed, because
 * the suite tests behaviour rather than parseability, and a page whose only
 * script throws on line one has no behaviour left to test.
 *
 * Sitewide sweeps over 38 static pages with no include mechanism are a fact
 * of this codebase, and prose edits will keep landing inside string
 * literals. A syntax check is the cheapest possible guard against that.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const PAGES = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));

test("every inline script on every page parses", () => {
  const broken = [];
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), "utf8");
    let i = 0;
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      const body = m[1];
      // Skip JSON-LD and any other non-JavaScript payload.
      if (/^\s*\{/.test(body) && /application\/ld\+json/.test(m[0])) { i++; continue; }
      try {
        new vm.Script(body, { filename: `${page}#inline-${i}` });
      } catch (err) {
        broken.push(`${page} (inline script ${i}): ${err.message}`);
      }
      i++;
    }
  }
  assert.deepEqual(broken, [], `inline scripts failed to parse:\n  ${broken.join("\n  ")}`);
});

test("every standalone js/ file parses", () => {
  const broken = [];
  const dir = path.join(ROOT, "js");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    try {
      new vm.Script(fs.readFileSync(path.join(dir, file), "utf8"), { filename: file });
    } catch (err) {
      broken.push(`js/${file}: ${err.message}`);
    }
  }
  assert.deepEqual(broken, [], `browser scripts failed to parse:\n  ${broken.join("\n  ")}`);
});
