/* Website Subscription checkout helper.
 *
 * Signing up is two Square checkouts -- a one-off deposit, then the monthly
 * plan -- because Square Payment Links only support a single paid phase, so
 * a deposit and a recurring charge can't live on one link. The failure mode
 * that creates is obvious and expensive: someone pays the deposit, the Square
 * tab takes their attention, and they never come back for step 2. We've taken
 * their money and started nothing.
 *
 * So: when a deposit button is clicked we remember it, and when the visitor
 * comes back to this tab we put step 2 in front of them with the right link
 * already filled in. Clicking the matching subscribe button clears it.
 *
 * Deliberately does NOT disable or gate step 2 -- someone may have paid their
 * deposit by invoice, or be resuming days later. It only ever adds a prompt.
 */
(function () {
  'use strict';

  var KEY = 'lts-subscription-deposit';
  var MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14; // a fortnight; after that it's stale, not helpful

  var reminder = document.getElementById('step2Reminder');
  var link = document.getElementById('step2Link');
  var dismiss = document.getElementById('step2Dismiss');
  var buttons = document.querySelectorAll('[data-sub-step]');
  if (!reminder || !link || !buttons.length) return;

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (!v || !v.tier || !v.at) return null;
      if (Date.now() - v.at > MAX_AGE_MS) { localStorage.removeItem(KEY); return null; }
      return v;
    } catch (e) { return null; }
  }

  function write(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode -- prompt just won't persist */ }
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  function subscribeLinkFor(tier) {
    var el = document.querySelector('[data-sub-step="subscribe"][data-sub-tier="' + tier + '"]');
    return el ? el.getAttribute('href') : null;
  }

  function render() {
    var state = read();
    if (!state) { reminder.hidden = true; return; }
    var href = subscribeLinkFor(state.tier);
    if (!href) { reminder.hidden = true; return; }
    link.setAttribute('href', href);
    link.textContent = 'Finish: start ' + state.tier + (state.monthly ? ' at ' + state.monthly + '/month' : '');
    reminder.hidden = false;
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var step = btn.getAttribute('data-sub-step');
      var tier = btn.getAttribute('data-sub-tier');
      if (step === 'deposit') {
        write({ tier: tier, monthly: btn.getAttribute('data-sub-monthly') || '', at: Date.now() });
        // The Square tab takes focus; show the prompt now so it's already
        // waiting when they come back rather than appearing under them.
        setTimeout(render, 400);
      } else if (step === 'subscribe') {
        clear();
        reminder.hidden = true;
      }
    });
  });

  if (dismiss) {
    dismiss.addEventListener('click', function () { clear(); reminder.hidden = true; });
  }

  // Coming back from the Square tab is a visibility change, not a page load.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) render();
  });
  window.addEventListener('pageshow', render);

  render();
})();
