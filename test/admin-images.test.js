const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/admin-images");

const REAL_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function fakeDeps(overrides = {}) {
  const store = new Map();
  return {
    getSession: async () => ({ userId: "staff-1", role: "admin" }),
    getJSON: async (_ns, key) => store.get(key) || null,
    setJSON: async (_ns, key, value) => { store.set(key, value); },
    deleteKey: async (_ns, key) => { store.delete(key); },
    uploadPublicAsset: async () => ({ publicId: "img-asset-1", resourceType: "image", format: "png", bytes: 100, url: "https://res.cloudinary.com/test/img-asset-1.png" }),
    destroyAsset: async () => ({ result: "ok" }),
    _store: store,
    ...overrides,
  };
}

function eventFor(method, body, query) {
  return { httpMethod: method, headers: { cookie: "lts_session=fake-token" }, body: body ? JSON.stringify(body) : undefined, queryStringParameters: query };
}

test("upload stores the image in Cloudinary and returns its URL, not the raw dataUri", async () => {
  const deps = fakeDeps();
  const res = await handler(eventFor("POST", { action: "upload", dataUri: REAL_PNG_DATA_URI, alt: "A photo" }), {}, deps);
  const body = JSON.parse(res.body);

  assert.equal(res.statusCode, 201);
  assert.equal(body.url, "https://res.cloudinary.com/test/img-asset-1.png");
  const stored = deps._store.get(body.id);
  assert.equal(stored.cloudinaryPublicId, "img-asset-1");
  assert.equal(stored.dataUri, undefined, "the raw base64 must never be persisted once Cloudinary upload succeeds");
});

test("upload rejects a fabricated file signature before calling Cloudinary", async () => {
  const deps = fakeDeps();
  let called = false;
  deps.uploadPublicAsset = async () => { called = true; return {}; };

  const res = await handler(eventFor("POST", { action: "upload", dataUri: "data:image/png;base64,not-a-real-png" }), {}, deps);

  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});

test("upload surfaces a clean error if Cloudinary fails, and stores nothing", async () => {
  const deps = fakeDeps({ uploadPublicAsset: async () => { throw new Error("network blip"); } });
  const res = await handler(eventFor("POST", { action: "upload", dataUri: REAL_PNG_DATA_URI }), {}, deps);

  assert.equal(res.statusCode, 502);
  assert.equal(deps._store.size, 0);
});

test("GET ?id= returns the Cloudinary URL for a migrated record", async () => {
  const deps = fakeDeps();
  await deps.setJSON("images", "img-1", { cloudinaryPublicId: "img-asset-1", cloudinaryUrl: "https://res.cloudinary.com/test/img-asset-1.png", alt: "Alt text", caption: "", uploadedAt: 123 });

  const res = await handler(eventFor("GET", null, { id: "img-1" }), {}, deps);
  const body = JSON.parse(res.body);
  assert.equal(body.url, "https://res.cloudinary.com/test/img-asset-1.png");
});

test("GET ?id= for a legacy pre-migration record still serves its raw dataUri as url", async () => {
  const deps = fakeDeps();
  await deps.setJSON("images", "img-legacy", { dataUri: "data:image/png;base64,legacy", alt: "Old", caption: "", uploadedAt: 1 });

  const res = await handler(eventFor("GET", null, { id: "img-legacy" }), {}, deps);
  assert.equal(JSON.parse(res.body).url, "data:image/png;base64,legacy");
});

test("delete removes the Cloudinary asset (as public 'upload' type) before deleting the record", async () => {
  const deps = fakeDeps();
  await deps.setJSON("images", "img-1", { cloudinaryPublicId: "img-asset-1", cloudinaryResourceType: "image" });
  let destroyedWith = null;
  deps.destroyAsset = async (asset) => { destroyedWith = asset; };

  const res = await handler(eventFor("POST", { action: "delete", imageId: "img-1" }), {}, deps);

  assert.equal(res.statusCode, 200);
  assert.equal(destroyedWith.publicId, "img-asset-1");
  assert.equal(destroyedWith.type, "upload", "the image library uses public delivery, not documents.js's authenticated type");
  assert.equal(deps._store.has("img-1"), false);
});

test("delete of a legacy record with no Cloudinary asset never calls destroyAsset", async () => {
  const deps = fakeDeps();
  await deps.setJSON("images", "img-legacy", { dataUri: "data:image/png;base64,legacy" });
  let called = false;
  deps.destroyAsset = async () => { called = true; };

  const res = await handler(eventFor("POST", { action: "delete", imageId: "img-legacy" }), {}, deps);

  assert.equal(res.statusCode, 200);
  assert.equal(called, false);
});

test("a non-admin/staff session is denied", async () => {
  const deps = fakeDeps({ getSession: async () => ({ userId: "cust-1", role: "customer" }) });
  const res = await handler(eventFor("GET", null, {}), {}, deps);
  assert.equal(res.statusCode, 403);
});
