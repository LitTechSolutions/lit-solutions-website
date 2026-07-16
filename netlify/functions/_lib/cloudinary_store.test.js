const test = require("node:test");
const assert = require("node:assert/strict");

// Cloudinary reads its config from env vars at module-load/first-call
// time (ensureConfigured() caches after the first success) -- set fake
// values before requiring the module so tests never depend on a real
// account, and never touch the real network since every SDK call below
// is injected via `deps`.
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "test-cloud";
process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "test-key";
process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "test-secret";

const {
  uploadPrivateAsset,
  uploadPublicAsset,
  signedUrlForPrivateAsset,
  destroyAsset,
} = require("./cloudinary_store");

function fakeUploader(result) {
  const calls = [];
  return {
    calls,
    upload: async (dataUri, options) => {
      calls.push({ dataUri, options });
      return result;
    },
    destroy: async (publicId, options) => {
      calls.push({ publicId, options });
      return { result: "ok" };
    },
  };
}

test("uploadPrivateAsset uploads with authenticated delivery type and a server-generated public_id", async () => {
  const uploader = fakeUploader({ public_id: "abc123", resource_type: "image", format: "png", bytes: 1024, version: 1 });
  const asset = await uploadPrivateAsset("data:image/png;base64,xyz", { deps: { uploader, idGenerator: () => "abc123" } });

  assert.equal(asset.publicId, "abc123");
  assert.equal(asset.resourceType, "image");
  assert.equal(uploader.calls.length, 1);
  assert.equal(uploader.calls[0].options.type, "authenticated");
  assert.equal(uploader.calls[0].options.public_id, "abc123");
  assert.equal(uploader.calls[0].options.overwrite, false);
  assert.equal(uploader.calls[0].options.use_filename, false, "never derive the stored id from a user-supplied filename");
});

test("uploadPublicAsset uploads with ordinary public delivery type and returns a direct URL", async () => {
  const uploader = fakeUploader({ public_id: "img1", resource_type: "image", format: "jpg", bytes: 2048, version: 1, secure_url: "https://res.cloudinary.com/test-cloud/image/upload/v1/lts-image-library/img1.jpg" });
  const asset = await uploadPublicAsset("data:image/jpeg;base64,xyz", { deps: { uploader, idGenerator: () => "img1" } });

  assert.equal(asset.publicId, "img1");
  assert.match(asset.url, /^https:\/\//);
  assert.equal(uploader.calls[0].options.type, "upload");
  assert.equal(uploader.calls[0].options.overwrite, false);
});

test("signedUrlForPrivateAsset requests an authenticated, expiring URL", () => {
  const calls = [];
  const utils = {
    private_download_url: (publicId, format, options) => {
      calls.push({ publicId, format, options });
      return "https://res.cloudinary.com/test-cloud/signed-url";
    },
  };
  const fixedNow = () => 1_700_000_000_000; // ms
  const url = signedUrlForPrivateAsset(
    { publicId: "abc123", resourceType: "image", format: "png" },
    { expiresInSeconds: 300, deps: { utils, now: fixedNow } }
  );

  assert.equal(url, "https://res.cloudinary.com/test-cloud/signed-url");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].publicId, "abc123");
  assert.equal(calls[0].options.type, "authenticated");
  assert.equal(calls[0].options.expires_at, Math.floor(1_700_000_000_000 / 1000) + 300);
});

test("signedUrlForPrivateAsset defaults resource_type to 'auto' when not stored", () => {
  const calls = [];
  const utils = { private_download_url: (publicId, format, options) => { calls.push(options); return "url"; } };
  signedUrlForPrivateAsset({ publicId: "abc123", format: "pdf" }, { deps: { utils, now: () => 0 } });
  assert.equal(calls[0].resource_type, "auto");
});

test("destroyAsset requests invalidation and defaults to the authenticated type", async () => {
  const uploader = fakeUploader();
  await destroyAsset({ publicId: "abc123", resourceType: "image" }, { deps: { uploader } });
  assert.equal(uploader.calls[0].publicId, "abc123");
  assert.equal(uploader.calls[0].options.type, "authenticated");
  assert.equal(uploader.calls[0].options.invalidate, true);
});

test("destroyAsset respects an explicit type (e.g. 'upload' for public library assets)", async () => {
  const uploader = fakeUploader();
  await destroyAsset({ publicId: "img1", resourceType: "image", type: "upload" }, { deps: { uploader } });
  assert.equal(uploader.calls[0].options.type, "upload");
});
