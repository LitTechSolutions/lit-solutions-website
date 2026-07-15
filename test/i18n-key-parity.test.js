// Guards against exactly the drift that happened manually during the
// 2026-07-14 CTA/nav rework: a key gets added/removed from en.json (the
// source of truth) but the 15 translated i18n/*.json files fall out of
// sync -- either missing the new key (silent English fallback) or still
// carrying an orphaned key nothing references anymore. Every previous
// pass caught this by hand with one-off scripts; this makes it permanent.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const I18N_DIR = path.join(__dirname, "..", "i18n");
const EN_PATH = path.join(I18N_DIR, "en.json");

function flattenKeys(obj, prefix = "") {
  const keys = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const nested of flattenKeys(v, full)) keys.add(nested);
    } else {
      keys.add(full);
    }
  }
  return keys;
}

const enJson = JSON.parse(fs.readFileSync(EN_PATH, "utf8"));
const enKeys = flattenKeys(enJson);

const langFiles = fs
  .readdirSync(I18N_DIR)
  .filter((f) => f.endsWith(".json") && f !== "en.json");

test("i18n directory contains the 15 expected non-English language files", () => {
  assert.equal(langFiles.length, 15, `expected 15 language files, found ${langFiles.length}: ${langFiles.join(", ")}`);
});

for (const file of langFiles) {
  const lang = file.replace(/\.json$/, "");

  test(`${lang}.json is valid JSON`, () => {
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(I18N_DIR, file), "utf8")));
  });

  test(`${lang}.json has exact key-set parity with en.json`, () => {
    const data = JSON.parse(fs.readFileSync(path.join(I18N_DIR, file), "utf8"));
    const keys = flattenKeys(data);

    const missing = [...enKeys].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !enKeys.has(k));

    assert.deepEqual(
      missing,
      [],
      `${lang}.json is missing ${missing.length} key(s) present in en.json: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? ", ..." : ""}`
    );
    assert.deepEqual(
      extra,
      [],
      `${lang}.json has ${extra.length} orphaned key(s) not present in en.json: ${extra.slice(0, 10).join(", ")}${extra.length > 10 ? ", ..." : ""}`
    );
  });
}
