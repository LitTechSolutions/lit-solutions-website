document.addEventListener('DOMContentLoaded', () => {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const match = window.location.hash.match(/^#ref=(.+)$/);
  if (!match) return;

  history.replaceState(null, '', window.location.pathname + window.location.search);

  let ref;
  try {
    ref = decodeURIComponent(match[1]);
  } catch (e) {
    return; // malformed fragment (e.g. a hand-edited link) -- just skip the reference note
  }

  const refNote = document.getElementById('refNote');
  const refId = document.getElementById('refId');
  if (refNote && refId) {
    refId.textContent = ref;
    refNote.hidden = false;
  }
});
