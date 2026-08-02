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
})();
