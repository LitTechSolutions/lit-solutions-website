const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./documents");

// A tiny (1x1) real PNG, base64-encoded -- passes _lib/file_signatures.js's
// magic-byte sniff, unlike a fabricated "data:image/png;base64,xxx" string.
const REAL_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function fakeDeps(overrides = {}) {
  const store = new Map();
  return {
    getSession: async () => ({ userId: "staff-1", role: "admin" }),
    getJSON: async (_ns, key) => store.get(key) || null,
    setJSON: async (_ns, key, value) => { store.set(key, value); },
    deleteKey: async (_ns, key) => { store.delete(key); },
    createNotification: async () => {},
    sendEmail: async () => ({ sent: false }),
    uploadPrivateAsset: async () => ({ publicId: "asset-1", resourceType: "image", format: "png", bytes: 100 }),
    signedUrlForPrivateAsset: () => "https://res.cloudinary.com/test/signed-url",
    destroyAsset: async () => ({ result: "ok" }),
    _store: store,
    ...overrides,
  };
}

function eventFor(method, body, query) {
  return { httpMethod: method, headers: { cookie: "lts_session=fake-token" }, body: body ? JSON.stringify(body) : undefined, queryStringParameters: query };
}

async function seedCustomer(deps, overrides = {}) {
  await deps.setJSON("users", "customer@example.com", {
    id: "cust-1",
    email: "customer@example.com",
    name: "Cust One",
    preferences: {},
    ...overrides,
  });
}

test("upload with a real attachment stores it in Cloudinary, not as raw fileDataUri", async () => {
  const deps = fakeDeps();
  await seedCustomer(deps);

  const res = await handler(
    eventFor("POST", { action: "upload", customerEmail: "customer@example.com", title: "Invoice #1", type: "invoice", fileDataUri: REAL_PNG_DATA_URI, fileName: "invoice.png" }),
    {},
    deps
  );

  assert.equal(res.statusCode, 201);
  const stored = deps._store.get(JSON.parse(res.body).id);
  assert.equal(stored.cloudinaryPublicId, "asset-1");
  assert.equal(stored.cloudinaryResourceType, "image");
  assert.equal(stored.fileDataUri, undefined, "the raw base64 must never be persisted once Cloudinary upload succeeds");
});

test("upload rejects a fabricated file signature before ever calling Cloudinary", async () => {
  const deps = fakeDeps();
  await seedCustomer(deps);
  let uploadCalled = false;
  deps.uploadPrivateAsset = async () => { uploadCalled = true; return {}; };

  const res = await handler(
    eventFor("POST", { action: "upload", customerEmail: "customer@example.com", title: "Bad", type: "invoice", fileDataUri: "data:image/png;base64,not-a-real-png" }),
    {},
    deps
  );

  assert.equal(res.statusCode, 400);
  assert.equal(uploadCalled, false);
});

test("upload surfaces a clean error if Cloudinary itself fails, and stores nothing", async () => {
  const deps = fakeDeps({ uploadPrivateAsset: async () => { throw new Error("network blip"); } });
  await seedCustomer(deps);

  const res = await handler(
    eventFor("POST", { action: "upload", customerEmail: "customer@example.com", title: "Invoice", type: "invoice", fileDataUri: REAL_PNG_DATA_URI }),
    {},
    deps
  );

  assert.equal(res.statusCode, 502);
  assert.equal(deps._store.size, 1, "only the seeded customer record exists -- no partial document was written");
});

test("upload with no attachment at all succeeds without touching Cloudinary", async () => {
  const deps = fakeDeps();
  await seedCustomer(deps);
  let uploadCalled = false;
  deps.uploadPrivateAsset = async () => { uploadCalled = true; return {}; };

  const res = await handler(
    eventFor("POST", { action: "upload", customerEmail: "customer@example.com", title: "Note", type: "other" }),
    {},
    deps
  );

  assert.equal(res.statusCode, 201);
  assert.equal(uploadCalled, false);
});

test("GET ?id= for a Cloudinary-backed record returns a freshly-signed fileUrl and never leaks internal Cloudinary fields", async () => {
  const deps = fakeDeps();
  await deps.setJSON("documents", "doc-1", {
    customerId: "staff-1", customerEmail: "customer@example.com", title: "Invoice", type: "invoice",
    date: "2026-07-16", cloudinaryPublicId: "asset-1", cloudinaryResourceType: "image", cloudinaryFormat: "png",
  });

  const res = await handler(eventFor("GET", null, { id: "doc-1" }), {}, deps);
  const body = JSON.parse(res.body);

  assert.equal(res.statusCode, 200);
  assert.equal(body.fileUrl, "https://res.cloudinary.com/test/signed-url");
  assert.equal(body.cloudinaryPublicId, undefined);
  assert.equal(body.cloudinaryResourceType, undefined);
});

test("GET ?id= for a legacy pre-migration record still serves its raw fileDataUri as fileUrl", async () => {
  const deps = fakeDeps();
  await deps.setJSON("documents", "doc-legacy", {
    customerId: "staff-1", customerEmail: "customer@example.com", title: "Old receipt", type: "receipt",
    date: "2026-01-01", fileDataUri: "data:image/png;base64,legacy",
  });

  const res = await handler(eventFor("GET", null, { id: "doc-legacy" }), {}, deps);
  const body = JSON.parse(res.body);

  assert.equal(body.fileUrl, "data:image/png;base64,legacy");
  assert.equal(body.fileDataUri, undefined, "the frontend should only ever read fileUrl going forward");
});

test("GET ?id= for a record with no attachment returns a null fileUrl", async () => {
  const deps = fakeDeps();
  await deps.setJSON("documents", "doc-nofile", { customerId: "staff-1", customerEmail: "customer@example.com", title: "Note", type: "other", date: "2026-01-01" });

  const res = await handler(eventFor("GET", null, { id: "doc-nofile" }), {}, deps);
  assert.equal(JSON.parse(res.body).fileUrl, null);
});

test("GET ?id= denies a customer who does not own the record", async () => {
  const deps = fakeDeps({ getSession: async () => ({ userId: "cust-2", role: "customer" }) });
  await deps.setJSON("documents", "doc-1", { customerId: "cust-1", customerEmail: "x@y.com", title: "Invoice", type: "invoice", date: "2026-01-01" });

  const res = await handler(eventFor("GET", null, { id: "doc-1" }), {}, deps);
  assert.equal(res.statusCode, 403);
});

test("delete removes the Cloudinary asset before deleting the record", async () => {
  const deps = fakeDeps();
  await deps.setJSON("documents", "doc-1", { customerId: "cust-1", cloudinaryPublicId: "asset-1", cloudinaryResourceType: "image" });
  let destroyedWith = null;
  deps.destroyAsset = async (asset) => { destroyedWith = asset; };

  const res = await handler(eventFor("POST", { action: "delete", documentId: "doc-1" }), {}, deps);

  assert.equal(res.statusCode, 200);
  assert.equal(destroyedWith.publicId, "asset-1");
  assert.equal(deps._store.has("doc-1"), false);
});

test("delete of a legacy record with no Cloudinary asset never calls destroyAsset", async () => {
  const deps = fakeDeps();
  await deps.setJSON("documents", "doc-legacy", { customerId: "cust-1", fileDataUri: "data:image/png;base64,legacy" });
  let destroyCalled = false;
  deps.destroyAsset = async () => { destroyCalled = true; };

  const res = await handler(eventFor("POST", { action: "delete", documentId: "doc-legacy" }), {}, deps);

  assert.equal(res.statusCode, 200);
  assert.equal(destroyCalled, false);
});

test("delete still succeeds even if Cloudinary cleanup itself fails", async () => {
  const deps = fakeDeps({ destroyAsset: async () => { throw new Error("Cloudinary is down"); } });
  await deps.setJSON("documents", "doc-1", { customerId: "cust-1", cloudinaryPublicId: "asset-1" });

  const res = await handler(eventFor("POST", { action: "delete", documentId: "doc-1" }), {}, deps);

  assert.equal(res.statusCode, 200, "an orphaned Cloudinary asset is a minor cleanup issue, not a reason to fail the customer-facing delete");
  assert.equal(deps._store.has("doc-1"), false);
});
