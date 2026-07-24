document.addEventListener('DOMContentLoaded', () => {

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const form = document.getElementById('intakeForm');
  if (!form) return;

  const formNote = document.getElementById('formNote');
  const missingNote = document.getElementById('missingFieldsNote');

  function isGroupField(el) {
    return el.hasAttribute('data-required') && el.querySelector('input[type="radio"]');
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
      return !!el.querySelector('input[type="radio"]:checked');
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
    const missing = [];
    let firstBadEl = null;

    form.querySelectorAll('[data-required="always"]').forEach(el => {
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
      missingNote.innerHTML = `<strong>Please fill in the following before submitting:</strong><ul>${missing.map(m => `<li>${m}</li>`).join('')}</ul>`;
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

      const payload = {
        form: 'intake',
        fullName: val('full_name'), email: val('email'), phone: val('phone'),
        contactMethod: checkedValue('contact_method'), reason: val('reason'),
        botField: val('bot-field'),
      };

      const response = await fetch('/.netlify/functions/site-forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        const ref = data && data.id ? `#ref=${encodeURIComponent(data.id)}` : '';
        window.location.href = `request-submitted.html${ref}`;
      } else {
        const data = await response.json().catch(() => ({}));
        formNote.classList.add('form-note--error');
        formNote.textContent = data.error || 'Something went wrong. Please call or email us directly.';
        submitBtn.disabled = false;
      }
    } catch (err) {
      formNote.classList.add('form-note--error');
      formNote.textContent = 'Something went wrong. Please call or email us directly.';
      submitBtn.disabled = false;
    }
  });
});
