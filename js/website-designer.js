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
  const priceNoteEl = document.getElementById('wdPriceNote');
  const browserUrlEl = document.getElementById('wdBrowserUrl');
  const browserEmptyEl = document.getElementById('wdBrowserEmpty');
  const previewNavEl = document.getElementById('wdPreviewNav');
  const previewSectionsEl = document.getElementById('wdPreviewSections');
  const previewBadgesEl = document.getElementById('wdPreviewBadges');
  const costBreakdownEl = document.getElementById('wdCostBreakdown');
  const downloadBtn = document.getElementById('wdDownloadPdf');
  const heroesCheckbox = document.getElementById('wdHeroesDiscount');
  const HEROES_DISCOUNT_RATE = 0.15; // 15% off one-time work -- matches heroes-pricing.html

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

  // Mock preview content per feature title -- icon + a short representative
  // blurb shown in the growing site mock-up. Anything not listed here still
  // gets a sensible generic block, keyed off its category.
  const PREVIEW_CONTENT = {
    'Additional standard pages': { icon: '📄', blurb: 'A new page, ready for your content.' },
    'Blog / News section': { icon: '📰', blurb: '"5 Tips for Winterizing Your Boat" and more.' },
    'Portfolio / Gallery page': { icon: '🖼️', blurb: 'Recent projects, with photos and write-ups.' },
    'FAQ page': { icon: '❓', blurb: 'Answers to the questions you get asked most.' },
    'Testimonials / Reviews': { icon: '💬', blurb: '"Best service in the area!" -- a happy customer.' },
    'Team / Staff page': { icon: '🧑‍🔧', blurb: 'Meet the people behind the business.' },
    'Pricing page': { icon: '💲', blurb: 'Clear, upfront rates for what you offer.' },
    'Image gallery': { icon: '🌆', blurb: 'A responsive photo grid.' },
    'Custom graphics & icons': { icon: '🎨', blurb: 'Icons and graphics matched to your brand.' },
    'Light / dark appearance mode': { icon: '🌗', blurb: 'Visitors can switch between light and dark.' },
    'Motion & transitions': { icon: '✨', blurb: 'Subtle animation as visitors scroll.' },
    'Breadcrumb navigation': { icon: '🧭', blurb: 'Home > Services > This Page.' },
    'In-page navigation (anchors)': { icon: '📌', blurb: 'Jump links for long pages.' },
    'Sitemap page': { icon: '🗺️', blurb: 'A plain list of every page on the site.' },
    'Site-wide search': { icon: '🔎', blurb: 'Visitors can search your whole site.' },
    'Search filters & scopes': { icon: '🧮', blurb: 'Narrow search results by section.' },
    'Search suggestions / autocomplete': { icon: '⌨️', blurb: 'Suggestions appear as visitors type.' },
    'Additional custom forms': { icon: '📝', blurb: 'A purpose-built intake or request form.' },
    'File upload with validation': { icon: '📎', blurb: 'Visitors can attach files to a form.' },
    'Multi-step forms': { icon: '🪜', blurb: 'A longer form broken into easy steps.' },
    'Map / location embed': { icon: '📍', blurb: 'An embedded map to your location.' },
    'Newsletter signup': { icon: '✉️', blurb: 'Visitors can subscribe for updates.' },
    'Live chat integration': { icon: '💬', blurb: 'A chat bubble for real-time questions.' },
    'Online Booking Request Form': { icon: '📅', blurb: 'Pick a service and a preferred time.' },
    'Star Ratings on Testimonials': { icon: '⭐', blurb: 'Testimonials now show a star rating.' },
    'Enhanced SEO & Structured Data Package': { icon: '📈', blurb: 'Richer search-result previews.' },
    'Consent management': { icon: '🍪', blurb: 'A cookie/consent preference center.' },
    'Notification preference center': { icon: '🔔', blurb: 'Visitors control what they get notified about.' },
  };
  const CATEGORY_FALLBACK_ICON = { 'Core Pages': '📄', 'Design & Branding': '🎨', 'Navigation': '🧭',
    'Search': '🔎', 'Forms & Validation': '📝', 'Contact & Communication': '✉️', 'Notifications': '🔔',
    'Privacy & Legal': '🔒', 'SEO & Analytics': '📈', 'Security & Hosting': '🛡️', 'Media Management': '🖼️',
    'Content Management': '🗂️', 'Booking & Scheduling': '📅', 'Reviews & Ratings': '⭐',
    'User Accounts': '👤', 'Account Management': '👤', 'Personalization': '🧩' };

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

  function renderCategoryGroup(container, categories, priority) {
    container.innerHTML = '';
    categories.forEach(cat => {
      const items = cat.items.filter(i => i.priority === priority);
      if (!items.length) return;
      const block = document.createElement('div');
      block.className = 'wd-category';
      const heading = document.createElement('h3');
      heading.className = 'wd-category-title';
      heading.textContent = cat.category;
      block.appendChild(heading);
      const grid = document.createElement('div');
      grid.className = 'checkbox-grid';
      items.forEach(i => {
        const label = document.createElement('label');
        label.className = 'checkbox-pill wd-feature-pill';
        const priceTag = i.price != null ? `<span class="wd-price-tag">+$${i.price}</span>` : '<span class="wd-price-tag wd-price-tag--quote">quote</span>';
        label.innerHTML = `<input type="checkbox" data-priority="${priority}" data-title="${i.title.replace(/"/g, '&quot;')}" data-price="${i.price != null ? i.price : ''}" data-category="${cat.category.replace(/"/g, '&quot;')}" value="${i.pdf_label.replace(/"/g, '&quot;')}"> <span class="wd-feature-pill-label">${i.title}</span>${priceTag}`;
        label.querySelector('input').addEventListener('change', (e) => onFeatureToggle(e.target, i));
        grid.appendChild(label);
      });
      block.appendChild(grid);
      container.appendChild(block);
    });
  }

  function selectedInputs(priority) {
    return Array.from(document.querySelectorAll(`input[data-priority="${priority}"]:checked`));
  }

  function heroesEligible() {
    return !!(heroesCheckbox && heroesCheckbox.checked);
  }

  function computeSubtotal() {
    const optionalSum = selectedInputs('C').reduce((sum, el) => sum + (Number(el.dataset.price) || 0), 0);
    return state.basePrice + optionalSum;
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
    const subtotal = computeSubtotal();
    const total = computeTotal();
    const heroes = heroesEligible();
    animatePrice(total);
    priceNoteEl.textContent = (heroes ? 'Starting price, Heroes Discount applied' : 'Starting price') +
      (premiumSel.length ? ` -- excludes ${premiumSel.length} custom-quote item${premiumSel.length === 1 ? '' : 's'}` : '');

    let html = `<div class="wd-cost-row wd-cost-row--base"><span>${state.package === 'business' ? 'Business' : 'Starter'} base</span><strong>${fmtMoney(state.basePrice)}</strong></div>`;
    optionalSel.forEach(el => {
      html += `<div class="wd-cost-row"><span>${el.dataset.title}</span><strong>+$${el.dataset.price}</strong></div>`;
    });
    if (heroes) {
      html += `<div class="wd-cost-row wd-cost-row--discount"><span>American Heroes Discount (15%)</span><strong>-${fmtMoney(subtotal - total)}</strong></div>`;
    }
    if (premiumSel.length) {
      html += `<div class="wd-cost-row wd-cost-row--divider"><span>Custom-quote add-ons</span></div>`;
      premiumSel.forEach(el => {
        html += `<div class="wd-cost-row wd-cost-row--quote"><span>${el.dataset.title}</span><strong>quote</strong></div>`;
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
    updatePriceAndBreakdown();
  }

  function addPreviewSection(item) {
    const slug = slugForPreview(item.title);
    if (document.getElementById(`wd-preview-${slug}`)) return;

    const preview = PREVIEW_CONTENT[item.title] || { icon: CATEGORY_FALLBACK_ICON[item.category] || '🧩', blurb: 'Now part of your site.' };

    // nav pill
    previewNavEl.hidden = false;
    const navPill = document.createElement('span');
    navPill.className = 'wd-preview-nav-pill';
    navPill.id = `wd-nav-${slug}`;
    navPill.textContent = item.title.split('/')[0].trim().split(' ').slice(0, 2).join(' ');
    previewNavEl.appendChild(navPill);

    // section card
    const card = document.createElement('div');
    card.className = 'wd-preview-card wd-entering';
    card.id = `wd-preview-${slug}`;
    card.innerHTML = `<span class="wd-preview-card-icon">${preview.icon}</span>
      <div><strong>${item.title}</strong><p>${preview.blurb}</p></div>`;
    previewSectionsEl.appendChild(card);
    requestAnimationFrame(() => card.classList.remove('wd-entering'));
  }

  function removePreviewSection(slug) {
    const card = document.getElementById(`wd-preview-${slug}`);
    const nav = document.getElementById(`wd-nav-${slug}`);
    if (card) {
      card.classList.add('wd-leaving');
      setTimeout(() => card.remove(), 220);
    }
    if (nav) nav.remove();
    if (!previewSectionsEl.children.length) {
      setTimeout(() => { if (!previewSectionsEl.children.length) previewNavEl.hidden = true; }, 230);
    }
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
        updatePriceAndBreakdown();
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

  document.getElementById('wdBusinessName')?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    browserUrlEl.textContent = val ? val.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com' : 'yourbusiness.com';
  });

  function selectionPayload() {
    return {
      optionalSelected: selectedInputs('C').map(el => ({ title: el.dataset.title, price: Number(el.dataset.price) || 0 })),
      premiumSelected: selectedInputs('S').map(el => el.dataset.title),
      heroesDiscount: heroesEligible(),
    };
  }

  function buildPdf() {
    if (!window.jspdf) return null;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const { optionalSelected, premiumSelected, heroesDiscount } = selectionPayload();
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
    if (heroesDiscount) {
      doc.setFontSize(10);
      doc.text(`(Subtotal $${subtotal.toLocaleString()}, less 15% American Heroes Discount, pending verification)`, 14, y); y += 7;
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
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!state.package) return;
      if (document.getElementById('wdHoneypot').value) return; // bot

      const submitBtn = document.getElementById('wdSubmitBtn');
      submitBtn.disabled = true;
      formStatus.textContent = 'Building your PDF and sending it over...';

      const doc = buildPdf();
      const pdfBase64 = doc ? doc.output('datauristring').split(',')[1] : null;
      const { optionalSelected, premiumSelected, heroesDiscount } = selectionPayload();

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
        optionalSelected, premiumSelected,
        pdfBase64, pdfFilename: 'website-designer-summary.pdf',
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
