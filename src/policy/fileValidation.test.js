const test = require("node:test");
const assert = require("node:assert/strict");
const { validateFileUpload, DEFAULT_MAX_SIZE_BYTES } = require("./fileValidation");

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test("accepts a valid PDF within size limits", () => {
  const decision = validateFileUpload({ fileName: "invoice.pdf", mimeType: "application/pdf", sizeBytes: 1024, headerBytes: PDF_HEADER });
  assert.equal(decision.allowed, true);
});

test("rejects a file over the default size limit", () => {
  const decision = validateFileUpload({
    fileName: "huge.pdf",
    mimeType: "application/pdf",
    sizeBytes: DEFAULT_MAX_SIZE_BYTES + 1,
    headerBytes: PDF_HEADER,
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /size limit/);
});

test("rejects a MIME type not on the allowlist", () => {
  const decision = validateFileUpload({ fileName: "script.exe", mimeType: "application/x-msdownload", sizeBytes: 1024 });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /not on the allowlist/);
});

test("rejects when declared MIME type doesn't match actual file content (magic-byte mismatch)", () => {
  // Declares PDF but the bytes are actually a PNG signature -- exactly the
  // spoofing case SYS-SEC-006 exists to catch.
  const decision = validateFileUpload({ fileName: "fake.pdf", mimeType: "application/pdf", sizeBytes: 1024, headerBytes: PNG_HEADER });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /magic-byte mismatch/);
});

test("requires headerBytes for MIME types with a known signature", () => {
  const decision = validateFileUpload({ fileName: "invoice.pdf", mimeType: "application/pdf", sizeBytes: 1024 });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /headerBytes required/);
});

test("does not require headerBytes for text/plain (no reliable signature)", () => {
  const decision = validateFileUpload({ fileName: "notes.txt", mimeType: "text/plain", sizeBytes: 100 });
  assert.equal(decision.allowed, true);
});

test("size and MIME limits are configurable, overriding the defaults", () => {
  const decision = validateFileUpload(
    { fileName: "small.txt", mimeType: "text/plain", sizeBytes: 500 },
    { maxSizeBytes: 100 }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /size limit/);
});

test("accepts a docx (ZIP-container signature) declared as the modern Word MIME type", () => {
  const zipSignature = [0x50, 0x4b, 0x03, 0x04];
  const decision = validateFileUpload({
    fileName: "scope.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sizeBytes: 2048,
    headerBytes: zipSignature,
  });
  assert.equal(decision.allowed, true);
});
