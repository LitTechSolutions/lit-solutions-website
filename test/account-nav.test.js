/* The header account control.
 *
 * This is the site's only signed-in affordance, so the things worth pinning
 * are structural: it exists on every page, it never renders a signed-in
 * state for a signed-out visitor, and a stale cache can't do anything worse
 * than briefly show the wrong name.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "js", "account-nav.js"), "utf8");
const PAGES = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));

function mount({ user = null, ok = true, fail = false } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><body><div class="account-nav" id="accountNav" data-loading></div></body></html>`,
    { runScripts: "outside-only", url: "https://lit-solutions.tech/" }
  );
  const { window } = dom;
  const store = new Map();
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  });
  const calls = [];
  window.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: (opts && opts.method) || "GET" });
    if (fail) throw new Error("offline");
    if (!ok) return { ok: false, status: 401, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ user }) };
  };
  window.eval(SRC);
  return { window, doc: window.document, store, calls };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

test("every page carries the control and loads the script", () => {
  // 38 static pages with no include mechanism -- a sweep is the only way it
  // stays consistent, so assert it rather than trusting the sweep ran.
  const missing = PAGES.filter((p) => !fs.readFileSync(path.join(ROOT, p), "utf8").includes('id="accountNav"'));
  const noScript = PAGES.filter((p) => !fs.readFileSync(path.join(ROOT, p), "utf8").includes("js/account-nav.js"));
  assert.deepEqual(missing, [], `pages without the account control: ${missing.join(", ")}`);
  assert.deepEqual(noScript, [], `pages without the script: ${noScript.join(", ")}`);
});

test("signed out shows a sign-in link and nothing personal", async () => {
  const { doc } = mount({ user: null });
  await settle();
  const link = doc.querySelector("#accountNav a");
  assert.ok(link, "expected a sign-in link");
  assert.equal(link.getAttribute("href"), "myaccount.html#signin");
  assert.equal(doc.querySelector(".account-trigger"), null, "no account menu when signed out");
});

test("signed in shows the first name, initials, and a working menu", async () => {
  const { doc, window } = mount({ user: { name: "Jane Doe", email: "jane@example.test", role: "customer" } });
  await settle();
  assert.equal(doc.querySelector(".account-name").textContent, "Jane");
  assert.equal(doc.querySelector(".account-avatar").textContent, "JD");

  const trigger = doc.querySelector("#accountTrigger");
  const drop = doc.querySelector("#accountDrop");
  assert.equal(drop.hidden, true, "menu starts closed");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");

  trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(drop.hidden, false);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");

  // Escape is what people actually press.
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(drop.hidden, true);
});

test("an admin gets admin destinations, a customer never does", async () => {
  const admin = mount({ user: { name: "Dylan Little", email: "d@x.test", role: "admin" } });
  await settle();
  const adminLinks = [...admin.doc.querySelectorAll(".account-drop-links a")].map((a) => a.getAttribute("href"));
  assert.ok(adminLinks.some((h) => h.includes("#stripe")), "admin should reach Stripe setup");
  assert.ok(adminLinks.some((h) => h.includes("#heroqueue")));

  const cust = mount({ user: { name: "Jane Doe", email: "j@x.test", role: "customer" } });
  await settle();
  const custLinks = [...cust.doc.querySelectorAll(".account-drop-links a")].map((a) => a.getAttribute("href"));
  assert.ok(!custLinks.some((h) => h.includes("#stripe")), "a customer must not be offered admin destinations");
  assert.ok(!custLinks.some((h) => h.includes("#heroqueue")));
});

test("a 401 renders signed-out rather than a broken menu", async () => {
  const { doc } = mount({ ok: false });
  await settle();
  assert.ok(doc.querySelector("#accountNav a"), "should fall back to the sign-in link");
  assert.equal(doc.querySelector(".account-trigger"), null);
});

test("being offline leaves the header neutral instead of claiming signed-out", async () => {
  // Rendering "Sign in" to someone who IS signed in, purely because the
  // network blipped, is worse than showing nothing for a moment.
  const { doc } = mount({ fail: true });
  await settle();
  assert.equal(doc.querySelector(".account-trigger"), null);
});

test("the session is cached, so moving between pages isn't a request per page", async () => {
  const first = mount({ user: { name: "Jane Doe", email: "j@x.test", role: "customer" } });
  await settle();
  assert.equal(first.calls.filter((c) => c.url.includes("/account")).length, 1);

  // A second page load sharing the same sessionStorage must not refetch.
  const before = first.calls.length;
  first.window.eval(SRC);
  await settle();
  assert.equal(first.calls.length, before, "a cached session should not trigger another fetch");
});

test("signing out clears the cache before anything else", async () => {
  const { doc, window, store, calls } = mount({ user: { name: "Jane Doe", email: "j@x.test", role: "customer" } });
  await settle();
  assert.ok(store.has("lts-account-cache"));

  doc.querySelector("#accountSignOut").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  // Cleared synchronously -- a cache that outlives the sign-out would show a
  // signed-in header to the next visitor on a shared machine.
  assert.equal(store.has("lts-account-cache"), false);
  await settle();
  assert.ok(calls.some((c) => c.url.includes("auth-logout") && c.method === "POST"));
});

test("a name with markup in it can't inject into the header", async () => {
  const { doc } = mount({ user: { name: '<img src=x onerror="steal()">', email: "x@y.test", role: "customer" } });
  await settle();
  const nav = doc.getElementById("accountNav");
  assert.deepEqual(nav.innerHTML.match(/<\s*(script|img|iframe)\b/gi) || [], [],
    "live markup reached the header");
});
