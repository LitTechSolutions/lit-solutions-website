/* Headcount stays private -- in BOTH directions.
 *
 * CLAUDE.md records this as an explicit owner decision: customer-facing copy
 * must not confirm the business is a one-person operation, and must not
 * imply a larger staff either. An outside review read "Our Team" / "the
 * people behind the work" (plural, one person pictured) as deliberate
 * concealment, which is worse than either honest answer.
 *
 * It's a copy rule, so it gets broken by copy edits rather than by code --
 * "Five categories. One team." survived on two pages until it was found by
 * hand. This makes it fail loudly instead.
 *
 * The safe register is second-person and singular-agnostic: "you'll know
 * who's coming", "owner-led", "your point of contact".
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

// patch-notes.html is a historical changelog. Rewriting it would make a
// record of what shipped untrue, so it's excluded deliberately.
const HISTORICAL = new Set(["patch-notes.html"]);

const PAGES = fs.readdirSync(ROOT)
  .filter((f) => f.endsWith(".html") && !HISTORICAL.has(f));

/** Phrases that assert a headcount, in either direction. */
const FORBIDDEN = [
  { re: /\bone team\b/i,                    why: "implies a staff we've never claimed" },
  { re: /\bour team of\b/i,                 why: "implies a staff we've never claimed" },
  { re: /\bthe people behind the work\b/i,  why: "plural with one person pictured reads as concealment" },
  { re: /\bteam of one\b/i,                 why: "confirms a solo operation" },
  { re: /\bone technician\b/i,              why: "confirms a solo operation" },
  // Deliberately broader than one exact phrasing: I wrote "it's the same
  // person on the other end of it" while fixing this very rule, and the
  // narrow pattern sailed straight past it. Any construction that pins the
  // work to a single individual counts.
  { re: /\bthe same (person|guy)\b/i,     why: "confirms a solo operation" },
  { re: /\bjust me\b/i,                   why: "confirms a solo operation" },
  { re: /\bone[- ]man\b/i,                why: "confirms a solo operation" },
  { re: /\bI(?:'m| am) the only\b/i,      why: "confirms a solo operation" },
  { re: /\bsole (employee|technician)\b/i, why: "confirms a solo operation" },
  { re: /\bour staff\b/i,                   why: "implies a staff we've never claimed" },
];

/** Strip markup so we test what a reader sees, not attribute values. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

test("no customer-facing page asserts a headcount, in either direction", () => {
  const found = [];
  for (const page of PAGES) {
    const text = visibleText(fs.readFileSync(path.join(ROOT, page), "utf8"));
    for (const { re, why } of FORBIDDEN) {
      const m = text.match(re);
      if (m) {
        const at = text.indexOf(m[0]);
        const context = text.slice(Math.max(0, at - 45), at + m[0].length + 45).trim();
        found.push(`${page}: "${m[0]}" — ${why}\n      …${context}…`);
      }
    }
  }
  assert.deepEqual(found, [],
    `headcount-revealing copy (see CLAUDE.md, "Headcount stays private"):\n  ${found.join("\n  ")}`);
});
