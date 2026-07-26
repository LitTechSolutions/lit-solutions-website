const test = require("node:test");
const assert = require("node:assert/strict");

const handler = require("../netlify/functions/square-webhook").handler;
const { signSquareWebhookPayload } = require("../src/webhooks/squareWebhookVerification");
const {
  mapSquareStatus,
  parseSquareEvent,
  applySubscriptionEvent,
  linkToOrganization,
} = require("../src/db/squareSubscriptionLinkStore");

const KEY = "test-square-signature-key";
const URL = "https://lit-solutions.tech/.netlify/functions/square-webhook";
const ENV = { SQUARE_WEBHOOK_SIGNATURE_KEY: KEY, SQUARE_WEBHOOK_NOTIFICATION_URL: URL };
const NOW = () => new Date("2026-07-26T12:00:00.000Z");

function squareEvent(overrides = {}) {
  return JSON.stringify({
    merchant_id: "MLK42A4B9BC1X",
    type: overrides.type || "subscription.updated",
    event_id: overrides.event_id || "evt-1",
    created_at: "2026-07-26T12:00:00Z",
    data: {
      type: "subscription",
      id: overrides.subscriptionId || "sub_abc",
      object: {
        subscription: {
          id: overrides.subscriptionId || "sub_abc",
          customer_id: "cust_1",
          plan_variation_id: "plan_basic",
          status: overrides.status || "ACTIVE",
        },
      },
    },
  });
}

function req(body, { signed = true, key = KEY, url = URL, method = "POST" } = {}) {
  return {
    httpMethod: method,
    headers: signed
      ? { "x-square-hmacsha256-signature": signSquareWebhookPayload({ rawBody: body, signatureKey: key, notificationUrl: url }) }
      : {},
    body,
  };
}

/** Records every SQL call and returns queued canned result sets in order. */
function fakeSql(queue = []) {
  const calls = [];
  const results = [...queue];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?").replace(/\s+/g, " ").trim(), values });
    return results.length ? results.shift() : [];
  };
  tag.calls = calls;
  return tag;
}

const deps = (sql, extra = {}) => ({ sql, env: ENV, now: NOW, idGenerator: () => "fixed-id", auditRecorder: { record: async () => {} }, ...extra });

/* ------------------------------------------------------------ security --- */

test("rejects an unsigned request with 401", async () => {
  const body = squareEvent();
  const res = await handler(req(body, { signed: false }), {}, deps(fakeSql()));
  assert.equal(res.statusCode, 401);
});

test("rejects a signature made with the wrong key", async () => {
  const body = squareEvent();
  const res = await handler(req(body, { key: "attacker-key" }), {}, deps(fakeSql()));
  assert.equal(res.statusCode, 401);
});

test("rejects a body tampered with after signing", async () => {
  const body = squareEvent({ status: "ACTIVE" });
  const r = req(body);
  r.body = body.replace('"ACTIVE"', '"CANCELED"');
  const res = await handler(r, {}, deps(fakeSql()));
  assert.equal(res.statusCode, 401);
});

test("logs failed verifications rather than dropping them silently", async () => {
  const sql = fakeSql();
  await handler(req(squareEvent(), { signed: false }), {}, deps(sql));
  const insert = sql.calls.find((c) => /INSERT INTO webhook_events/.test(c.text));
  assert.ok(insert, "expected the failed attempt to be logged");
  assert.ok(insert.values.includes(false), "expected verified=false to be recorded");
});

test("never leaks WHICH verification check failed, only that one did", async () => {
  // A generic "Invalid signature." is fine and expected. What must not escape
  // is the internal reason -- telling a prober "notification URL is not
  // configured" or "signature length mismatch" hands them a free oracle for
  // narrowing down the configuration.
  const cases = [
    req(squareEvent(), { signed: false }),                              // missing header
    req(squareEvent(), { key: "attacker-key" }),                        // wrong key
    req(squareEvent(), { url: "https://evil.example/webhook" }),        // wrong URL
  ];
  const leaks = /length mismatch|does not match|not configured|malformed|missing x-square/i;
  for (const r of cases) {
    const res = await handler(r, {}, deps(fakeSql()));
    assert.equal(res.statusCode, 401);
    assert.doesNotMatch(res.body, leaks, `leaked internal reason: ${res.body}`);
  }

  // Truncated header goes down a different branch inside the verifier; make
  // sure that one is equally quiet.
  const body = squareEvent();
  const truncated = req(body);
  truncated.headers["x-square-hmacsha256-signature"] = "abc";
  const res = await handler(truncated, {}, deps(fakeSql()));
  assert.equal(res.statusCode, 401);
  assert.doesNotMatch(res.body, leaks);
});

test("returns 500 when the signature key is not configured, rather than trusting the request", async () => {
  const res = await handler(req(squareEvent()), {}, deps(fakeSql(), { env: {} }));
  assert.equal(res.statusCode, 500);
});

test("a valid signature for a DIFFERENT notification URL is rejected", async () => {
  const body = squareEvent();
  const res = await handler(req(body, { url: "https://evil.example/webhook" }), {}, deps(fakeSql()));
  assert.equal(res.statusCode, 401);
});

test("rejects non-POST methods", async () => {
  const res = await handler(req(squareEvent(), { method: "GET" }), {}, deps(fakeSql()));
  assert.equal(res.statusCode, 405);
});

test("verifies against the raw body, not a re-serialised one", async () => {
  // Square signs exact bytes. This body has whitespace and key order that
  // JSON.parse -> JSON.stringify would not reproduce.
  const body = '{\n  "type": "subscription.updated",\n  "event_id": "evt-ws",\n  "data": { "object": { "subscription": { "id": "sub_ws", "status": "ACTIVE" } } }\n}';
  const res = await handler(req(body), {}, deps(fakeSql([[], [{ id: "w" }], []])));
  assert.equal(res.statusCode, 200, "raw-byte verification should succeed");
});

test("handles a base64-encoded body from Netlify", async () => {
  const body = squareEvent({ event_id: "evt-b64" });
  const r = req(body);
  r.body = Buffer.from(body, "utf8").toString("base64");
  r.isBase64Encoded = true;
  const res = await handler(r, {}, deps(fakeSql([[], [{ id: "w" }], []])));
  assert.equal(res.statusCode, 200);
});

/* --------------------------------------------------------- idempotency --- */

test("acknowledges a redelivered event without acting on it again", async () => {
  //            hasProcessedEvent -> one row = already seen
  const sql = fakeSql([[{ "?column?": 1 }]]);
  const res = await handler(req(squareEvent({ event_id: "evt-dupe" })), {}, deps(sql));
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).duplicate, true);
  assert.ok(!sql.calls.some((c) => /INSERT INTO square_subscription_links/.test(c.text)),
    "a duplicate must not re-apply the subscription event");
});

test("treats losing an insert race as a duplicate, not a failure", async () => {
  //           hasProcessed=[] , recordEvent RETURNING [] (ON CONFLICT DO NOTHING)
  const sql = fakeSql([[], []]);
  const res = await handler(req(squareEvent({ event_id: "evt-race" })), {}, deps(sql));
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).duplicate, true);
});

/* -------------------------------------------------------------- routing -- */

test("acknowledges an event type we do not handle without acting", async () => {
  const sql = fakeSql([[], [{ id: "w" }]]);
  const res = await handler(req(squareEvent({ type: "payment.created", event_id: "evt-p" })), {}, deps(sql));
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).handled, false);
});

test("acts on subscription.created and subscription.updated", async () => {
  for (const type of ["subscription.created", "subscription.updated"]) {
    const sql = fakeSql([[], [{ id: "w" }], [{ square_subscription_id: "sub_abc", organization_id: null, subscription_id: null }]]);
    const res = await handler(req(squareEvent({ type, event_id: "evt-" + type })), {}, deps(sql));
    assert.equal(JSON.parse(res.body).handled, true, type);
    assert.ok(sql.calls.some((c) => /INSERT INTO square_subscription_links/.test(c.text)), type);
  }
});

/* ---------------------------------------------------------- store logic -- */

test("maps Square statuses onto our lifecycle, treating DEACTIVATED as recoverable", () => {
  assert.equal(mapSquareStatus("ACTIVE"), "active");
  assert.equal(mapSquareStatus("PENDING"), "active");
  assert.equal(mapSquareStatus("PAUSED"), "paused");
  // Not "cancelled": cancelled is terminal in subscriptionLifecycle.js, so
  // mapping a recoverable Square state onto it would strand the record.
  assert.equal(mapSquareStatus("DEACTIVATED"), "paused");
  assert.equal(mapSquareStatus("CANCELED"), "cancelled");
  assert.equal(mapSquareStatus("CANCELLED"), "cancelled");
  assert.equal(mapSquareStatus("SOMETHING_NEW"), null);
  assert.equal(mapSquareStatus(undefined), null);
});

test("parses Square's nested envelope", () => {
  const parsed = parseSquareEvent(JSON.parse(squareEvent({ event_id: "evt-x", subscriptionId: "sub_x" })));
  assert.equal(parsed.eventId, "evt-x");
  assert.equal(parsed.eventType, "subscription.updated");
  assert.equal(parsed.subscription.id, "sub_x");
});

test("parseSquareEvent tolerates junk without throwing", () => {
  for (const junk of [null, undefined, {}, { data: {} }, { data: { object: {} } }, "string"]) {
    const parsed = parseSquareEvent(junk);
    assert.equal(parsed.subscription, null);
  }
});

test("a webhook never creates an organization -- unlinked subscriptions wait for staff", async () => {
  const sql = fakeSql([[{ square_subscription_id: "sub_new", organization_id: null, subscription_id: null }]]);
  const out = await applySubscriptionEvent(
    { subscription: { id: "sub_new", status: "ACTIVE" }, eventType: "subscription.created" },
    { sql, now: NOW }
  );
  assert.equal(out.linked, false);
  assert.match(out.note, /awaiting staff link/);
  assert.ok(!sql.calls.some((c) => /INSERT INTO organizations/i.test(c.text)),
    "a webhook must never mint an organization");
});

test("an illegal transition is reported, not thrown -- so Square stops retrying", async () => {
  const sql = fakeSql([
    [{ square_subscription_id: "sub_c", organization_id: "org-1", subscription_id: "int-1" }],
    // getSubscriptionById -> already cancelled, which is terminal
    [{ id: "int-1", organization_id: "org-1", plan_key: "basic", status: "cancelled", started_at: "2026-01-01T00:00:00Z" }],
  ]);
  const out = await applySubscriptionEvent(
    { subscription: { id: "sub_c", status: "ACTIVE" }, eventType: "subscription.updated" },
    { sql, now: NOW, auditRecorder: { record: async () => {} } }
  );
  assert.equal(out.transitioned, false);
  assert.match(out.note, /transition refused/);
});

test("an event with no subscription id is reported rather than crashing", async () => {
  const out = await applySubscriptionEvent({ subscription: {}, eventType: "subscription.updated" }, { sql: fakeSql(), now: NOW });
  assert.equal(out.squareSubscriptionId, null);
  assert.match(out.note, /no subscription id/);
});

test("linking refuses when the Square subscription is unknown", async () => {
  await assert.rejects(
    () => linkToOrganization({ squareSubscriptionId: "nope", organizationId: "org-1", planKey: "basic" }, { sql: fakeSql([[]]), now: NOW }),
    /no Square subscription/
  );
});

test("linking refuses to re-link an already-linked subscription", async () => {
  const sql = fakeSql([[{ square_subscription_id: "sub_a", organization_id: "org-existing" }]]);
  await assert.rejects(
    () => linkToOrganization({ squareSubscriptionId: "sub_a", organizationId: "org-2", planKey: "basic" }, { sql, now: NOW }),
    /already linked/
  );
});
