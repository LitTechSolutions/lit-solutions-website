// website-designer.js -- LTS Website Designer configurator.
//
// Two steps: pick a package, then customize by choosing bundles (each
// bundle groups several related feature categories at one flat price --
// there is no way to buy an individual feature on its own) before
// submitting customer details. Submission generates a PDF client-side
// (jsPDF) and posts it -- along with the structured selection data -- to
// the website-designer Netlify Function, which emails Dylan the PDF and
// persists a lead record.
//
// Feature catalog (starter-catalog.json / business-catalog.json) is
// generated directly from feature_manifest.json, so category/title/price
// data here can never drift from the actual build spec. Per-feature prices
// are Dylan's starting estimates -- genuinely adjustable, but real numbers
// so a bundle's price means something. Premium (S-tier) items never get a
// price -- always "custom quote," per the reference spec's own
// non-negotiable rule; they're listed individually as Custom Add-Ons,
// since they were never part of bundle pricing to begin with.
//
// Bundles group several of the catalog's original categories under one
// customer-facing name (BUNDLE_GROUPS below) at a flat price equal to 90%
// of the sum of their priced items -- the old "select every item in a
// category, save 10%" mechanic, just always-on now that there's no other
// way to buy, so it's presented as the normal price rather than a
// discount. Selecting a bundle checks every one of its underlying
// (hidden) feature checkboxes at once; the pricing math below still
// operates on those same checkboxes, so it works identically to before.

document.addEventListener('DOMContentLoaded', () => {
  const steps = document.querySelectorAll('.wd-step');
  const panels = document.querySelectorAll('.wd-panel');
  const includedSummary = document.getElementById('wdIncludedSummary');
  const includedTitle = document.getElementById('wdIncludedTitle');
  const bundleTilesContainer = document.getElementById('wdBundleTiles');
  const customRequestEl = document.getElementById('wdCustomRequest');
  const quickFormStatus = document.getElementById('wdCheckoutStatus');
  const wdWorksheetFallbackLink = document.getElementById('wdWorksheetFallbackLink');

  const priceAmountEl = document.getElementById('wdPriceAmount');
  const priceSavingsEl = document.getElementById('wdPriceSavings');
  const priceNoteEl = document.getElementById('wdPriceNote');
  const featureCountEl = document.getElementById('wdFeatureCount');
  const quoteRecapAmountEl = document.getElementById('wdQuoteRecapAmount');
  const businessNameEl = document.getElementById('wdBusinessName');
  const quoteRecapBreakdownEl = document.getElementById('wdQuoteRecapBreakdown');
  const downloadBtn = document.getElementById('wdDownloadPdf');
  const pdfErrorEl = document.getElementById('wdPdfError');
  const reviewSubmitBtn = document.getElementById('wdReviewSubmitBtn');
  const priceBarEl = document.getElementById('wdPriceBar');
  const launchBannerEl = document.getElementById('wdLaunchBanner');

  // Keeps --wd-price-bar-height (css/style.css) equal to the sticky price
  // bar's real rendered height at all times, so the page's bottom padding
  // (and the cookie banner's clearance above the bar) stay correct as its
  // content changes size -- same technique this tool has always used for
  // its sticky bar, just now there's only one bar instead of a separate
  // sidebar-footer + mobile-bar pair.
  function syncPriceBarHeight() {
    if (priceBarEl) document.documentElement.style.setProperty('--wd-price-bar-height', `${priceBarEl.offsetHeight}px`);
  }
  if (priceBarEl && 'ResizeObserver' in window) {
    new ResizeObserver(syncPriceBarHeight).observe(priceBarEl);
  }
  window.addEventListener('resize', syncPriceBarHeight);

  // Launch banner: a <details> disclosure (see website-designer.html) --
  // collapsed by default at or below 600px so it doesn't push the actual
  // configurator out of the first viewport, expanded by default above
  // that. Only forced open/closed when the breakpoint is actually crossed
  // (matchMedia's "change" event), never on every resize tick, so a
  // customer who's manually toggled it isn't fought on an unrelated
  // resize that doesn't cross 600px.
  const collapseLaunchBannerQuery = window.matchMedia('(max-width: 600px)');
  function applyLaunchBannerCollapse(isNarrow) {
    if (!launchBannerEl) return;
    if (isNarrow) launchBannerEl.removeAttribute('open');
    else launchBannerEl.setAttribute('open', '');
  }
  applyLaunchBannerCollapse(collapseLaunchBannerQuery.matches);
  collapseLaunchBannerQuery.addEventListener('change', (e) => applyLaunchBannerCollapse(e.matches));

  // jsPDF is loaded via a blocking <script src> (vendored locally, see
  // assets/vendor/jspdf/) before this file, so by the time this line runs
  // window.jspdf is either fully present or the load genuinely failed --
  // there's no async "still loading" state to account for here.
  const JSPDF_READY = !!(window.jspdf && typeof window.jspdf.jsPDF === 'function');
  const startOverBtn = document.getElementById('wdStartOver');
  const HEROES_DISCOUNT_RATE = 0.15; // 15% off one-time work -- matches heroes-pricing.html
  const BUNDLE_DISCOUNT_RATE = 0.10; // baked into every bundle's flat price -- see header comment
  const BUNDLE_MIN_ITEMS = 1; // every category in a purchased bundle counts, even a 1-item one --
  // there's no more "customer partially completes a category" concept once
  // bundles (not individual features) are the only way to buy.

  // Groups the catalog's original categories into customer-facing bundles.
  // Combines categories that make sense to buy together (e.g. a full user
  // account system) so there are a handful of clear choices instead of 21+
  // individual categories. A bundle only renders if it has at least one
  // priced item in the active tier's catalog (see renderBundleTiles) --
  // e.g. Accounts & Personalization has no priced Starter items, so it
  // simply doesn't appear for that tier.
  const BUNDLE_GROUPS = [
    { key: 'pages-content', name: 'Pages & Content', categories: ['Core Pages', 'Content Management', 'Media Management'] },
    { key: 'design-nav', name: 'Design & Navigation', categories: ['Design & Branding', 'Navigation', 'Search'] },
    { key: 'forms-comm', name: 'Forms & Communication', categories: ['Forms & Validation', 'Contact & Communication', 'Notifications', 'Booking & Scheduling'] },
    { key: 'accounts-personalization', name: 'Accounts & Personalization', categories: ['User Accounts', 'Account Management', 'Personalization'] },
    { key: 'seo-reviews', name: 'SEO & Reviews', categories: ['SEO & Analytics', 'Reviews & Ratings'] },
    { key: 'security-privacy', name: 'Security & Privacy', categories: ['Security & Hosting', 'Privacy & Legal'] },
  ];

  const state = {
    package: null,
    basePrice: 0,
    displayedTotal: 0,
    catalog: null,
    // Set once the quick-quote form (step 2) is sent successfully -- the
    // resume token authorizes the standalone worksheet (opened in a new
    // tab) to fetch this lead's data back and later complete the full
    // submission. Never put in a URL query string, only a URL fragment,
    // and never logged (see netlify/functions/website-designer.js).
    quickLeadId: null,
    resumeToken: null,
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    preferredContact: '',
  };

  // ---- Draft persistence (survive an accidental refresh/navigation) --
  // Session-only (not localStorage): this brief can carry real business
  // details, so it shouldn't outlive the tab. Bumping WD_DRAFT_VERSION
  // invalidates any old saved shape rather than risk restoring into a
  // catalog/form structure that's since changed.
  const WD_DRAFT_KEY = 'lts-wd-draft';
  const WD_DRAFT_VERSION = 3; // bumped: bundle-only selection model replaces individual-feature checkboxes
  const QUICK_FORM_FIELD_IDS = [];
  let saveDraftTimer = null;

  function collectFieldValues(ids) {
    const out = {};
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) out[id] = el.value;
    });
    return out;
  }

  function saveDraftNow() {
    if (!state.package) { clearDraft(); return; }
    const draft = {
      v: WD_DRAFT_VERSION,
      package: state.package,
      checkedTitles: Array.from(document.querySelectorAll('input[data-priority]:checked')).map(el => el.dataset.title),
      heroesDiscount: heroesEligible(),
      quickLeadId: state.quickLeadId,
      resumeToken: state.resumeToken,
      customerName: state.customerName,
      customerEmail: state.customerEmail,
      customerPhone: state.customerPhone,
      preferredContact: state.preferredContact,
      fields: collectFieldValues(QUICK_FORM_FIELD_IDS),
      savedAt: Date.now(),
    };
    try { sessionStorage.setItem(WD_DRAFT_KEY, JSON.stringify(draft)); } catch (e) { /* private browsing / quota -- draft just won't survive, not fatal */ }
  }

  function saveDraft() {
    clearTimeout(saveDraftTimer);
    saveDraftTimer = setTimeout(saveDraftNow, 400);
  }

  function clearDraft() {
    try { sessionStorage.removeItem(WD_DRAFT_KEY); } catch (e) { /* ignore */ }
    if (startOverBtn) startOverBtn.hidden = true;
  }

  function loadDraft() {
    try {
      const raw = sessionStorage.getItem(WD_DRAFT_KEY);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      if (!draft || draft.v !== WD_DRAFT_VERSION || !draft.package) return null;
      return draft;
    } catch (e) {
      return null;
    }
  }

  const INCLUDED_SUMMARY_EN = {
    starter: [
      'Custom design matched to your brand', 'Mobile-responsive on every device',
      'Contact form with spam protection', 'Basic SEO (titles, descriptions, sitemap)',
      'Accessibility & performance basics', 'Home, About, Services, Contact, Legal pages',
    ],
    business: [
      'Everything in Starter', 'Up to 10 pages, including individual service pages',
      'Advanced contact / quote-request form', 'Testimonials, FAQ & blog pages (mandatory at this tier)',
      'Site-wide search', 'Newsletter signup integration',
    ],
  };

  // ---- catalog text helpers ----------------------------------------------
  // This tool builds nearly everything visible from JS (catalog JSON +
  // template strings), not static HTML. English-only -- these just pass
  // their text straight through -- but call sites stay simple either way.
  function tCatItem(title) { return title; }
  function tCatCategory(cat) { return cat; }
  function tDyn(key, fallback) { return fallback; }
  function fillTemplate(str, vars) {
    return str.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  }
  function includedSummaryItems(pkg) {
    return INCLUDED_SUMMARY_EN[pkg].map((en, i) => tDyn(`included_${pkg}_${i + 1}`, en));
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function fmtMoney(n) {
    return '$' + Math.round(n).toLocaleString();
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animatePrice(newTotal) {
    const start = state.displayedTotal;
    const delta = newTotal - start;
    // Set the correct value immediately and unconditionally -- the count-up below is a
    // pure visual bonus layered on top. requestAnimationFrame is throttled/suspended in
    // backgrounded or non-visible tabs, so the displayed price must never depend on it
    // ever firing (found in testing: rAF never ran in a headless/inactive tab, which
    // would have left the ticker stuck at a stale number).
    priceAmountEl.textContent = fmtMoney(newTotal);
    if (quoteRecapAmountEl) quoteRecapAmountEl.textContent = fmtMoney(newTotal);
    state.displayedTotal = newTotal;
    if (delta === 0 || prefersReducedMotion) return;
    const duration = 400;
    const startTime = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - startTime) / duration);
      if (state.displayedTotal !== newTotal) return; // a newer call took over -- stop
      const eased = 1 - Math.pow(1 - t, 3);
      priceAmountEl.textContent = fmtMoney(start + delta * eased);
      if (t < 1) requestAnimationFrame(tick);
      else priceAmountEl.textContent = fmtMoney(newTotal);
    }
    requestAnimationFrame(tick);
    priceAmountEl.classList.remove('wd-price-pulse');
    void priceAmountEl.offsetWidth; // restart animation
    priceAmountEl.classList.add('wd-price-pulse');
  }

  function showPanel(name) {
    panels.forEach(p => p.classList.toggle('is-active', p.dataset.panel === name));
    steps.forEach(s => {
      const stepNum = s.dataset.step;
      s.classList.toggle('is-active', stepNum === name);
      if (name === '2') s.disabled = false;
    });
    // Move focus to the new panel's heading so screen-reader/keyboard users
    // land on the new content instead of a now-hidden or stale element, and
    // scroll that panel itself into view rather than the whole page's top
    // (the tool sits well below the page's own hero/launch-banner section).
    const activePanel = document.querySelector(`.wd-panel[data-panel="${name}"]`);
    if (name === '2' && activePanel) {
      activePanel.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
    const heading = activePanel && activePanel.querySelector('h2[tabindex="-1"]');
    if (heading) heading.focus({ preventScroll: true });
    if (reviewSubmitBtn) reviewSubmitBtn.hidden = name !== '2' || !state.package;
  }

  function renderIncludedSummary() {
    const fallback = `Included in your ${state.package === 'business' ? 'Business' : 'Starter'} package`;
    includedTitle.textContent = tDyn(state.package === 'business' ? 'included_title_business' : 'included_title_starter', fallback);
    includedSummary.innerHTML = '<ul class="wd-included-list">' +
      includedSummaryItems(state.package).map(t => `<li>${escHtml(t)}</li>`).join('') + '</ul>';
  }

  // ---- Bundles ----------------------------------------------------------

  function categoryInputs(category) {
    return Array.from(document.querySelectorAll('input[data-priority="C"]')).filter(el => el.dataset.category === category);
  }

  function isCategoryBundled(category) {
    const inputs = categoryInputs(category);
    return inputs.length >= BUNDLE_MIN_ITEMS && inputs.every(i => i.checked);
  }

  // Category names (not bundle names) where every priced item is checked --
  // this is what the backend's independent recompute understands (it knows
  // the catalog's original categories, not this page's bundle groupings),
  // so it's still sent to the server exactly as before.
  function bundledCategories() {
    if (!state.catalog) return [];
    return state.catalog.categories.map(c => c.category).filter(isCategoryBundled);
  }

  function categoryCItems(category) {
    if (!state.catalog) return [];
    const cat = state.catalog.categories.find(c => c.category === category);
    return cat ? cat.items.filter(i => i.priority === 'C').map(i => ({ ...i, category })) : [];
  }

  function groupCItems(group) {
    return group.categories.flatMap(categoryCItems);
  }

  function bundlePriceFromRawSum(rawSum) {
    return Math.round(rawSum * (1 - BUNDLE_DISCOUNT_RATE));
  }

  function bundleTileEl(groupKey) {
    return bundleTilesContainer && bundleTilesContainer.querySelector(`.wd-bundle-tile[data-bundle-key="${groupKey}"]`);
  }

  function bundleGroupRawSum(group) {
    const tile = bundleTileEl(group.key);
    if (!tile) return 0;
    return Array.from(tile.querySelectorAll('input[data-priority="C"]')).reduce((s, el) => s + (Number(el.dataset.price) || 0), 0);
  }

  function bundleGroupPrice(group) {
    return bundlePriceFromRawSum(bundleGroupRawSum(group));
  }

  function isBundleSelected(group) {
    const tile = bundleTileEl(group.key);
    const cb = tile && tile.querySelector('.wd-bundle-tile-checkbox');
    return !!(cb && cb.checked);
  }

  function selectedBundleGroups() {
    return BUNDLE_GROUPS.filter(isBundleSelected);
  }

  function bundleIncludesText(items) {
    const names = items.map(i => tCatItem(i.title));
    if (names.length <= 4) return names.join(', ');
    return names.slice(0, 4).join(', ') + fillTemplate(tDyn('bundle_includes_more', ' + {{count}} more'), { count: names.length - 4 });
  }

  function renderBundleTiles() {
    bundleTilesContainer.innerHTML = '';
    BUNDLE_GROUPS.forEach(group => {
      const items = groupCItems(group);
      const rawSum = items.reduce((s, i) => s + (i.price || 0), 0);
      if (rawSum <= 0) return; // nothing priced in this group for this tier -- skip entirely

      const price = bundlePriceFromRawSum(rawSum);
      const tile = document.createElement('label');
      tile.className = 'wd-bundle-tile';
      tile.dataset.bundleKey = group.key;
      tile.innerHTML = `
        <input type="checkbox" class="wd-bundle-tile-checkbox">
        <span class="wd-bundle-tile-main">
          <span class="wd-bundle-tile-name">${escHtml(tDyn(`bundle_name_${group.key}`, group.name))}</span>
          <span class="wd-bundle-tile-desc">${escHtml(fillTemplate(tDyn('bundle_includes_prefix', 'Includes: {{items}}'), { items: bundleIncludesText(items) }))}</span>
        </span>
        <span class="wd-bundle-tile-price">${fmtMoney(price)}</span>`;

      const hiddenWrap = document.createElement('span');
      hiddenWrap.className = 'wd-bundle-hidden-inputs';
      hiddenWrap.hidden = true;
      items.forEach(i => {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.priority = 'C';
        input.dataset.title = i.title;
        input.dataset.price = i.price != null ? i.price : '';
        input.dataset.category = i.category;
        input.value = i.pdf_label;
        hiddenWrap.appendChild(input);
      });
      tile.appendChild(hiddenWrap);

      tile.querySelector('.wd-bundle-tile-checkbox').addEventListener('change', (e) => toggleBundleGroup(group, e.target.checked));
      bundleTilesContainer.appendChild(tile);
    });
  }

  function toggleBundleGroup(group, checked) {
    const tile = bundleTileEl(group.key);
    if (!tile) return;
    tile.classList.toggle('is-selected', checked);
    tile.querySelectorAll('input[data-priority="C"]').forEach(input => { input.checked = checked; });
    updatePriceAndBreakdown();
    saveDraft();
  }

  // ---- Pricing ------------------------------------------------------------

  function selectedInputs(priority) {
    return Array.from(document.querySelectorAll(`input[data-priority="${priority}"]:checked`));
  }

  // Always false here. The American Heroes Discount is held on the customer's
  // account and verified before payment, so the configurator shows list price
  // and the discount is applied at checkout from the account record. A
  // self-attested checkbox was only ever a price the customer picked.
  function heroesEligible() {
    return false;
  }

  // Raw (undiscounted) sum of every currently-checked priced item -- used
  // only to derive a "bundle savings" figure for the backend's independent
  // cross-check (see selectionPayload); never shown to the customer as a
  // "was" price, since there's no longer a non-bundle way to buy.
  function computeRawOptionalSum() {
    return selectedInputs('C').reduce((sum, el) => sum + (Number(el.dataset.price) || 0), 0);
  }

  function computeBundlesTotal() {
    return selectedBundleGroups().reduce((sum, g) => sum + bundleGroupPrice(g), 0);
  }

  function computeSubtotal() {
    return state.basePrice + computeBundlesTotal();
  }

  // Final total after the Heroes Discount (15% off one-time work -- see
  // heroes-pricing.html). Premium/custom-quote items are never in the
  // subtotal, so the discount never touches them, matching the sitewide policy.
  function computeTotal() {
    const subtotal = computeSubtotal();
    return heroesEligible() ? subtotal * (1 - HEROES_DISCOUNT_RATE) : subtotal;
  }

  function updatePriceAndBreakdown() {
    const selectedGroups = selectedBundleGroups();
    const subtotal = computeSubtotal();
    const total = computeTotal();
    const heroes = heroesEligible();
    animatePrice(total);

    const selectedCount = selectedGroups.length;
    const countText = selectedCount === 1
      ? tDyn('feature_count_one', '1 item selected')
      : fillTemplate(tDyn('feature_count_many', '{{count}} items selected'), { count: selectedCount });
    if (featureCountEl) {
      featureCountEl.hidden = selectedCount === 0;
      featureCountEl.textContent = countText;
    }

    // The only discount left to call out is the Heroes Discount -- a
    // bundle's price is just its price now, not a "before/after" saving.
    const heroesSavings = heroes ? subtotal - total : 0;
    if (heroesSavings >= 1) {
      priceSavingsEl.textContent = fillTemplate(tDyn('price_savings', "🎉 You're saving {{amount}} with the Heroes Discount"), {
        amount: fmtMoney(heroesSavings),
      });
      priceSavingsEl.hidden = false;
    } else {
      priceSavingsEl.hidden = true;
    }

    priceNoteEl.textContent = heroes
      ? tDyn('note_starting_price_with_heroes', 'Heroes Discount applied at checkout')
      : tDyn('note_starting_price', 'Half now, half at launch');

    const baseLabel = tDyn(state.package === 'business' ? 'cost_row_base_business' : 'cost_row_base_starter', state.package === 'business' ? 'Business base' : 'Starter base');
    let html = `<div class="wd-cost-row wd-cost-row--base"><span>${escHtml(baseLabel)}</span><strong>${fmtMoney(state.basePrice)}</strong></div>`;
    selectedGroups.forEach(g => {
      html += `<div class="wd-cost-row"><span>${escHtml(tDyn(`bundle_name_${g.key}`, g.name))}</span><strong>+${fmtMoney(bundleGroupPrice(g))}</strong></div>`;
    });
    if (heroes) {
      const heroesLabel = tDyn('cost_row_heroes', 'American Heroes Discount (15%, pending confirmation)');
      html += `<div class="wd-cost-row wd-cost-row--discount"><span>${escHtml(heroesLabel)}</span><strong>-${fmtMoney(subtotal - total)}</strong></div>`;
    }
    if (quoteRecapBreakdownEl) quoteRecapBreakdownEl.innerHTML = html;
    downloadBtn.hidden = false;
    downloadBtn.disabled = !JSPDF_READY;
    downloadBtn.setAttribute('aria-disabled', String(!JSPDF_READY));
    if (pdfErrorEl) pdfErrorEl.hidden = JSPDF_READY;
  }

  function loadCatalog(pkg, draft) {
    state.package = pkg;
    state.displayedTotal = 0;
    const file = pkg === 'business' ? 'business-catalog.json' : 'starter-catalog.json';
    fetch(file)
      .then(r => r.json())
      .then(data => {
        state.catalog = data;
        state.basePrice = data.base_price;
        renderIncludedSummary();
        renderBundleTiles();
        if (draft) applyDraft(draft);
        updatePriceAndBreakdown();
        if (!draft) saveDraft();
        if (priceBarEl) priceBarEl.hidden = false;
        document.body.classList.add('has-price-bar');
        syncPriceBarHeight();
        showPanel(draft && draft.quickLeadId ? 'prompt' : '2');
      })
      .catch(err => {
        console.error('Could not load feature catalog', err);
        const msg = tDyn('feature_unavailable', "Feature list unavailable right now -- you can still submit your project details and we'll follow up.");
        includedSummary.innerHTML = `<p class="wd-note">${escHtml(msg)}</p>`;
        showPanel('2');
      });
  }

  // Re-applies a restored draft's selections/fields once the catalog has
  // rendered its checkboxes.
  function applyDraft(draft) {
    Array.from(document.querySelectorAll('input[data-priority]')).forEach(el => {
      if (draft.checkedTitles.includes(el.dataset.title)) el.checked = true;
    });
    // Sync each bundle tile's own visible checkbox to "checked" if every one
    // of its underlying inputs came back checked from the draft.
    BUNDLE_GROUPS.forEach(group => {
      const tile = bundleTileEl(group.key);
      if (!tile) return;
      const inputs = Array.from(tile.querySelectorAll('input[data-priority="C"]'));
      const cb = tile.querySelector('.wd-bundle-tile-checkbox');
      const allChecked = inputs.length > 0 && inputs.every(i => i.checked);
      if (cb) cb.checked = allChecked;
      tile.classList.toggle('is-selected', allChecked);
    });
    if (heroesCheckbox) heroesCheckbox.checked = !!draft.heroesDiscount;
    state.quickLeadId = draft.quickLeadId || null;
    state.resumeToken = draft.resumeToken || null;
    state.customerName = draft.customerName || '';
    state.customerEmail = draft.customerEmail || '';
    state.customerPhone = draft.customerPhone || '';
    state.preferredContact = draft.preferredContact || '';
    Object.keys(draft.fields || {}).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = draft.fields[id];
    });
    if (startOverBtn) startOverBtn.hidden = false;
  }

  document.querySelectorAll('[data-choose-package]').forEach(btn => {
    btn.addEventListener('click', () => loadCatalog(btn.dataset.choosePackage));
  });
  startOverBtn?.addEventListener('click', () => {
    clearDraft();
    location.reload();
  });
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => showPanel(btn.dataset.back));
  });

  // The resume token travels only as a URL fragment (never a query string,
  // so it's never sent to the server as part of this navigation, and never
  // logged) -- see netlify/functions/website-designer.js for the full
  // security model (hash-only storage, 24h expiry, single use, timing-safe
  // validation).

  // Deliberately does NOT pass the literal 'noopener' feature string to
  // window.open() -- per spec (and confirmed in Safari on macOS/iOS), a
  // browser that honors 'noopener' returns null from window.open() even
  // when the popup opened successfully, since the whole point of noopener
  // is that the caller gets no reference back. That makes `win` useless
  // for detecting an actually-blocked popup: in Safari this made every
  // single click look "blocked" and show the fallback link, even though
  // the new tab opened and worked fine (Chromium browsers, which don't
  // null the return value out, never surfaced this in testing). Instead,
  // get a real reference back and manually sever win.opener on it --
  // functionally identical reverse-tabnabbing protection (the new tab
  // can't navigate this one via window.opener), while keeping the return
  // value meaningful so a genuinely blocked popup still falls back to the
  // direct link instead of silently doing nothing.

  customRequestEl?.addEventListener('input', saveDraft);

  // The sticky bar's button is the same action as the one at the bottom of
  // the page -- someone who has finished choosing shouldn't have to scroll
  // to find it.
  reviewSubmitBtn?.addEventListener('click', () => {
    const addBtn = document.getElementById('wdAddToCart');
    if (addBtn) addBtn.click();
  });

  // Debounced draft save on every keystroke in the quick-quote form (event
  // delegation via bubbling 'input', so this covers every current and
  // future named field in the form with one listener).

  function selectionPayload() {
    const rawOptionalSum = computeRawOptionalSum();
    const bundlesTotal = computeBundlesTotal();
    return {
      optionalSelected: selectedInputs('C').map(el => ({ title: el.dataset.title, price: Number(el.dataset.price) || 0 })),
      customRequest: '',
      heroesDiscount: heroesEligible(),
      bundledCategories: bundledCategories(),
      // Derived from the same flat bundle prices shown on screen (not a
      // separate per-category computation) so what's submitted always
      // matches what the customer actually saw -- see header comment on
      // computeSubtotal for why. Stays within the backend's existing $2
      // price-mismatch tolerance versus its own independent recompute.
      bundleSavings: rawOptionalSum - bundlesTotal,
      selectedBundles: selectedBundleGroups().map(g => ({ name: tDyn(`bundle_name_${g.key}`, g.name), price: bundleGroupPrice(g) })),
    };
  }

  function submissionId() {
    return 'WD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  // Builds the shared premium-PDF payload from whatever's known at this
  // point in the flow (package + selections + contact info) -- the full
  // business brief doesn't exist yet on this page (see
  // js/website-project-brief.js, which builds its own richer payload once
  // the customer has filled that in on the worksheet).
  function pdfPayloadFromState() {
    const { optionalSelected, customRequest, heroesDiscount, bundledCategories: bundled, bundleSavings, selectedBundles } = selectionPayload();
    const total = computeTotal();
    const subtotal = computeSubtotal();
    return {
      business: (businessNameEl && businessNameEl.value) || 'Your business',
      customerName: document.getElementById('wdName')?.value || '',
      customerEmail: document.getElementById('wdEmail')?.value || '',
      customerPhone: document.getElementById('wdPhone')?.value || '',
      reference: state.quickLeadId || submissionId(),
      generatedDate: new Date().toLocaleDateString('en-US'),
      packageLabel: state.package === 'business' ? 'Business package -- $1,299 starting' : 'Starter package -- $699 starting',
      basePrice: state.basePrice,
      includedCapabilities: includedSummaryItems(state.package),
      optionalSelected, customRequest,
      bundledCategories: bundled, bundleSavings, selectedBundles,
      heroesDiscount, heroesDiscountAmount: heroesDiscount ? subtotal - total : 0,
      subtotal, total,
      brief: {}, notes: '',
    };
  }

  let pdfBuildInFlight = false;
  downloadBtn.addEventListener('click', async () => {
    if (pdfBuildInFlight || !window.LTS_WD_PDF) {
      if (pdfErrorEl) pdfErrorEl.hidden = false;
      return;
    }
    pdfBuildInFlight = true;
    downloadBtn.disabled = true;
    try {
      const doc = await window.LTS_WD_PDF.buildWebsiteDesignerPdf(pdfPayloadFromState());
      if (!doc) { if (pdfErrorEl) pdfErrorEl.hidden = false; return; }
      doc.save('website-designer-summary.pdf');
    } finally {
      pdfBuildInFlight = false;
      downloadBtn.disabled = !JSPDF_READY;
    }
  });

  /* Add to cart.
   *
   * This page used to end in a contact form: name, email, phone, preferred
   * contact method, and a promise to follow up. That made a configurator into
   * a lead magnet. It now ends in a purchase.
   *
   * The configuration is posted to designer-quote, which prices it again
   * server-side with the same recomputeEstimate the lead flow used and stores
   * the result. What goes in the cart is an opaque quote id -- so a
   * hand-edited cart can change which design is bought, never what it costs.
   */
  const addToCartBtn = document.getElementById('wdAddToCart');
  if (addToCartBtn) {
    addToCartBtn.addEventListener('click', async () => {
      if (!state.package) return;
      const status = document.getElementById('wdCheckoutStatus');
      const sel = selectionPayload();

      addToCartBtn.disabled = true;
      const originalLabel = addToCartBtn.textContent;
      addToCartBtn.textContent = tDyn('adding_to_cart', 'Saving your build\u2026');
      if (status) { status.textContent = ''; status.className = 'form-status'; }

      try {
        const res = await fetch('/.netlify/functions/designer-quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            package: state.package,
            optionalSelected: sel.optionalSelected,
            bundledCategories: sel.bundledCategories,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.cartKey) {
          throw new Error(body.error || 'We could not save that build.');
        }

        // The cart validates against the catalog, so a quote key is added
        // through the same API rather than written to storage directly.
        if (window.LTS_CART && window.LTS_CART.add(body.cartKey)) {
          clearDraft();
          window.location.href = 'cart.html';
          return;
        }
        throw new Error('We could not add that to your cart.');
      } catch (err) {
        if (status) {
          status.textContent = (err && err.message) ||
            'Something went wrong \u2014 please call 804-309-0968 and we\u2019ll take it from here.';
          status.className = 'form-status form-status--error';
        }
        addToCartBtn.disabled = false;
        addToCartBtn.textContent = originalLabel;
      }
    });
  }

  // The full content brief lives in the project brief, which unlocks in the
  // customer's account once payment lands -- not on this page, and no longer
  // behind a "want to add details now?" prompt after a lead form.

  // Resume an interrupted session (accidental refresh/navigation) --
  // silent, since sessionStorage only ever holds this same tab's own
  // in-progress draft, not something from a different visit to second-guess.
  const savedDraft = loadDraft();
  if (savedDraft) loadCatalog(savedDraft.package, savedDraft);
});
