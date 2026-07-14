const test = require("node:test");
const assert = require("node:assert/strict");
const { toCsv, escapeCsvField } = require("./csvExport");

test("produces a header row and one data row per input row", () => {
  const csv = toCsv([{ id: "t1", subject: "Fix contact form" }], [{ key: "id", header: "ID" }, { key: "subject", header: "Subject" }]);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "ID,Subject");
  assert.equal(lines[1], "t1,Fix contact form");
});

test("only exports columns explicitly declared, even if rows have extra fields", () => {
  const csv = toCsv([{ id: "t1", subject: "x", internalCost: 500 }], [{ key: "id", header: "ID" }]);
  assert.equal(csv.includes("internalCost"), false);
  assert.equal(csv.includes("500"), false);
});

test("quotes and escapes fields containing commas", () => {
  const csv = toCsv([{ subject: "Fix, please" }], [{ key: "subject", header: "Subject" }]);
  assert.equal(csv, 'Subject\r\n"Fix, please"');
});

test("quotes and escapes fields containing quotes (doubled per CSV convention)", () => {
  const csv = toCsv([{ subject: 'Say "hello"' }], [{ key: "subject", header: "Subject" }]);
  assert.equal(csv, 'Subject\r\n"Say ""hello"""');
});

test("quotes fields containing newlines", () => {
  const csv = toCsv([{ notes: "line one\nline two" }], [{ key: "notes", header: "Notes" }]);
  assert.ok(csv.includes('"line one\nline two"'));
});

test("null/undefined values become empty fields, not the literal string 'null'", () => {
  const csv = toCsv([{ id: "t1", subject: null }], [{ key: "id", header: "ID" }, { key: "subject", header: "Subject" }]);
  assert.equal(csv.split("\r\n")[1], "t1,");
});

test("refuses to export without an explicit column allowlist", () => {
  assert.throws(() => toCsv([{ id: "t1" }], []), /explicit column allowlist/);
  assert.throws(() => toCsv([{ id: "t1" }], undefined));
});

test("handles zero rows (header only)", () => {
  const csv = toCsv([], [{ key: "id", header: "ID" }]);
  assert.equal(csv, "ID");
});

test("escapeCsvField is exported and works standalone", () => {
  assert.equal(escapeCsvField("plain"), "plain");
  assert.equal(escapeCsvField("a,b"), '"a,b"');
});
