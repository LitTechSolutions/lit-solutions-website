// Focused tests for json()'s Session 20 multi-cookie support -- the rest
// of this module (password hashing, session signing, rate limiting) is
// exercised indirectly through every endpoint's existing test suite.

const test = require("node:test");
const assert = require("node:assert/strict");
const { json } = require("./auth_utils");

test("a single string header value is returned unchanged in headers", () => {
  const res = json(200, { ok: true }, { "Set-Cookie": "a=1; Path=/" });
  assert.equal(res.headers["Set-Cookie"], "a=1; Path=/");
  assert.equal(res.multiValueHeaders, undefined);
});

test("an array header value goes into multiValueHeaders, not headers", () => {
  const res = json(200, { ok: true }, { "Set-Cookie": ["a=1; Path=/", "b=2; Path=/"] });
  assert.equal(res.headers["Set-Cookie"], undefined);
  assert.deepEqual(res.multiValueHeaders["Set-Cookie"], ["a=1; Path=/", "b=2; Path=/"]);
});

test("default headers (Content-Type, Cache-Control, X-Content-Type-Options) are always present", () => {
  const res = json(200, {});
  assert.equal(res.headers["Content-Type"], "application/json");
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
});

test("with no extraHeaders, no multiValueHeaders key is added", () => {
  const res = json(200, {});
  assert.equal(res.multiValueHeaders, undefined);
});
