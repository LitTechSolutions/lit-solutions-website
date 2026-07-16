// website-designer.js -- LTS Website Designer configurator.
//
// Three steps: pick a package, choose features while watching a live
// mock-up of the site grow feature-by-feature with a real-time price
// ticker, then submit customer details. Submission generates a PDF
// client-side (jsPDF) and posts it -- along with the structured selection
// data -- to the website-designer Netlify Function, which emails Dylan
// the PDF and persists a lead record.
//
// Feature catalog (starter-catalog.json / business-catalog.json) is
// generated directly from feature_manifest.json, so category/title/price
// data here can never drift from the actual build spec. Per-feature prices
// are Dylan's starting estimates (see build script in scratchpad) --
// genuinely adjustable, but real numbers so the running total means
// something. Premium (S-tier) items never get a price -- always "custom
// quote," per the reference spec's own non-negotiable rule.
//
// Categories are grouped and collapsed by default (a full flat list of
// every feature was too much to take in at once) with a "bundle & save"
// box that selects an entire category in one click. Selecting every
// optional feature in a category -- by hand or via that box -- unlocks an
// extra 10% off that category's items, on top of any Heroes Discount.

document.addEventListener('DOMContentLoaded', () => {
  const steps = document.querySelectorAll('.wd-step');
  const panels = document.querySelectorAll('.wd-panel');
  const includedSummary = document.getElementById('wdIncludedSummary');
  const includedTitle = document.getElementById('wdIncludedTitle');
  const optionalContainer = document.getElementById('wdOptionalCategories');
  const premiumContainer = document.getElementById('wdPremiumCategories');
  const quickForm = document.getElementById('wdQuickForm');
  const quickFormStatus = document.getElementById('wdQuickFormStatus');
  const doneMessageEl = document.getElementById('wdDoneMessage');
  const wdPromptYesBtn = document.getElementById('wdPromptYesBtn');
  const wdFinishLaterBtn = document.getElementById('wdFinishLaterBtn');
  const wdOpenWorksheetAgainBtn = document.getElementById('wdOpenWorksheetAgainBtn');
  const wdWorksheetFallback = document.getElementById('wdWorksheetFallback');
  const wdWorksheetFallbackLink = document.getElementById('wdWorksheetFallbackLink');

  const priceAmountEl = document.getElementById('wdPriceAmount');
  const priceSavingsEl = document.getElementById('wdPriceSavings');
  const priceNoteEl = document.getElementById('wdPriceNote');
  const featureCountEl = document.getElementById('wdFeatureCount');
  const quoteRecapAmountEl = document.getElementById('wdQuoteRecapAmount');
  const businessNameEl = document.getElementById('wdBusinessName');
  const browserUrlEl = document.getElementById('wdBrowserUrl');
  const browserEmptyEl = document.getElementById('wdBrowserEmpty');
  const previewBaseEl = document.getElementById('wdPreviewBase');
  const previewHeroNameEl = document.getElementById('wdPreviewHeroName');
  const previewFooterNameEl = document.getElementById('wdPreviewFooterName');
  const previewNavEl = document.getElementById('wdPreviewNav');
  const previewSectionsEl = document.getElementById('wdPreviewSections');
  const previewBadgesEl = document.getElementById('wdPreviewBadges');
  const quoteRecapBreakdownEl = document.getElementById('wdQuoteRecapBreakdown');
  const downloadBtn = document.getElementById('wdDownloadPdf');
  const pdfErrorEl = document.getElementById('wdPdfError');
  const reviewSubmitBtn = document.getElementById('wdReviewSubmitBtn');
  const featureTabsEl = document.getElementById('wdFeatureTabs');
  const featureToolbarEl = document.getElementById('wdFeatureToolbar');
  const featureSearchEl = document.getElementById('wdFeatureSearch');
  const categoryChipsEl = document.getElementById('wdCategoryChips');
  const featureEmptyNoteEl = document.getElementById('wdFeatureEmptyNote');
  const optionalPanelEl = document.getElementById('wdOptionalCategoriesPanel');
  const premiumPanelEl = document.getElementById('wdPremiumCategoriesPanel');
  const includedPanelEl = document.getElementById('wdIncludedPanel');
  const mobileBarEl = document.getElementById('wdMobileBar');
  const mobileBarAmountEl = document.getElementById('wdMobileBarAmount');
  const mobileBarCountEl = document.getElementById('wdMobileBarCount');
  const mobileReviewBtn = document.getElementById('wdMobileReviewBtn');
  const wdStudioEl = document.getElementById('wdStudio');
  const studioPreviewEl = document.getElementById('wdStudioPreview');
  const sidebarEl = document.getElementById('wdSidebar');
  const modeTabCustomizeEl = document.getElementById('wdModeTabCustomize');
  const modeTabPreviewEl = document.getElementById('wdModeTabPreview');
  const previewUpdatedBadgeEl = document.getElementById('wdPreviewUpdatedBadge');
  const previewBackBtnEl = document.getElementById('wdPreviewBackBtn');
  const launchBannerEl = document.getElementById('wdLaunchBanner');
  // Keeps --wd-mobile-bar-height (css/style.css) equal to the bar's real
  // rendered height at all times, so the page/footer bottom padding and
  // the open cookie banner's clearance above the bar (both computed from
  // that variable) stay correct as its content changes size -- a longer
  // translated "Review & submit" label wrapping to two lines, or the page
  // being zoomed, grows the reserved space right along with it instead of
  // leaving a gap that's too tight or actually overlapping. Called directly
  // at every point the bar's size could change, rather than relying only on
  // ResizeObserver's own initial-fire timing.
  function syncMobileBarHeight() {
    if (mobileBarEl) document.documentElement.style.setProperty('--wd-mobile-bar-height', `${mobileBarEl.offsetHeight}px`);
  }
  if (mobileBarEl && 'ResizeObserver' in window) {
    new ResizeObserver(syncMobileBarHeight).observe(mobileBarEl);
  }
  window.addEventListener('resize', syncMobileBarHeight);

  // ---- Mobile Customize / Live Preview mode switch (900px and below) ----
  // Above 900px both .wd-studio-preview and #wdSidebar are always visible
  // side by side and this whole section is inert (the mode-switch tablist
  // is display:none, the matchMedia below never fires "isMobile"). At or
  // below 900px, css/style.css shows exactly one of them at a time based
  // on #wdStudio's data-mobile-mode attribute -- this just keeps that
  // attribute, the tab buttons' aria-selected/tabindex, and focus in sync.
  // Scroll position: .wd-sidebar-scroll's scrollTop is a normal DOM
  // property that browsers preserve on a display:none'd element, so
  // hiding/showing #wdSidebar via CSS alone already preserves the
  // customer's place in the feature list across a mode switch -- no extra
  // bookkeeping needed here.
  const mobileModeQuery = window.matchMedia('(max-width: 900px)');

  function setMobileMode(mode, opts) {
    opts = opts || {};
    if (wdStudioEl) wdStudioEl.dataset.mobileMode = mode;
    [modeTabCustomizeEl, modeTabPreviewEl].forEach(tab => {
      if (!tab) return;
      const active = tab.dataset.mobileMode === mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    if (mode === 'preview' && previewUpdatedBadgeEl) previewUpdatedBadgeEl.hidden = true;
    if (!opts.skipFocus) {
      const activeTab = mode === 'preview' ? modeTabPreviewEl : modeTabCustomizeEl;
      if (activeTab) activeTab.focus();
    }
  }

  function markPreviewUpdated() {
    if (!previewUpdatedBadgeEl || !wdStudioEl) return;
    if (wdStudioEl.dataset.mobileMode === 'preview') return; // already looking at it
    previewUpdatedBadgeEl.hidden = false;
  }

  if (modeTabCustomizeEl) modeTabCustomizeEl.addEventListener('click', () => setMobileMode('customize'));
  if (modeTabPreviewEl) modeTabPreviewEl.addEventListener('click', () => setMobileMode('preview'));
  if (previewBackBtnEl) previewBackBtnEl.addEventListener('click', () => setMobileMode('customize'));

  // Standard tabs keyboard pattern: Left/Right/Home/End move focus AND
  // activate (only two tabs here, so automatic activation is simpler than
  // requiring a separate Enter/Space press).
  if (modeTabCustomizeEl && modeTabPreviewEl) {
    const modeTabs = [modeTabCustomizeEl, modeTabPreviewEl];
    modeTabs.forEach((tab, i) => {
      tab.addEventListener('keydown', (e) => {
        let target = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = modeTabs[(i + 1) % modeTabs.length];
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = modeTabs[(i - 1 + modeTabs.length) % modeTabs.length];
        else if (e.key === 'Home') target = modeTabs[0];
        else if (e.key === 'End') target = modeTabs[modeTabs.length - 1];
        if (!target) return;
        e.preventDefault();
        setMobileMode(target.dataset.mobileMode);
      });
    });
  }

  // role="tablist"/"tab"/"tabpanel" only make sense while the mode switch
  // is actually the active UI (<=900px) -- above that, both panels are
  // simultaneously visible (not really "tabs" at all), so the roles are
  // added/removed as the viewport crosses the breakpoint rather than left
  // on permanently, which would mislabel the desktop layout for anyone
  // using a screen reader at a wide-but-not-huge window size.
  function applyMobileModeA11y(isMobile) {
    [sidebarEl, studioPreviewEl].forEach(panel => {
      if (!panel) return;
      if (isMobile) {
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('tabindex', '0');
      } else {
        panel.removeAttribute('role');
        panel.removeAttribute('tabindex');
      }
    });
    if (sidebarEl) { if (isMobile) sidebarEl.setAttribute('aria-labelledby', 'wdModeTabCustomize'); else sidebarEl.removeAttribute('aria-labelledby'); }
    if (studioPreviewEl) { if (isMobile) studioPreviewEl.setAttribute('aria-labelledby', 'wdModeTabPreview'); else studioPreviewEl.removeAttribute('aria-labelledby'); }
  }
  applyMobileModeA11y(mobileModeQuery.matches);
  mobileModeQuery.addEventListener('change', (e) => applyMobileModeA11y(e.matches));

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
  const heroesCheckbox = document.getElementById('wdHeroesDiscount');
  const startOverBtn = document.getElementById('wdStartOver');
  const HEROES_DISCOUNT_RATE = 0.15; // 15% off one-time work -- matches heroes-pricing.html
  const BUNDLE_DISCOUNT_RATE = 0.10; // 10% off a category when every optional item in it is selected
  const BUNDLE_MIN_ITEMS = 2; // a "bundle" of one item isn't a bundle

  const state = {
    package: null,
    basePrice: 0,
    displayedTotal: 0,
    catalog: null,
    // Set once the quick-quote form (step 3) is sent successfully -- the
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
    featureTab: 'addons', // 'addons' | 'premium' | 'included'
    categoryFilter: null, // null = all categories
    searchQuery: '',
  };

  // ---- Draft persistence (survive an accidental refresh/navigation) --
  // Session-only (not localStorage): this brief can carry real business
  // details, so it shouldn't outlive the tab. Logo/photo files are never
  // persisted -- browsers won't let JS repopulate a file input anyway, and
  // base64-encoding them into sessionStorage risked hitting its ~5-10MB
  // quota. Bumping WD_DRAFT_VERSION invalidates any old saved shape rather
  // than risk restoring into a catalog/form structure that's since changed.
  const WD_DRAFT_KEY = 'lts-wd-draft';
  const WD_DRAFT_VERSION = 2; // bumped: the full brief's fields moved to website-project-brief.js's own draft
  const QUICK_FORM_FIELD_IDS = ['wdBusinessName', 'wdName', 'wdEmail', 'wdPhone', 'wdPreferredContact'];
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

  // ---- i18n helpers -----------------------------------------------------
  // This tool builds nearly everything visible from JS (catalog JSON +
  // template strings), not static HTML, so none of it can carry a
  // data-i18n attribute the way the rest of the site does. i18n.js exposes
  // window.LTS_I18N for exactly this: a lookup with an English fallback,
  // so a missing translation key never breaks anything, it just shows
  // English for that one string until a translation is added.
  function tt(path, fallback) {
    return window.LTS_I18N ? window.LTS_I18N.t(path, fallback) : fallback;
  }
  function tCatItem(title) { return tt('catalog_items.' + title, title); }
  function tCatCategory(cat) { return tt('catalog_categories.' + cat, cat); }
  function tDyn(key, fallback) { return tt('wd_dyn.' + key, fallback); }
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

  function bizName() {
    const v = businessNameEl && businessNameEl.value.trim();
    return v ? escHtml(v) : tDyn('preview_default_business_name', 'your business');
  }

  // Mock preview content per feature title -- these are the "content" kind
  // features (the ones the reference spec treats as actual visible pages),
  // so they're the only ones that get a full mini section card in the
  // growing site mock-up. Each renders a small graphic (built from CSS, no
  // external assets) plus a blurb that plugs in whatever business name has
  // been typed so far. Anything not listed here still gets a sensible
  // generic block, keyed off its category's fallback icon.
  // blurb/visual text goes through tDyn()/fillTemplate() at render time
  // (see cardBodyHtml) rather than being embedded as English literals here,
  // so this illustrative mock content follows the selected language too.
  const PREVIEW_CONTENT = {
    'Additional standard pages': {
      icon: '📄',
      visual: () => '<div class="wd-mock-page"><span></span><span></span><span class="wd-mock-line-short"></span></div>',
      blurb: 'preview_additional_pages_blurb',
    },
    'Blog / News section': {
      icon: '📰',
      visual: (biz) => `<div class="wd-mock-blogcard"><span class="wd-mock-swatch wd-mock-swatch--a"></span><div class="wd-mock-blogcard-text"><b>${fillTemplate(tDyn('preview_blog_headline', '5 things {{biz}} customers ask most'), { biz })}</b><small>${tDyn('preview_blog_posted', 'Posted this week')}</small></div></div>`,
      blurb: 'preview_blog_blurb',
    },
    'Portfolio / Gallery page': {
      icon: '🖼️',
      visual: () => '<div class="wd-mock-grid-4"><span class="wd-mock-swatch wd-mock-swatch--a"></span><span class="wd-mock-swatch wd-mock-swatch--b"></span><span class="wd-mock-swatch wd-mock-swatch--c"></span><span class="wd-mock-swatch wd-mock-swatch--d"></span></div>',
      blurb: 'preview_portfolio_blurb',
    },
    'FAQ page': {
      icon: '❓',
      visual: (biz) => `<div class="wd-mock-faq"><div class="wd-mock-faq-row"><span class="wd-mock-faq-plus">+</span>${fillTemplate(tDyn('preview_faq_q1', 'What areas does {{biz}} serve?'), { biz })}</div><div class="wd-mock-faq-row"><span class="wd-mock-faq-plus">+</span>${tDyn('preview_faq_q2', 'How much does it cost?')}</div></div>`,
      blurb: 'preview_faq_blurb',
    },
    'Testimonials / Reviews': {
      icon: '💬',
      visual: () => `<div class="wd-mock-quote">&ldquo;${tDyn('preview_testimonial_quote', 'Best service in the area!')}&rdquo;</div><div class="wd-mock-stars">★★★★★</div>`,
      blurb: 'preview_testimonials_blurb',
    },
    'Team / Staff page': {
      icon: '🧑‍🔧',
      visual: () => '<div class="wd-mock-row wd-mock-avatars"><span class="wd-mock-avatar">👤</span><span class="wd-mock-avatar">👤</span><span class="wd-mock-avatar">👤</span></div>',
      blurb: 'preview_team_blurb',
    },
    'Pricing page': {
      icon: '💲',
      visual: () => '<div class="wd-mock-row wd-mock-pricing"><span class="wd-mock-bar">$</span><span class="wd-mock-bar wd-mock-bar--tall">$$</span><span class="wd-mock-bar">$$$</span></div>',
      blurb: 'preview_pricing_blurb',
    },
    'Image gallery': {
      icon: '🌆',
      visual: () => '<div class="wd-mock-grid-4"><span class="wd-mock-swatch wd-mock-swatch--b"></span><span class="wd-mock-swatch wd-mock-swatch--d"></span><span class="wd-mock-swatch wd-mock-swatch--a"></span><span class="wd-mock-swatch wd-mock-swatch--c"></span></div>',
      blurb: 'preview_gallery_blurb',
    },
    'Custom graphics & icons': {
      icon: '🎨',
      visual: () => '<div class="wd-mock-row wd-mock-icons"><span class="wd-mock-icon-shape wd-mock-icon-shape--circle"></span><span class="wd-mock-icon-shape wd-mock-icon-shape--square"></span><span class="wd-mock-icon-shape wd-mock-icon-shape--diamond"></span><span class="wd-mock-icon-shape wd-mock-icon-shape--dot"></span></div>',
      blurb: 'preview_graphics_blurb',
    },
    'Sitemap page': {
      icon: '🗺️',
      visual: () => `<div class="wd-mock-sitemap"><span>• ${tDyn('preview_sitemap_home', 'Home')}</span><span>• ${tDyn('preview_sitemap_about', 'About')}</span><span class="wd-mock-indent">• ${tDyn('preview_sitemap_services', 'Services')}</span></div>`,
      blurb: 'preview_sitemap_blurb',
    },
    'Additional custom forms': {
      icon: '📝',
      visual: () => `<div class="wd-mock-form"><span class="wd-mock-input"></span><span class="wd-mock-btn">${tDyn('preview_form_submit', 'Submit')}</span></div>`,
      blurb: 'preview_forms_blurb',
    },
    'Map / location embed': {
      icon: '📍',
      visual: () => '<div class="wd-mock-map"><span class="wd-mock-pin">📍</span></div>',
      blurb: 'preview_map_blurb',
    },
    'Online Booking Request Form': {
      icon: '📅',
      visual: () => '<div class="wd-mock-calendar"><span></span><span></span><span class="wd-mock-calendar-selected"></span><span></span><span></span><span></span><span></span></div>',
      blurb: 'preview_booking_blurb',
    },
    'Data-subject request intake': {
      icon: '📋',
      visual: () => `<div class="wd-mock-form"><span class="wd-mock-input"></span><span class="wd-mock-btn">${tDyn('preview_form_submit', 'Submit')}</span></div>`,
      blurb: 'preview_dsr_blurb',
    },
  };
  // English fallback text for each PREVIEW_CONTENT blurb key (used when no
  // translation is active, or the key hasn't been translated yet).
  const PREVIEW_BLURB_EN = {
    preview_additional_pages_blurb: 'A new page for {{biz}}, ready for your content.',
    preview_blog_blurb: 'Fresh posts and news from {{biz}}.',
    preview_portfolio_blurb: 'Recent {{biz}} projects, with photos and write-ups.',
    preview_faq_blurb: 'Answers to what {{biz}} customers ask most.',
    preview_testimonials_blurb: 'Real feedback from {{biz}} customers, front and center.',
    preview_team_blurb: 'Meet the people behind {{biz}}.',
    preview_pricing_blurb: 'Clear, upfront rates for what {{biz}} offers.',
    preview_gallery_blurb: 'A responsive photo grid for {{biz}}.',
    preview_graphics_blurb: "Icons and graphics matched to {{biz}}'s brand.",
    preview_sitemap_blurb: "A plain list of every page on {{biz}}'s site.",
    preview_forms_blurb: 'A purpose-built request form for {{biz}}.',
    preview_map_blurb: "An embedded map to {{biz}}'s location.",
    preview_booking_blurb: 'Pick a service and a preferred time with {{biz}}.',
    preview_dsr_blurb: "A simple, compliant way for {{biz}}'s visitors to request their data.",
  };

  const CATEGORY_FALLBACK_ICON = { 'Core Pages': '📄', 'Design & Branding': '🎨', 'Navigation': '🧭',
    'Search': '🔎', 'Forms & Validation': '📝', 'Contact & Communication': '✉️', 'Notifications': '🔔',
    'Privacy & Legal': '🔒', 'SEO & Analytics': '📈', 'Security & Hosting': '🛡️', 'Media Management': '🖼️',
    'Content Management': '🗂️', 'Booking & Scheduling': '📅', 'Reviews & Ratings': '⭐',
    'User Accounts': '👤', 'Account Management': '👤', 'Personalization': '🧩' };

  // Content-brief conditional-section logic (which brief fields to show
  // based on package/selections) now lives entirely in
  // js/website-project-brief.js, alongside the brief form itself.

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
    if (mobileBarAmountEl) mobileBarAmountEl.textContent = fmtMoney(newTotal);
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
      if (name === '2' || name === '3' || name === 'prompt' || name === 'worksheet-opened' || name === 'done') s.disabled = false;
    });
    // Move focus to the new panel's heading so screen-reader/keyboard users
    // land on the new content instead of a now-hidden or stale element, and
    // (for the post-quote prompt/worksheet-opened/done panels specifically)
    // scroll that panel itself into view. This used to be
    // window.scrollTo({top:0}) -- which scrolls the whole PAGE to its very
    // top, i.e. the hero/launch-banner section, not the tool. Since the
    // prompt panel lives well below that inside .wd-sidebar, forcing the
    // page to the top after a quick-quote submission actively hid the
    // "want to continue?" prompt below the fold right when a customer most
    // needed to see it -- scrollIntoView brings the actual panel into view
    // instead (a no-op if it's already visible, which it usually is, since
    // the customer just clicked a submit button inside this same sidebar).
    const activePanel = document.querySelector(`.wd-panel[data-panel="${name}"]`);
    if ((name === 'prompt' || name === 'worksheet-opened' || name === 'done') && activePanel) {
      activePanel.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
    const heading = activePanel && activePanel.querySelector('h2[tabindex="-1"]');
    if (heading) heading.focus({ preventScroll: true });
    // The feature tabs/search/toolbar and "Review & submit" button only
    // make sense while actually browsing add-ons (panel 2) -- hide them
    // the rest of the time rather than leaving inert controls visible
    // above whatever panel (package picker, quote form, done screen) is
    // actually showing.
    if (featureTabsEl) featureTabsEl.hidden = name !== '2';
    if (featureToolbarEl) featureToolbarEl.hidden = name !== '2' || state.featureTab === 'included';
    if (reviewSubmitBtn) reviewSubmitBtn.hidden = name !== '2' || !state.package;
    const sidebarScrollEl = document.getElementById('wdSidebarScroll');
    if (sidebarScrollEl) sidebarScrollEl.scrollTop = 0;
  }

  function renderIncludedSummary() {
    const fallback = `Included in your ${state.package === 'business' ? 'Business' : 'Starter'} package`;
    includedTitle.textContent = tDyn(state.package === 'business' ? 'included_title_business' : 'included_title_starter', fallback);
    includedSummary.innerHTML = '<ul class="wd-included-list">' +
      includedSummaryItems(state.package).map(t => `<li>${escHtml(t)}</li>`).join('') + '</ul>';
  }

  // ---- Category accordion + bundle box -------------------------------

  function categoryOptionalItems(category) {
    if (!state.catalog) return [];
    const cat = state.catalog.categories.find(c => c.category === category);
    return cat ? cat.items.filter(i => i.priority === 'C') : [];
  }

  function categoryInputs(category) {
    return Array.from(document.querySelectorAll('input[data-priority="C"]')).filter(el => el.dataset.category === category);
  }

  function categorySelectedSubtotal(category) {
    return categoryInputs(category).filter(i => i.checked).reduce((s, el) => s + (Number(el.dataset.price) || 0), 0);
  }

  function isCategoryBundled(category) {
    const inputs = categoryInputs(category);
    return inputs.length >= BUNDLE_MIN_ITEMS && inputs.every(i => i.checked);
  }

  function bundledCategories() {
    if (!state.catalog) return [];
    return state.catalog.categories.map(c => c.category).filter(isCategoryBundled);
  }

  function computeBundleSavings() {
    return bundledCategories().reduce((sum, cat) => sum + categorySelectedSubtotal(cat) * BUNDLE_DISCOUNT_RATE, 0);
  }

  function categorySummaryText(category, items) {
    const inputs = categoryInputs(category);
    const checkedCount = inputs.filter(i => i.checked).length;
    if (checkedCount) {
      return fillTemplate(tDyn('category_summary_selected', '{{checked}} of {{total}} selected -- {{amount}}'), {
        checked: checkedCount, total: items.length, amount: fmtMoney(categorySelectedSubtotal(category)),
      });
    }
    const names = items.slice(0, 3).map(i => tCatItem(i.title).split('(')[0].trim());
    const extra = items.length > 3 ? ' ' + fillTemplate(tDyn('category_summary_more', '+{{count}} more'), { count: items.length - 3 }) : '';
    return `${names.join(', ')}${extra}`;
  }

  function updateCategoryBundleUI(category) {
    if (!category) return;
    const items = categoryOptionalItems(category);
    if (items.length < BUNDLE_MIN_ITEMS) return;
    const block = Array.from(optionalContainer.querySelectorAll('.wd-category')).find(b => b.dataset.category === category);
    if (!block) return;

    const summaryEl = block.querySelector('[data-summary]');
    if (summaryEl) summaryEl.textContent = categorySummaryText(category, items);

    const allChecked = isCategoryBundled(category);
    const bundleCheckbox = block.querySelector('.wd-bundle-checkbox');
    const bundleBox = block.querySelector('.wd-bundle-box');
    const savingsBadge = block.querySelector('.wd-bundle-savings-badge');
    if (bundleCheckbox) {
      bundleCheckbox.checked = allChecked;
      const checkedCount = categoryInputs(category).filter(i => i.checked).length;
      bundleCheckbox.indeterminate = checkedCount > 0 && !allChecked;
    }
    if (bundleBox) bundleBox.classList.toggle('is-active', allChecked);
    if (savingsBadge) {
      const wasHidden = savingsBadge.hidden;
      if (allChecked) {
        savingsBadge.textContent = fillTemplate(tDyn('bundle_savings_badge', "🤝 We've got your back -- saving {{amount}} (10%)!"), {
          amount: fmtMoney(categorySelectedSubtotal(category) * BUNDLE_DISCOUNT_RATE),
        });
      }
      savingsBadge.hidden = !allChecked;
      if (allChecked && wasHidden && !prefersReducedMotion) {
        savingsBadge.classList.remove('wd-pop-in');
        void savingsBadge.offsetWidth;
        savingsBadge.classList.add('wd-pop-in');
      }
    }
  }

  function toggleCategoryBundle(category, checked) {
    browserEmptyEl.hidden = true;
    categoryInputs(category).forEach(input => {
      if (input.checked === checked) return;
      input.checked = checked;
      const item = findItem(input.dataset.title);
      const slug = slugForPreview(input.dataset.title);
      if (item && item.kind === 'content') {
        if (checked) addPreviewSection(item); else removePreviewSection(slug);
      }
    });
    renderBadges();
    updateCategoryBundleUI(category);
    updatePriceAndBreakdown();
  }

  function renderCategoryGroup(container, categories, priority) {
    container.innerHTML = '';
    categories.forEach(cat => {
      const items = cat.items.filter(i => i.priority === priority);
      if (!items.length) return;

      const block = document.createElement('div');
      block.className = 'wd-category';
      block.dataset.category = cat.category;
      const panelId = `wd-cat-panel-${priority}-${slugForPreview(cat.category)}`;

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'wd-category-header';
      header.setAttribute('aria-expanded', 'false');
      header.setAttribute('aria-controls', panelId);
      const categoryLabel = tCatCategory(cat.category);
      const quoteCountText = items.length === 1
        ? tDyn('category_quote_count_one', '1 item -- custom quote')
        : fillTemplate(tDyn('category_quote_count_many', '{{count}} items -- custom quote'), { count: items.length });
      header.innerHTML = `
        <span class="wd-category-header-main">
          <span class="wd-category-title">${escHtml(categoryLabel)}</span>
          <span class="wd-category-summary" data-summary>${escHtml(priority === 'C' ? categorySummaryText(cat.category, items) : quoteCountText)}</span>
        </span>
        <svg class="wd-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
      block.appendChild(header);

      if (priority === 'C' && items.length >= BUNDLE_MIN_ITEMS) {
        const bundleTotal = items.reduce((s, i) => s + (i.price || 0), 0);
        const bundleBox = document.createElement('label');
        bundleBox.className = 'wd-bundle-box';
        const getAllText = fillTemplate(tDyn('bundle_box_get_all', 'Get all {{count}} {{category}} features'), { count: items.length, category: categoryLabel });
        const save10Text = tDyn('bundle_box_save_10', 'save 10%');
        bundleBox.innerHTML = `
          <input type="checkbox" class="wd-bundle-checkbox" data-category="${escHtml(cat.category)}">
          <span class="wd-bundle-box-main">
            <strong>${escHtml(getAllText)}</strong>
            <span class="wd-bundle-box-price"><span class="wd-bundle-now">${fmtMoney(bundleTotal * (1 - BUNDLE_DISCOUNT_RATE))}</span> <s class="wd-bundle-was">${fmtMoney(bundleTotal)}</s> <em>${escHtml(save10Text)}</em></span>
          </span>
          <span class="wd-bundle-savings-badge" hidden></span>`;
        bundleBox.querySelector('input').addEventListener('change', (e) => toggleCategoryBundle(cat.category, e.target.checked));
        block.appendChild(bundleBox);
      }

      header.addEventListener('click', () => {
        const expanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', String(!expanded));
        panel.hidden = expanded;
        block.classList.toggle('is-open', !expanded);
      });

      const panel = document.createElement('div');
      panel.className = 'wd-category-panel';
      panel.id = panelId;
      panel.hidden = true;
      const grid = document.createElement('div');
      grid.className = 'checkbox-grid';
      items.forEach(i => {
        const itemFull = { ...i, category: cat.category };
        const label = document.createElement('label');
        label.className = 'checkbox-pill wd-feature-pill';
        const priceTag = i.price != null ? `<span class="wd-price-tag">+$${i.price}</span>` : `<span class="wd-price-tag wd-price-tag--quote">${escHtml(tDyn('cost_row_quote', 'Custom quote'))}</span>`;
        label.innerHTML = `<input type="checkbox" data-priority="${priority}" data-title="${escHtml(i.title)}" data-price="${i.price != null ? i.price : ''}" data-category="${escHtml(cat.category)}" value="${escHtml(i.pdf_label)}"> <span class="wd-feature-pill-label">${escHtml(tCatItem(i.title))}</span>${priceTag}`;
        label.querySelector('input').addEventListener('change', (e) => onFeatureToggle(e.target, itemFull));
        grid.appendChild(label);
      });
      panel.appendChild(grid);
      block.appendChild(panel);

      container.appendChild(block);
    });
  }

  // ---- Feature tabs (Add-ons / Premium / Included) + search + category
  // chips. Purely a display filter over the category blocks/pills that
  // renderCategoryGroup() already built -- selection state, pricing, and
  // the preview are completely untouched by any of this.
  function currentFeaturePriority() {
    return state.featureTab === 'premium' ? 'S' : 'C';
  }

  function renderCategoryChips() {
    if (!categoryChipsEl || !state.catalog) return;
    categoryChipsEl.innerHTML = '';
    if (state.featureTab === 'included') return;
    const priority = currentFeaturePriority();
    const categories = state.catalog.categories.filter(c => c.items.some(i => i.priority === priority));
    if (categories.length < 2) return; // nothing meaningful to filter with only one category
    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = 'wd-category-chip' + (state.categoryFilter === null ? ' is-active' : '');
    allChip.setAttribute('aria-pressed', String(state.categoryFilter === null));
    allChip.textContent = tDyn('chip_all_categories', 'All');
    allChip.addEventListener('click', () => {
      state.categoryFilter = null;
      renderCategoryChips();
      applyFeatureFilters();
    });
    categoryChipsEl.appendChild(allChip);
    categories.forEach(cat => {
      const chip = document.createElement('button');
      chip.type = 'button';
      const active = state.categoryFilter === cat.category;
      chip.className = 'wd-category-chip' + (active ? ' is-active' : '');
      chip.setAttribute('aria-pressed', String(active));
      chip.textContent = tCatCategory(cat.category);
      chip.addEventListener('click', () => {
        state.categoryFilter = active ? null : cat.category;
        renderCategoryChips();
        applyFeatureFilters();
      });
      categoryChipsEl.appendChild(chip);
    });
  }

  function applyFeatureFilters() {
    if (!state.catalog) return;
    const priority = currentFeaturePriority();
    const container = priority === 'S' ? premiumContainer : optionalContainer;
    const query = state.searchQuery.trim().toLowerCase();
    let anyVisible = false;
    Array.from(container.querySelectorAll('.wd-category')).forEach(block => {
      const categoryMatches = !state.categoryFilter || block.dataset.category === state.categoryFilter;
      let categoryHasMatch = false;
      Array.from(block.querySelectorAll('.wd-feature-pill')).forEach(pill => {
        const label = pill.querySelector('.wd-feature-pill-label');
        const text = label ? label.textContent.toLowerCase() : '';
        const matchesQuery = !query || text.includes(query);
        const visible = categoryMatches && matchesQuery;
        pill.hidden = !visible;
        if (visible) categoryHasMatch = true;
      });
      const blockVisible = categoryMatches && (!query || categoryHasMatch);
      block.hidden = !blockVisible;
      if (blockVisible) {
        anyVisible = true;
        // Auto-expand a category with a live search match so results
        // aren't hidden behind its collapsed accordion header.
        if (query && categoryHasMatch) {
          const header = block.querySelector('.wd-category-header');
          const panel = block.querySelector('.wd-category-panel');
          if (header && panel && header.getAttribute('aria-expanded') !== 'true') {
            header.setAttribute('aria-expanded', 'true');
            panel.hidden = false;
            block.classList.add('is-open');
          }
        }
      }
    });
    if (featureEmptyNoteEl) featureEmptyNoteEl.hidden = anyVisible || state.featureTab === 'included';
  }

  function switchFeatureTab(tab) {
    state.featureTab = tab;
    state.categoryFilter = null;
    if (featureSearchEl) featureSearchEl.value = '';
    state.searchQuery = '';
    if (featureTabsEl) {
      Array.from(featureTabsEl.querySelectorAll('.wd-feature-tab')).forEach(btn => {
        const active = btn.dataset.featureTab === tab;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', String(active));
      });
    }
    if (optionalPanelEl) optionalPanelEl.hidden = tab !== 'addons';
    if (premiumPanelEl) premiumPanelEl.hidden = tab !== 'premium';
    if (includedPanelEl) includedPanelEl.hidden = tab !== 'included';
    if (featureToolbarEl) featureToolbarEl.hidden = tab === 'included';
    renderCategoryChips();
    applyFeatureFilters();
    if (tab === 'addons') openFirstCategoryIfNoneOpen(optionalContainer);
    if (tab === 'premium') openFirstCategoryIfNoneOpen(premiumContainer);
  }

  // A customer landing on the feature list for the first time saw every
  // category collapsed -- no visible checkboxes, no obvious way to tell
  // "here's what I can actually add." Opens the first visible category so
  // real, selectable options are on screen immediately, without touching
  // any category a customer already opened or closed themselves (that's
  // what the "none already open" check guards against).
  function openFirstCategoryIfNoneOpen(container) {
    if (!container) return;
    const blocks = Array.from(container.querySelectorAll('.wd-category'));
    if (blocks.some(b => b.classList.contains('is-open'))) return;
    const first = blocks.find(b => !b.hidden);
    if (!first) return;
    const header = first.querySelector('.wd-category-header');
    const panel = first.querySelector('.wd-category-panel');
    if (!header || !panel) return;
    header.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
    first.classList.add('is-open');
  }

  function selectedInputs(priority) {
    return Array.from(document.querySelectorAll(`input[data-priority="${priority}"]:checked`));
  }

  function heroesEligible() {
    return !!(heroesCheckbox && heroesCheckbox.checked);
  }

  function computeRawOptionalSum() {
    return selectedInputs('C').reduce((sum, el) => sum + (Number(el.dataset.price) || 0), 0);
  }

  function computeSubtotal() {
    return state.basePrice + computeRawOptionalSum() - computeBundleSavings();
  }

  // Final total after the Heroes Discount (15% off one-time work -- see
  // heroes-pricing.html). Premium/custom-quote items are never in the
  // subtotal, so the discount never touches them, matching the sitewide policy.
  function computeTotal() {
    const subtotal = computeSubtotal();
    return heroesEligible() ? subtotal * (1 - HEROES_DISCOUNT_RATE) : subtotal;
  }

  function updatePriceAndBreakdown() {
    const optionalSel = selectedInputs('C');
    const premiumSel = selectedInputs('S');
    const bundled = bundledCategories();
    const subtotal = computeSubtotal();
    const total = computeTotal();
    const heroes = heroesEligible();
    animatePrice(total);

    const selectedCount = optionalSel.length + premiumSel.length;
    const countText = selectedCount === 1
      ? tDyn('feature_count_one', '1 feature selected')
      : fillTemplate(tDyn('feature_count_many', '{{count}} features selected'), { count: selectedCount });
    if (featureCountEl) {
      featureCountEl.hidden = selectedCount === 0;
      featureCountEl.textContent = countText;
    }
    if (mobileBarCountEl) {
      mobileBarCountEl.hidden = selectedCount === 0;
      mobileBarCountEl.textContent = countText;
    }

    // What they'd have paid with no discounts at all, vs. what they're
    // actually paying -- shown as a concrete dollar figure under the price,
    // not just "a discount was applied."
    const rawTotal = state.basePrice + computeRawOptionalSum();
    const totalSavings = rawTotal - total;
    if (totalSavings >= 1) {
      const savingsParts = [];
      if (bundled.length) {
        savingsParts.push(bundled.length === 1
          ? tDyn('savings_part_bundle_one', '1 bundle discount')
          : fillTemplate(tDyn('savings_part_bundle_many', '{{count}} bundle discounts'), { count: bundled.length }));
      }
      if (heroes) savingsParts.push(tDyn('savings_part_heroes', 'Heroes Discount'));
      priceSavingsEl.textContent = fillTemplate(tDyn('price_savings', "🎉 You're saving {{amount}}{{parts}}"), {
        amount: fmtMoney(totalSavings), parts: savingsParts.length ? ` (${savingsParts.join(' + ')})` : '',
      });
      priceSavingsEl.hidden = false;
    } else {
      priceSavingsEl.hidden = true;
    }

    const notes = [];
    if (bundled.length) {
      notes.push(bundled.length === 1
        ? tDyn('note_bundle_one_applied', '1 bundle discount applied')
        : fillTemplate(tDyn('note_bundle_many_applied', '{{count}} bundle discounts applied'), { count: bundled.length }));
    }
    if (heroes) notes.push(tDyn('note_heroes_applied', 'Heroes Discount applied (pending confirmation)'));
    let note = notes.length
      ? fillTemplate(tDyn('note_starting_price_with', 'Starting price -- {{notes}}'), { notes: notes.join(', ') })
      : tDyn('note_starting_price', 'Starting price');
    if (premiumSel.length) {
      note += premiumSel.length === 1
        ? tDyn('note_excludes_one', ' -- excludes 1 custom-quote item')
        : fillTemplate(tDyn('note_excludes_many', ' -- excludes {{count}} custom-quote items'), { count: premiumSel.length });
    }
    priceNoteEl.textContent = note;

    const baseLabel = tDyn(state.package === 'business' ? 'cost_row_base_business' : 'cost_row_base_starter', state.package === 'business' ? 'Business base' : 'Starter base');
    let html = `<div class="wd-cost-row wd-cost-row--base"><span>${escHtml(baseLabel)}</span><strong>${fmtMoney(state.basePrice)}</strong></div>`;
    optionalSel.forEach(el => {
      html += `<div class="wd-cost-row"><span>${escHtml(tCatItem(el.dataset.title))}</span><strong>+$${el.dataset.price}</strong></div>`;
    });
    bundled.forEach(cat => {
      const savings = categorySelectedSubtotal(cat) * BUNDLE_DISCOUNT_RATE;
      const bundleLabel = fillTemplate(tDyn('cost_row_bundle', '{{category}} bundle (10%)'), { category: tCatCategory(cat) });
      html += `<div class="wd-cost-row wd-cost-row--discount"><span>${escHtml(bundleLabel)}</span><strong>-${fmtMoney(savings)}</strong></div>`;
    });
    if (heroes) {
      const heroesLabel = tDyn('cost_row_heroes', 'American Heroes Discount (15%, pending confirmation)');
      html += `<div class="wd-cost-row wd-cost-row--discount"><span>${escHtml(heroesLabel)}</span><strong>-${fmtMoney(subtotal - total)}</strong></div>`;
    }
    if (premiumSel.length) {
      const quoteDividerLabel = tDyn('cost_row_quote_divider', 'Custom-quote add-ons');
      const quoteLabel = tDyn('cost_row_quote', 'Custom quote');
      html += `<div class="wd-cost-row wd-cost-row--divider"><span>${escHtml(quoteDividerLabel)}</span></div>`;
      premiumSel.forEach(el => {
        html += `<div class="wd-cost-row wd-cost-row--quote"><span>${escHtml(tCatItem(el.dataset.title))}</span><strong>${escHtml(quoteLabel)}</strong></div>`;
      });
    }
    if (quoteRecapBreakdownEl) quoteRecapBreakdownEl.innerHTML = html;
    downloadBtn.hidden = false;
    downloadBtn.disabled = !JSPDF_READY;
    downloadBtn.setAttribute('aria-disabled', String(!JSPDF_READY));
    if (pdfErrorEl) pdfErrorEl.hidden = JSPDF_READY;
  }

  function slugForPreview(title) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function onFeatureToggle(input, item) {
    const checked = input.checked;
    const priority = item.priority;
    markPreviewUpdated();

    if (priority === 'S') {
      // Premium items never get visually "built" -- they show as a locked badge only.
      renderBadges();
      updatePriceAndBreakdown();
      saveDraft();
      return;
    }

    browserEmptyEl.hidden = true;
    const slug = slugForPreview(item.title);

    if (item.kind === 'content') {
      if (checked) {
        addPreviewSection(item);
      } else {
        removePreviewSection(slug);
      }
    } else {
      renderBadges();
    }
    updateCategoryBundleUI(item.category);
    updatePriceAndBreakdown();
    saveDraft();
  }

  function cardBodyHtml(item) {
    const entry = PREVIEW_CONTENT[item.title];
    const biz = bizName();
    const titleLabel = escHtml(tCatItem(item.title));
    if (entry) {
      // biz is already HTML-escaped by bizName() -- the translated template
      // text around it is trusted (from i18n JSON, same trust level as the
      // English literals this replaced), so the filled result is NOT
      // escaped again here (that would double-escape biz, e.g. turning a
      // business name with "&" into a literal "&amp;" on the page).
      const visual = entry.visual ? entry.visual(biz) : '';
      const blurb = fillTemplate(tDyn(entry.blurb, PREVIEW_BLURB_EN[entry.blurb] || ''), { biz });
      return `<span class="wd-preview-card-icon">${entry.icon}</span>
        <div class="wd-preview-card-body"><strong>${titleLabel}</strong>${visual}<p>${blurb}</p></div>`;
    }
    const icon = CATEGORY_FALLBACK_ICON[item.category] || '🧩';
    const genericBlurb = fillTemplate(tDyn('preview_generic_blurb', "Now part of {{biz}}'s site."), { biz });
    return `<span class="wd-preview-card-icon">${icon}</span>
      <div class="wd-preview-card-body"><strong>${titleLabel}</strong><p>${genericBlurb}</p></div>`;
  }

  function navLabel(title) {
    const label = tCatItem(title);
    return label.split('/')[0].trim().split(' ').slice(0, 2).join(' ');
  }

  function addPreviewSection(item) {
    const slug = slugForPreview(item.title);
    const existingCard = document.getElementById(`wd-preview-${slug}`);
    if (existingCard) {
      // A rapid uncheck-then-recheck (the bundle box does this in bulk) can
      // land here while the card is still mid-"leaving" -- cancel the
      // pending removal and restore it instead of leaving state desynced
      // from the checkbox. Its nav pill was already removed synchronously
      // (see removePreviewSection), so re-create that if it's missing.
      clearTimeout(existingCard._removeTimeout);
      existingCard.classList.remove('wd-leaving');
      if (!document.getElementById(`wd-nav-${slug}`)) {
        const navPill = document.createElement('span');
        navPill.className = 'wd-preview-nav-pill';
        navPill.id = `wd-nav-${slug}`;
        navPill.textContent = navLabel(item.title);
        previewNavEl.appendChild(navPill);
      }
      return;
    }

    // nav pill -- appended after the always-visible base nav items
    // (Home/Services/About/Contact), never replacing them.
    const navPill = document.createElement('span');
    navPill.className = 'wd-preview-nav-pill';
    navPill.id = `wd-nav-${slug}`;
    navPill.textContent = navLabel(item.title);
    previewNavEl.appendChild(navPill);

    // section card
    const card = document.createElement('div');
    card.className = 'wd-preview-card wd-entering';
    card.id = `wd-preview-${slug}`;
    card.innerHTML = cardBodyHtml(item);
    previewSectionsEl.appendChild(card);
    requestAnimationFrame(() => card.classList.remove('wd-entering'));
  }

  function removePreviewSection(slug) {
    const card = document.getElementById(`wd-preview-${slug}`);
    const nav = document.getElementById(`wd-nav-${slug}`);
    if (nav) nav.remove();
    if (card) {
      card.classList.add('wd-leaving');
      card._removeTimeout = setTimeout(() => {
        if (card.classList.contains('wd-leaving')) card.remove();
      }, 220);
    }
  }

  // Re-renders the text/graphics of every preview card already on screen --
  // called when the business name changes, so cards typed before the name
  // was filled in still pick it up.
  function refreshPreviewContent() {
    const name = businessNameEl && businessNameEl.value.trim();
    browserUrlEl.textContent = name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com' : 'yourbusiness.com';
    const displayName = name || tDyn('preview_default_business_name', 'Your business');
    if (previewHeroNameEl) previewHeroNameEl.textContent = displayName;
    if (previewFooterNameEl) previewFooterNameEl.textContent = displayName;
    if (!state.catalog) return;
    document.querySelectorAll('.wd-preview-card').forEach(card => {
      const slug = card.id.replace('wd-preview-', '');
      for (const cat of state.catalog.categories) {
        const item = cat.items.find(i => slugForPreview(i.title) === slug);
        if (item) { card.innerHTML = cardBodyHtml({ ...item, category: cat.category }); break; }
      }
    });
  }

  function renderBadges() {
    previewBadgesEl.innerHTML = '';
    selectedInputs('C').filter(el => {
      const item = findItem(el.dataset.title);
      return item && item.kind !== 'content';
    }).forEach(el => {
      const item = findItem(el.dataset.title);
      const chip = document.createElement('span');
      chip.className = 'wd-badge-chip';
      chip.textContent = `${CATEGORY_FALLBACK_ICON[item.category] || '⚙️'} ${tCatItem(item.title)}`;
      previewBadgesEl.appendChild(chip);
    });
    selectedInputs('S').forEach(el => {
      const chip = document.createElement('span');
      chip.className = 'wd-badge-chip wd-badge-chip--locked';
      chip.textContent = `🔒 ${tCatItem(el.dataset.title)} ${tDyn('badge_custom_quote', '(custom quote)')}`;
      previewBadgesEl.appendChild(chip);
    });
  }

  function findItem(title) {
    if (!state.catalog) return null;
    for (const cat of state.catalog.categories) {
      const found = cat.items.find(i => i.title === title);
      if (found) return { ...found, category: cat.category };
    }
    return null;
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
        renderCategoryGroup(optionalContainer, data.categories, 'C');
        renderCategoryGroup(premiumContainer, data.categories, 'S');
        // Clear only the dynamically-added nav pills -- the base nav's own
        // Home/Services/About/Contact pills stay put, since the preview
        // now always looks like a real (if starter) site rather than
        // starting empty.
        Array.from(previewNavEl.querySelectorAll('.wd-preview-nav-pill:not(.wd-preview-nav-pill--base)')).forEach(el => el.remove());
        previewSectionsEl.innerHTML = '';
        previewBadgesEl.innerHTML = '';
        browserEmptyEl.hidden = true;
        previewBaseEl.hidden = false;
        refreshPreviewContent();
        switchFeatureTab('addons');
        if (draft) applyDraft(draft);
        updatePriceAndBreakdown();
        if (!draft) saveDraft();
        if (mobileBarEl) mobileBarEl.classList.add('is-visible');
        document.body.classList.add('has-mobile-bar');
        syncMobileBarHeight();
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
  // rendered its checkboxes -- mirrors the exact pattern the lts:langchange
  // handler below already uses to restore checked state after a re-render.
  function applyDraft(draft) {
    Array.from(document.querySelectorAll('input[data-priority]')).forEach(el => {
      if (draft.checkedTitles.includes(el.dataset.title)) {
        el.checked = true;
        if (el.dataset.priority === 'C') {
          const item = findItem(el.dataset.title);
          if (item && item.kind === 'content') addPreviewSection(item);
        }
      }
    });
    renderBadges();
    state.catalog.categories.forEach(cat => updateCategoryBundleUI(cat.category));
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
  document.querySelectorAll('[data-next]').forEach(btn => {
    btn.addEventListener('click', () => showPanel(btn.dataset.next));
  });
  function finishLater() {
    doneMessageEl.textContent = tDyn('done_message_quick_only',
      "Got it -- we'll reach out using the contact method you picked. If you'd rather add your project details now, you can always start another Website Designer request.");
    clearDraft();
    showPanel('done');
  }

  // The resume token travels only as a URL fragment (never a query string,
  // so it's never sent to the server as part of this navigation, and never
  // logged) -- see netlify/functions/website-designer.js for the full
  // security model (hash-only storage, 24h expiry, single use, timing-safe
  // validation).
  function worksheetUrl() {
    if (!state.quickLeadId || !state.resumeToken) return null;
    return 'website-project-brief.html#resume=' + encodeURIComponent(state.quickLeadId + '.' + state.resumeToken);
  }

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
  function openWorksheet() {
    const url = worksheetUrl();
    if (!url) return;
    const win = window.open(url, '_blank');
    // A plain truthiness check on `win` isn't enough: Safari on macOS has
    // been observed handing back a real (non-null) Window reference even
    // when the popup was actually blocked, unlike Chromium which reliably
    // returns null in that case. On a genuinely-opened tab, `win.closed`
    // reads false at this point (it was just created); on Safari's blocked-
    // but-truthy case it reads back true immediately, so checking it closes
    // the gap the null check alone misses.
    if (!win || win.closed || typeof win.closed === 'undefined') {
      if (wdWorksheetFallbackLink) wdWorksheetFallbackLink.href = url;
      if (wdWorksheetFallback) wdWorksheetFallback.hidden = false;
      return;
    }
    try { win.opener = null; } catch (e) { /* best-effort hardening only */ }
    if (wdWorksheetFallback) wdWorksheetFallback.hidden = true;
    showPanel('worksheet-opened');
  }

  document.querySelectorAll('[data-prompt-choice="no"]').forEach(btn => {
    btn.addEventListener('click', finishLater);
  });
  wdPromptYesBtn?.addEventListener('click', openWorksheet);
  wdFinishLaterBtn?.addEventListener('click', finishLater);
  wdOpenWorksheetAgainBtn?.addEventListener('click', openWorksheet);
  heroesCheckbox?.addEventListener('change', () => {
    if (state.package) updatePriceAndBreakdown();
    saveDraft();
  });

  featureTabsEl?.querySelectorAll('.wd-feature-tab').forEach(btn => {
    btn.addEventListener('click', () => switchFeatureTab(btn.dataset.featureTab));
  });
  featureSearchEl?.addEventListener('input', () => {
    state.searchQuery = featureSearchEl.value;
    applyFeatureFilters();
  });
  reviewSubmitBtn?.addEventListener('click', () => showPanel('3'));
  // The quote form/review panel lives inside #wdSidebar's panel system --
  // if a customer taps "Review & submit" from the floating mobile bar
  // while looking at Live Preview mode, #wdSidebar is display:none, so
  // switch back to Customize first or the panel change would be invisible.
  mobileReviewBtn?.addEventListener('click', () => {
    setMobileMode('customize', { skipFocus: true });
    showPanel('3');
  });

  // Debounced draft save on every keystroke in the quick-quote form (event
  // delegation via bubbling 'input', so this covers every current and
  // future named field in the form with one listener).
  quickForm?.addEventListener('input', saveDraft);

  businessNameEl?.addEventListener('input', refreshPreviewContent);
  businessNameEl?.addEventListener('keydown', (e) => {
    // A single-line field -- don't let Enter attempt to submit from
    // steps 1/2, where the rest of the quick form's required fields
    // aren't visible yet.
    if (e.key === 'Enter') e.preventDefault();
  });

  function selectionPayload() {
    return {
      optionalSelected: selectedInputs('C').map(el => ({ title: el.dataset.title, price: Number(el.dataset.price) || 0 })),
      premiumSelected: selectedInputs('S').map(el => el.dataset.title),
      heroesDiscount: heroesEligible(),
      bundledCategories: bundledCategories(),
      bundleSavings: computeBundleSavings(),
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
    const { optionalSelected, premiumSelected, heroesDiscount, bundledCategories: bundled, bundleSavings } = selectionPayload();
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
      optionalSelected, premiumSelected,
      bundledCategories: bundled, bundleSavings,
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

  // Step 3: quick quote capture. Minimal fields only (name/email/phone/
  // preferred contact method) -- no content brief, no PDF -- so a lead
  // reaches Dylan's inbox the moment someone decides the price works for
  // them, instead of requiring the full project-details form first.
  if (quickForm) {
    quickForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.package) return;
      if (document.getElementById('wdHoneypot').value) return; // bot

      const submitBtn = document.getElementById('wdQuickSubmitBtn');
      submitBtn.disabled = true;
      quickFormStatus.textContent = tDyn('status_sending_quote', 'Sending your quote request...');

      const { optionalSelected, premiumSelected, heroesDiscount, bundledCategories: bundled, bundleSavings } = selectionPayload();
      const customerName = document.getElementById('wdName').value;
      const email = document.getElementById('wdEmail').value;
      const phone = document.getElementById('wdPhone').value;
      const preferredContact = document.getElementById('wdPreferredContact').value;

      const payload = {
        stage: 'quick',
        package: state.package,
        businessName: document.getElementById('wdBusinessName').value,
        customerName, email, phone, preferredContact,
        subtotal: Math.round(computeSubtotal()),
        estimateTotal: Math.round(computeTotal()),
        heroesDiscount,
        bundledCategories: bundled,
        bundleSavings: Math.round(bundleSavings),
        optionalSelected, premiumSelected,
      };

      fetch('/.netlify/functions/website-designer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
          state.quickLeadId = data.id || submissionId();
          state.resumeToken = data.resumeToken || null;
          state.customerName = customerName;
          state.customerEmail = email;
          state.customerPhone = phone;
          state.preferredContact = preferredContact;
          document.getElementById('wdSubmissionId').textContent = state.quickLeadId;
          saveDraftNow();
          showPanel('prompt');
        })
        .catch((err) => {
          quickFormStatus.textContent = err.message && err.message !== 'Failed to fetch'
            ? err.message
            : tDyn('error_generic_submit', 'Something went wrong sending your project -- please call 804-309-0968 or email dylan@lit-solutions.tech directly.');
          submitBtn.disabled = false;
        });
    });
  }

  // The full content brief, file uploads, and full-submission PDF/POST now
  // live entirely in website-project-brief.html / js/website-project-brief.js
  // (opened in a new tab via openWorksheet() above) -- this page never
  // shows the complete brief inline again.

  // Everything above is built from JS, not static HTML, so switching
  // language mid-session (the visitor is on Step 2/3 already) needs an
  // explicit re-render -- i18n.js's normal data-i18n pass never touches
  // this tool's dynamically-generated content. Category panels get fully
  // rebuilt (same as a fresh catalog load), so checked state is captured
  // first and restored after, rather than lost.
  document.addEventListener('lts:langchange', () => {
    if (!state.catalog) return;
    const checkedTitles = new Set(Array.from(document.querySelectorAll('input[data-priority]:checked')).map(el => el.dataset.title));
    renderIncludedSummary();
    renderCategoryGroup(optionalContainer, state.catalog.categories, 'C');
    renderCategoryGroup(premiumContainer, state.catalog.categories, 'S');
    Array.from(document.querySelectorAll('input[data-priority]')).forEach(el => {
      if (checkedTitles.has(el.dataset.title)) el.checked = true;
    });
    state.catalog.categories.forEach(cat => updateCategoryBundleUI(cat.category));
    refreshPreviewContent();
    renderBadges();
    updatePriceAndBreakdown();
    renderCategoryChips();
    applyFeatureFilters();
    // renderCategoryGroup() just rebuilt every category block from scratch
    // (fresh accordion markup, nothing open), so re-apply the same
    // "land on real, selectable options" behavior a first-time catalog
    // load gets, instead of leaving a customer who switched languages
    // mid-selection staring at an all-collapsed list.
    if (state.featureTab === 'addons') openFirstCategoryIfNoneOpen(optionalContainer);
    if (state.featureTab === 'premium') openFirstCategoryIfNoneOpen(premiumContainer);
    syncMobileBarHeight();
  });

  // Resume an interrupted session (accidental refresh/navigation) --
  // silent, since sessionStorage only ever holds this same tab's own
  // in-progress draft, not something from a different visit to second-guess.
  const savedDraft = loadDraft();
  if (savedDraft) loadCatalog(savedDraft.package, savedDraft);
});
