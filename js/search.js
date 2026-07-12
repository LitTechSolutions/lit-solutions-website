// Site-wide search (REQ-37/38) — client-side filter over search-index.json,
// since this is a static site with no server to query. Loaded only on
// search.html.
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('searchForm');
  const input = document.getElementById('searchInput');
  const status = document.getElementById('search-status');
  const list = document.getElementById('search-results');
  const filterBar = document.getElementById('searchFilterBar');
  if (!form || !input || !list) return;

  const params = new URLSearchParams(window.location.search);
  const initialQuery = params.get('q') || '';
  input.value = initialQuery;

  let activeScope = 'All';
  let index = [];

  const render = () => {
    const q = input.value.trim().toLowerCase();
    const matches = index.filter(item => {
      const inScope = activeScope === 'All' || item.scope === activeScope;
      const text = (item.title + ' ' + item.excerpt).toLowerCase();
      return inScope && (!q || text.includes(q));
    });
    status.textContent = q || activeScope !== 'All'
      ? `${matches.length} result${matches.length === 1 ? '' : 's'}`
      : `Showing all ${matches.length} pages`;
    list.innerHTML = '';
    matches.forEach(item => {
      const li = document.createElement('li');
      li.className = 'search-result-item';
      li.innerHTML = `<span class="search-result-scope">${item.scope}</span>
        <h3><a href="${item.href}">${item.title}</a></h3>
        <p>${item.excerpt}</p>`;
      list.appendChild(li);
    });
  };

  fetch('search-index.json')
    .then(r => r.json())
    .then(data => { index = data; render(); })
    .catch(() => { status.textContent = "Search index couldn't be loaded. Please try again or use the site menu."; });

  form.addEventListener('submit', (e) => { e.preventDefault(); render(); });
  input.addEventListener('input', () => render());

  if (filterBar) {
    filterBar.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        filterBar.querySelectorAll('button').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        activeScope = btn.dataset.scope;
        render();
      });
    });
  }

  // Saved searches (REQ-40) -- only offered to signed-in customers; the
  // button stays hidden for anonymous visitors instead of erroring on click.
  const saveBtn = document.getElementById('saveSearchBtn');
  const signInLink = document.getElementById('signInToSaveLink');
  const saveStatus = document.getElementById('saveSearchStatus');
  if (saveBtn) {
    fetch('/.netlify/functions/account', { credentials: 'same-origin' })
      .then(r => r.ok ? saveBtn.hidden = false : (signInLink.style.display = ''))
      .catch(() => {});

    saveBtn.addEventListener('click', () => {
      const q = input.value.trim();
      if (!q) { saveStatus.textContent = 'Type something to search first.'; return; }
      const href = 'search.html?q=' + encodeURIComponent(q);
      fetch('/.netlify/functions/favorites', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-search', query: q, href: href }),
      })
        .then(r => r.json().then(body => ({ ok: r.ok, body })))
        .then(({ ok, body }) => { saveStatus.textContent = (body && (body.message || body.error)) || (ok ? 'Saved.' : 'Could not save.'); })
        .catch(() => { saveStatus.textContent = 'Could not reach the server.'; });
    });
  }
});
