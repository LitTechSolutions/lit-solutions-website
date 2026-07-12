// website-designer.js -- LTS Website Designer configurator.
//
// Three steps: pick a package, choose optional/premium features from the
// real feature catalog (starter-catalog.json / business-catalog.json --
// generated directly from feature_manifest.json, so this never drifts from
// the actual build spec), then submit customer details.
//
// No per-feature pricing exists yet (see OWCT spec, decision D-01), so the
// running estimate shows the package starting price plus a count of
// selected optional/premium items rather than a fabricated total -- final
// price is always confirmed by Little Technical Solutions LLC before work
// begins. Submission goes through Netlify's native form handling (same
// pattern as contact.html/intake.html), so it reaches the Forms >
// Notifications email once that's configured in the Netlify dashboard.

document.addEventListener('DOMContentLoaded', () => {
  const steps = document.querySelectorAll('.wd-step');
  const panels = document.querySelectorAll('.wd-panel');
  const summaryBody = document.getElementById('wdSummaryBody');
  const downloadBtn = document.getElementById('wdDownloadPdf');
  const includedSummary = document.getElementById('wdIncludedSummary');
  const includedTitle = document.getElementById('wdIncludedTitle');
  const optionalContainer = document.getElementById('wdOptionalCategories');
  const premiumContainer = document.getElementById('wdPremiumCategories');
  const form = document.getElementById('wdForm');
  const formStatus = document.getElementById('wdFormStatus');

  const state = {
    package: null,     // 'starter' | 'business'
    basePrice: 0,
    catalog: null,     // fetched catalog JSON
    optional: new Map(), // pdf_label -> title
    premium: new Map(),
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

  function renderCategoryGroup(container, categories, priority, mapOut) {
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
        mapOut.set(i.pdf_label, i.title);
        const label = document.createElement('label');
        label.className = 'checkbox-pill';
        label.innerHTML = `<input type="checkbox" data-priority="${priority}" value="${i.pdf_label.replace(/"/g, '&quot;')}"> ${i.title}`;
        label.querySelector('input').addEventListener('change', updateSummary);
        grid.appendChild(label);
      });
      block.appendChild(grid);
      container.appendChild(block);
    });
  }

  function selectedItems(priority) {
    const selector = `input[data-priority="${priority}"]:checked`;
    return Array.from(document.querySelectorAll(selector)).map(el => el.value);
  }

  function updateSummary() {
    const optionalSel = selectedItems('C');
    const premiumSel = selectedItems('S');
    let html = `<div class="wd-summary-line wd-summary-base">
      <span>${state.package === 'business' ? 'Business' : 'Starter'} starting price</span>
      <strong>$${state.basePrice.toLocaleString()}</strong>
    </div>`;
    if (optionalSel.length) {
      html += `<div class="wd-summary-line"><span>${optionalSel.length} optional feature${optionalSel.length === 1 ? '' : 's'} selected</span></div>
        <ul class="wd-summary-list">${optionalSel.map(v => `<li>${v}</li>`).join('')}</ul>`;
    }
    if (premiumSel.length) {
      html += `<div class="wd-summary-line wd-summary-premium"><span>${premiumSel.length} premium add-on${premiumSel.length === 1 ? '' : 's'} -- custom quote</span></div>
        <ul class="wd-summary-list">${premiumSel.map(v => `<li>${v}</li>`).join('')}</ul>`;
    }
    html += `<p class="wd-illustrative-note">Estimated starting total: $${state.basePrice.toLocaleString()}
      ${optionalSel.length ? '+ selected optional features (priced in your quote)' : ''}
      ${premiumSel.length ? (optionalSel.length ? ' and' : '+') + ' custom-quote add-ons' : ''}.
      This is not a final price.</p>`;
    summaryBody.innerHTML = html;
    downloadBtn.hidden = false;
  }

  function loadCatalog(pkg) {
    state.package = pkg;
    state.basePrice = pkg === 'business' ? 1299 : 699;
    const file = pkg === 'business' ? 'business-catalog.json' : 'starter-catalog.json';
    fetch(file)
      .then(r => r.json())
      .then(data => {
        state.catalog = data;
        renderIncludedSummary();
        renderCategoryGroup(optionalContainer, data.categories, 'C', state.optional);
        renderCategoryGroup(premiumContainer, data.categories, 'S', state.premium);
        updateSummary();
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

  function buildSummaryText() {
    const optionalSel = selectedItems('C');
    const premiumSel = selectedItems('S');
    const lines = [
      `Package: ${state.package === 'business' ? 'Business ($1,299 starting)' : 'Starter ($699 starting)'}`,
      '',
      `Optional features selected (${optionalSel.length}):`,
      ...(optionalSel.length ? optionalSel.map(v => `- ${v}`) : ['(none)']),
      '',
      `Premium add-ons requested -- custom quote (${premiumSel.length}):`,
      ...(premiumSel.length ? premiumSel.map(v => `- ${v}`) : ['(none)']),
    ];
    return lines.join('\n');
  }

  function submissionId() {
    return 'WD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  downloadBtn.addEventListener('click', () => {
    if (!window.jspdf) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const business = document.getElementById('wdBusinessName').value || 'Your business';
    doc.setFontSize(16);
    doc.text('Website Designer -- Project Summary', 14, 18);
    doc.setFontSize(10);
    doc.text('Little Technical Solutions LLC', 14, 25);
    doc.setFontSize(11);
    let y = 38;
    doc.text(`Business: ${business}`, 14, y); y += 8;
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(buildSummaryText(), 180);
    doc.text(lines, 14, y);
    doc.setFontSize(8);
    doc.text('This is an example estimate only. Final scope and price are confirmed by Little Technical Solutions LLC before any work begins.', 14, 280);
    doc.save('website-designer-summary.pdf');
  });

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!state.package) return;

      document.getElementById('wdFieldPackage').value = state.package;
      document.getElementById('wdFieldEstimateSummary').value =
        `Starting price: $${state.basePrice.toLocaleString()}`;
      document.getElementById('wdFieldOptional').value = selectedItems('C').join('; ') || '(none)';
      document.getElementById('wdFieldPremium').value = selectedItems('S').join('; ') || '(none)';

      const submitBtn = document.getElementById('wdSubmitBtn');
      submitBtn.disabled = true;
      formStatus.textContent = 'Submitting...';

      const body = new URLSearchParams(new FormData(form)).toString();
      fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
        .then((res) => {
          if (!res.ok) throw new Error(`Form submission failed (${res.status})`);
          document.getElementById('wdSubmissionId').textContent = submissionId();
          showPanel('done');
        })
        .catch(() => {
          formStatus.textContent = 'Something went wrong sending your project -- please call 636-426-0289 or email dylan@lit-solutions.tech directly.';
          submitBtn.disabled = false;
        });
    });
  }
});
