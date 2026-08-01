/* Shopping cart for website plans.
 *
 * Deliberately small: a customer buys one website plan, not a basket of goods,
 * so this holds at most one plan and "add" replaces rather than appends.
 * Modelling it as a list would invite questions nobody has an answer for --
 * two websites on one order? two deposits? -- and the checkout, the order
 * record and the project brief all assume one build.
 *
 * State lives in localStorage. It is display convenience only: the order that
 * actually matters is created server-side at checkout, and the amount charged
 * comes from the Square payment link, not from anything here. Tampering with
 * the stored value changes what the customer sees, never what they pay.
 */
(function () {
  'use strict';

  var KEY = 'lts-cart';
  var catalog = window.LTS_PLANS;
  if (!catalog) return;

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      // Validate against the catalog rather than trusting what's stored --
      // a stale key from a renamed tier must not render as a blank line item.
      return v && v.planKey && catalog.getPlan(v.planKey) ? v : null;
    } catch (e) { return null; }
  }

  function write(v) {
    try {
      if (v) localStorage.setItem(KEY, JSON.stringify(v));
      else localStorage.removeItem(KEY);
    } catch (e) { /* private mode -- cart just won't persist */ }
    render();
    document.dispatchEvent(new CustomEvent('lts:cart-changed', { detail: read() }));
  }

  function add(planKey) {
    if (!catalog.getPlan(planKey)) return false;
    write({ planKey: planKey, addedAt: Date.now() });
    return true;
  }

  function clear() { write(null); }

  /* ---- header badge ---- */

  function render() {
    var cart = read();
    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = cart ? '1' : '';
      el.hidden = !cart;
    });
    document.querySelectorAll('[data-cart-link]').forEach(function (el) {
      el.hidden = !cart;
    });
    // Buttons flip to "In your cart" so the page reflects state without a reload.
    document.querySelectorAll('[data-add-to-cart]').forEach(function (btn) {
      var mine = cart && cart.planKey === btn.getAttribute('data-add-to-cart');
      btn.classList.toggle('is-in-cart', !!mine);
      var label = btn.querySelector('[data-cart-label]') || btn;
      label.textContent = mine ? 'In your cart ✓' : (btn.getAttribute('data-label-default') || label.textContent);
    });
  }

  /* ---- wiring ---- */

  document.addEventListener('click', function (e) {
    var add_ = e.target.closest && e.target.closest('[data-add-to-cart]');
    if (add_) {
      e.preventDefault();
      var key = add_.getAttribute('data-add-to-cart');
      if (add(key)) {
        var next = add_.getAttribute('data-then');
        if (next) window.location.href = next;
      }
      return;
    }
    var rm = e.target.closest && e.target.closest('[data-cart-remove]');
    if (rm) { e.preventDefault(); clear(); }
  });

  // Another tab changed the cart.
  window.addEventListener('storage', function (e) { if (e.key === KEY) render(); });

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-add-to-cart]').forEach(function (btn) {
      var label = btn.querySelector('[data-cart-label]') || btn;
      if (!btn.getAttribute('data-label-default')) btn.setAttribute('data-label-default', label.textContent.trim());
    });
    render();
  });

  window.LTS_CART = { read: read, add: add, clear: clear, render: render };
})();
