// design-submitted.js -- the Website Designer's quick-quote success
// destination. A real, stable page (not an inline panel swap) so it can
// serve as a Google Ads conversion-tracking URL: it only ever loads after
// js/website-designer.js's quick-form handler gets a real 201 back from
// the server and redirects here, so a page load here reliably means a
// quote request was actually received.
//
// Reads the same "#resume=<quickLeadId>.<token>" URL fragment
// website-project-brief.html uses (never a query string, never sent to
// the server) so this page can still offer the optional full project
// worksheet -- the one thing the old inline "prompt" panel in
// website-designer.html did that a plain static thank-you page couldn't.
document.addEventListener('DOMContentLoaded', () => {
  const promptState = document.getElementById('dsPrompt');
  const worksheetOpenedState = document.getElementById('dsWorksheetOpened');
  const noReferenceState = document.getElementById('dsNoReference');
  const referenceNote = document.getElementById('dsReferenceNote');
  const submissionIdEl = document.getElementById('dsSubmissionId');
  const openBtn = document.getElementById('dsOpenWorksheetBtn');
  const openAgainBtn = document.getElementById('dsOpenWorksheetAgainBtn');
  const fallback = document.getElementById('dsWorksheetFallback');
  const fallbackLink = document.getElementById('dsWorksheetFallbackLink');

  function showState(el) {
    [promptState, worksheetOpenedState, noReferenceState].forEach((s) => { if (s) s.hidden = s !== el; });
    if (el) el.querySelector('h1')?.focus?.();
  }

  function readResumeFromFragment() {
    const hash = window.location.hash || '';
    const match = /^#resume=(.+)$/.exec(hash);
    if (!match) return null;
    let decoded;
    try { decoded = decodeURIComponent(match[1]); } catch (e) { return null; }
    const dot = decoded.indexOf('.');
    if (dot <= 0 || dot === decoded.length - 1) return null;
    return { quickLeadId: decoded.slice(0, dot), token: decoded.slice(dot + 1) };
  }

  const resume = readResumeFromFragment();
  // Strip the token out of the visible/bookmarkable URL immediately, same
  // as website-project-brief.js -- it should never linger in browser
  // history or get shared if this tab's URL is copied.
  if (resume) history.replaceState(null, '', window.location.pathname + window.location.search);

  if (!resume) {
    showState(noReferenceState);
    return;
  }

  if (referenceNote && submissionIdEl) {
    submissionIdEl.textContent = resume.quickLeadId;
    referenceNote.hidden = false;
  }
  showState(promptState);

  function worksheetUrl() {
    return 'website-project-brief.html#resume=' + encodeURIComponent(resume.quickLeadId + '.' + resume.token);
  }

  // Same Safari popup-detection handling as website-designer.js's
  // openWorksheet() -- see that file's comment for why a plain truthiness
  // check on window.open()'s return value isn't sufficient.
  function openWorksheet() {
    const url = worksheetUrl();
    const win = window.open(url, '_blank');
    if (!win || win.closed || typeof win.closed === 'undefined') {
      if (fallbackLink) fallbackLink.href = url;
      if (fallback) fallback.hidden = false;
      return;
    }
    try { win.opener = null; } catch (e) { /* best-effort hardening only */ }
    if (fallback) fallback.hidden = true;
    showState(worksheetOpenedState);
  }

  openBtn?.addEventListener('click', openWorksheet);
  openAgainBtn?.addEventListener('click', openWorksheet);
});
