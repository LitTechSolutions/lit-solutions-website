/* The account control in the site header.
 *
 * Before this, every page showed the same anonymous person icon whether you
 * were signed in or not, linking to myaccount.html. So a signed-in customer
 * had no way to tell they were signed in, no route to their documents or
 * messages without going via the dashboard, and nowhere obvious to sign out.
 * Given that buying anything now requires an account, that was the least
 * finished part of the site.
 *
 * Signed out: a plain "Sign in" link.
 * Signed in:  the customer's first name, with a menu.
 *
 * The session is fetched once and cached in sessionStorage for a minute, so
 * moving between pages doesn't fire a request per page load. It's display
 * state only -- every endpoint re-checks the real cookie -- so a stale cache
 * can make the header briefly wrong, never make anything unauthorised
 * possible. Signing out clears it immediately, and any 401 anywhere clears it
 * too.
 */
(function () {
  'use strict';

  var CACHE_KEY = 'lts-account-cache';
  var CACHE_MS = 60 * 1000;

  var host = document.getElementById('accountNav');
  if (!host) return;

  /* ---- session, cached briefly ---- */

  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (!v || typeof v.at !== 'number' || Date.now() - v.at > CACHE_MS) return null;
      return v;
    } catch (e) { return null; }
  }

  function writeCache(user) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), user: user })); } catch (e) {}
  }

  function clearCache() {
    try { sessionStorage.removeItem(CACHE_KEY); } catch (e) {}
  }
  window.LTS_ACCOUNT_CLEAR = clearCache;

  async function loadUser() {
    var cached = readCache();
    if (cached) return cached.user;
    try {
      var res = await fetch('/.netlify/functions/account', { credentials: 'same-origin' });
      if (!res.ok) { writeCache(null); return null; }
      var body = await res.json();
      var user = (body && body.user) || null;
      writeCache(user);
      return user;
    } catch (e) {
      return null; // offline: leave the header in its neutral state
    }
  }

  /* ---- rendering ---- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function firstName(name) {
    var n = String(name || '').trim().split(/\s+/)[0];
    return n || 'Account';
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  var PERSON_ICON =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

  function renderSignedOut() {
    host.innerHTML =
      '<a href="myaccount.html#signin" class="account-signin" title="Client sign in">' +
        PERSON_ICON + '<span>Sign in</span>' +
      '</a>';
  }

  function renderSignedIn(user) {
    var isAdmin = user.role === 'admin';
    var links = isAdmin
      ? [['#dashboard', 'Dashboard'], ['#heroqueue', 'Verify Heroes'], ['#stripe', 'Stripe setup'],
         ['#documents', 'Documents'], ['#messages', 'Messages'], ['#profile', 'Account settings']]
      : [['#dashboard', 'Dashboard'], ['#brief', 'Project brief'], ['#documents', 'Documents'],
         ['#messages', 'Messages'], ['#hero', 'Heroes Discount'], ['#profile', 'Account settings']];

    host.innerHTML =
      '<div class="account-menu">' +
        '<button type="button" class="account-trigger" id="accountTrigger" aria-expanded="false" aria-haspopup="true" aria-controls="accountDrop">' +
          '<span class="account-avatar" aria-hidden="true">' + esc(initials(user.name)) + '</span>' +
          '<span class="account-name">' + esc(firstName(user.name)) + '</span>' +
          '<svg class="account-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>' +
        '<div class="account-drop" id="accountDrop" hidden>' +
          '<p class="account-drop-head">' +
            '<strong>' + esc(user.name || 'Your account') + '</strong>' +
            '<span>' + esc(user.email || '') + '</span>' +
          '</p>' +
          '<nav class="account-drop-links" aria-label="Account">' +
            links.map(function (l) {
              return '<a href="myaccount.html' + l[0] + '">' + esc(l[1]) + '</a>';
            }).join('') +
          '</nav>' +
          '<button type="button" class="account-drop-signout" id="accountSignOut">Sign out</button>' +
        '</div>' +
      '</div>';

    wireMenu();
  }

  function wireMenu() {
    var trigger = document.getElementById('accountTrigger');
    var drop = document.getElementById('accountDrop');
    if (!trigger || !drop) return;

    function close() {
      drop.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
    function open() {
      drop.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (drop.hidden) open(); else close();
    });

    // Click anywhere else, or Escape, closes it -- the two things people
    // actually try when a menu is in the way.
    document.addEventListener('click', function (e) {
      if (!drop.hidden && !drop.contains(e.target) && e.target !== trigger) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !drop.hidden) { close(); trigger.focus(); }
    });

    document.getElementById('accountSignOut').addEventListener('click', async function () {
      clearCache();
      try { await fetch('/.netlify/functions/auth-logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) {}
      // Back to the page they were on, signed out, rather than dumped on a
      // sign-in form with no context.
      window.location.href = 'index.html';
    });
  }

  /* ---- go ---- */

  loadUser().then(function (user) {
    if (user) renderSignedIn(user); else renderSignedOut();
    host.removeAttribute('data-loading');
  });
})();
