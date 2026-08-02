// Regression for configured Website Designer quotes: before sign-in the cart
// uses its local fallback while the server quote is unavailable. The quote
// line and summary must use the same deposit amount.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");

function response(ok, body) {
  return Promise.resolve({ ok, json: async () => body });
}

async function loadConfiguredQuoteCart({ payInFull = false } = {}) {
  const html = fs.readFileSync(path.join(root, "cart.html"), "utf8");
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://lit-solutions.tech/cart.html",
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.localStorage.setItem("lts-cart-v2", JSON.stringify({
    items: [{ key: "quote:q1234567890abcdef1234", qty: 1 }],
    payInFull,
  }));
  window.fetch = (url) => {
    const value = String(url);
    if (value.includes("designer-quote")) {
      return response(true, { quote: {
        id: "q1234567890abcdef1234",
        package: "starter",
        packageName: "Starter website",
        totalCents: 69900,
        featureCount: 0,
      } });
    }
    if (value.includes("checkout-status")) return response(true, { enabled: true });
    if (value.includes("/account")) return response(false, {});
    return response(false, {});
  };

  window.eval(fs.readFileSync(path.join(root, "js/product-catalog.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(root, "js/cart.js"), "utf8"));
  const cartScript = Array.from(window.document.scripts)
    .map((script) => script.textContent)
    .find((source) => source.includes("/* Cart page."));
  assert.ok(cartScript, "cart page script was not found");
  window.eval(cartScript);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return window;
}

test("configured build deposit contributes to the signed-out cart total", async () => {
  const window = await loadConfiguredQuoteCart();
  assert.match(window.document.getElementById("cartLines").textContent, /\$349\.50/);
  assert.match(window.document.getElementById("cartTotals").textContent, /Charged today\s*\$349\.50/);
  assert.match(window.document.getElementById("cartTotals").textContent, /Balance at launch\s*\$349\.50/);
});

test("pay-in-full configured build contributes its full price to the summary", async () => {
  const window = await loadConfiguredQuoteCart({ payInFull: true });
  assert.match(window.document.getElementById("cartTotals").textContent, /Charged today\s*\$699/);
  assert.doesNotMatch(window.document.getElementById("cartTotals").textContent, /Balance at launch/);
});
