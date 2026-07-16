// cloudinary_store.js -- thin wrapper around the Cloudinary SDK, mirroring
// blob_store.js's shape (one place that knows how to talk to the
// provider; every endpoint imports from here rather than configuring its
// own client). Two upload profiles, matching the two real callers:
//
// - uploadPrivateAsset() -- documents.js's customer paperwork (invoices,
//   receipts). Uses Cloudinary's "authenticated" delivery type: the
//   original file and every transformation of it are NOT reachable by a
//   bare URL, even one you could guess -- every view requires a freshly
//   signed, short-lived URL minted server-side, and only after this
//   app's own session/ownership check already ran. This is deliberate:
//   Cloudinary's DEFAULT delivery type ("upload") is public, which is
//   wrong for another customer's invoice.
// - uploadPublicAsset() -- admin-images.js's image library. Uses ordinary
//   "upload" (public) delivery, since these images are meant to end up
//   on public pages anyway; no signed URL machinery needed.
//
// Every asset gets a server-generated opaque public_id (never a
// user-supplied filename) so nothing about the id leaks into a URL and
// two uploads can never collide/overwrite each other (overwrite: false).
//
// Requires CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY /
// CLOUDINARY_API_SECRET as Netlify environment variables (see
// DEPLOYMENT_PLAN.md). The API secret never leaves this module.

const cloudinary = require("cloudinary").v2;
const crypto = require("node:crypto");

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
      "cloudinary_store: CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET must all be set -- see docs/development/DEPLOYMENT_PLAN.md"
    );
  }
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  configured = true;
}

function generatePublicId() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * @param {string} dataUri - full `data:<mime>;base64,<content>` string, already validated (see _lib/file_signatures.js).
 * @param {{ folder?: string, deps?: { uploader?: object, idGenerator?: () => string } }} [opts]
 * @returns {Promise<{ publicId: string, resourceType: string, format: string, bytes: number, version: number }>}
 */
async function uploadPrivateAsset(dataUri, opts = {}) {
  ensureConfigured();
  const deps = opts.deps || {};
  const uploader = deps.uploader || cloudinary.uploader;
  const publicId = (deps.idGenerator || generatePublicId)();
  const result = await uploader.upload(dataUri, {
    public_id: publicId,
    folder: opts.folder || "lts-documents",
    type: "authenticated",
    resource_type: "auto",
    overwrite: false,
    unique_filename: false,
    use_filename: false,
  });
  return {
    publicId: result.public_id,
    resourceType: result.resource_type,
    format: result.format,
    bytes: result.bytes,
    version: result.version,
  };
}

/**
 * @param {string} dataUri
 * @param {{ folder?: string, deps?: { uploader?: object, idGenerator?: () => string } }} [opts]
 * @returns {Promise<{ publicId: string, resourceType: string, format: string, bytes: number, version: number, url: string }>}
 */
async function uploadPublicAsset(dataUri, opts = {}) {
  ensureConfigured();
  const deps = opts.deps || {};
  const uploader = deps.uploader || cloudinary.uploader;
  const publicId = (deps.idGenerator || generatePublicId)();
  const result = await uploader.upload(dataUri, {
    public_id: publicId,
    folder: opts.folder || "lts-image-library",
    type: "upload",
    resource_type: "image",
    overwrite: false,
    unique_filename: false,
    use_filename: false,
  });
  return {
    publicId: result.public_id,
    resourceType: result.resource_type,
    format: result.format,
    bytes: result.bytes,
    version: result.version,
    url: result.secure_url,
  };
}

/**
 * Mints a fresh, time-limited signed URL for a private ("authenticated")
 * asset. Never cache or store this URL -- generate it new on every
 * authorized request, after this app's own authorization check.
 *
 * @param {{ publicId: string, resourceType?: string, format?: string }} asset
 * @param {{ expiresInSeconds?: number, deps?: { utils?: object, now?: () => number } }} [opts]
 * @returns {string}
 */
function signedUrlForPrivateAsset(asset, opts = {}) {
  ensureConfigured();
  const deps = opts.deps || {};
  const utils = deps.utils || cloudinary.utils;
  const now = deps.now || (() => Date.now());
  const expiresInSeconds = opts.expiresInSeconds ?? 300;
  return utils.private_download_url(asset.publicId, asset.format, {
    resource_type: asset.resourceType || "auto",
    type: "authenticated",
    expires_at: Math.floor(now() / 1000) + expiresInSeconds,
  });
}

/**
 * @param {{ publicId: string, resourceType?: string, type?: string }} asset
 * @param {{ deps?: { uploader?: object } }} [opts]
 */
async function destroyAsset(asset, opts = {}) {
  ensureConfigured();
  const deps = opts.deps || {};
  const uploader = deps.uploader || cloudinary.uploader;
  return uploader.destroy(asset.publicId, {
    resource_type: asset.resourceType || "auto",
    type: asset.type || "authenticated",
    invalidate: true,
  });
}

module.exports = {
  uploadPrivateAsset,
  uploadPublicAsset,
  signedUrlForPrivateAsset,
  destroyAsset,
  generatePublicId,
};
