// Exercises the shipped unified account page: customer login, emailed admin
// verification, the admin workspace, sign-out cleanup, and purchase views.
//
// Loads the real myaccount.html with its inline script actually executing
// (JSDOM's runScripts: "dangerously"), rather than reimplementing any of
// this, so these tests exercise the shipped code.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

function loadMyAccountPage(opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(ROOT, "myaccount.html"), "utf8");
  const capturedRequests = [];
  const responses = opts.responses || {};

  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: opts.url || "http://localhost/myaccount.html",
    beforeParse(window) {
      window.fetch = function (url, fetchOpts) {
        const path = String(url).replace("/.netlify/functions/", "");
        const record = { path, opts: fetchOpts || {} };
        capturedRequests.push(record);
        const responder = responses[path];
        const result = typeof responder === "function" ? responder(record) : responder;
        // No configured responder -- a real 404, not a fake empty success.
        // This page's own code only has fallback handling for a non-ok
        // response (e.g. `results[1].ok ? results[1].body : {items:[],...}`),
        // so an unmocked path silently answering "ok" with an empty body
        // crashes on the first field access the real endpoint would have
        // actually provided.
        const body = result || { status: 404, body: { error: "Not found (unmocked in test)" } };
        return Promise.resolve({
          ok: body.status ? body.status >= 200 && body.status < 300 : true,
          status: body.status || 200,
          json: () => Promise.resolve(body.body !== undefined ? body.body : {}),
        });
      };
    },
  });

  return { window: dom.window, capturedRequests };
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

test("signing out clears the tab bar instead of leaving it visible above the sign-in form", async () => {
  const { window } = loadMyAccountPage({
    responses: {
      account: { body: { user: { id: "u1", name: "Jane", email: "jane@example.com", role: "customer" } } },
      "auth-logout": { body: {} },
    },
  });
  await wait(50);

  const tabsEl = window.document.getElementById("accountTabs");
  assert.equal(tabsEl.hidden, false, "tabs should be visible once signed in");
  assert.match(tabsEl.innerHTML, /Sign out/);

  const signOutLink = window.document.getElementById("account-signout");
  assert.ok(signOutLink, "expected a rendered sign-out link");
  signOutLink.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
  await wait(50);

  assert.equal(tabsEl.hidden, true, "tab bar must be hidden immediately after signing out");
  assert.equal(tabsEl.innerHTML, "", "no stale tab links should remain in the DOM after signing out");
});

test("the signed-out layout spans the account area instead of occupying the old sidebar column", async () => {
  const { window } = loadMyAccountPage({ responses: { account: { status: 401, body: { error: "Sign in required." } } } });
  await wait(50);
  assert.ok(window.document.getElementById("accountPortalShell").classList.contains("is-auth"));
  assert.ok(window.document.querySelector(".auth-card"));
});

test("a customer signs into the normal dashboard without any Care Hub membership handoff", async () => {
  let signedIn = false;
  const { window, capturedRequests } = loadMyAccountPage({
    responses: {
      account: () => (signedIn
        ? { body: { user: { id: "u2", name: "Bob", email: "bob@example.com", role: "customer" } } }
        : { status: 401, body: { error: "Sign in required." } }),
      "auth-login": () => {
        signedIn = true;
        return { body: { user: { id: "u2", name: "Bob", email: "bob@example.com", role: "customer" } } };
      },
      documents: { body: { documents: [] } },
      messages: { body: { messages: [] } },
      notifications: { body: { unreadCount: 0 } },
      favorites: { body: { items: [], recentlyViewed: [] } },
    },
  });
  await wait(50);

  window.location.hash = "#signin";
  await wait(20);
  window.document.getElementById("si-email").value = "bob@example.com";
  window.document.getElementById("si-password").value = "correct-password";
  window.document.getElementById("si-submit").dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
  await wait(100);

  assert.ok(!capturedRequests.some((r) => r.path === "my-memberships"), "the retired Care Hub must not participate in sign-in");
  assert.equal(window.location.hash, "#dashboard");
  assert.equal(window.document.getElementById("accountTabs").hidden, false);
  assert.ok(!window.document.getElementById("accountPortalShell").classList.contains("is-auth"));
});

test("a successful Stripe return renders the paid order instead of crashing the dashboard", async () => {
  const orderId = "ef7c8bcc-3113-40f0-9e36-b5d2b514a712";
  const { window, capturedRequests } = loadMyAccountPage({
    url: `http://localhost/myaccount.html?checkout=success&order=${orderId}#dashboard`,
    responses: {
      account: { body: { user: { id: "admin-1", name: "Dylan Little", email: "dylan@lit-solutions.tech", role: "admin" } } },
      "my-memberships": { body: { memberships: [] } },
      orders: { body: { orders: [{
        id: orderId,
        status: "paid",
        summary: "Live Stripe connection test",
        amountPaidCents: 100,
        needsBrief: false,
      }] } },
      documents: { body: { documents: [] } },
      favorites: { body: { items: [], recentlyViewed: [] } },
      notifications: { body: { unreadCount: 0 } },
    },
  });
  await wait(100);

  assert.ok(capturedRequests.some((r) => r.path === "orders"), "the dashboard must load the customer's orders");
  const orderCard = window.document.querySelector("#dashOrder .order-card");
  assert.ok(orderCard, "the paid order should render on the dashboard");
  assert.match(orderCard.textContent, /Live Stripe connection test/);
  assert.match(orderCard.textContent, /\$1 paid/);
  assert.match(orderCard.textContent, /Payment confirmed/);
});

test("the Purchases tab shows a customer's receipt, recurring price, and project action", async () => {
  const { window } = loadMyAccountPage({
    url: "http://localhost/myaccount.html#purchases",
    responses: {
      account: { body: { user: { id: "u4", name: "Maria", email: "maria@example.com", role: "customer" } } },
      "my-memberships": { body: { memberships: [] } },
      notifications: { body: { unreadCount: 0 } },
      orders: { body: { orders: [{
        id: "ord-4", status: "paid", summary: "Premium Website Plan", amountPaidCents: 37800,
        monthlyCents: 12900, balanceAtLaunchCents: 0, paidAt: "2026-08-02T12:00:00Z",
        needsBrief: true, receiptDocumentId: "purchase-receipt-ord-4", hasSubscription: true,
        items: [{ key: "plan-premium", name: "Premium", quantity: 1 }],
      }] } },
    },
  });
  await wait(100);

  const active = window.document.querySelector('#accountTabs a[href="#purchases"]');
  assert.ok(active.classList.contains("is-active"), "Purchases should be visibly selected");
  const record = window.document.querySelector(".purchase-record");
  assert.ok(record);
  assert.match(record.textContent, /Premium Website Plan/);
  assert.match(record.textContent, /\$378 paid|Paid/i);
  assert.match(record.textContent, /\$129\/month/);
  assert.ok(record.querySelector('a[href="#documents"]'), "the saved PDF receipt should be reachable");
  assert.ok(record.querySelector('a[href="#brief"]'), "a paid website project should offer the brief");
  assert.ok(record.querySelector("[data-billing]"), "a recurring plan should offer Stripe billing management");
});

test("an admin enters the emailed code on the normal sign-in path and reaches the admin workspace", async () => {
  let signedIn = false;
  const { window, capturedRequests } = loadMyAccountPage({
    responses: {
      account: () => signedIn
        ? { body: { user: { id: "admin-1", name: "Dylan", email: "admin@example.com", role: "admin" } } }
        : { status: 401, body: { error: "Sign in required." } },
      "auth-login": { body: { emailCodeRequired: true, challengeId: "abcdef0123456789abcdef0123456789abcd", maskedEmail: "ad•••@example.com" } },
      "auth-admin-code": () => { signedIn = true; return { body: { user: { id: "admin-1", role: "admin" } } }; },
      "admin-dashboard": { body: { metrics: {}, customers: [], orders: [], leads: [], recentMessages: [] } },
    },
  });
  await wait(50);

  window.location.hash = "#signin";
  await wait(20);
  window.document.getElementById("si-email").value = "admin@example.com";
  window.document.getElementById("si-password").value = "correct-password";
  window.document.getElementById("si-submit").dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
  await wait(60);
  assert.ok(capturedRequests.some((r) => r.path === "auth-login"), "expected the password to be submitted");
  assert.equal(window.location.hash, "#admin-code");
  assert.match(window.document.querySelector(".auth-card").textContent, /ad•••@example\.com/);
  window.document.getElementById("admin-code-input").value = "123456";
  window.document.getElementById("admin-code-submit").dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
  await wait(120);
  assert.ok(capturedRequests.some((r) => r.path === "auth-admin-code"));
  assert.equal(window.location.hash, "#admin");
  assert.match(window.document.getElementById("accountTabs").textContent, /Customers/);
  assert.match(window.document.getElementById("accountTabs").textContent, /System health/);
});
