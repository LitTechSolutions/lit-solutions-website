// Terms acceptance belongs to account creation, not payment. These tests pin
// that single, understandable consent point so checkout never grows a second
// duplicate checkbox while registration remains fail-closed.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const cart = fs.readFileSync(path.join(root, "cart.html"), "utf8");
const account = fs.readFileSync(path.join(root, "myaccount.html"), "utf8");

test("checkout has no duplicate Terms or Privacy agreement control", () => {
  assert.doesNotMatch(cart, /id=["']agreeTerms["']/);
  assert.doesNotMatch(cart, /id=["']termsAgreeBlock["']/);

  const payView = account.slice(account.indexOf("views.pay = function"), account.indexOf("views.dashboard = function"));
  assert.doesNotMatch(payView, /id=["']agreeTerms["']/);
  assert.doesNotMatch(payView, /termsAgreeBlock/);
});

test("account creation still requires explicit Terms and Privacy acceptance", () => {
  const registerView = account.slice(account.indexOf("views.register = function"), account.indexOf("views.verify = function"));
  assert.match(registerView, /id="rg-terms"/);
  assert.match(registerView, /Terms &amp; Conditions/);
  assert.match(registerView, /Privacy Policy/);
  assert.match(registerView, /if \(!v\.querySelector\("#rg-terms"\)\.checked\)/);
  assert.match(registerView, /termsAccepted:\s*true/);
});

test("one-time vs. recurring charges remain clear before checkout", () => {
  assert.match(cart, /Charged today/);
  assert.match(cart, /Then every month/);
  assert.match(cart, /Balance at launch/);
  assert.match(cart, /includes your first month/i);
});
