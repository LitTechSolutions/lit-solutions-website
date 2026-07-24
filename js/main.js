document.addEventListener('DOMContentLoaded', () => {

  // Footer year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Mobile nav toggle
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');

  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('is-open');
      navToggle.classList.toggle('is-open', isOpen);
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    // Close menu after clicking a link (mobile)
    mainNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('is-open');
        navToggle.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }


  // Sticky header shadow on scroll
  const header = document.getElementById('siteHeader');
  if (header) {
    const onScroll = () => {
      header.style.boxShadow = window.scrollY > 8
        ? '0 4px 16px rgba(20, 33, 61, 0.08)'
        : 'none';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Rotating hero word
  const rotatorWord = document.getElementById('rotatorWord');
  if (rotatorWord && !prefersReducedMotion) {
    const words = ['websites', 'home networks', 'small business IT', 'secure systems', 'computers'];
    let idx = 0;
    setInterval(() => {
      rotatorWord.classList.add('is-leaving');
      setTimeout(() => {
        idx = (idx + 1) % words.length;
        rotatorWord.textContent = words[idx];
        rotatorWord.classList.remove('is-leaving');
      }, 320);
    }, 2400);
  }

  // Rotating hero testimonial carousel
  const heroTestimonial = document.getElementById('heroTestimonial');
  if (heroTestimonial) {
    const slidesWrap = heroTestimonial.querySelector('.hero-testimonial-slides');
    const slides = Array.from(heroTestimonial.querySelectorAll('.hero-testimonial-slide'));
    const dots = Array.from(heroTestimonial.querySelectorAll('.hero-testimonial-dot'));
    const learnMoreLink = heroTestimonial.querySelector('.hero-testimonial-link');
    let current = slides.findIndex(s => s.classList.contains('is-active'));
    if (current < 0) current = 0;
    let timer = null;

    // "Learn more" only makes sense for Bill Armour's slide (index 0) --
    // it points at the Portfolio case study built for his company, which
    // the other two reviews aren't tied to.
    if (learnMoreLink) learnMoreLink.hidden = (current !== 0);

    const syncHeight = () => {
      if (slidesWrap && slides[current]) slidesWrap.style.height = slides[current].offsetHeight + 'px';
    };

    const goTo = (index) => {
      if (index === current || !slides[index]) return;
      slides[current].classList.remove('is-active');
      if (dots[current]) { dots[current].classList.remove('is-active'); dots[current].setAttribute('aria-pressed', 'false'); }
      current = index;
      slides[current].classList.add('is-active');
      if (dots[current]) { dots[current].classList.add('is-active'); dots[current].setAttribute('aria-pressed', 'true'); }
      if (learnMoreLink) learnMoreLink.hidden = (current !== 0);
      syncHeight();
    };

    const next = () => goTo((current + 1) % slides.length);
    const prev = () => goTo((current - 1 + slides.length) % slides.length);
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const start = () => {
      if (prefersReducedMotion || slides.length < 2) return;
      stop();
      timer = setInterval(next, 5000);
    };

    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => { goTo(i); start(); });
    });

    // Pausing needs to track hover and focus together -- otherwise tabbing
    // into the carousel while the mouse is still resting on it (or vice
    // versa) lets the other listener resume rotation out from under the user.
    let hovered = false;
    let focused = false;
    const updatePause = () => { if (hovered || focused) stop(); else start(); };

    heroTestimonial.addEventListener('mouseenter', () => { hovered = true; updatePause(); });
    heroTestimonial.addEventListener('mouseleave', () => { hovered = false; updatePause(); });
    heroTestimonial.addEventListener('focusin', () => { focused = true; updatePause(); });
    heroTestimonial.addEventListener('focusout', (e) => {
      if (heroTestimonial.contains(e.relatedTarget)) return; // focus moved to another element still inside the carousel
      focused = false;
      updatePause();
    });

    // Swipe support -- touch devices only have the tiny dots to tap otherwise.
    // Purely a touchend comparison (no touchmove/preventDefault), so it never
    // fights the page's normal vertical scroll.
    let touchStartX = 0;
    let touchStartY = 0;
    heroTestimonial.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });
    heroTestimonial.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return; // not a clear horizontal swipe
      if (dx < 0) next(); else prev();
      start();
    }, { passive: true });

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(syncHeight, 150);
    });

    syncHeight();
    // Enable the smooth height transition only after the initial sizing, so
    // the very first paint doesn't visibly grow from zero -- only slide
    // changes/resizes after that should animate.
    if (slidesWrap) slidesWrap.classList.add('height-animated');
    start();
  }

  // Scroll-reveal animations
  const revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    if (prefersReducedMotion) {
      revealEls.forEach(el => el.classList.add('is-visible'));
    } else {
      const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
      revealEls.forEach(el => revealObserver.observe(el));
    }
  }

  // Highlight the nav link for whichever page we're currently on, and
  // disable it (stays visible, just can't be clicked) since you're
  // already there. Applies to the main nav and the "Get a quote" CTA.
  // Same-page #section links (homepage scroll anchors) are left alone —
  // those aren't "you're already on this page" in the same sense.
  const currentPage = (location.pathname.split('/').pop() || 'index.html');
  const currentPageLinks = document.querySelectorAll('.main-nav a, .header-actions a.btn');
  currentPageLinks.forEach(link => {
    const href = link.getAttribute('href') || '';
    const linkPage = href.split('#')[0];
    if (linkPage && linkPage === currentPage) {
      link.classList.add('is-active', 'is-current-page');
      link.setAttribute('aria-disabled', 'true');
      link.addEventListener('click', (e) => e.preventDefault());
    }
  });

  // Scrollspy — highlight active nav link
  const navLinks = document.querySelectorAll('.main-nav a');
  const sections = Array.from(navLinks)
    .filter(link => (link.getAttribute('href') || '').startsWith('#'))
    .map(link => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  if (sections.length && navLinks.length) {
    const spyObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const link = document.querySelector(`.main-nav a[href="#${entry.target.id}"]`);
        if (!link) return;
        if (entry.isIntersecting) {
          navLinks.forEach(l => l.classList.remove('is-active'));
          link.classList.add('is-active');
        }
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    sections.forEach(sec => spyObserver.observe(sec));
  }

  // Expandable service ticket cards
  document.querySelectorAll('.ticket').forEach(ticket => {
    ticket.addEventListener('click', (e) => {
      if (e.target.closest('a')) return; // don't toggle when clicking a link inside
      ticket.classList.toggle('is-open');
    });
  });

  // Animated stat counters
  const statNums = document.querySelectorAll('.stat-num');
  if (statNums.length) {
    const animateCount = (el) => {
      const target = parseInt(el.dataset.count, 10) || 0;
      if (prefersReducedMotion) { el.textContent = target.toLocaleString(); return; }
      const duration = 1400;
      const start = performance.now();
      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(eased * target).toLocaleString();
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const statObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          statObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    statNums.forEach(el => statObserver.observe(el));
  }

  // Terms & Conditions gate — payment buttons won't proceed until checked
  const agreeTerms = document.getElementById('agreeTerms');
  const termsBlock = document.getElementById('termsAgreeBlock');
  const termsWarning = document.getElementById('termsWarning');
  const gatedPayButtons = document.querySelectorAll('a.pay-btn, a.pay-btn-sm');

  if (agreeTerms && gatedPayButtons.length) {
    const updateLockState = () => {
      gatedPayButtons.forEach(btn => {
        btn.classList.toggle('is-locked', !agreeTerms.checked);
      });
      if (agreeTerms.checked) {
        termsBlock.classList.remove('needs-attention');
        termsWarning.classList.remove('is-visible');
      }
    };

    updateLockState();
    agreeTerms.addEventListener('change', updateLockState);

    gatedPayButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (!agreeTerms.checked) {
          e.preventDefault();
          termsBlock.classList.add('needs-attention');
          termsWarning.classList.add('is-visible');
          termsBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });
  }

  // "Do I qualify?" — smooth scroll to the eligibility list
  const doIQualifyBtn = document.getElementById('doIQualifyBtn');
  const heroGroups = document.getElementById('heroGroups');
  if (doIQualifyBtn && heroGroups) {
    doIQualifyBtn.addEventListener('click', () => {
      heroGroups.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Eligibility categories — click to reveal appreciation message + verification info
  document.querySelectorAll('.hero-group-item').forEach(btn => {
    const detail = btn.querySelector('.hero-group-detail');
    if (!detail) return;
    btn.addEventListener('click', () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      if (isOpen) {
        detail.style.maxHeight = '0px';
        btn.setAttribute('aria-expanded', 'false');
      } else {
        detail.style.maxHeight = detail.scrollHeight + 'px';
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Pricing accordion — click a category header to reveal its price list.
  // A block can start pre-opened by marking its button aria-expanded="true"
  // in the HTML (e.g. the Payments page's "One-Time Payment" block) — the
  // CSS default is collapsed (max-height:0), so that has to be synced here
  // on load or the chevron shows "open" while the content stays hidden.
  document.querySelectorAll('.price-block-head').forEach(btn => {
    const wrap = btn.nextElementSibling;
    if (!wrap || !wrap.classList.contains('price-list-wrap')) return;

    if (btn.getAttribute('aria-expanded') === 'true') {
      wrap.style.maxHeight = wrap.scrollHeight + 'px';
    }

    btn.addEventListener('click', () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      if (isOpen) {
        wrap.style.maxHeight = '0px';
        btn.setAttribute('aria-expanded', 'false');
      } else {
        wrap.style.maxHeight = wrap.scrollHeight + 'px';
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Payment/booking link safety guard — prevents dead/placeholder links from
  // silently doing nothing if they haven't been swapped in yet. Covers any
  // future "#REPLACE_WITH_..." placeholder, not just Square payment links.
  document.querySelectorAll('a[href^="#REPLACE_WITH_"]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const msg = link.dataset.notConnectedMsg ||
        "This isn't connected yet. Please call 804-309-0968 or email dylan@lit-solutions.tech.";
      alert(msg);
    });
  });

  // Nav dropdowns (Services / Resources)
  document.querySelectorAll('.nav-dropdown-toggle').forEach(toggle => {
    const menu = document.getElementById(toggle.getAttribute('aria-controls'));
    if (!menu) return;

    const closeMenu = () => {
      menu.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    };
    const openMenu = () => {
      document.querySelectorAll('.nav-dropdown-menu.is-open').forEach(m => {
        if (m !== menu) { m.classList.remove('is-open'); }
      });
      document.querySelectorAll('.nav-dropdown-toggle[aria-expanded="true"]').forEach(t => {
        if (t !== toggle) t.setAttribute('aria-expanded', 'false');
      });
      menu.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
    };

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      if (isOpen) { closeMenu(); } else { openMenu(); }
    });

    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown')) {
      document.querySelectorAll('.nav-dropdown-menu.is-open').forEach(m => m.classList.remove('is-open'));
      document.querySelectorAll('.nav-dropdown-toggle[aria-expanded="true"]').forEach(t => t.setAttribute('aria-expanded', 'false'));
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.nav-dropdown-menu.is-open').forEach(m => m.classList.remove('is-open'));
      document.querySelectorAll('.nav-dropdown-toggle[aria-expanded="true"]').forEach(t => t.setAttribute('aria-expanded', 'false'));
    }
  });

  // FAQ accordion — same accordion mechanics as the pricing-page accordion
  // above, reused verbatim via the same .price-block-head/.price-list-wrap
  // class pair so a single pattern covers both.

  // Cookie / tracking notice (REQ-60/62). We don't set any tracking
  // cookies ourselves — Netlify Analytics is cookie-free/server-side, and
  // localStorage (theme choice) isn't a cookie — so this is a transparency
  // notice with a single acknowledgement, not an accept/reject gate for
  // something we don't actually do.
  const cookieBanner = document.getElementById('cookie-banner');
  const manageConsentLink = document.getElementById('manageConsentLink');
  if (cookieBanner) {
    const dismissedKey = 'lts-cookie-notice-dismissed';
    let dismissed = false;
    try { dismissed = !!localStorage.getItem(dismissedKey); } catch (e) {}
    if (!dismissed) cookieBanner.hidden = false;

    cookieBanner.querySelectorAll('[data-consent]').forEach(btn => {
      btn.addEventListener('click', () => {
        cookieBanner.hidden = true;
        try { localStorage.setItem(dismissedKey, String(Date.now())); } catch (e) {}
      });
    });
  }
  if (manageConsentLink && cookieBanner) {
    manageConsentLink.addEventListener('click', (e) => {
      e.preventDefault();
      cookieBanner.hidden = false;
      cookieBanner.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }

  // Booking request form (booking.html) — AJAX-to-site-forms.js pattern
  // (see js/intake.js for the same shape), plus a custom check requiring
  // at least one of email/phone (neither is natively `required` on its own).
  const bookingRequestForm = document.getElementById('bookingRequestForm');
  if (bookingRequestForm) {
    const dateInput = document.getElementById('booking-date');
    if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);

    const statusEl = bookingRequestForm.querySelector('.form-note[role="status"]');
    const missingNote = document.getElementById('bookingMissingNote');
    bookingRequestForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const missing = [];
      let firstBadEl = null;

      const markInvalid = (field, labelText) => {
        field.classList.add('field-error');
        field.setAttribute('aria-invalid', 'true');
        if (missingNote && missingNote.id) field.setAttribute('aria-describedby', missingNote.id);
        missing.push(labelText);
        if (!firstBadEl) firstBadEl = field;
      };
      const markValid = (field) => {
        field.classList.remove('field-error');
        field.removeAttribute('aria-invalid');
        field.removeAttribute('aria-describedby');
      };

      bookingRequestForm.querySelectorAll('input[required], select[required]').forEach(field => {
        if (field.type === 'radio') return; // handled separately below (radio group)
        const ok = field.value.trim().length > 0;
        if (ok) markValid(field);
        else {
          const label = bookingRequestForm.querySelector(`label[for="${field.id}"]`);
          markInvalid(field, label ? label.textContent.trim() : 'A required field');
        }
      });

      const markFieldOnly = (field) => {
        field.classList.add('field-error');
        field.setAttribute('aria-invalid', 'true');
        if (missingNote && missingNote.id) field.setAttribute('aria-describedby', missingNote.id);
        if (!firstBadEl) firstBadEl = field;
      };

      const email = document.getElementById('booking-email');
      const phone = document.getElementById('booking-phone');
      const hasEmail = email.value.trim().length > 0;
      const hasPhone = phone.value.trim().length > 0;
      const emailValid = !hasEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value);
      if (!hasEmail && !hasPhone) {
        markFieldOnly(email);
        markFieldOnly(phone);
        missing.push('Enter at least one — email or phone.');
      } else if (!emailValid) {
        markInvalid(email, 'Email');
        markValid(phone);
      } else {
        markValid(email);
        markValid(phone);
      }

      const timeChecked = bookingRequestForm.querySelector('input[name="preferred_time"]:checked');
      if (!timeChecked) {
        missing.push('Preferred time');
        if (!firstBadEl) firstBadEl = bookingRequestForm.querySelector('input[name="preferred_time"]');
      }

      const honeypot = bookingRequestForm.querySelector('input[name="bot-field"]');
      if (honeypot && honeypot.value) return;

      if (missing.length) {
        if (missingNote) {
          const intro = 'Please fill in the following:';
          missingNote.innerHTML = `<strong>${intro}</strong><ul>${missing.map(m => `<li>${m}</li>`).join('')}</ul>`;
          missingNote.classList.add('is-visible');
        }
        if (firstBadEl) firstBadEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (missingNote) missingNote.classList.remove('is-visible');

      const payload = {
        form: 'booking',
        name: bookingRequestForm.elements['name'].value.trim(),
        email: email.value.trim(),
        phone: phone.value.trim(),
        serviceType: bookingRequestForm.elements['service_type'].value,
        preferredDate: bookingRequestForm.elements['preferred_date'].value,
        preferredTime: timeChecked.value,
        note: bookingRequestForm.elements['note'].value.trim(),
        botField: honeypot ? honeypot.value : '',
      };
      if (statusEl) { statusEl.textContent = 'Sending…'; statusEl.classList.remove('form-note--error'); }
      fetch('/.netlify/functions/site-forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(async res => {
          if (statusEl) {
            if (res.ok) {
              statusEl.textContent = "Thanks — we'll confirm your requested time within one business day.";
              statusEl.classList.remove('form-note--error');
            } else {
              const data = await res.json().catch(() => ({}));
              statusEl.textContent = data.error || 'Something went wrong. Please call or email us directly.';
              statusEl.classList.add('form-note--error');
            }
          }
          if (res.ok) bookingRequestForm.reset();
        })
        .catch(() => {
          if (statusEl) {
            statusEl.textContent = 'Something went wrong. Please call or email us directly.';
            statusEl.classList.add('form-note--error');
          }
        });
    });
  }

  // Newsletter signup — lightweight AJAX submit to site-forms.js with an
  // inline status message, consistent with the rest of the site's forms.
  document.querySelectorAll('.newsletter-form').forEach(form => {
    const statusEl = form.parentElement.querySelector('.newsletter-status');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const honeypot = form.querySelector('input[name="bot-field"]');
      if (honeypot && honeypot.value) return; // silently drop likely-bot submissions

      const payload = { form: 'newsletter', email: form.elements['email'].value.trim(), botField: honeypot ? honeypot.value : '' };
      fetch('/.netlify/functions/site-forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(async res => {
          if (statusEl) {
            if (res.ok) {
              statusEl.textContent = "You're on the list — thanks for signing up!";
              statusEl.classList.remove('is-error');
            } else {
              const data = await res.json().catch(() => ({}));
              statusEl.textContent = data.error || 'Something went wrong. Please try again or email dylan@lit-solutions.tech.';
              statusEl.classList.add('is-error');
            }
          }
          if (res.ok) form.reset();
        })
        .catch(() => {
          if (statusEl) {
            statusEl.textContent = 'Something went wrong. Please try again or email dylan@lit-solutions.tech.';
            statusEl.classList.add('is-error');
          }
        });
    });
  });
});
