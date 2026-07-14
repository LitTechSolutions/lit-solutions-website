document.addEventListener('DOMContentLoaded', () => {

  // Dark/light mode toggle
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('lts-theme', next); } catch (e) {}
    });
  }

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

  // Hero diagram parallax tilt
  const heroDiagram = document.querySelector('.hero-diagram');
  const heroSection = document.querySelector('.hero');
  if (heroDiagram && heroSection && !prefersReducedMotion && window.matchMedia('(min-width: 861px)').matches) {
    heroSection.addEventListener('mousemove', (e) => {
      const rect = heroSection.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      heroDiagram.style.transform = `rotateY(${x * 10}deg) rotateX(${-y * 10}deg)`;
    });
    heroSection.addEventListener('mouseleave', () => {
      heroDiagram.style.transform = 'rotateY(0deg) rotateX(0deg)';
    });
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

  // Before/after website compare slider
  const compareSlider = document.getElementById('compareSlider');
  const compareBefore = document.getElementById('compareBefore');
  const compareHandle = document.getElementById('compareHandle');

  if (compareSlider && compareBefore && compareHandle) {
    let dragging = false;

    const setPosition = (percent) => {
      const clamped = Math.max(2, Math.min(98, percent));
      compareBefore.style.clipPath = `inset(0 ${100 - clamped}% 0 0)`;
      compareHandle.style.left = `${clamped}%`;
      compareHandle.setAttribute('aria-valuenow', Math.round(clamped));
    };

    const positionFromEvent = (clientX) => {
      const rect = compareSlider.getBoundingClientRect();
      return ((clientX - rect.left) / rect.width) * 100;
    };

    const startDrag = () => { dragging = true; };
    const endDrag = () => { dragging = false; };
    const onMove = (clientX) => { if (dragging) setPosition(positionFromEvent(clientX)); };

    compareHandle.addEventListener('mousedown', startDrag);
    compareSlider.addEventListener('mousedown', (e) => { dragging = true; setPosition(positionFromEvent(e.clientX)); });
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('mousemove', (e) => onMove(e.clientX));

    compareHandle.addEventListener('touchstart', startDrag, { passive: true });
    compareSlider.addEventListener('touchstart', (e) => {
      dragging = true;
      onMove(e.touches[0].clientX);
    }, { passive: true });
    window.addEventListener('touchend', endDrag);
    window.addEventListener('touchcancel', endDrag);
    window.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      e.preventDefault(); // stop page scroll from fighting the drag on touch devices
      onMove(e.touches[0].clientX);
    }, { passive: false });

    compareHandle.addEventListener('keydown', (e) => {
      const current = parseFloat(compareHandle.style.left) || 50;
      if (e.key === 'ArrowLeft') setPosition(current - 5);
      if (e.key === 'ArrowRight') setPosition(current + 5);
    });

    setPosition(50);
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
        "This isn't connected yet. Please call 636-426-0289 or email dylan@lit-solutions.tech.";
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

  // Simple contact form (contact.html) — same AJAX-to-Netlify-Forms pattern
  // as the newsletter form, with a missing-fields summary matching the
  // intake form's validation pattern (js/intake.js).
  const simpleContactForm = document.getElementById('simpleContactForm');
  if (simpleContactForm) {
    const statusEl = simpleContactForm.querySelector('.form-note');
    const missingNote = simpleContactForm.querySelector('.form-note--missing');
    simpleContactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const missing = [];
      let firstBadEl = null;
      simpleContactForm.querySelectorAll('[required]').forEach(field => {
        const ok = field.value.trim().length > 0 &&
          (field.type !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value));
        field.classList.toggle('field-error', !ok);
        if (ok) {
          field.removeAttribute('aria-invalid');
          field.removeAttribute('aria-describedby');
        } else {
          field.setAttribute('aria-invalid', 'true');
          if (missingNote && missingNote.id) field.setAttribute('aria-describedby', missingNote.id);
          const label = simpleContactForm.querySelector(`label[for="${field.id}"]`);
          missing.push(label ? label.textContent.trim() : 'A required field');
          if (!firstBadEl) firstBadEl = field;
        }
      });
      const honeypot = simpleContactForm.querySelector('input[name="bot-field"]');
      if (honeypot && honeypot.value) return;

      if (missing.length) {
        if (missingNote) {
          missingNote.innerHTML = `<strong>Please fill in the following:</strong><ul>${missing.map(m => `<li>${m}</li>`).join('')}</ul>`;
          missingNote.classList.add('is-visible');
        }
        if (firstBadEl) firstBadEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (missingNote) missingNote.classList.remove('is-visible');

      const formData = new FormData(simpleContactForm);
      if (statusEl) { statusEl.textContent = 'Sending…'; statusEl.classList.remove('form-note--error'); }
      fetch('/', { method: 'POST', body: formData })
        .then(res => {
          if (statusEl) {
            statusEl.textContent = res.ok
              ? "Thanks — we'll follow up within one business day."
              : 'Something went wrong. Please call or email us directly.';
            statusEl.classList.toggle('form-note--error', !res.ok);
          }
          if (res.ok) simpleContactForm.reset();
        })
        .catch(() => {
          if (statusEl) {
            statusEl.textContent = 'Something went wrong. Please call or email us directly.';
            statusEl.classList.add('form-note--error');
          }
        });
    });
  }

  // Newsletter signup — lightweight AJAX submit to Netlify Forms with an
  // inline status message, consistent with the rest of the site's forms.
  document.querySelectorAll('.newsletter-form').forEach(form => {
    const statusEl = form.parentElement.querySelector('.newsletter-status');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const honeypot = form.querySelector('input[name="bot-field"]');
      if (honeypot && honeypot.value) return; // silently drop likely-bot submissions

      const formData = new FormData(form);
      fetch('/', { method: 'POST', body: formData })
        .then(res => {
          if (statusEl) {
            statusEl.textContent = res.ok
              ? "You're on the list — thanks for signing up!"
              : "Something went wrong. Please try again or email dylan@lit-solutions.tech.";
            statusEl.classList.toggle('is-error', !res.ok);
          }
          if (res.ok) form.reset();
        })
        .catch(() => {
          if (statusEl) {
            statusEl.textContent = "Something went wrong. Please try again or email dylan@lit-solutions.tech.";
            statusEl.classList.add('is-error');
          }
        });
    });
  });
});
