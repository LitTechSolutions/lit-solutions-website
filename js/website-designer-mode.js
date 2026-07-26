/* Website Designer: buy-outright vs. subscribe fork.
 *
 * Sits in front of the configurator rather than inside it. The two routes are
 * different products -- a one-off build the client owns, and a fixed monthly
 * bundle we own and host -- so the subscription side has no feature picker at
 * all. Bolting a payment toggle onto the estimate would have implied you can
 * assemble a subscription feature-by-feature, which isn't how it's sold.
 *
 * Kept out of js/website-designer.js on purpose: that file owns the step
 * machine and the pricing math that the test suite covers, and none of this
 * needs to touch either.
 */
(function () {
  'use strict';

  var choice = document.getElementById('wdModeChoice');
  var subscribePanel = document.getElementById('wdSubscribePanel');
  var stepsRow = document.getElementById('wdStepsRow');
  var configurator = document.getElementById('wdConfigurator');
  if (!choice || !subscribePanel || !stepsRow || !configurator) return;

  // Same key js/website-designer.js writes its in-progress quote to. If one
  // exists, the visitor is mid-quote and has already chosen -- don't make
  // them pick again.
  var WD_DRAFT_KEY = 'lts-wd-draft';

  function show(el, on) {
    if (el) el.hidden = !on;
  }

  function setMode(mode, opts) {
    var silent = opts && opts.silent;
    show(choice, mode === null);
    show(subscribePanel, mode === 'subscribe');
    show(stepsRow, mode === 'buy');
    show(configurator, mode === 'buy');

    if (silent) return;

    // Move focus and scroll to whatever just appeared, so keyboard and
    // screen-reader users aren't left on a control that's now hidden.
    var target = mode === 'subscribe' ? subscribePanel : (mode === 'buy' ? configurator : choice);
    if (!target) return;
    var heading = target.querySelector('h2, h1');
    if (heading) {
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  // Where "back" should return to. Someone who reached the plans from a
  // half-built quote wants their quote back, not the opening chooser.
  var previous = null;

  document.querySelectorAll('[data-wd-mode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var mode = btn.getAttribute('data-wd-mode');
      if (mode === 'reset') {
        setMode(previous === 'buy' ? 'buy' : null);
        previous = null;
        return;
      }
      if (mode === 'subscribe') previous = configurator.hidden ? null : 'buy';
      setMode(mode);
    });
  });

  var hasDraft = false;
  try { hasDraft = !!sessionStorage.getItem(WD_DRAFT_KEY); } catch (e) { /* private mode */ }

  // ?plan=subscribe / #subscribe lets Pricing and the service pages link
  // straight at the plans without a stop on the chooser.
  var wantsSubscribe = /(^|[?&])plan=subscribe\b/.test(location.search) || location.hash === '#subscribe';

  if (hasDraft) setMode('buy', { silent: true });
  else if (wantsSubscribe) setMode('subscribe', { silent: true });
  else setMode(null, { silent: true });
})();
