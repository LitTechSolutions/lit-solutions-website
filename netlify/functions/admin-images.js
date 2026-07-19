// admin-images.js -- personal image library for the admin panel, so a
// photo can be uploaded once and reused across multiple posts/portfolio
// items without re-uploading. Role-gated server-side, for both reads and
// writes -- unlike content.js, nothing here needs extra access control
// once uploaded, since the actual image data used on public pages gets
// embedded directly into the post/portfolio/testimonial record at save
// time (see the Care Hub's Image Library and Site Content screens).
//
// Images are stored in Cloudinary (see _lib/cloudinary_store.js) using
// ordinary public "upload" delivery -- these are meant to end up on
// public pages anyway, unlike documents.js's customer paperwork, so there
// is no signed-URL step here. Netlify Functions cap request bodies around
// 6MB, so uploads are limited to ~4MB base64 here. Records written before
// this migration may still carry a legacy raw `dataUri`; those are served
// as-is (see resolveUrl below) rather than broken by this change.
//
// GET               -> { images: [{ id, url, alt, caption, uploadedAt }] } (a URL is cheap to list, unlike base64)
// GET ?id=xyz        -> { id, url, alt, caption, uploadedAt } (full record)
// POST { action: "upload", dataUri, alt, caption } -> admin/staff only
// POST { action: "delete", imageId }                -> admin/staff only

const { readCookie, getSession, json } = require("./_lib/auth_utils");
const { getJSON, setJSON, deleteKey, store } = require("./_lib/blob_store");
const { isRecognizedDataUri } = require("./_lib/file_signatures");
const { uploadPublicAsset, destroyAsset } = require("./_lib/cloudinary_store");

const MAX_DATA_URI_LENGTH = 4 * 1024 * 1024; // ~4MB base64 string

function resolveUrl(record) {
  return record.cloudinaryUrl || record.dataUri || null;
}

function toClientShape(id, record) {
  return { id, url: resolveUrl(record), alt: record.alt, caption: record.caption, uploadedAt: record.uploadedAt };
}

exports.handler = async (event, context, deps = {}) => {
  const getSessionFn = deps.getSession || getSession;
  const getJSONFn = deps.getJSON || getJSON;
  const setJSONFn = deps.setJSON || setJSON;
  const deleteKeyFn = deps.deleteKey || deleteKey;
  const uploadPublicAssetFn = deps.uploadPublicAsset || uploadPublicAsset;
  const destroyAssetFn = deps.destroyAsset || destroyAsset;

  const token = readCookie(event, "lts_session");
  const session = token ? await getSessionFn(token) : null;
  if (!session) return json(401, { error: "Sign in required." });
  if (session.role !== "admin" && session.role !== "staff") return json(403, { error: "Not authorized." });

  if (event.httpMethod === "GET") {
    const id = event.queryStringParameters && event.queryStringParameters.id;
    if (id) {
      const record = await getJSONFn("images", id);
      if (!record) return json(404, { error: "Image not found." });
      return json(200, toClientShape(id, record));
    }
    const imagesStore = store("images");
    const { blobs } = await imagesStore.list();
    const items = [];
    for (const b of blobs) {
      const record = await imagesStore.get(b.key, { type: "json" });
      if (record) items.push(toClientShape(b.key, record));
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

    let asset;
    try {
      asset = await uploadPublicAssetFn(body.dataUri);
    } catch (e) {
      return json(502, { error: "Could not store the image. Try again shortly." });
    }

    const imageId = require("crypto").randomBytes(10).toString("hex");
    await setJSONFn("images", imageId, {
      cloudinaryPublicId: asset.publicId,
      cloudinaryResourceType: asset.resourceType,
      cloudinaryUrl: asset.url,
      alt: body.alt || "",
      caption: body.caption || "",
      uploadedBy: session.userId,
      uploadedAt: Date.now(),
    });
    return json(201, { id: imageId, url: asset.url, message: "Uploaded." });
  }

  if (body.action === "delete") {
    if (!body.imageId) return json(400, { error: "imageId is required." });
    const record = await getJSONFn("images", body.imageId);
    if (record && record.cloudinaryPublicId) {
      try {
        await destroyAssetFn({ publicId: record.cloudinaryPublicId, resourceType: record.cloudinaryResourceType, type: "upload" });
      } catch (e) {
        // Same reasoning as documents.js: an orphaned Cloudinary asset is
        // a minor cleanup item, not a reason to fail the admin's delete.
      }
    }
    await deleteKeyFn("images", body.imageId);
    return json(200, { message: "Deleted." });
  }

  return json(400, { error: "Unknown action." });
};
