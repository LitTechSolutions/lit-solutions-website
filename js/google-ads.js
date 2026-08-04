/* Privacy-aware Google Ads measurement.
 *
 * Consent starts denied. The tag can retain an ad click and attribute a later
 * verified purchase only after the visitor chooses "Allow measurement" in the
 * site notice. Enhanced conversions and ad personalization remain disabled;
 * customer names and email addresses are never sent to Google by this code.
 */
(function () {
  'use strict';

  var TAG_ID = 'AW-18337968564';
  var CONSENT_KEY = 'lts-ads-measurement-consent';
  var choice = '';
  try { choice = localStorage.getItem(CONSENT_KEY) || ''; } catch (e) {}

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  window.gtag('consent', 'default', {
    ad_storage: choice === 'granted' ? 'granted' : 'denied',
    analytics_storage: choice === 'granted' ? 'granted' : 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500,
  });
  window.gtag('js', new Date());
  window.gtag('config', TAG_ID, {
    allow_ad_personalization_signals: false,
    allow_google_signals: false,
  });

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(TAG_ID);
  script.setAttribute('data-lts-google-tag', TAG_ID);
  document.head.appendChild(script);

  window.LTS_ADS_CONSENT = function (allowMeasurement) {
    var next = allowMeasurement ? 'granted' : 'denied';
    try { localStorage.setItem(CONSENT_KEY, next); } catch (e) {}
    window.gtag('consent', 'update', {
      ad_storage: next,
      analytics_storage: next,
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    return next;
  };

  window.LTS_ADS_CONSENT_VALUE = function () {
    try { return localStorage.getItem(CONSENT_KEY) || ''; } catch (e) { return ''; }
  };

  // Privacy-safe conversion events. These intentionally contain no names,
  // email addresses, phone numbers, free-form messages, or query strings.
  // Consent Mode remains authoritative: when measurement is denied, Google
  // receives no advertising-storage permission even though the local event
  // is still visible in dataLayer for testing and debugging.
  var TRACKABLE_EVENTS = ['phone_click', 'text_click', 'cta_click', 'form_submit'];
  var TRACKABLE_FIELDS = ['cta_name', 'form_name', 'funnel', 'link_destination'];

  function safeValue(value) {
    return String(value || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 80);
  }

  window.LTS_TRACK = function (eventName, details) {
    if (TRACKABLE_EVENTS.indexOf(eventName) === -1) return false;
    var params = {
      page_path: window.location.pathname,
      funnel: safeValue((details && details.funnel) || (document.body && document.body.dataset.funnel) || 'general'),
    };
    TRACKABLE_FIELDS.forEach(function (field) {
      if (details && details[field]) params[field] = safeValue(details[field]);
    });
    window.dataLayer.push(Object.assign({ event: 'lts_conversion', conversion_event: eventName }, params));
    window.gtag('event', eventName, params);
    return true;
  };

  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!link) return;
    var href = link.getAttribute('href') || '';
    var ctaName = link.dataset.trackLabel || '';
    if (href.indexOf('tel:') === 0) {
      window.LTS_TRACK('phone_click', { cta_name: ctaName, link_destination: 'phone' });
    } else if (href.indexOf('sms:') === 0) {
      window.LTS_TRACK('text_click', { cta_name: ctaName, link_destination: 'sms' });
    } else if (link.hasAttribute('data-track-cta')) {
      window.LTS_TRACK('cta_click', { cta_name: ctaName || 'primary_cta', link_destination: 'form' });
    }
  });
})();
