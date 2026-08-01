/* Shopping cart.
 *
 * Holds any number of catalog items with quantities: a website plan, a couple
 * of fixed-price services, an ongoing support subscription -- one checkout for
 * the lot. (It used to hold exactly one website plan. That was a fair model
 * when the only thing you could buy was a website, and it stopped being one
 * the moment services and support plans became purchasable.)
 *
 * State lives in localStorage and is display convenience ONLY. It stores
 * product KEYS and quantities and nothing else -- no prices, no discounts, no
 * totals. The order that matters is created server-side at checkout, and every
 * amount is recomputed there from the server catalog and the account's own
 * verified hero status. Tampering with the stored value changes what the
 * customer sees; it can never change what Stripe charges.
 */
(function () {
  'use strict';

  var KEY = 'lts-cart-v2';
  var LEGACY_KEY = 'lts-cart';
  var MAX_LINES = 12;
  var MAX_QTY = 20;

  var catalog = window.LTS_PRODUCTS;
  if (!catalog) return;

  /* ---- state ---- */

  function clampQty(n) {
    n = parseInt(n, 10);
    if (!n || n < 1) return 1;
    return Math.min(MAX_QTY, n);
  }

  function normalise(raw) {
    var items = [];
    var seen = {};
    var list = (raw && raw.items) || [];
    for (var i = 0; i < list.length && items.length < MAX_LINES; i++) {
      var it = list[i];
      var key = it && it.key;
      // Validate against the catalog rather than trusting what's stored -- a
      // stale key from a renamed product must not render as a blank line.
      if (!key || seen[key] || !catalog.get(key)) continue;
      seen[key] = true;
      items.push({ key: key, qty: clampQty(it.qty) });
    }
    return { items: items, payInFull: !!(raw && raw.payInFull) };
  }

  /* A cart saved before this file supported more than one item. Carried
   * forward rather than dropped -- someone mid-purchase shouldn't lose it. */
  function migrateLegacy() {
    try {
      var old = localStorage.getItem(LEGACY_KEY);
      if (!old) return null;
      localStorage.removeItem(LEGACY_KEY);
      var v = JSON.parse(old);
      if (!v || !v.planKey || !catalog.get(v.planKey)) return null;
      return { items: [{ key: v.planKey, qty: 1 }], payInFull: false };
    } catch (e) { return null; }
  }

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) {
        var migrated = migrateLegacy();
        if (migrated) { save(migrated); return migrated; }
        return { items: [], payInFull: false };
      }
      return normalise(JSON.parse(raw));
    } catch (e) { return { items: [], payInFull: false }; }
  }

  function save(state) {
    try {
      if (state.items.length) localStorage.setItem(KEY, JSON.stringify(state));
      else localStorage.removeItem(KEY);
    } catch (e) { /* private mode -- the cart just won't persist */ }
  }

  function write(state) {
    save(state);
    render();
    document.dispatchEvent(new CustomEvent('lts:cart-changed', { detail: state }));
    return state;
  }

  /* ---- operations ---- */

  function add(key, qty) {
    if (!catalog.get(key)) return false;
    var state = read();
    var line = find(state, key);
    if (line) line.qty = clampQty(line.qty + (qty ? clampQty(qty) : 1));
    else {
      if (state.items.length >= MAX_LINES) return false;
      state.items.push({ key: key, qty: qty ? clampQty(qty) : 1 });
    }
    write(state);
    return true;
  }

  function setQty(key, qty) {
    var state = read();
    var line = find(state, key);
    if (!line) return false;
    if (parseInt(qty, 10) < 1) return remove(key);
    line.qty = clampQty(qty);
    write(state);
    return true;
  }

  function remove(key) {
    var state = read();
    state.items = state.items.filter(function (i) { return i.key !== key; });
    // The 50/50 toggle only means anything with a website build in the cart.
    if (!state.items.some(isPackage)) state.payInFull = false;
    write(state);
    return true;
  }

  function clear() { return write({ items: [], payInFull: false }); }

  function setPayInFull(on) {
    var state = read();
    state.payInFull = !!on;
    write(state);
    return state;
  }

  function find(state, key) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].key === key) return state.items[i];
    return null;
  }

  function isPackage(item) {
    var p = catalog.get(item.key);
    return !!p && p.kind === 'package';
  }

  function has(key) { return !!find(read(), key); }

  function count() {
    return read().items.reduce(function (n, i) { return n + i.qty; }, 0);
  }

  /** "plan-premium:1,svc-mfa:2" -- what the checkout endpoint parses. */
  function toQuery() {
    return read().items.map(function (i) { return i.key + ':' + i.qty; }).join(',');
  }

  /* ---- header badge and button state ---- */

  function render() {
    var state = read();
    var n = state.items.reduce(function (a, i) { return a + i.qty; }, 0);

    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = n ? String(n) : '';
      el.hidden = !n;
    });
    document.querySelectorAll('[data-cart-link]').forEach(function (el) {
      el.hidden = !n;
    });
    // Buttons flip to "In your cart" so a page reflects state without a reload.
    document.querySelectorAll('[data-add-to-cart]').forEach(function (btn) {
      var mine = !!find(state, btn.getAttribute('data-add-to-cart'));
      btn.classList.toggle('is-in-cart', mine);
      btn.setAttribute('aria-pressed', mine ? 'true' : 'false');
      var label = btn.querySelector('[data-cart-label]') || btn;
      label.textContent = mine
        ? 'In your cart ✓'
        : (btn.getAttribute('data-label-default') || label.textContent);
    });
  }

  /* ---- wiring ---- */

  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    // Another handler already cancelled this click -- the Terms gate on the
    // payments page does exactly that. Honour it rather than adding to the
    // cart anyway, which would defeat the gate while looking like it worked.
    if (e.defaultPrevented) return;

    var addBtn = e.target.closest('[data-add-to-cart]');
    if (addBtn) {
      e.preventDefault();
      var key = addBtn.getAttribute('data-add-to-cart');
      // A second press on an item already in the cart goes to the cart rather
      // than silently stacking a quantity nobody asked for.
      if (has(key)) { window.location.href = 'cart.html'; return; }
      if (add(key)) {
        var next = addBtn.getAttribute('data-then');
        if (next) window.location.href = next;
      }
      return;
    }

    var rm = e.target.closest('[data-cart-remove]');
    if (rm) {
      e.preventDefault();
      var rmKey = rm.getAttribute('data-cart-remove');
      if (rmKey) remove(rmKey); else clear();
    }
  });

  // Another tab changed the cart.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) { render(); document.dispatchEvent(new CustomEvent('lts:cart-changed', { detail: read() })); }
  });

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-add-to-cart]').forEach(function (btn) {
      var label = btn.querySelector('[data-cart-label]') || btn;
      if (!btn.getAttribute('data-label-default')) {
        btn.setAttribute('data-label-default', label.textContent.trim());
      }
    });
    render();
  });

  window.LTS_CART = {
    read: read, add: add, setQty: setQty, remove: remove, clear: clear,
    setPayInFull: setPayInFull, has: has, count: count, toQuery: toQuery, render: render,
    MAX_LINES: MAX_LINES, MAX_QTY: MAX_QTY,
  };
})();
