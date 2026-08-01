#!/usr/bin/env node
/*
 * Generates js/product-catalog.js from the server catalog.
 *
 *   node scripts/build-product-catalog.js   (also runs as part of `npm test`)
 *
 * The browser needs names and prices to render the cart without a round trip,
 * but there must be exactly one place those are authored. Generating the
 * client copy means it can't drift from the copy that decides money -- the
 * failure mode this whole exercise already hit once, when Square's product
 * names and the site's stopped matching.
 *
 * Every number below comes out of _lib/pricing.js rather than being derived
 * here, so the figure printed on a card is by construction the figure the
 * checkout endpoint will quote. Both the list price and the Heroes price are
 * emitted, so a verified hero sees their own price immediately on page load
 * instead of watching it change after a fetch resolves.
 */
const fs = require('fs');
const path = require('path');
const cat = require('../netlify/functions/_lib/product_catalog.js');
const { priceCart } = require('../netlify/functions/_lib/pricing.js');

/** Price a single product on its own, the way a one-line cart would. */
function solo(product, opts) {
  return priceCart([{ product, quantity: 1 }], opts);
}

const products = cat.listProducts().map((p) => {
  const list = solo(p, {});
  const hero = solo(p, { hero: true });
  const full = p.kind === 'package' ? solo(p, { payInFull: true }) : null;
  const fullHero = p.kind === 'package' ? solo(p, { payInFull: true, hero: true }) : null;

  return {
    key: p.key, kind: p.kind, category: p.category, name: p.name,
    page: p.page || null, featured: !!p.featured,
    summary: p.summary, blurb: p.blurb || null,
    minimumTermMonths: p.minimumTermMonths || null,
    totalCents: p.totalCents || null,

    // What a cart containing only this item is charged today.
    chargedTodayCents: list.chargedTodayCents,
    monthlyCents: list.monthlyCents,
    balanceAtLaunchCents: list.balanceAtLaunchCents,
    label: list.lines[0] ? list.lines[0].label : p.name,

    heroChargedTodayCents: hero.chargedTodayCents,
    heroMonthlyCents: hero.monthlyCents,
    heroBalanceAtLaunchCents: hero.balanceAtLaunchCents,

    payInFullCents: full ? full.chargedTodayCents : null,
    heroPayInFullCents: fullHero ? fullHero.chargedTodayCents : null,
  };
});

const out = `/* GENERATED FILE -- do not edit.
 * Source: netlify/functions/_lib/product_catalog.js + _lib/pricing.js
 * Rebuild: node scripts/build-product-catalog.js
 *
 * Display data only. These prices render the cards and the cart; the amount
 * actually charged is recomputed server-side at checkout from the same
 * pricing engine that generated this file. Editing this file changes what a
 * customer sees and nothing about what they pay.
 */
(function (global) {
  'use strict';
  var PRODUCTS = ${JSON.stringify(products, null, 2).split('\n').map((l, i) => (i ? '  ' + l : l)).join('\n')};

  function get(key) {
    for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].key === key) return PRODUCTS[i];
    return null;
  }
  function money(cents) {
    return '$' + (cents / 100).toLocaleString('en-US', {
      minimumFractionDigits: cents % 100 ? 2 : 0,
      maximumFractionDigits: 2,
    });
  }
  function categories() {
    var seen = [];
    PRODUCTS.forEach(function (p) { if (seen.indexOf(p.category) === -1) seen.push(p.category); });
    return seen;
  }
  /* The right price for this viewer: hero pricing if their account carries a
   * verified status, list price otherwise. Never trusted for charging. */
  function priceFor(product, hero) {
    return {
      chargedTodayCents: hero ? product.heroChargedTodayCents : product.chargedTodayCents,
      monthlyCents: hero ? product.heroMonthlyCents : product.monthlyCents,
      balanceAtLaunchCents: hero ? product.heroBalanceAtLaunchCents : product.balanceAtLaunchCents,
      payInFullCents: hero ? product.heroPayInFullCents : product.payInFullCents,
    };
  }

  global.LTS_PRODUCTS = {
    PRODUCTS: PRODUCTS, get: get, money: money, categories: categories, priceFor: priceFor,
  };
})(window);
`;
fs.writeFileSync(path.join(__dirname, '..', 'js', 'product-catalog.js'), out, 'utf8');
console.log(`  wrote js/product-catalog.js (${products.length} products)`);
