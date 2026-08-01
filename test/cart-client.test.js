/* js/cart.js, in a real DOM.
 *
 * The cart is the one piece of this flow that lives entirely in the browser
 * and entirely in the customer's hands. So the questions worth asking are
 * less "does add() add" and more: what happens when localStorage is full,
 * when a product key gets renamed under a saved cart, when two tabs disagree,
 * and when someone edits the stored value by hand.
 *
 * The last one matters most. The cart stores product KEYS, never prices, so
 * tampering can change what the page shows and never what Stripe charges --
 * these tests pin that property in place.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const CATALOG_SRC = fs.readFileSync(path.join(ROOT, "js", "product-catalog.js"), "utf8");
const CART_SRC = fs.readFileSync(path.join(ROOT, "js", "cart.js"), "utf8");

/** A page with the header badge markup and whatever buttons a test needs. */
function mount({ body = "", storage = {}, brokenStorage = false } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><body>
       <a href="cart.html" data-cart-link hidden><span data-cart-count hidden></span></a>
       ${body}
     </body></html>`,
    { runScripts: "outside-only", url: "https://lit-solutions.tech/cart.html" }
  );
  const { window } = dom;

  const store = new Map(Object.entries(storage));
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (kk) => (store.has(kk) ? store.get(kk) : null),
      setItem: (kk, v) => {
        if (brokenStorage) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
        store.set(kk, String(v));
      },
      removeItem: (kk) => { store.delete(kk); },
    },
  });

  window.eval(CATALOG_SRC);
  window.eval(CART_SRC);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  return { window, doc: window.document, store, dom };
}

const KEY = "lts-cart-v2";
const saved = (store) => JSON.parse(store.get(KEY) || '{"items":[]}');

/* Values built inside jsdom carry jsdom's prototypes, so assert/strict's
 * deepEqual reports "same structure but not reference-equal" against a plain
 * Node literal. Round-tripping through JSON brings them into this realm. */
const own = (v) => JSON.parse(JSON.stringify(v));

/* ------------------------------------------------------------- basics --- */

test("an empty cart hides the header link and the badge", () => {
  const { doc } = mount();
  assert.equal(doc.querySelector("[data-cart-link]").hidden, true);
  assert.equal(doc.querySelector("[data-cart-count]").hidden, true);
});

test("adding shows the badge with the total number of units, not lines", () => {
  const { window, doc } = mount();
  window.LTS_CART.add("svc-seo", 2);
  window.LTS_CART.add("svc-domain-setup");
  const badge = doc.querySelector("[data-cart-count]");
  assert.equal(badge.hidden, false);
  assert.equal(badge.textContent, "3");
  assert.equal(doc.querySelector("[data-cart-link]").hidden, false);
});

test("adding the same product twice raises its quantity instead of duplicating the line", () => {
  const { window, store } = mount();
  window.LTS_CART.add("svc-seo");
  window.LTS_CART.add("svc-seo");
  const s = saved(store);
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].qty, 2);
});

test("only real catalog keys can enter the cart", () => {
  const { window, store } = mount();
  assert.equal(window.LTS_CART.add("free-website-please"), false);
  assert.equal(window.LTS_CART.add(""), false);
  assert.equal(window.LTS_CART.add(null), false);
  assert.equal(saved(store).items.length, 0);
});

test("quantities are clamped at both ends", () => {
  const { window } = mount();
  window.LTS_CART.add("svc-seo", 9999);
  assert.equal(window.LTS_CART.read().items[0].qty, window.LTS_CART.MAX_QTY);
  window.LTS_CART.setQty("svc-seo", -3);
  assert.equal(window.LTS_CART.has("svc-seo"), false, "dropping below one removes the line");
});

test("the cart refuses to grow past its line limit", () => {
  const { window } = mount();
  const keys = window.LTS_PRODUCTS.PRODUCTS.map((p) => p.key);
  // The catalog is smaller than the cap, so add everything twice over to
  // actually reach it -- otherwise this asserts nothing.
  keys.concat(keys).forEach((key) => window.LTS_CART.add(key));
  const held = window.LTS_CART.read().items.length;
  assert.ok(held <= window.LTS_CART.MAX_LINES, `${held} lines exceeds the cap`);
  assert.equal(held, Math.min(keys.length, window.LTS_CART.MAX_LINES));
});

/* ------------------------------------------------------------ tamper ---- */

test("a hand-edited cart is filtered to real products, and prices are ignored entirely", () => {
  const { window } = mount({
    storage: {
      [KEY]: JSON.stringify({
        items: [
          { key: "plan-premium", qty: 1, priceCents: 1, name: "FREE WEBSITE" },
          { key: "not-a-product", qty: 1 },
          { key: "svc-seo", qty: 400 },
        ],
        payInFull: true,
        totalCents: 0,
      }),
    },
  });
  const state = window.LTS_CART.read();
  assert.deepEqual(own(state.items).map((i) => i.key), ["plan-premium", "svc-seo"], "unknown keys dropped");
  assert.equal(state.items[1].qty, window.LTS_CART.MAX_QTY, "quantity clamped");

  // The injected price fields survive nowhere -- the cart's whole contract is
  // that it carries keys and quantities and nothing else.
  const roundTripped = JSON.stringify(state);
  assert.ok(!roundTripped.includes("priceCents"), roundTripped);
  assert.ok(!roundTripped.includes("FREE WEBSITE"), roundTripped);
  assert.ok(!roundTripped.includes("totalCents"), roundTripped);

  // What checkout receives is only ever keys and quantities.
  assert.equal(window.LTS_CART.toQuery(), "plan-premium:1,svc-seo:20");
});

test("a corrupt or hostile stored value degrades to an empty cart, never a crash", () => {
  for (const bad of ["not json", "null", "[]", '{"items":"everything"}', '{"items":[null,7,"x"]}', '{"items":[{}]}']) {
    const { window } = mount({ storage: { [KEY]: bad } });
    assert.deepEqual(own(window.LTS_CART.read().items), [], `failed on ${bad}`);
  }
});

test("a prototype-pollution attempt through the stored cart is inert", () => {
  const { window } = mount({
    storage: { [KEY]: '{"items":[{"key":"svc-seo","qty":1}],"__proto__":{"polluted":true}}' },
  });
  window.LTS_CART.read();
  assert.equal({}.polluted, undefined);
  assert.equal(window.Object.prototype.polluted, undefined);
});

/* ---------------------------------------------------------- migration --- */

test("a cart saved by the old single-plan version is carried forward, not lost", () => {
  const { window, store } = mount({
    storage: { "lts-cart": JSON.stringify({ planKey: "plan-premium", addedAt: 1 }) },
  });
  const state = window.LTS_CART.read();
  assert.deepEqual(own(state.items), [{ key: "plan-premium", qty: 1 }]);
  assert.equal(store.has("lts-cart"), false, "the old key should be cleaned up");
});

test("an old cart holding a key that no longer exists is discarded quietly", () => {
  const { window } = mount({ storage: { "lts-cart": JSON.stringify({ planKey: "premium" }) } });
  // "premium" was the pre-migration key; it is not a catalog key now.
  assert.deepEqual(own(window.LTS_CART.read().items), []);
});

/* ------------------------------------------------------------ buttons --- */

test("an add-to-cart button reflects state, and a second press goes to the cart", () => {
  const { window, doc } = mount({
    body: '<button data-add-to-cart="svc-seo"><span data-cart-label>Add to cart</span></button>',
  });
  const btn = doc.querySelector("[data-add-to-cart]");
  assert.equal(btn.getAttribute("data-label-default"), "Add to cart");

  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(window.LTS_CART.has("svc-seo"), true);
  assert.equal(btn.querySelector("[data-cart-label]").textContent, "In your cart ✓");
  assert.equal(btn.getAttribute("aria-pressed"), "true");

  // A second press must not silently stack a quantity nobody asked for.
  const before = window.LTS_CART.read().items[0].qty;
  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(window.LTS_CART.read().items[0].qty, before);
});

test("a remove control with a key removes one line; without one it empties the cart", () => {
  const { window, doc } = mount({
    body: '<button data-cart-remove="svc-seo">x</button><button id="all" data-cart-remove>empty</button>',
  });
  window.LTS_CART.add("svc-seo");
  window.LTS_CART.add("svc-domain-setup");

  doc.querySelector('[data-cart-remove="svc-seo"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.deepEqual(own(window.LTS_CART.read().items).map((i) => i.key), ["svc-domain-setup"]);

  doc.querySelector("#all").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.deepEqual(own(window.LTS_CART.read().items), []);
});

test("the 50/50 toggle is dropped when the last website build leaves the cart", () => {
  const { window } = mount();
  window.LTS_CART.add("package-business");
  window.LTS_CART.add("svc-seo");
  window.LTS_CART.setPayInFull(true);
  assert.equal(window.LTS_CART.read().payInFull, true);

  window.LTS_CART.remove("package-business");
  assert.equal(window.LTS_CART.read().payInFull, false, "pay-in-full means nothing without a build");
});

test("a click another handler has cancelled does not reach the cart", () => {
  // The payments page gates every pay/subscribe control behind a Terms
  // checkbox by calling preventDefault on the click. Before this guard the
  // gate stopped the navigation but the item still went in the cart, which
  // is worse than no gate at all -- it looks like it worked.
  const { window, doc } = mount({
    body: '<button class="pay-btn" data-add-to-cart="care-plan" data-then="cart.html">Subscribe</button>',
  });
  const btn = doc.querySelector("[data-add-to-cart]");
  btn.addEventListener("click", (e) => e.preventDefault());

  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(window.LTS_CART.has("care-plan"), false, "a gated click must not add to the cart");

  // And an ungated click still works.
  const clean = mount({ body: '<button data-add-to-cart="care-plan">Subscribe</button>' });
  clean.doc.querySelector("[data-add-to-cart]")
    .dispatchEvent(new clean.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(clean.window.LTS_CART.has("care-plan"), true);
});

/* ------------------------------------------------------- resilience ----- */

test("private browsing (localStorage throwing) leaves the page working", () => {
  const { window, doc } = mount({ brokenStorage: true });
  assert.doesNotThrow(() => window.LTS_CART.add("svc-seo"));
  // It can't persist, but nothing throws into the page and the badge is honest.
  assert.equal(doc.querySelector("[data-cart-count]").hidden, true);
});

test("a change in another tab repaints this one", () => {
  const { window, doc, store } = mount();
  store.set(KEY, JSON.stringify({ items: [{ key: "svc-seo", qty: 2 }] }));
  const evt = new window.Event("storage");
  evt.key = KEY;
  window.dispatchEvent(evt);
  assert.equal(doc.querySelector("[data-cart-count]").textContent, "2");
});

test("every change announces itself so a page can re-render without polling", () => {
  const { window, doc } = mount();
  let fired = 0;
  doc.addEventListener("lts:cart-changed", () => { fired++; });
  window.LTS_CART.add("svc-seo");
  window.LTS_CART.setQty("svc-seo", 3);
  window.LTS_CART.setPayInFull(true);
  window.LTS_CART.remove("svc-seo");
  window.LTS_CART.clear();
  assert.equal(fired, 5);
});

test("the query string handed to checkout is exactly keys and quantities", () => {
  const { window } = mount();
  window.LTS_CART.add("plan-standard");
  window.LTS_CART.add("svc-seo", 2);
  assert.match(window.LTS_CART.toQuery(), /^[a-z0-9-]+:\d+(,[a-z0-9-]+:\d+)*$/);
  assert.equal(window.LTS_CART.toQuery(), "plan-standard:1,svc-seo:2");
});

/* -------------------------------------------------------------- catalog -- */

test("the generated catalog exposes a price for every product, and formats money sanely", () => {
  const { window } = mount();
  const P = window.LTS_PRODUCTS;
  // Website work only: three plans, two builds, two ongoing plans and four
  // fixed-rate website services. IT work is quoted and invoiced, never carted.
  assert.equal(P.PRODUCTS.length, 11);
  assert.deepEqual(
    own(P.PRODUCTS).map((p) => p.category).filter((c, i, a) => a.indexOf(c) === i).sort(),
    ["Ongoing support", "Website build", "Website services", "Website subscription"]
  );
  for (const p of P.PRODUCTS) {
    assert.ok(p.chargedTodayCents > 0, `${p.key} has no price`);
    assert.ok(p.heroChargedTodayCents > 0 && p.heroChargedTodayCents <= p.chargedTodayCents,
      `${p.key}: the hero price must be lower, never higher`);
  }
  assert.equal(P.money(24900), "$249");
  assert.equal(P.money(21165), "$211.65");
  assert.equal(P.money(129900), "$1,299");
});

test("priceFor returns the hero price only for a hero", () => {
  const { window } = mount();
  const P = window.LTS_PRODUCTS;
  const premium = P.get("plan-premium");
  assert.equal(P.priceFor(premium, false).chargedTodayCents, 37800);
  assert.equal(P.priceFor(premium, true).chargedTodayCents, 21165 + 12255);
});
