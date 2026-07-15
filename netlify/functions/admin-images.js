// admin-images.js -- personal image library for the admin panel, so a
// photo can be uploaded once and reused across multiple posts/portfolio
// items without re-uploading. Role-gated server-side, for both reads and
// writes -- unlike content.js, nothing here needs to be public, since the
// actual image data used on public pages gets embedded directly into the
// post/portfolio/testimonial record at save time (see admin.html).
//
// Images are stored as base64 data URIs in Netlify Blobs, which keeps this
// self-contained with no extra service to sign up for -- fine for a
// handful of images at this business's scale. Netlify Functions cap
// request bodies around 6MB, so uploads are limited to ~4MB base64 here.
//
// GET               -> { images: [{ id, alt, caption, uploadedAt }] } (no dataUri, keeps the list light)
// GET ?id=xyz        -> { id, dataUri, alt, caption, uploadedAt } (full record)
// POST { action: "upload", dataUri, alt, caption } -> admin/staff only
// POST { action: "delete", imageId }                -> admin/staff only

const { readCookie, getSession, json } = require("./_lib/auth_utils");
const { getJSON, setJSON, deleteKey, store } = require("./_lib/blob_store");
const { isRecognizedDataUri } = require("./_lib/file_signatures");

const MAX_DATA_URI_LENGTH = 4 * 1024 * 1024; // ~4MB base64 string

exports.handler = async (event) => {
  const token = readCookie(event, "lts_session");
  const session = token ? await getSession(token) : null;
  if (!session) return json(401, { error: "Sign in required." });
  if (session.role !== "admin" && session.role !== "staff") return json(403, { error: "Not authorized." });

  if (event.httpMethod === "GET") {
    const id = event.queryStringParameters && event.queryStringParameters.id;
    if (id) {
      const record = await getJSON("images", id);
      if (!record) return json(404, { error: "Image not found." });
      return json(200, record);
    }
    const imagesStore = store("images");
    const { blobs } = await imagesStore.list();
    const items = [];
    for (const b of blobs) {
      const record = await imagesStore.get(b.key, { type: "json" });
      if (record) items.push({ id: b.key, alt: record.alt, caption: record.caption, uploadedAt: record.uploadedAt });
    }
    return json(200, { images: items });
  }

  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }

  if (body.action === "upload") {
    // Sniff the real file signature rather than trusting the data: URI's
    // declared MIME type (see _lib/file_signatures.js) -- SVG is
    // deliberately not allowed here since it can carry executable script,
    // unlike the raster formats this library actually needs.
    if (!isRecognizedDataUri(body.dataUri, { allowSvg: false })) return json(400, { error: "A valid image (PNG, JPEG, or WEBP) is required." });
    if (body.dataUri.length > MAX_DATA_URI_LENGTH) return json(400, { error: "Image too large (max ~3MB)." });
    const imageId = require("crypto").randomBytes(10).toString("hex");
    await setJSON("images", imageId, {
      dataUri: body.dataUri, alt: body.alt || "", caption: body.caption || "",
      uploadedBy: session.userId, uploadedAt: Date.now(),
    });
    return json(201, { id: imageId, dataUri: body.dataUri, message: "Uploaded." });
  }

  if (body.action === "delete") {
    if (!body.imageId) return json(400, { error: "imageId is required." });
    await deleteKey("images", body.imageId);
    return json(200, { message: "Deleted." });
  }

  return json(400, { error: "Unknown action." });
};
