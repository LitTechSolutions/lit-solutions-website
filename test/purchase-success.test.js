const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "thank-you.html"), "utf8");
const script = fs.readFileSync(path.join(ROOT, "js", "purchase-success.js"), "utf8");

function wait(ms = 30) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function page(fetchImpl) {
  const dom = new JSDOM(html, {
    url: "https://lit-solutions.tech/thank-you.html?order=ord-123",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  let cleared = 0;
  dom.window.fetch = fetchImpl;
  dom.window.LTS_CART = { clear: () => { cleared++; } };
  dom.window.eval(script);
  return { window: dom.window, cleared: () => cleared };
}

test("the thank-you page confirms the owned order, clears the cart, and exposes the receipt journey", async () => {
  const order = {
    id: "ord-123", status: "paid", summary: "Premium Website Plan",
    amountPaidCents: 37800, monthlyCents: 12900, balanceAtLaunchCents: 0,
    needsBrief: true, items: [{ key: "plan-premium", name: "Premium", quantity: 1 }],
  };
  const { window, cleared } = page(async () => response(200, { orders: [order] }));
  await wait();

  assert.equal(cleared(), 1);
  assert.match(window.document.getElementById("purchaseTitle").textContent, /Thank you/);
  assert.match(window.document.getElementById("purchaseSummary").textContent, /Premium Website Plan/);
  assert.match(window.document.getElementById("purchaseSummary").textContent, /\$378\.00/);
  assert.equal(window.document.getElementById("purchaseNextSteps").hidden, false);
  assert.equal(window.document.querySelector("#purchaseActions a").getAttribute("href"), "myaccount.html#brief");
  assert.equal(window.dataLayer.length, 1);
  assert.equal(window.dataLayer[0].event, "purchase");
  assert.equal(window.dataLayer[0].ecommerce.transaction_id, "ord-123");
  assert.equal(window.dataLayer[0].ecommerce.value, 378);
  assert.equal(window.location.search, "", "the opaque order id should be removed after capture");
});

test("the purchase conversion event is emitted once per order, even if the page logic runs again", async () => {
  const fetchImpl = async () => response(200, { orders: [{
    id: "ord-123", status: "paid", summary: "Standard", amountPaidCents: 22800,
    needsBrief: true, items: [{ key: "plan-standard", name: "Standard", quantity: 1 }],
  }] });
  const { window } = page(fetchImpl);
  await wait();
  window.eval(script);
  await wait();
  assert.equal(window.dataLayer.filter((item) => item.event === "purchase").length, 1);
});

test("a signed-out customer gets a safe sign-in handoff instead of order details", async () => {
  const { window } = page(async () => response(401, { error: "Sign in required." }));
  await wait();
  assert.match(window.document.getElementById("purchaseTitle").textContent, /purchase is safe/i);
  assert.equal(window.document.querySelector("#purchaseActions a").getAttribute("href"), "myaccount.html#signin");
  assert.equal(window.document.getElementById("purchaseSummary").hidden, true);
});
