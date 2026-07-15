// Guards against the "zero-counter" SEO/no-JS bug: the animated stat
// counters on index.html and about.html (.stat-num, data-count="N")
// used to render "0" in the static HTML and rely on js/main.js's
// IntersectionObserver-driven animateCount() to fill in the real
// number once scrolled into view. That meant search crawlers,
// no-JS/failed-JS visitors, reduced-motion users who load fast, and
// print views all saw literal zeros (e.g. "0 Years of Navy technical
// service") instead of the real facts. The animation itself is fine
// as progressive enhancement -- the bug was the static fallback.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const STAT_NUM_RE = /<span class="stat-num" data-count="(\d+)">([^<]*)<\/span>/g;

function formatExpected(count) {
  return Number(count).toLocaleString("en-US");
}

function checkFile(file) {
  const html = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const matches = [...html.matchAll(STAT_NUM_RE)];
  assert.ok(matches.length > 0, `expected at least one .stat-num element in ${file}`);
  for (const [, count, rendered] of matches) {
    assert.notEqual(rendered.trim(), "0", `${file}: data-count="${count}" renders as literal "0" in static HTML`);
    assert.equal(
      rendered.trim(),
      formatExpected(count),
      `${file}: data-count="${count}" should render as "${formatExpected(count)}" in static HTML, found "${rendered.trim()}"`
    );
  }
}

test("index.html stat counters render their real values in static HTML, never zero", () => {
  checkFile("index.html");
});

test("about.html stat counters render their real values in static HTML, never zero", () => {
  checkFile("about.html");
});
