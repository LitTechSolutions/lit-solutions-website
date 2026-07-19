// Covers 3 fixes to myaccount.html (previously untested):
//   1. Signing out used to leave the old tab bar (Dashboard/Documents/
//      Messages/.../Sign out) visibly rendered above the sign-in form
//      that then loaded, since the click handler never called
//      renderTabs() again after clearing state.user (unlike the
//      update-email/update-password success handlers, which already did).
//   2. A customer who's enrolled in Care Hub (has a real organization
//      membership) is now automatically redirected to /care-hub/ instead
//      of being left on this older, simpler account page -- both right
//      after signing in and on a plain page load with an existing session.
//   3. A customer with no Care Hub membership is completely unaffected --
//      confirms the redirect never fires for the common case.
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
    url: "http://localhost/myaccount.html",
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

test("a customer enrolled in Care Hub (has an organization membership) is redirected to /care-hub/ right after signing in", async () => {
  let signedIn = false;
  const { window, capturedRequests } = loadMyAccountPage({
    responses: {
      account: () => (signedIn
        ? { body: { user: { id: "u1", name: "Jane", email: "jane@example.com", role: "customer" } } }
        : { status: 401, body: { error: "Sign in required." } }),
      "auth-login": () => {
        signedIn = true;
        return { body: { user: { id: "u1", name: "Jane", email: "jane@example.com", role: "customer" } } };
      },
      "my-memberships": { body: { memberships: [{ organizationId: "org-1", organizationName: "Acme Co", role: "org_owner", status: "active" }] } },
    },
  });
  await wait(50);

  window.location.hash = "#signin";
  await wait(20);
  window.document.getElementById("si-email").value = "jane@example.com";
  window.document.getElementById("si-password").value = "correct-password";
  window.document.getElementById("si-submit").dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
  await wait(100);

  // jsdom doesn't implement cross-document navigation, so a
  // window.location.href assignment to a different path never actually
  // takes -- confirm the redirect branch was taken (and returned early)
  // by checking it never got as far as the normal post-login flow: the
  // hash never advances to #dashboard, and the tab bar (only rendered by
  // that later renderTabs() call) never appears.
  assert.ok(capturedRequests.some((r) => r.path === "my-memberships"), "expected a my-memberships check after a successful sign-in");
  assert.equal(window.location.hash, "#signin", "should have returned before ever navigating to #dashboard");
  assert.equal(window.document.getElementById("accountTabs").hidden, true, "tab bar must never render -- the redirect should fire first");
});

test("a customer with no Care Hub membership stays on myaccount.html and sees the normal dashboard", async () => {
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
      "my-memberships": { body: { memberships: [] } },
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

  assert.ok(capturedRequests.some((r) => r.path === "my-memberships"), "expected the membership check to still run");
  assert.equal(window.location.hash, "#dashboard", "should land on this page's own dashboard as before");
  assert.equal(window.document.getElementById("accountTabs").hidden, false, "the normal tab bar should render since there's no redirect");
});

test("an existing session with a Care Hub membership is redirected on a plain page load too, not just at sign-in", async () => {
  const { window, capturedRequests } = loadMyAccountPage({
    responses: {
      account: { body: { user: { id: "u3", name: "Priya", email: "priya@example.com", role: "customer" } } },
      "my-memberships": { body: { memberships: [{ organizationId: "org-2", organizationName: "Beta LLC", role: "org_member", status: "active" }] } },
    },
  });
  await wait(80);

  assert.ok(capturedRequests.some((r) => r.path === "my-memberships"), "expected the membership check to run on initial load too");
  assert.equal(window.document.getElementById("accountTabs").hidden, true, "tab bar/route() must never run -- the redirect should fire first");
});
