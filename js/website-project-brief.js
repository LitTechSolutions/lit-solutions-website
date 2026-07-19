// website-project-brief.js -- standalone Website Project Details Worksheet,
// opened in a new tab from website-designer.html's post-quote prompt.
//
// Receives its authorization via a one-time resume token carried ONLY in
// the URL fragment (#resume=...), never a query string and never sent to
// the server as part of navigation. On load this:
//   1. reads the fragment,
//   2. immediately strips it from the visible URL (history.replaceState),
//   3. stores the raw token in this tab's sessionStorage only (never
//      localStorage, never logged),
//   4. POSTs it to the backend ("stage: resume") to fetch back a limited
//      summary of the quick lead.
// The same token is required again at full-submission time, and is spent
// (single-use) the moment that submission succeeds. See
// netlify/functions/website-designer.js for the server-side half of this.
document.addEventListener('DOMContentLoaded', () => {
  const RESUME_SESSION_KEY = 'lts-wpb-resume'; // { quickLeadId, token } -- this tab only
  const DRAFT_KEY_PREFIX = 'lts-wpb-draft-'; // + quickLeadId -- text fields only, this tab only
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
  const MAX_PHOTOS = 4;
  const BASE_PRICES = { starter: 699, business: 1299 };
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

  // Same mapping website-designer.js used to drive its (now-removed) inline
  // brief-visibility logic -- kept in exact parity so the same feature
  // selections trigger the same conditional sections here.
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
  };
  // Conditional sections that are actually required (carry a "*" in their
  // label) once triggered -- gallery/newsletter stay optional even when shown.
  const REQUIRED_CONDITIONAL_KEYS = ['staff', 'testimonials', 'faq', 'blog', 'pricing', 'booking'];
  const ALWAYS_REQUIRED_IDS = ['wdBizDescription', 'wdBizIndustry', 'wdServiceArea', 'wdServicesList'];
  const CONDITIONAL_FIELD_IDS = {
    staff: 'wdBriefStaff', testimonials: 'wdBriefTestimonials', faq: 'wdBriefFaq', blog: 'wdBriefBlog',
    gallery: 'wdBriefGallery', pricing: 'wdBriefPricing', booking: 'wdBriefBooking',
    newsletter: 'wdBriefNewsletter',
  };
  const DRAFT_FIELD_IDS = [
    'wdDomain', 'wdDesiredDomain', 'wdBizDescription', 'wdBizIndustry', 'wdServiceArea', 'wdServicesList',
    'wdBrandColors', 'wdStyleReferences', 'wdAddressHours', 'wdSocialLinks', 'wdLaunchDate', 'wdNotes',
    'wdBriefStaff', 'wdBriefTestimonials', 'wdBriefFaq', 'wdBriefBlog', 'wdBriefGallery',
    'wdBriefPricing', 'wdBriefBooking', 'wdBriefNewsletter',
  ];

  const els = {
    loading: document.getElementById('wpbLoading'),
    invalid: document.getElementById('wpbInvalid'),
    invalidMessage: document.getElementById('wpbInvalidMessage'),
    form: document.getElementById('wpbForm'),
    done: document.getElementById('wpbDone'),
    doneRef: document.getElementById('wpbDoneRef'),
    downloadPdfBtn: document.getElementById('wpbDownloadPdfBtn'),
    summaryBusiness: document.getElementById('wpbSummaryBusiness'),
    summaryRef: document.getElementById('wpbSummaryRef'),
    summaryPackage: document.getElementById('wpbSummaryPackage'),
    summaryEstimate: document.getElementById('wpbSummaryEstimate'),
    progressFill: document.getElementById('wpbProgressFill'),
    progressTrack: document.getElementById('wpbProgressTrack'),
    progressText: document.getElementById('wpbProgressText'),
    autosaveStatus: document.getElementById('wpbAutosaveStatus'),
    section6: document.getElementById('wpbSection6'),
    briefForm: document.getElementById('wdBriefForm'),
    formStatus: document.getElementById('wdFormStatus'),
    submitBtn: document.getElementById('wdSubmitBtn'),
  };

  const INVALID_TEXT = "We couldn't reopen this project worksheet. Your original quote request may still have been received. Please contact Little Technical Solutions at 804-309-0968 or dylan@lit-solutions.tech.";

  function showState(name) {
    ['loading', 'invalid', 'form', 'done'].forEach((key) => {
      if (els[key]) els[key].hidden = key !== name;
    });
  }

  function showInvalid() {
    if (els.invalidMessage) els.invalidMessage.textContent = INVALID_TEXT;
    showState('invalid');
  }

  // ---- Step 1: read the resume token from the URL fragment (or, on a
  // same-tab refresh, from sessionStorage where step 3 below stashed it) --
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

  function readResumeFromSession() {
    try {
      const raw = sessionStorage.getItem(RESUME_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.quickLeadId || !parsed.token) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function storeResumeInSession(resume) {
    try { sessionStorage.setItem(RESUME_SESSION_KEY, JSON.stringify(resume)); } catch (e) { /* ignore -- private browsing / quota */ }
  }

  function clearResumeFromSession() {
    try { sessionStorage.removeItem(RESUME_SESSION_KEY); } catch (e) { /* ignore */ }
  }

  let resume = readResumeFromFragment();
  // Step 2: strip the token out of the visible/bookmarkable URL immediately
  // -- before any network request -- so it never lingers in browser
  // history or gets shared if the tab's URL is copied.
  if (resume) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    storeResumeInSession(resume);
  } else {
    resume = readResumeFromSession();
  }

  if (!resume) {
    showInvalid();
    return;
  }

  // ---- Draft (text fields only) autosave, scoped to this specific lead ----
  const draftKey = DRAFT_KEY_PREFIX + resume.quickLeadId;
  let saveDraftTimer = null;

  function setAutosaveStatus(text) {
    if (els.autosaveStatus) els.autosaveStatus.textContent = text;
  }

  function saveDraftNow() {
    const fields = {};
    DRAFT_FIELD_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) fields[id] = el.value;
    });
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ fields, savedAt: Date.now() }));
      setAutosaveStatus('Saved in this tab');
    } catch (e) {
      setAutosaveStatus('');
    }
  }

  function saveDraft() {
    setAutosaveStatus('Saving…');
    clearTimeout(saveDraftTimer);
    saveDraftTimer = setTimeout(saveDraftNow, 400);
  }

  function loadDraft() {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.fields ? parsed.fields : null;
    } catch (e) {
      return null;
    }
  }

  function clearDraft() {
    try { sessionStorage.removeItem(draftKey); } catch (e) { /* ignore */ }
  }

  // ---- Conditional section visibility (mirrors website-designer.js's
  // now-removed isBriefKeyActive/updateBriefVisibility, driven by the
  // selections handed back from the resume endpoint instead of live DOM
  // checkboxes, since there are none on this page). ----
  function briefKeyActive(key, resumeData) {
    if ((CONTENT_BRIEF_ALWAYS_INCLUDED[resumeData.package] || []).includes(key)) return true;
    const titles = CONTENT_BRIEF_TRIGGER_TITLES[key] || [];
    const selectedTitles = (resumeData.optionalSelected || []).map((f) => f.title);
    return selectedTitles.some((t) => titles.includes(t));
  }

  function applyConditionalVisibility(resumeData) {
    let anyVisible = false;
    Object.keys(CONTENT_BRIEF_TRIGGER_TITLES).forEach((key) => {
      const group = document.getElementById(`wdBriefGroup_${key}`);
      if (!group) return;
      const active = briefKeyActive(key, resumeData);
      group.hidden = !active;
      if (active) anyVisible = true;
    });
    if (els.section6) els.section6.hidden = !anyVisible;
  }

  function fieldVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function collectBrief(resumeData) {
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
      staff: briefKeyActive('staff', resumeData) ? fieldVal('wdBriefStaff') : '',
      testimonials: briefKeyActive('testimonials', resumeData) ? fieldVal('wdBriefTestimonials') : '',
      faq: briefKeyActive('faq', resumeData) ? fieldVal('wdBriefFaq') : '',
      blog: briefKeyActive('blog', resumeData) ? fieldVal('wdBriefBlog') : '',
      gallery: briefKeyActive('gallery', resumeData) ? fieldVal('wdBriefGallery') : '',
      pricing: briefKeyActive('pricing', resumeData) ? fieldVal('wdBriefPricing') : '',
      booking: briefKeyActive('booking', resumeData) ? fieldVal('wdBriefBooking') : '',
      newsletter: briefKeyActive('newsletter', resumeData) ? fieldVal('wdBriefNewsletter') : '',
    };
  }

  // ---- Progress indicator: % of required fields (always-required plus
  // whichever conditional sections are currently active) that are filled. ----
  function updateProgress(resumeData) {
    const requiredIds = ALWAYS_REQUIRED_IDS.slice();
    REQUIRED_CONDITIONAL_KEYS.forEach((key) => {
      if (briefKeyActive(key, resumeData)) requiredIds.push(CONDITIONAL_FIELD_IDS[key]);
    });
    const filled = requiredIds.filter((id) => fieldVal(id).length > 0).length;
    const pct = requiredIds.length ? Math.round((filled / requiredIds.length) * 100) : 0;
    if (els.progressFill) els.progressFill.style.width = pct + '%';
    if (els.progressTrack) els.progressTrack.setAttribute('aria-valuenow', String(pct));
    if (els.progressText) els.progressText.textContent = pct + '% complete';
  }

  function fmtMoney(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }

  function renderSummary(resumeData) {
    if (els.summaryBusiness) els.summaryBusiness.textContent = resumeData.businessName || '—';
    if (els.summaryRef) els.summaryRef.textContent = resumeData.quickLeadId || '—';
    if (els.summaryPackage) els.summaryPackage.textContent = resumeData.package === 'business' ? 'Business' : 'Starter';
    if (els.summaryEstimate) els.summaryEstimate.textContent = fmtMoney(resumeData.estimateTotal);
  }

  function restoreDraft() {
    const fields = loadDraft();
    if (!fields) return;
    Object.keys(fields).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = fields[id];
    });
    setAutosaveStatus('Saved in this tab');
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

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

  function pdfPayload(resumeData, brief, notes) {
    return {
      business: resumeData.businessName || 'Your business',
      customerName: resumeData.customerName || '',
      customerEmail: resumeData.email || '',
      customerPhone: resumeData.phone || '',
      reference: resumeData.quickLeadId,
      generatedDate: new Date().toLocaleDateString('en-US'),
      packageLabel: resumeData.package === 'business' ? 'Business package -- $1,299 starting' : 'Starter package -- $699 starting',
      basePrice: BASE_PRICES[resumeData.package] || 0,
      includedCapabilities: INCLUDED_SUMMARY[resumeData.package] || [],
      optionalSelected: resumeData.optionalSelected || [],
      customRequest: resumeData.customRequest || '',
      bundledCategories: resumeData.bundledCategories || [],
      bundleSavings: resumeData.bundleSavings || 0,
      selectedBundles: resumeData.selectedBundles || [],
      heroesDiscount: !!resumeData.heroesDiscount,
      heroesDiscountAmount: resumeData.heroesDiscount ? (resumeData.subtotal - resumeData.estimateTotal) : 0,
      subtotal: resumeData.subtotal,
      total: resumeData.estimateTotal,
      brief, notes,
    };
  }

  let lastPdfDoc = null;
  let lastPdfFilename = null;

  function slugify(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'business';
  }

  async function submitFullBrief(resumeData) {
    if (document.getElementById('wdHoneypotFull')?.value) return; // bot

    const missing = [];
    ALWAYS_REQUIRED_IDS.forEach((id) => { if (!fieldVal(id)) missing.push(id); });
    REQUIRED_CONDITIONAL_KEYS.forEach((key) => {
      if (briefKeyActive(key, resumeData) && !fieldVal(CONDITIONAL_FIELD_IDS[key])) missing.push(CONDITIONAL_FIELD_IDS[key]);
    });
    if (missing.length) {
      if (els.formStatus) els.formStatus.textContent = 'Please fill in all required fields (marked *) before submitting.';
      const firstEl = document.getElementById(missing[0]);
      if (firstEl) firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    els.submitBtn.disabled = true;
    if (els.formStatus) els.formStatus.textContent = 'Reading your files…';

    const { logo, photos, errors } = await collectImageAttachments();
    if (errors.length) {
      if (els.formStatus) els.formStatus.textContent = errors.join(' ');
      els.submitBtn.disabled = false;
      return;
    }

    if (els.formStatus) els.formStatus.textContent = 'Preparing your PDF…';
    const brief = collectBrief(resumeData);
    const notes = fieldVal('wdNotes');

    let doc = null;
    try {
      doc = window.LTS_WD_PDF ? await window.LTS_WD_PDF.buildWebsiteDesignerPdf(pdfPayload(resumeData, brief, notes)) : null;
    } catch (e) {
      doc = null;
    }
    if (!doc) {
      if (els.formStatus) els.formStatus.textContent = "We couldn't generate your PDF summary, so we didn't send your submission. Please refresh the page and try again, or call 804-309-0968 / email dylan@lit-solutions.tech directly.";
      els.submitBtn.disabled = false;
      return;
    }
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    const pdfFilename = `LTS-Website-Estimate-${slugify(resumeData.businessName)}-${resumeData.quickLeadId}.pdf`;

    if (els.formStatus) els.formStatus.textContent = 'Sending your project details…';

    const payload = {
      stage: 'full',
      quickLeadId: resume.quickLeadId,
      resumeToken: resume.token,
      package: resumeData.package,
      businessName: resumeData.businessName,
      customerName: resumeData.customerName,
      email: resumeData.email,
      phone: resumeData.phone,
      preferredContact: resumeData.preferredContact,
      domain: fieldVal('wdDomain'),
      notes,
      subtotal: resumeData.subtotal,
      estimateTotal: resumeData.estimateTotal,
      heroesDiscount: resumeData.heroesDiscount,
      bundledCategories: resumeData.bundledCategories,
      bundleSavings: resumeData.bundleSavings,
      optionalSelected: resumeData.optionalSelected,
      customRequest: resumeData.customRequest,
      selectedBundles: resumeData.selectedBundles,
      pdfBase64, pdfFilename,
      brief, logo, photos,
    };

    try {
      const res = await fetch('/.netlify/functions/website-designer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

      lastPdfDoc = doc;
      lastPdfFilename = pdfFilename;
      clearDraft();
      clearResumeFromSession(); // single-use: the server has already marked this token spent
      if (els.doneRef) els.doneRef.textContent = data.id || resume.quickLeadId;
      showState('done');
    } catch (err) {
      if (els.formStatus) {
        els.formStatus.textContent = err.message && err.message !== 'Failed to fetch'
          ? err.message
          : 'Something went wrong sending your project -- please call 804-309-0968 or email dylan@lit-solutions.tech directly.';
      }
      els.submitBtn.disabled = false;
    }
  }

  // ---- Step 3/4: fetch back the limited quick-lead summary using the
  // resume token, entirely server-validated (timing-safe hash comparison,
  // rate-limited, never disclosing whether an id/token is merely wrong vs.
  // nonexistent). ----
  fetch('/.netlify/functions/website-designer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 'resume', quickLeadId: resume.quickLeadId, token: resume.token }),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showInvalid(); return; }

      renderSummary(data);
      applyConditionalVisibility(data);
      updateProgress(data);
      restoreDraft();
      showState('form');

      if (els.briefForm) {
        els.briefForm.addEventListener('input', () => { saveDraft(); updateProgress(data); });
        els.briefForm.addEventListener('submit', (e) => {
          e.preventDefault();
          submitFullBrief(data);
        });
      }
    })
    .catch(() => showInvalid());

  if (els.downloadPdfBtn) {
    els.downloadPdfBtn.addEventListener('click', () => {
      if (lastPdfDoc) lastPdfDoc.save(lastPdfFilename || 'website-project-estimate.pdf');
    });
  }
});
