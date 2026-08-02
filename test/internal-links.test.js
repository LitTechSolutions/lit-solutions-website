/* Internal links and anchors must actually go somewhere.
 *
 * This exists because three pages shipped links to
 * "pricing.html#ongoing-support" when no element with that id existed
 * anywhere -- the anchor had simply been invented while writing the copy.
 * Nothing noticed: the page still loaded, the link still looked fine, it
 * just silently did nothing. That's the worst kind of broken, because it
 * never shows up as an error.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const PAGES = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));

/** Every id and legacy name anchor a page defines. */
function anchorsIn(html) {
  const ids = new Set();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  for (const m of html.matchAll(/<a[^>]+name="([^"]+)"/g)) ids.add(m[1]);
  return ids;
}

/** Every href a page points at, ignoring external and non-navigational ones. */
function linksIn(html) {
  const out = [];
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|tel:|javascript:|data:|#$)/.test(href)) continue;
    out.push(href);
  }
  return out;
}

/* Paths that resolve through a netlify.toml redirect rather than a file --
 * the renamed plan pages, for instance, are legitimately linked from the
 * historical changelog and 301 to their new names in production. */
const REDIRECTED = new Set(
  [...fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8")
    .matchAll(/from\s*=\s*"([^"]+)"/g)]
    .map((m) => m[1].replace(/^\//, ""))
);

const pageAnchors = new Map(
  PAGES.map((p) => [p, anchorsIn(fs.readFileSync(path.join(ROOT, p), "utf8"))])
);

test("every internal link points at a page that exists", () => {
  const broken = [];
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), "utf8");
    for (const href of linksIn(html)) {
      const target = href.split("#")[0].split("?")[0];
      if (!target) continue;                    // same-page anchor
      if (target.startsWith("/")) continue;     // handled by netlify.toml redirects
      if (!target.endsWith(".html")) continue;  // assets, feeds, etc.
      if (fs.existsSync(path.join(ROOT, target))) continue;
      if (REDIRECTED.has(target)) continue;   // 301s to its replacement
      broken.push(`${page} -> ${href}`);
    }
  }
  assert.deepEqual(broken, [], `links to pages that don't exist:\n  ${broken.join("\n  ")}`);
});

test("every #anchor points at an element that exists", () => {
  const broken = [];
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), "utf8");
    for (const href of linksIn(html)) {
      const [rawTarget, hash] = href.split("#");
      if (!hash) continue;
      const target = rawTarget.split("?")[0] || page;
      if (target.startsWith("/") || !target.endsWith(".html")) continue;
      // A hash on myaccount.html is a client-side route, not a DOM id.
      if (target === "myaccount.html") continue;
      if (!pageAnchors.has(target)) continue;   // covered by the test above
      if (!pageAnchors.get(target).has(hash)) {
        broken.push(`${page} -> ${href}  (no id="${hash}" on ${target})`);
      }
    }
  }
  assert.deepEqual(broken, [], `links to anchors that don't exist:\n  ${broken.join("\n  ")}`);
});
