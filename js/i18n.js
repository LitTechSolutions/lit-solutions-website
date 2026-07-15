// i18n.js -- site-wide language switcher and translation engine.
//
// Every page carries the same .lang-bar dropdown (see header markup) and
// includes this script. Translations live in /i18n/{code}.json, keyed by
// dot-path strings matching each element's data-i18n attribute:
//   data-i18n="nav.about"          -> sets textContent
//   data-i18n-html="veteran.lede"  -> sets innerHTML (string contains tags)
//   data-i18n-attr-placeholder="contact.name_placeholder" -> sets that attribute
// English is the document's native language -- selecting "en" just clears
// back to whatever's already in the HTML, no fetch needed. Every other
// language fetches its JSON once per page load and applies it. The choice
// is remembered in localStorage so it carries across full page navigations
// on this multi-page (non-SPA) site.

(function () {
  var STORAGE_KEY = 'lts-lang';

  var LANGS = [
    { code: 'en', label: 'ENG', name: 'English' },
    { code: 'es', label: 'ESP', name: 'Español' },
    { code: 'fr', label: 'FRA', name: 'Français' },
    { code: 'zh', label: 'ZH', name: '中文' },
    { code: 'ja', label: 'JPN', name: '日本語' },
    { code: 'vi', label: 'VIE', name: 'Tiếng Việt' },
    { code: 'tl', label: 'FIL', name: 'Filipino' },
    { code: 'ar', label: 'ARA', name: 'العربية' },
    { code: 'ko', label: 'KOR', name: '한국어' },
    { code: 'de', label: 'GER', name: 'Deutsch' },
    { code: 'ht', label: 'HAT', name: 'Kreyòl Ayisyen' },
    { code: 'pt', label: 'POR', name: 'Português' },
    { code: 'ru', label: 'RUS', name: 'Русский' },
    { code: 'it', label: 'ITA', name: 'Italiano' },
    { code: 'pl', label: 'POL', name: 'Polski' },
    { code: 'hi', label: 'HIN', name: 'हिन्दी' },
  ];
  var RTL_LANGS = { ar: true };

  function getSavedLang() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      return LANGS.some(function (l) { return l.code === saved; }) ? saved : 'en';
    } catch (e) {
      return 'en';
    }
  }

  function setSavedLang(code) {
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* private browsing, etc. -- ignore */ }
  }

  function applyDirAndHtmlLang(code) {
    document.documentElement.lang = code;
    document.documentElement.dir = RTL_LANGS[code] ? 'rtl' : 'ltr';
  }

  function getByPath(dict, path) {
    var parts = path.split('.');
    var cur = dict;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return typeof cur === 'string' ? cur : undefined;
  }

  // Legal copy remains in its reviewed English source unless and until
  // each translation receives equivalent review. Navigation around it may
  // still translate; the nested lang/dir attributes keep the document's
  // actual language explicit for browsers and assistive technology.
  function isEnglishOnlyLegal(el) {
    return !!el.closest('[data-legal-english-only]');
  }

  function applyDict(dict) {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      if (isEnglishOnlyLegal(el)) return;
      var val = getByPath(dict, el.getAttribute('data-i18n'));
      if (val !== undefined) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      if (isEnglishOnlyLegal(el)) return;
      var val = getByPath(dict, el.getAttribute('data-i18n-html'));
      if (val !== undefined) el.innerHTML = val;
    });
    Array.prototype.forEach.call(document.querySelectorAll('*'), function (el) {
      if (isEnglishOnlyLegal(el)) return;
      for (var i = 0; i < el.attributes.length; i++) {
        var attr = el.attributes[i];
        if (attr.name.indexOf('data-i18n-attr-') === 0) {
          var targetAttr = attr.name.slice('data-i18n-attr-'.length);
          var val = getByPath(dict, attr.value);
          if (val !== undefined) el.setAttribute(targetAttr, val);
        }
      }
    });
  }

  // Reverts every tagged element back to its original (English) text --
  // used when switching back to English, since the base HTML already IS
  // the English copy and there's nothing to fetch/apply.
  var originals = null;
  function captureOriginals() {
    originals = { text: [], html: [], attr: [] };
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      if (isEnglishOnlyLegal(el)) return;
      originals.text.push([el, el.textContent]);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      if (isEnglishOnlyLegal(el)) return;
      originals.html.push([el, el.innerHTML]);
    });
    Array.prototype.forEach.call(document.querySelectorAll('*'), function (el) {
      if (isEnglishOnlyLegal(el)) return;
      for (var i = 0; i < el.attributes.length; i++) {
        var attr = el.attributes[i];
        if (attr.name.indexOf('data-i18n-attr-') === 0) {
          var targetAttr = attr.name.slice('data-i18n-attr-'.length);
          originals.attr.push([el, targetAttr, el.getAttribute(targetAttr)]);
        }
      }
    });
  }
  function restoreOriginals() {
    if (!originals) return;
    originals.text.forEach(function (pair) { pair[0].textContent = pair[1]; });
    originals.html.forEach(function (pair) { pair[0].innerHTML = pair[1]; });
    originals.attr.forEach(function (t) { t[0].setAttribute(t[1], t[2]); });
  }

  var dictCache = {};
  function loadDict(code) {
    if (dictCache[code]) return Promise.resolve(dictCache[code]);
    return fetch('i18n/' + code + '.json')
      .then(function (r) { if (!r.ok) throw new Error('fetch failed: ' + r.status); return r.json(); })
      .then(function (json) { dictCache[code] = json; return json; });
  }

  function setActiveOption(code) {
    var lang = LANGS.filter(function (l) { return l.code === code; })[0] || LANGS[0];
    document.querySelectorAll('.lang-option').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.lang === code);
    });
    var label = document.getElementById('langCurrentLabel');
    if (label) label.textContent = lang.label;
  }

  // Current active dict (null for English -- there's nothing to look up,
  // the native HTML/JS defaults are already English). Exposed via
  // window.LTS_I18N so scripts that generate their own DOM content (the
  // Website Designer catalog/preview text, which isn't static HTML and so
  // can't carry a data-i18n attribute) can translate what they render and
  // re-render when the visitor switches language mid-session.
  var activeDict = null;
  var activeCode = 'en';

  function notifyLangChange(code, dict) {
    document.dispatchEvent(new CustomEvent('lts:langchange', { detail: { code: code, dict: dict } }));
  }

  function switchLanguage(code) {
    if (!originals) captureOriginals();
    applyDirAndHtmlLang(code);
    setActiveOption(code);
    activeCode = code;
    if (code === 'en') {
      activeDict = null;
      restoreOriginals();
      notifyLangChange(code, null);
      return;
    }
    loadDict(code)
      .then(function (dict) {
        activeDict = dict;
        applyDict(dict);
        notifyLangChange(code, dict);
      })
      .catch(function (err) {
        console.error('i18n: could not load language "' + code + '"', err);
      });
  }

  // t(path, fallback) -- looks up `path` in the active language's dict,
  // falling back to the given English string when there's no active dict
  // (English selected) or the key is missing (translation not added yet).
  window.LTS_I18N = {
    t: function (path, fallback) {
      if (!activeDict) return fallback;
      var val = getByPath(activeDict, path);
      return val !== undefined ? val : fallback;
    },
    getCode: function () { return activeCode; },
  };

  document.addEventListener('DOMContentLoaded', function () {
    var saved = getSavedLang();
    applyDirAndHtmlLang(saved);
    setActiveOption(saved);
    activeCode = saved;
    if (saved !== 'en') {
      captureOriginals();
      loadDict(saved).then(function (dict) {
        activeDict = dict;
        applyDict(dict);
        notifyLangChange(saved, dict);
      }).catch(function (err) {
        console.error('i18n: could not load saved language "' + saved + '"', err);
      });
    }

    document.querySelectorAll('.lang-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var code = btn.dataset.lang;
        setSavedLang(code);
        switchLanguage(code);
        var menu = btn.closest('.nav-dropdown-menu');
        var toggle = btn.closest('.nav-dropdown')?.querySelector('.nav-dropdown-toggle');
        if (menu) menu.classList.remove('is-open');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      });
    });
  });
})();
