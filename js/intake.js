document.addEventListener('DOMContentLoaded', () => {

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const form = document.getElementById('intakeForm');
  if (!form) return;

  const formNote = document.getElementById('formNote');
  const missingNote = document.getElementById('missingFieldsNote');

  // ----------------------------------------------------------------
  // Collapsible sections (Website Project Details / Gov Contracting)
  // Manual expand/collapse works for everyone. Checking the relevant
  // trigger checkbox also auto-expands the matching section and marks
  // it "active" (meaning its fields become required on submit).
  // ----------------------------------------------------------------
  function setupCollapsible(blockId, toggleId, contentId, triggerCheckbox) {
    const block = document.getElementById(blockId);
    const toggle = document.getElementById(toggleId);
    const content = document.getElementById(contentId);
    if (!block || !toggle || !content) return null;

    function setExpanded(expanded) {
      toggle.setAttribute('aria-expanded', String(expanded));
      content.style.maxHeight = expanded ? content.scrollHeight + 'px' : '0px';
    }

    function setActive(active) {
      block.setAttribute('data-active', String(active));
      const statusEl = toggle.querySelector('.intake-block-status');
      if (statusEl) {
        statusEl.textContent = active
          ? 'Required — you checked the box above'
          : statusEl.dataset.defaultText || statusEl.textContent;
      }
    }

    // remember the original "not required" status text
    const statusEl = toggle.querySelector('.intake-block-status');
    if (statusEl) statusEl.dataset.defaultText = statusEl.textContent;

    // manual toggle, independent of trigger checkbox
    toggle.addEventListener('click', () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      setExpanded(!isOpen);
    });

    if (triggerCheckbox) {
      triggerCheckbox.addEventListener('change', () => {
        setActive(triggerCheckbox.checked);
        setExpanded(triggerCheckbox.checked);
      });
    }

    return { setExpanded, setActive };
  }

  const websiteTrigger = document.getElementById('websiteServicesTrigger');
  const govTrigger = document.getElementById('govContractingTrigger');
  setupCollapsible('websiteBlock', 'websiteBlockToggle', 'websiteBlockContent', websiteTrigger);
  setupCollapsible('govBlock', 'govBlockToggle', 'govBlockContent', govTrigger);

  // ----------------------------------------------------------------
  // Validation
  // "always" fields/groups are required no matter what.
  // "website" fields/groups are required only if websiteTrigger is checked.
  // "govcontract" fields/groups are required only if govTrigger is checked.
  // ----------------------------------------------------------------
  function isGroupField(el) {
    return el.hasAttribute('data-required') && (el.querySelector('input[type="radio"]') || el.querySelector('input[type="checkbox"]'));
  }

  function fieldLabel(el) {
    if (el.dataset.label) return el.dataset.label;
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl) return lbl.textContent.replace('*', '').trim();
    }
    return 'A required field';
  }

  function isFilled(el) {
    if (isGroupField(el)) {
      return !!el.querySelector('input[type="radio"]:checked, input[type="checkbox"]:checked');
    }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return el.value.trim() !== '';
    }
    return true;
  }

  function clearErrors() {
    form.querySelectorAll('.field-error').forEach(el => { el.classList.remove('field-error'); el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); });
    form.querySelectorAll('.group-error').forEach(el => { el.classList.remove('group-error'); el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); });
    missingNote.classList.remove('is-visible');
    missingNote.innerHTML = '';
  }

  function validateForm() {
    clearErrors();
    const websiteActive = websiteTrigger && websiteTrigger.checked;
    const govActive = govTrigger && govTrigger.checked;
    const missing = [];
    let firstBadEl = null;

    const candidates = form.querySelectorAll('[data-required]');
    candidates.forEach(el => {
      const level = el.getAttribute('data-required');
      const applies = level === 'always' || (level === 'website' && websiteActive) || (level === 'govcontract' && govActive);
      if (!applies) return;
      if (!isFilled(el)) {
        missing.push(fieldLabel(el));
        if (!firstBadEl) firstBadEl = el;
        el.setAttribute('aria-invalid', 'true');
        el.setAttribute('aria-describedby', 'missingFieldsNote');
        if (isGroupField(el)) {
          el.classList.add('group-error');
        } else {
          el.classList.add('field-error');
        }
      }
    });

    if (missing.length) {
      const intro = "Please fill in the following before submitting (type N/A if a question doesn't apply to you):";
      missingNote.innerHTML = `<strong>${intro}</strong><ul>${missing.map(m => `<li>${m}</li>`).join('')}</ul>`;
      missingNote.classList.add('is-visible');
      if (firstBadEl) {
        firstBadEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return false;
    }
    return true;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    formNote.classList.remove('form-note--error');
    formNote.textContent = 'Sending…';

    try {
      const val = (name) => (form.elements[name] ? form.elements[name].value.trim() : '');
      const checkedValue = (name) => {
        const el = form.querySelector(`input[name="${name}"]:checked`);
        return el ? el.value : '';
      };
      const checkedValues = (name) =>
        Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map((el) => el.value);

      const payload = {
        form: 'intake',
        fullName: val('full_name'), businessName: val('business_name'), email: val('email'), phone: val('phone'),
        addressCity: val('address_city'), referralSource: val('referral_source'),
        contactMethod: checkedValue('contact_method'), bestTime: checkedValue('best_time'),
        govContractingInterest: !!(govTrigger && govTrigger.checked),
        services: checkedValues('services'), generalNotes: val('general_notes'),
        currentWebsite: val('current_website'), requestedDomain: val('requested_domain'),
        businessDescription: val('business_description'), targetCustomers: val('target_customers'),
        mustHavePages: val('must_have_pages'), mustHaveFeatures: val('must_have_features'),
        stylePreference: val('style_preference'), inspirationSites: val('inspiration_sites'),
        existingContent: val('existing_content'), photosImagery: val('photos_imagery'),
        hasLogo: checkedValue('has_logo'), hasContent: checkedValue('has_content'), hasDomain: checkedValue('has_domain'),
        timeline: val('timeline'), budgetRange: val('budget_range'),
        ueiNumber: val('uei_number'), naicsCodes: val('naics_codes'), samGovInfo: val('sam_gov_info'),
        certifications: val('certifications'), additionalNotes: val('additional_notes'),
        botField: val('bot-field'),
      };

      const response = await fetch('/.netlify/functions/site-forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        formNote.textContent = "Thanks — we'll follow up within one business day.";
        form.reset();
      } else {
        const data = await response.json().catch(() => ({}));
        formNote.classList.add('form-note--error');
        formNote.textContent = data.error || 'Something went wrong. Please call or email us directly.';
      }
    } catch (err) {
      formNote.classList.add('form-note--error');
      formNote.textContent = 'Something went wrong. Please call or email us directly.';
    } finally {
      submitBtn.disabled = false;
    }
  });
});
