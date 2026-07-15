// file_signatures.js -- shared magic-byte file-signature sniffing, so
// every endpoint that accepts an uploaded file (website-designer.js,
// admin-images.js, documents.js) verifies real file content server-side
// instead of trusting a client-supplied MIME string or `data:` URI
// prefix, which is trivial to spoof. Originally written for
// website-designer.js's public logo/photo upload; centralized here so
// admin-images.js and documents.js use the exact same check rather than
// their own looser MIME-prefix regex (see docs/audit F027).

const IMAGE_SIGNATURES = [
  { name: "png", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  { name: "jpeg", bytes: Buffer.from([0xff, 0xd8, 0xff]) },
  { name: "webp", bytes: Buffer.from("RIFF", "ascii"), offset: 0, secondary: { bytes: Buffer.from("WEBP", "ascii"), offset: 8 } },
];
const PDF_SIGNATURE = { name: "pdf", bytes: Buffer.from("%PDF", "ascii") };

function matchesSignature(head, sig) {
  if (head.subarray(sig.offset || 0, (sig.offset || 0) + sig.bytes.length).equals(sig.bytes)) {
    if (!sig.secondary) return true;
    return head.subarray(sig.secondary.offset, sig.secondary.offset + sig.secondary.bytes.length).equals(sig.secondary.bytes);
  }
  return false;
}

function sniffHead(base64Content) {
  if (!base64Content || typeof base64Content !== "string") return null;
  try {
    const head = Buffer.from(base64Content.slice(0, 64), "base64");
    return head.length >= 4 ? head : null;
  } catch (e) {
    return null;
  }
}

// base64Content: raw base64 payload, no `data:` URI prefix.
function isRecognizedImage(base64Content, { allowSvg } = {}) {
  const head = sniffHead(base64Content);
  if (!head) return false;
  for (const sig of IMAGE_SIGNATURES) {
    if (matchesSignature(head, sig)) return true;
  }
  if (allowSvg) {
    const text = head.toString("utf8").trim().toLowerCase();
    if (text.startsWith("<?xml") || text.startsWith("<svg")) return true;
  }
  return false;
}

function isRecognizedPdf(base64Content) {
  const head = sniffHead(base64Content);
  return !!head && matchesSignature(head, PDF_SIGNATURE);
}

// Parses a full `data:<mime>;base64,<content>` URI and verifies the
// actual bytes match an image (optionally SVG) or, if allowPdf is set, a
// PDF -- regardless of what the declared MIME type in the prefix claims.
function isRecognizedDataUri(dataUri, { allowSvg = false, allowPdf = false } = {}) {
  if (!dataUri || typeof dataUri !== "string") return false;
  const commaIdx = dataUri.indexOf(",");
  if (commaIdx === -1) return false;
  const base64Content = dataUri.slice(commaIdx + 1);
  if (isRecognizedImage(base64Content, { allowSvg })) return true;
  if (allowPdf && isRecognizedPdf(base64Content)) return true;
  return false;
}

module.exports = { isRecognizedImage, isRecognizedPdf, isRecognizedDataUri };
