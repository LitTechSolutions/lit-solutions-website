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
  const form = document.getElementById('wdForm');
  const formStatus = document.getElementById('wdFormStatus');

  const priceAmountEl = document.getElementById('wdPriceAmount');
  const priceSavingsEl = document.getElementById('wdPriceSavings');
  const priceNoteEl = document.getElementById('wdPriceNote');
  const businessNameEl = document.getElementById('wdBusinessName');
  const browserUrlEl = document.getElementById('wdBrowserUrl');
  const browserEmptyEl = document.getElementById('wdBrowserEmpty');
  const previewNavEl = document.getElementById('wdPreviewNav');
  const previewSectionsEl = document.getElementById('wdPreviewSections');
  const previewBadgesEl = document.getElementById('wdPreviewBadges');
  const costBreakdownEl = document.getElementById('wdCostBreakdown');
  const downloadBtn = document.getElementById('wdDownloadPdf');
  const heroesCheckbox = document.getElementById('wdHeroesDiscount');
  const HEROES_DISCOUNT_RATE = 0.15; // 15% off one-time work -- matches heroes-pricing.html
  const BUNDLE_DISCOUNT_RATE = 0.10; // 10% off a category when every optional item in it is selected
  const BUNDLE_MIN_ITEMS = 2; // a "bundle" of one item isn't a bundle
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB per logo/photo, raw file size
  const MAX_PHOTOS = 4;

  const state = {
    package: null,
    basePrice: 0,
    displayedTotal: 0,
    catalog: null,
  };

  const INCLUDED_SUMMARY = {
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

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function bizName() {
    const v = businessNameEl && businessNameEl.value.trim();
    return v ? escHtml(v) : 'your business';
  }

  // Mock preview content per feature title -- these are the "content" kind
  // features (the ones the reference spec treats as actual visible pages),
  // so they're the only ones that get a full mini section card in the
  // growing site mock-up. Each renders a small graphic (built from CSS, no
  // external assets) plus a blurb that plugs in whatever business name has
  // been typed so far. Anything not listed here still gets a sensible
  // generic block, keyed off its category's fallback icon.
  const PREVIEW_CONTENT = {
    'Additional standard pages': {
      icon: '📄',
      visual: () => '<div class="wd-mock-page"><span></span><span></span><span class="wd-mock-line-short"></span></div>',
      blurb: (biz) => `A new page for ${biz}, ready for your content.`,
    },
    'Blog / News section': {
      icon: '📰',
      visual: (biz) => `<div class="wd-mock-blogcard"><span class="wd-mock-swatch wd-mock-swatch--a"></span><div class="wd-mock-blogcard-text"><b>5 things ${biz} customers ask most</b><small>Posted this week</small></div></div>`,
      blurb: (biz) => `Fresh posts and news from ${biz}.`,
    },
    'Portfolio / Gallery page': {
      icon: '🖼️',
      visual: () => '<div class="wd-mock-grid-4"><span class="wd-mock-swatch wd-mock-swatch--a"></span><span class="wd-mock-swatch wd-mock-swatch--b"></span><span class="wd-mock-swatch wd-mock-swatch--c"></span><span class="wd-mock-swatch wd-mock-swatch--d"></span></div>',
      blurb: (biz) => `Recent ${biz} projects, with photos and write-ups.`,
    },
    'FAQ page': {
      icon: '❓',
      visual: (biz) => `<div class="wd-mock-faq"><div class="wd-mock-faq-row"><span class="wd-mock-faq-plus">+</span>What areas does ${biz} serve?</div><div class="wd-mock-faq-row"><span class="wd-mock-faq-plus">+</span>How much does it cost?</div></div>`,
      blurb: (biz) => `Answers to what ${biz} customers ask most.`,
    },
    'Testimonials / Reviews': {
      icon: '💬',
      visual: () => '<div class="wd-mock-quote">&ldquo;Best service in the area!&rdquo;</div><div class="wd-mock-stars">★★★★★</div>',
      blurb: (biz) => `Real feedback from ${biz} customers, front and center.`,
    },
    'Team / Staff page': {
      icon: '🧑‍🔧',
      visual: () => '<div class="wd-mock-row wd-mock-avatars"><span class="wd-mock-avatar">👤</span><span class="wd-mock-avatar">👤</span><span class="wd-mock-avatar">👤</span></div>',
      blurb: (biz) => `Meet the people behind ${biz}.`,
    },
    'Pricing page': {
      icon: '💲',
      visual: () => '<div class="wd-mock-row wd-mock-pricing"><span class="wd-mock-bar">$</span><span class="wd-mock-bar wd-mock-bar--tall">$$</span><span class="wd-mock-bar">$$$</span></div>',
      blurb: (biz) => `Clear, upfront rates for what ${biz} offers.`,
    },
    'Image gallery': {
      icon: '🌆',
      visual: () => '<div class="wd-mock-grid-4"><span class="wd-mock-swatch wd-mock-swatch--b"></span><span class="wd-mock-swatch wd-mock-swatch--d"></span><span class="wd-mock-swatch wd-mock-swatch--a"></span><span class="wd-mock-swatch wd-mock-swatch--c"></span></div>',
      blurb: (biz) => `A responsive photo grid for ${biz}.`,
    },
    'Custom graphics & icons': {
      icon: '🎨',
      visual: () => '<div class="wd-mock-row wd-mock-icons"><span class="wd-mock-icon-shape wd-mock-icon-shape--circle"></span><span class="wd-mock-icon-shape wd-mock-icon-shape--square"></span><span class="wd-mock-icon-shape wd-mock-icon-shape--diamond"></span><span class="wd-mock-icon-shape wd-mock-icon-shape--dot"></span></div>',
      blurb: (biz) => `Icons and graphics matched to ${biz}'s brand.`,
    },
    'Sitemap page': {
      icon: '🗺️',
      visual: () => '<div class="wd-mock-sitemap"><span>• Home</span><span>• About</span><span class="wd-mock-indent">• Services</span></div>',
      blurb: (biz) => `A plain list of every page on ${biz}'s site.`,
    },
    'Additional custom forms': {
      icon: '📝',
      visual: () => '<div class="wd-mock-form"><span class="wd-mock-input"></span><span class="wd-mock-btn">Submit</span></div>',
      blurb: (biz) => `A purpose-built request form for ${biz}.`,
    },
    'Map / location embed': {
      icon: '📍',
      visual: () => '<div class="wd-mock-map"><span class="wd-mock-pin">📍</span></div>',
      blurb: (biz) => `An embedded map to ${biz}'s location.`,
    },
    'Online Booking Request Form': {
      icon: '📅',
      visual: () => '<div class="wd-mock-calendar"><span></span><span></span><span class="wd-mock-calendar-selected"></span><span></span><span></span><span></span><span></span></div>',
      blurb: (biz) => `Pick a service and a preferred time with ${biz}.`,
    },
    'Data-subject request intake': {
      icon: '📋',
      visual: () => '<div class="wd-mock-form"><span class="wd-mock-input"></span><span class="wd-mock-btn">Submit</span></div>',
      blurb: (biz) => `A simple, compliant way for ${biz}'s visitors to request their data.`,
    },
  };
  const CATEGORY_FALLBACK_ICON = { 'Core Pages': '📄', 'Design & Branding': '🎨', 'Navigation': '🧭',
    'Search': '🔎', 'Forms & Validation': '📝', 'Contact & Communication': '✉️', 'Notifications': '🔔',
    'Privacy & Legal': '🔒', 'SEO & Analytics': '📈', 'Security & Hosting': '🛡️', 'Media Management': '🖼️',
    'Content Management': '🗂️', 'Booking & Scheduling': '📅', 'Reviews & Ratings': '⭐',
    'User Accounts': '👤', 'Account Management': '👤', 'Personalization': '🧩' };

  // ---- Content-brief conditional sections -----------------------------
  // Business tier includes these content pages standard (no checkbox), so
  // their brief sections must always show for that package regardless of
  // selection state. Starter only builds them if the matching optional
  // feature is checked, so there the brief section follows the checkbox.
  const CONTENT_BRIEF_ALWAYS_INCLUDED = {
    business: ['staff', 'testimonials', 'faq', 'blog', 'gallery', 'newsletter'],
    starter: [],
  };
  const CONTENT_BRIEF_TRIGGER_TITLES = {
    staff: ['Team / Staff page'],
    testimonials: ['Testimonials / Reviews'],
    faq: ['FAQ page'],
    blog: ['Blog / News section'],
    gallery: ['Portfolio / Gallery page', 'Image gallery'],
    pricing: ['Pricing page'],
    booking: ['Online Booking Request Form'],
    newsletter: ['Newsletter signup'],
    sms: ['SMS / text notifications'],
  };

  function isBriefKeyActive(key) {
    if ((CONTENT_BRIEF_ALWAYS_INCLUDED[state.package] || []).includes(key)) return true;
    const titles = CONTENT_BRIEF_TRIGGER_TITLES[key] || [];
    const checked = selectedInputs('C').concat(selectedInputs('S'));
    return checked.some(el => titles.includes(el.dataset.title));
  }

  function updateBriefVisibility() {
    Object.keys(CONTENT_BRIEF_TRIGGER_TITLES).forEach(key => {
      const group = document.getElementById(`wdBriefGroup_${key}`);
      if (!group) return;
      group.hidden = !isBriefKeyActive(key);
    });
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
      if (name === '2' || name === '3' || name === 'done') s.disabled = false;
    });
  }

  function renderIncludedSummary() {
    includedTitle.textContent = `Included in your ${state.package === 'business' ? 'Business' : 'Starter'} package`;
    includedSummary.innerHTML = '<ul class="wd-included-list">' +
      INCLUDED_SUMMARY[state.package].map(t => `<li>${t}</li>`).join('') + '</ul>';
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
    if (checkedCount) return `${checkedCount} of ${items.length} selected -- ${fmtMoney(categorySelectedSubtotal(category))}`;
    const names = items.slice(0, 3).map(i => i.title.split('(')[0].trim());
    const extra = items.length > 3 ? ` +${items.length - 3} more` : '';
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
      if (allChecked) savingsBadge.textContent = `🤝 We've got your back -- saving ${fmtMoney(categorySelectedSubtotal(category) * BUNDLE_DISCOUNT_RATE)} (10%)!`;
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
    updateBriefVisibility();
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
      header.innerHTML = `
        <span class="wd-category-header-main">
          <span class="wd-category-title">${escHtml(cat.category)}</span>
          <span class="wd-category-summary" data-summary>${escHtml(priority === 'C' ? categorySummaryText(cat.category, items) : `${items.length} item${items.length === 1 ? '' : 's'} -- custom quote`)}</span>
        </span>
        <svg class="wd-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
      block.appendChild(header);

      if (priority === 'C' && items.length >= BUNDLE_MIN_ITEMS) {
        const bundleTotal = items.reduce((s, i) => s + (i.price || 0), 0);
        const bundleBox = document.createElement('label');
        bundleBox.className = 'wd-bundle-box';
        bundleBox.innerHTML = `
          <input type="checkbox" class="wd-bundle-checkbox" data-category="${escHtml(cat.category)}">
          <span class="wd-bundle-box-main">
            <strong>Get all ${items.length} ${escHtml(cat.category)} features</strong>
            <span class="wd-bundle-box-price"><span class="wd-bundle-now">${fmtMoney(bundleTotal * (1 - BUNDLE_DISCOUNT_RATE))}</span> <s class="wd-bundle-was">${fmtMoney(bundleTotal)}</s> <em>save 10%</em></span>
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
        const priceTag = i.price != null ? `<span class="wd-price-tag">+$${i.price}</span>` : '<span class="wd-price-tag wd-price-tag--quote">quote</span>';
        label.innerHTML = `<input type="checkbox" data-priority="${priority}" data-title="${escHtml(i.title)}" data-price="${i.price != null ? i.price : ''}" data-category="${escHtml(cat.category)}" value="${escHtml(i.pdf_label)}"> <span class="wd-feature-pill-label">${escHtml(i.title)}</span>${priceTag}`;
        label.querySelector('input').addEventListener('change', (e) => onFeatureToggle(e.target, itemFull));
        grid.appendChild(label);
      });
      panel.appendChild(grid);
      block.appendChild(panel);

      container.appendChild(block);
    });
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

    // What they'd have paid with no discounts at all, vs. what they're
    // actually paying -- shown as a concrete dollar figure under the price,
    // not just "a discount was applied."
    const rawTotal = state.basePrice + computeRawOptionalSum();
    const totalSavings = rawTotal - total;
    if (totalSavings >= 1) {
      const savingsParts = [];
      if (bundled.length) savingsParts.push(`${bundled.length} bundle discount${bundled.length === 1 ? '' : 's'}`);
      if (heroes) savingsParts.push('Heroes Discount');
      priceSavingsEl.textContent = `🎉 You're saving ${fmtMoney(totalSavings)}${savingsParts.length ? ` (${savingsParts.join(' + ')})` : ''}`;
      priceSavingsEl.hidden = false;
    } else {
      priceSavingsEl.hidden = true;
    }

    const notes = [];
    if (bundled.length) notes.push(`${bundled.length} bundle discount${bundled.length === 1 ? '' : 's'} applied`);
    if (heroes) notes.push('Heroes Discount applied');
    let note = notes.length ? `Starting price -- ${notes.join(', ')}` : 'Starting price';
    if (premiumSel.length) note += ` -- excludes ${premiumSel.length} custom-quote item${premiumSel.length === 1 ? '' : 's'}`;
    priceNoteEl.textContent = note;

    let html = `<div class="wd-cost-row wd-cost-row--base"><span>${state.package === 'business' ? 'Business' : 'Starter'} base</span><strong>${fmtMoney(state.basePrice)}</strong></div>`;
    optionalSel.forEach(el => {
      html += `<div class="wd-cost-row"><span>${escHtml(el.dataset.title)}</span><strong>+$${el.dataset.price}</strong></div>`;
    });
    bundled.forEach(cat => {
      const savings = categorySelectedSubtotal(cat) * BUNDLE_DISCOUNT_RATE;
      html += `<div class="wd-cost-row wd-cost-row--discount"><span>${escHtml(cat)} bundle (10%)</span><strong>-${fmtMoney(savings)}</strong></div>`;
    });
    if (heroes) {
      html += `<div class="wd-cost-row wd-cost-row--discount"><span>American Heroes Discount (15%)</span><strong>-${fmtMoney(subtotal - total)}</strong></div>`;
    }
    if (premiumSel.length) {
      html += `<div class="wd-cost-row wd-cost-row--divider"><span>Custom-quote add-ons</span></div>`;
      premiumSel.forEach(el => {
        html += `<div class="wd-cost-row wd-cost-row--quote"><span>${escHtml(el.dataset.title)}</span><strong>quote</strong></div>`;
      });
    }
    costBreakdownEl.innerHTML = html;
    downloadBtn.hidden = false;
  }

  function slugForPreview(title) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function onFeatureToggle(input, item) {
    const checked = input.checked;
    const priority = item.priority;

    if (priority === 'S') {
      // Premium items never get visually "built" -- they show as a locked badge only.
      renderBadges();
      updatePriceAndBreakdown();
      updateBriefVisibility();
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
    updateBriefVisibility();
  }

  function cardBodyHtml(item) {
    const entry = PREVIEW_CONTENT[item.title];
    const biz = bizName();
    if (entry) {
      const visual = entry.visual ? entry.visual(biz) : '';
      const blurb = entry.blurb(biz);
      return `<span class="wd-preview-card-icon">${entry.icon}</span>
        <div class="wd-preview-card-body"><strong>${escHtml(item.title)}</strong>${visual}<p>${blurb}</p></div>`;
    }
    const icon = CATEGORY_FALLBACK_ICON[item.category] || '🧩';
    return `<span class="wd-preview-card-icon">${icon}</span>
      <div class="wd-preview-card-body"><strong>${escHtml(item.title)}</strong><p>Now part of ${biz}'s site.</p></div>`;
  }

  function navLabel(title) {
    return title.split('/')[0].trim().split(' ').slice(0, 2).join(' ');
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
        previewNavEl.hidden = false;
        const navPill = document.createElement('span');
        navPill.className = 'wd-preview-nav-pill';
        navPill.id = `wd-nav-${slug}`;
        navPill.textContent = navLabel(item.title);
        previewNavEl.appendChild(navPill);
      }
      return;
    }

    // nav pill
    previewNavEl.hidden = false;
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
    if (!previewSectionsEl.children.length) {
      setTimeout(() => { if (!previewSectionsEl.children.length) previewNavEl.hidden = true; }, 230);
    }
  }

  // Re-renders the text/graphics of every preview card already on screen --
  // called when the business name changes, so cards typed before the name
  // was filled in still pick it up.
  function refreshPreviewContent() {
    const name = businessNameEl && businessNameEl.value.trim();
    browserUrlEl.textContent = name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com' : 'yourbusiness.com';
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
      chip.textContent = `${CATEGORY_FALLBACK_ICON[item.category] || '⚙️'} ${item.title}`;
      previewBadgesEl.appendChild(chip);
    });
    selectedInputs('S').forEach(el => {
      const chip = document.createElement('span');
      chip.className = 'wd-badge-chip wd-badge-chip--locked';
      chip.textContent = `🔒 ${el.dataset.title} (custom quote)`;
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

  function loadCatalog(pkg) {
    state.package = pkg;
    state.basePrice = pkg === 'business' ? 1299 : 699;
    state.displayedTotal = 0;
    const file = pkg === 'business' ? 'business-catalog.json' : 'starter-catalog.json';
    fetch(file)
      .then(r => r.json())
      .then(data => {
        state.catalog = data;
        renderIncludedSummary();
        renderCategoryGroup(optionalContainer, data.categories, 'C');
        renderCategoryGroup(premiumContainer, data.categories, 'S');
        previewNavEl.innerHTML = '';
        previewNavEl.hidden = true;
        previewSectionsEl.innerHTML = '';
        previewBadgesEl.innerHTML = '';
        browserEmptyEl.hidden = false;
        refreshPreviewContent();
        updatePriceAndBreakdown();
        updateBriefVisibility();
        showPanel('2');
      })
      .catch(err => {
        console.error('Could not load feature catalog', err);
        includedSummary.innerHTML = '<p class="wd-note">Feature list unavailable right now -- you can still submit your project details and we\'ll follow up.</p>';
        showPanel('2');
      });
  }

  document.querySelectorAll('[data-choose-package]').forEach(btn => {
    btn.addEventListener('click', () => loadCatalog(btn.dataset.choosePackage));
  });
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => showPanel(btn.dataset.back));
  });
  document.querySelectorAll('[data-next]').forEach(btn => {
    btn.addEventListener('click', () => showPanel(btn.dataset.next));
  });
  heroesCheckbox?.addEventListener('change', () => {
    if (state.package) updatePriceAndBreakdown();
  });

  businessNameEl?.addEventListener('input', refreshPreviewContent);
  businessNameEl?.addEventListener('keydown', (e) => {
    // A single-line field -- don't let Enter attempt to submit wdForm from
    // steps 1/2, where the form's other required fields aren't visible yet.
    if (e.key === 'Enter') e.preventDefault();
  });

  function fieldVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  // Only sends a conditional field's value when its section is actually
  // active -- otherwise a value typed in before unchecking the triggering
  // feature would still go out even though it's no longer relevant.
  function collectBrief() {
    return {
      description: fieldVal('wdBizDescription'),
      industry: fieldVal('wdBizIndustry'),
      serviceArea: fieldVal('wdServiceArea'),
      servicesList: fieldVal('wdServicesList'),
      brandColors: fieldVal('wdBrandColors'),
      styleReferences: fieldVal('wdStyleReferences'),
      addressHours: fieldVal('wdAddressHours'),
      socialLinks: fieldVal('wdSocialLinks'),
      launchDate: fieldVal('wdLaunchDate'),
      desiredDomain: fieldVal('wdDesiredDomain'),
      staff: isBriefKeyActive('staff') ? fieldVal('wdBriefStaff') : '',
      testimonials: isBriefKeyActive('testimonials') ? fieldVal('wdBriefTestimonials') : '',
      faq: isBriefKeyActive('faq') ? fieldVal('wdBriefFaq') : '',
      blog: isBriefKeyActive('blog') ? fieldVal('wdBriefBlog') : '',
      gallery: isBriefKeyActive('gallery') ? fieldVal('wdBriefGallery') : '',
      pricing: isBriefKeyActive('pricing') ? fieldVal('wdBriefPricing') : '',
      booking: isBriefKeyActive('booking') ? fieldVal('wdBriefBooking') : '',
      newsletter: isBriefKeyActive('newsletter') ? fieldVal('wdBriefNewsletter') : '',
      sms: isBriefKeyActive('sms') ? fieldVal('wdBriefSms') : '',
    };
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // Reads the logo/photo file inputs into base64 for the email attachment --
  // same pattern the PDF already uses (client-generates, server just relays
  // to the email provider). Returns errors instead of throwing so the submit
  // handler can show them inline rather than via a thrown-exception path.
  async function collectImageAttachments() {
    const errors = [];
    let logo = null;
    const logoFile = document.getElementById('wdLogoFile')?.files?.[0];
    if (logoFile) {
      if (logoFile.size > MAX_IMAGE_BYTES) {
        errors.push('Logo file is too large -- please use a file under 4MB.');
      } else {
        logo = { filename: logoFile.name, content: await fileToBase64(logoFile) };
      }
    }

    const photos = [];
    const photoFiles = Array.from(document.getElementById('wdPhotosFile')?.files || []);
    if (photoFiles.length > MAX_PHOTOS) {
      errors.push(`Please attach at most ${MAX_PHOTOS} photos.`);
    } else {
      for (const file of photoFiles) {
        if (file.size > MAX_IMAGE_BYTES) {
          errors.push(`Photo "${file.name}" is too large -- please use files under 4MB each.`);
        } else {
          photos.push({ filename: file.name, content: await fileToBase64(file) });
        }
      }
    }

    return { logo, photos, errors };
  }

  function selectionPayload() {
    return {
      optionalSelected: selectedInputs('C').map(el => ({ title: el.dataset.title, price: Number(el.dataset.price) || 0 })),
      premiumSelected: selectedInputs('S').map(el => el.dataset.title),
      heroesDiscount: heroesEligible(),
      bundledCategories: bundledCategories(),
      bundleSavings: computeBundleSavings(),
    };
  }

  function buildPdf() {
    if (!window.jspdf) return null;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const { optionalSelected, premiumSelected, heroesDiscount, bundledCategories: bundled, bundleSavings } = selectionPayload();
    const business = document.getElementById('wdBusinessName').value || 'Your business';
    const subtotal = computeSubtotal();
    const total = computeTotal();
    let y = 20;

    doc.setFontSize(18);
    doc.text('Website Designer -- Project Summary', 14, y); y += 8;
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Little Technical Solutions LLC  |  dylan@lit-solutions.tech  |  636-426-0289', 14, y); y += 12;

    doc.setTextColor(20);
    doc.setFontSize(13);
    doc.text(`${state.package === 'business' ? 'Business' : 'Starter'} package -- estimated starting total: $${Math.round(total).toLocaleString()}`, 14, y); y += 7;
    doc.setFontSize(10);
    if (bundled.length) {
      doc.text(`(Includes ${bundled.length} category bundle discount${bundled.length === 1 ? '' : 's'} -- ${bundled.join(', ')} -- saving $${Math.round(bundleSavings).toLocaleString()})`, 14, y); y += 7;
    }
    if (heroesDiscount) {
      doc.text(`(Subtotal $${Math.round(subtotal).toLocaleString()}, less 15% American Heroes Discount, pending verification)`, 14, y); y += 7;
    }
    y += 3;

    doc.setFontSize(11);
    doc.text(`Business: ${business}`, 14, y); y += 7;
    doc.text(`Contact: ${document.getElementById('wdName').value || ''}`, 14, y); y += 7;
    doc.text(`Email: ${document.getElementById('wdEmail').value || ''}`, 14, y); y += 7;
    doc.text(`Phone: ${document.getElementById('wdPhone').value || ''}`, 14, y); y += 10;

    doc.setFontSize(12);
    doc.text(`Optional features selected (${optionalSelected.length}):`, 14, y); y += 7;
    doc.setFontSize(10);
    if (!optionalSelected.length) { doc.text('(none)', 18, y); y += 6; }
    optionalSelected.forEach(f => {
      const lines = doc.splitTextToSize(`- ${f.title} (+$${f.price})`, 175);
      doc.text(lines, 18, y); y += 6 * lines.length;
      if (y > 270) { doc.addPage(); y = 20; }
    });
    y += 4;

    doc.setFontSize(12);
    doc.text(`Premium add-ons -- custom quote (${premiumSelected.length}):`, 14, y); y += 7;
    doc.setFontSize(10);
    if (!premiumSelected.length) { doc.text('(none)', 18, y); y += 6; }
    premiumSelected.forEach(t => {
      const lines = doc.splitTextToSize(`- ${t}`, 175);
      doc.text(lines, 18, y); y += 6 * lines.length;
      if (y > 270) { doc.addPage(); y = 20; }
    });
    y += 6;

    const brief = collectBrief();
    const briefLines = [];
    if (brief.description) briefLines.push(['What they do', brief.description]);
    if (brief.industry) briefLines.push(['Industry', brief.industry]);
    if (brief.serviceArea) briefLines.push(['Service area', brief.serviceArea]);
    if (brief.servicesList) briefLines.push(['Services/products', brief.servicesList]);
    if (brief.desiredDomain) briefLines.push(['Desired domain', brief.desiredDomain]);
    if (brief.brandColors) briefLines.push(['Brand colors', brief.brandColors]);
    if (brief.styleReferences) briefLines.push(['Style references', brief.styleReferences]);
    if (brief.addressHours) briefLines.push(['Address / hours', brief.addressHours]);
    if (brief.socialLinks) briefLines.push(['Social links', brief.socialLinks]);
    if (brief.launchDate) briefLines.push(['Preferred launch date', brief.launchDate]);
    [
      ['staff', 'Team/staff'], ['testimonials', 'Testimonials'], ['faq', 'FAQ'], ['blog', 'Blog topics'],
      ['gallery', 'Gallery/portfolio'], ['pricing', 'Pricing'], ['booking', 'Booking details'],
      ['newsletter', 'Newsletter platform'], ['sms', 'SMS notifications'],
    ].forEach(([key, label]) => { if (brief[key]) briefLines.push([label, brief[key]]); });

    if (briefLines.length) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(12);
      doc.text('Business brief:', 14, y); y += 7;
      doc.setFontSize(10);
      briefLines.forEach(([label, value]) => {
        const lines = doc.splitTextToSize(`${label}: ${value}`, 175);
        doc.text(lines, 18, y); y += 6 * lines.length;
        if (y > 270) { doc.addPage(); y = 20; }
      });
      y += 4;
    }

    const notes = document.getElementById('wdNotes').value;
    if (notes) {
      doc.setFontSize(12);
      doc.text('Notes:', 14, y); y += 7;
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(notes, 175);
      doc.text(lines, 18, y); y += 6 * lines.length;
    }

    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text('This is an example estimate only. Final scope and price are confirmed by Little Technical Solutions LLC before any work begins.', 14, 287);

    return doc;
  }

  downloadBtn.addEventListener('click', () => {
    const doc = buildPdf();
    if (!doc) return;
    doc.save('website-designer-summary.pdf');
  });

  function submissionId() {
    return 'WD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.package) return;
      if (document.getElementById('wdHoneypot').value) return; // bot

      const submitBtn = document.getElementById('wdSubmitBtn');
      submitBtn.disabled = true;
      formStatus.textContent = 'Reading your files...';

      const { logo, photos, errors } = await collectImageAttachments();
      if (errors.length) {
        formStatus.textContent = errors.join(' ');
        submitBtn.disabled = false;
        return;
      }

      formStatus.textContent = 'Building your PDF and sending it over...';

      const doc = buildPdf();
      const pdfBase64 = doc ? doc.output('datauristring').split(',')[1] : null;
      const { optionalSelected, premiumSelected, heroesDiscount, bundledCategories: bundled, bundleSavings } = selectionPayload();

      const payload = {
        package: state.package,
        businessName: document.getElementById('wdBusinessName').value,
        customerName: document.getElementById('wdName').value,
        email: document.getElementById('wdEmail').value,
        phone: document.getElementById('wdPhone').value,
        domain: document.getElementById('wdDomain').value,
        notes: document.getElementById('wdNotes').value,
        subtotal: Math.round(computeSubtotal()),
        estimateTotal: Math.round(computeTotal()),
        heroesDiscount,
        bundledCategories: bundled,
        bundleSavings: Math.round(bundleSavings),
        optionalSelected, premiumSelected,
        pdfBase64, pdfFilename: 'website-designer-summary.pdf',
        brief: collectBrief(),
        logo, photos,
      };

      fetch('/.netlify/functions/website-designer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
          document.getElementById('wdSubmissionId').textContent = data.id || submissionId();
          showPanel('done');
        })
        .catch((err) => {
          formStatus.textContent = err.message && err.message !== 'Failed to fetch'
            ? err.message
            : 'Something went wrong sending your project -- please call 636-426-0289 or email dylan@lit-solutions.tech directly.';
          submitBtn.disabled = false;
        });
    });
  }
});
