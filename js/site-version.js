// Single source of truth for the "Website Version" footer string (F034).
// No build step exists for this site, so every page still needs the
// <span id="siteVersion"></span> placeholder and this script tag -- but a
// release now only means editing SITE_VERSION here once, instead of
// hand-sweeping the literal string across all 33 public page footers.
window.SITE_VERSION = "4.0.0";

document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('siteVersion');
  if (el) el.textContent = window.SITE_VERSION;
});
