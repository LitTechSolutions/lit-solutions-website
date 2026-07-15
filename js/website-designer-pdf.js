// website-designer-pdf.js -- shared, premium LTS-branded PDF builder for
// the Website Designer tool and the standalone project-details worksheet.
//
// Exposes window.LTS_WD_PDF.buildWebsiteDesignerPdf(data) -> Promise<jsPDF>.
// Requires window.jspdf (vendored locally, see assets/vendor/jspdf/) to
// already be loaded -- this file only builds on top of it, it never loads
// jsPDF itself.
//
// This intentionally produces an *illustrative starting estimate*, never
// anything that reads like a contract or a final quote -- every page
// carries a footer line saying so, and premium/custom-quote items are
// always shown separately from, and never folded into, the estimated total.
(function (global) {
  'use strict';

  const COLORS = {
    navy: '#10131C',
    indigo: '#3548C4',
    emerald: '#0E8C6B',
    white: '#FFFFFF',
    offWhite: '#FAFAF9',
    body: '#14161A',
    muted: '#5B6169',
    border: '#E5E7EB',
  };

  const PAGE_MARGIN = 18; // mm
  const CONTENT_TOP_COVER = 78; // mm -- below the cover's branded header band
  const CONTENT_TOP_INNER = 32; // mm -- below the compact per-page header
  // mm -- US Letter is 279.4mm tall; the footer draws two text lines below
  // this separator (at +5 and +9mm), so this must leave at least ~10mm of
  // clearance below it or the second line clips past the physical page
  // edge (found via visual PDF review -- the "Illustrative estimate" line
  // was being drawn at 280mm, past the 279.4mm page height).
  const FOOTER_TOP = 262;

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
  }

  function setFill(doc, hex) { const [r, g, b] = hexToRgb(hex); doc.setFillColor(r, g, b); }
  function setText(doc, hex) { const [r, g, b] = hexToRgb(hex); doc.setTextColor(r, g, b); }
  function setDraw(doc, hex) { const [r, g, b] = hexToRgb(hex); doc.setDrawColor(r, g, b); }

  function fmtMoney(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }

  // jsPDF's built-in fonts (Helvetica/Times/Courier) only implement
  // WinAnsiEncoding -- Western European Latin script plus common
  // typographic punctuation, nothing East Asian, Arabic, or emoji. Passing
  // an unsupported character through doesn't just render as a missing
  // glyph, it throws off jsPDF's own width measurements for the *entire*
  // string (found via visual PDF review: a business description mixing
  // emoji/CJK/Arabic with ordinary English text overflowed past the page's
  // right edge instead of wrapping, because splitTextToSize's width
  // estimate for the unsupported characters was wrong). Since this page is
  // English-only for now (see the i18n limitations noted in the release
  // report), unsupported characters are dropped rather than left to
  // silently corrupt layout or render as mojibake.
  const PDF_SAFE_CHARS_RE = /[^\x0A\x0D\x20-\x7E\xA0-\xFF–—‘’“”•…™®©]/gu;
  function sanitizeForPdf(s) {
    return String(s == null ? '' : s).replace(PDF_SAFE_CHARS_RE, '');
  }

  // Loads a same-origin PNG and returns a data URL + natural dimensions, so
  // it can be embedded with doc.addImage. Resolves to null (never rejects)
  // on any failure -- callers fall back to a clean text-only header instead
  // of failing the whole PDF over a missing/broken logo asset.
  function loadImageAsDataUrl(src) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
      // Belt-and-suspenders timeout: some environments (older browsers with
      // a blocked image request, or a test harness without a real image
      // decoder) never fire onload/onerror at all -- without this, a
      // missing/broken logo would hang PDF generation forever instead of
      // falling back to the text-only header.
      const timeoutId = setTimeout(() => finish(null), 1500);
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx2d = canvas.getContext('2d');
            if (!ctx2d) { finish(null); return; }
            ctx2d.drawImage(img, 0, 0);
            clearTimeout(timeoutId);
            finish({ dataUrl: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight });
          } catch (e) {
            finish(null);
          }
        };
        img.onerror = () => finish(null);
        img.src = src;
      } catch (e) {
        finish(null);
      }
    });
  }

  // ---- Layout primitives ---------------------------------------------
  // `ctx` carries everything the helpers need to lay out content and wrap
  // across pages without every call site re-deriving page geometry:
  //   { doc, y, contentWidth, business, reference, logo, pageStarted }

  function newPage(doc, ctx) {
    doc.addPage();
    ctx.page += 1;
    drawPageHeader(doc, ctx);
    ctx.y = CONTENT_TOP_INNER;
  }

  // Ensures at least `neededHeight` mm remain before the footer band --
  // starts a fresh (headered) page first if not. Every multi-line block in
  // this file calls this before drawing, so a long description or a big
  // table never gets silently clipped by the page edge.
  function ensureSpace(doc, ctx, neededHeight) {
    if (ctx.y + neededHeight > FOOTER_TOP) newPage(doc, ctx);
  }

  function drawPageHeader(doc, ctx) {
    setFill(doc, COLORS.offWhite);
    doc.rect(0, 0, ctx.pageWidth, 22, 'F');
    setDraw(doc, COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(0, 22, ctx.pageWidth, 22);

    if (ctx.logo && ctx.logo.dataUrl) {
      const h = 8;
      const w = h * (ctx.logo.width / ctx.logo.height);
      try { doc.addImage(ctx.logo.dataUrl, 'PNG', PAGE_MARGIN, 7, w, h); } catch (e) { /* skip silently */ }
    }
    setText(doc, COLORS.navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('Little Technical Solutions LLC', PAGE_MARGIN + (ctx.logo ? 12 : 0), 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setText(doc, COLORS.muted);
    doc.text('Website Project Estimate and Scope Summary', PAGE_MARGIN + (ctx.logo ? 12 : 0), 17.5);

    doc.setFontSize(8.5);
    setText(doc, COLORS.body);
    doc.text(sanitizeForPdf(ctx.business) || 'Your business', ctx.pageWidth - PAGE_MARGIN, 13, { align: 'right' });
  }

  function drawPageFooter(doc, ctx, pageNumber, totalPages) {
    setDraw(doc, COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(PAGE_MARGIN, FOOTER_TOP, ctx.pageWidth - PAGE_MARGIN, FOOTER_TOP);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setText(doc, COLORS.muted);
    doc.text(`Reference: ${ctx.reference}  |  Generated ${ctx.generatedDate}`, PAGE_MARGIN, FOOTER_TOP + 5);
    doc.text(`Page ${pageNumber} of ${totalPages}`, ctx.pageWidth / 2, FOOTER_TOP + 5, { align: 'center' });
    doc.text('lit-solutions.tech', ctx.pageWidth - PAGE_MARGIN, FOOTER_TOP + 5, { align: 'right' });
    doc.setFontSize(7);
    setText(doc, COLORS.indigo);
    doc.text('Illustrative estimate — not a final quote', ctx.pageWidth / 2, FOOTER_TOP + 9, { align: 'center' });
  }

  function drawSectionTitle(doc, ctx, title) {
    ensureSpace(doc, ctx, 12);
    setFill(doc, COLORS.emerald);
    doc.rect(PAGE_MARGIN, ctx.y, 3, 5.5, 'F');
    setText(doc, COLORS.navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.text(title, PAGE_MARGIN + 5.5, ctx.y + 4.6);
    ctx.y += 10;
  }

  // A bordered card of label/value pairs (customer info, package summary).
  function drawInfoCard(doc, ctx, rows) {
    const lineHeight = 6;
    const padding = 4;
    const height = rows.length * lineHeight + padding * 2;
    ensureSpace(doc, ctx, height + 2);
    setFill(doc, COLORS.offWhite);
    setDraw(doc, COLORS.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(PAGE_MARGIN, ctx.y, ctx.contentWidth, height, 2, 2, 'FD');
    let rowY = ctx.y + padding + 4;
    rows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      setText(doc, COLORS.muted);
      doc.text(String(label), PAGE_MARGIN + 5, rowY);
      doc.setFont('helvetica', 'normal');
      setText(doc, COLORS.body);
      doc.text(sanitizeForPdf(value) || '—', PAGE_MARGIN + 52, rowY);
      rowY += lineHeight;
    });
    ctx.y += height + 6;
  }

  // Wraps and draws a block of body text, paginating mid-paragraph if
  // needed rather than only checking space once for the whole block.
  function drawWrappedText(doc, ctx, text, opts) {
    opts = opts || {};
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size || 9.5);
    setText(doc, opts.color || COLORS.body);
    const lines = doc.splitTextToSize(sanitizeForPdf(text), ctx.contentWidth - (opts.indent || 0));
    const lineHeight = opts.lineHeight || 5;
    lines.forEach((line) => {
      ensureSpace(doc, ctx, lineHeight);
      doc.text(line, PAGE_MARGIN + (opts.indent || 0), ctx.y);
      ctx.y += lineHeight;
    });
    ctx.y += opts.gapAfter != null ? opts.gapAfter : 3;
  }

  // A single label + value line item, used for the labeled brief fields on
  // page 3+ -- label bold on its own line, value wrapped underneath, so a
  // long answer never gets cut off next to a short label.
  function drawFieldItem(doc, ctx, label, value) {
    ensureSpace(doc, ctx, 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    setText(doc, COLORS.navy);
    doc.text(sanitizeForPdf(label), PAGE_MARGIN, ctx.y);
    ctx.y += 5;
    drawWrappedText(doc, ctx, value, { indent: 2, gapAfter: 4 });
  }

  // A colored callout box (illustrative-estimate notice, price-mismatch-
  // style warnings). variant picks the accent color; the box height grows
  // to fit wrapped text rather than a fixed guess.
  function drawNoticeBox(doc, ctx, text, variant) {
    const accent = variant === 'warning' ? '#B8860B' : COLORS.indigo;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    const lines = doc.splitTextToSize(sanitizeForPdf(text), ctx.contentWidth - 10);
    const height = lines.length * 4.6 + 8;
    ensureSpace(doc, ctx, height + 2);
    setFill(doc, COLORS.offWhite);
    setDraw(doc, accent);
    doc.setLineWidth(0.5);
    doc.roundedRect(PAGE_MARGIN, ctx.y, ctx.contentWidth, height, 2, 2, 'FD');
    setFill(doc, accent);
    doc.rect(PAGE_MARGIN, ctx.y, 1.4, height, 'F');
    setText(doc, COLORS.body);
    let ly = ctx.y + 6.5;
    lines.forEach((line) => { doc.text(line, PAGE_MARGIN + 6, ly); ly += 4.6; });
    ctx.y += height + 6;
  }

  // A single "label ....... amount" row used by both the feature table and
  // the price summary -- amount is always right-aligned to the content
  // width's right edge, label wraps and pushes ctx.y down by however many
  // lines it actually took.
  function drawFeatureRow(doc, ctx, label, amountText, opts) {
    opts = opts || {};
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(9.3);
    const amountWidth = 28;
    const labelWidth = ctx.contentWidth - amountWidth - 2;
    const lines = doc.splitTextToSize(sanitizeForPdf(label), labelWidth);
    const rowHeight = Math.max(lines.length * 4.8, 5.5);
    ensureSpace(doc, ctx, rowHeight + 1);
    if (opts.stripe) {
      setFill(doc, COLORS.offWhite);
      doc.rect(PAGE_MARGIN, ctx.y - 3.6, ctx.contentWidth, rowHeight + 1.6, 'F');
    }
    setText(doc, opts.labelColor || COLORS.body);
    lines.forEach((line, i) => doc.text(line, PAGE_MARGIN, ctx.y + i * 4.8));
    setText(doc, opts.amountColor || COLORS.body);
    doc.text(sanitizeForPdf(amountText), ctx.pageWidth - PAGE_MARGIN, ctx.y, { align: 'right' });
    ctx.y += rowHeight + 1.6;
  }

  function drawTableHeader(doc, ctx, leftLabel, rightLabel) {
    ensureSpace(doc, ctx, 8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setText(doc, COLORS.muted);
    doc.text(leftLabel.toUpperCase(), PAGE_MARGIN, ctx.y);
    doc.text(rightLabel.toUpperCase(), ctx.pageWidth - PAGE_MARGIN, ctx.y, { align: 'right' });
    ctx.y += 2.5;
    setDraw(doc, COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(PAGE_MARGIN, ctx.y, ctx.pageWidth - PAGE_MARGIN, ctx.y);
    ctx.y += 5;
  }

  // Draws the fixed price-calculation block:
  //   Base package                         $1,299
  //   Selected add-ons                      +$XXX
  //   Bundle savings                         -$XX
  //   Heroes Discount                        -$XX
  //   Estimated starting total            $X,XXX
  // Premium/custom-quote items are deliberately never part of this -- they
  // get their own separate table further down.
  function drawPriceSummary(doc, ctx, data) {
    const rows = [['Base package', fmtMoney(data.basePrice)]];
    if (data.optionalSum) rows.push(['Selected add-ons', `+${fmtMoney(data.optionalSum)}`]);
    if (data.bundleSavings) rows.push(['Bundle savings', `-${fmtMoney(data.bundleSavings)}`]);
    if (data.heroesDiscountAmount) rows.push(['Heroes Discount', `-${fmtMoney(data.heroesDiscountAmount)}`]);

    const height = rows.length * 6.5 + 14;
    ensureSpace(doc, ctx, height + 2);
    setFill(doc, COLORS.offWhite);
    setDraw(doc, COLORS.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(PAGE_MARGIN, ctx.y, ctx.contentWidth, height, 2, 2, 'FD');
    let ry = ctx.y + 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    rows.forEach(([label, amount]) => {
      setText(doc, COLORS.body);
      doc.text(label, PAGE_MARGIN + 5, ry);
      doc.text(amount, ctx.pageWidth - PAGE_MARGIN - 5, ry, { align: 'right' });
      ry += 6.5;
    });
    setDraw(doc, COLORS.border);
    doc.line(PAGE_MARGIN + 5, ry - 3, ctx.pageWidth - PAGE_MARGIN - 5, ry - 3);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setText(doc, COLORS.emerald);
    doc.text('Estimated starting total', PAGE_MARGIN + 5, ry + 3);
    doc.text(fmtMoney(data.total), ctx.pageWidth - PAGE_MARGIN - 5, ry + 3, { align: 'right' });
    ctx.y += height + 8;
  }

  // ---- Cover page (page 1) --------------------------------------------
  function drawCoverPage(doc, ctx, data) {
    setFill(doc, COLORS.navy);
    doc.rect(0, 0, ctx.pageWidth, 60, 'F');

    if (ctx.logo && ctx.logo.dataUrl) {
      const h = 16;
      const w = h * (ctx.logo.width / ctx.logo.height);
      try { doc.addImage(ctx.logo.dataUrl, 'PNG', PAGE_MARGIN, 14, w, h); } catch (e) { /* skip silently */ }
    }
    setText(doc, COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Little Technical Solutions LLC', PAGE_MARGIN + (ctx.logo ? 24 : 0), 22);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setText(doc, '#C7CCE8');
    doc.text('dylan@lit-solutions.tech  |  636-426-0289  |  lit-solutions.tech', PAGE_MARGIN + (ctx.logo ? 24 : 0), 28.5);

    setFill(doc, COLORS.emerald);
    doc.rect(PAGE_MARGIN, 40, 3, 12, 'F');
    setText(doc, COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('Website Project Estimate and Scope Summary', PAGE_MARGIN + 6, 49);

    ctx.y = CONTENT_TOP_COVER;
    drawInfoCard(doc, ctx, [
      ['Business', data.business || '(not given)'],
      ['Customer', data.customerName || '(not given)'],
      ['Reference', data.reference],
      ['Generated', data.generatedDate],
      ['Package', data.packageLabel],
      ['Selected features', String(data.optionalCount)],
      ['Premium requests', String(data.premiumCount)],
      ['Email', data.customerEmail || '(not given)'],
      ['Phone', data.customerPhone || '(not given)'],
    ]);

    drawSectionTitle(doc, ctx, 'Starting estimate');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    setText(doc, COLORS.emerald);
    doc.text(fmtMoney(data.total), PAGE_MARGIN, ctx.y + 8);
    ctx.y += 14;
    if (data.bundleSavings || data.heroesDiscount) {
      const parts = [];
      if (data.bundleSavings) parts.push(`${fmtMoney(data.bundleSavings)} in bundle savings`);
      if (data.heroesDiscount) parts.push('the American Heroes Discount (pending verification)');
      drawWrappedText(doc, ctx, `Includes ${parts.join(' and ')}.`, { size: 9, color: COLORS.muted, gapAfter: 2 });
    }

    drawNoticeBox(
      doc, ctx,
      'This is an illustrative starting estimate based on the selections made in our online configurator -- not a contract and not a final quote. Little Technical Solutions LLC confirms final scope, schedule, and pricing directly with you before any work begins.',
      'info'
    );
  }

  // ---- Main entry point -------------------------------------------------
  // data shape:
  //  {
  //    business, customerName, customerEmail, customerPhone, reference,
  //    generatedDate, packageLabel, basePrice, optionalSelected: [{title,price}],
  //    premiumSelected: [title], bundledCategories: [category], bundleSavings,
  //    heroesDiscount, heroesDiscountAmount, subtotal, total,
  //    brief: { description, industry, serviceArea, servicesList, brandColors,
  //             styleReferences, addressHours, socialLinks, launchDate,
  //             desiredDomain, staff, testimonials, faq, blog, gallery,
  //             pricing, booking, newsletter, sms },
  //    notes,
  //  }
  async function buildWebsiteDesignerPdf(data) {
    if (!global.jspdf || typeof global.jspdf.jsPDF !== 'function') return null;
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });

    const logo = await loadImageAsDataUrl('assets/logo-icon.png');

    const ctx = {
      doc, page: 1, y: CONTENT_TOP_COVER,
      pageWidth: doc.internal.pageSize.getWidth(),
      pageHeight: doc.internal.pageSize.getHeight(),
      contentWidth: doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2,
      business: data.business, reference: data.reference,
      generatedDate: data.generatedDate, logo,
    };

    const optionalSum = (data.optionalSelected || []).reduce((s, f) => s + (Number(f.price) || 0), 0);
    const optionalCount = (data.optionalSelected || []).length;
    const premiumCount = (data.premiumSelected || []).length;

    // ---- Page 1: cover ----
    drawCoverPage(doc, ctx, {
      ...data,
      optionalCount, premiumCount,
    });

    // ---- Page 2: pricing breakdown ----
    newPage(doc, ctx);
    drawSectionTitle(doc, ctx, 'Base package and included capabilities');
    drawWrappedText(doc, ctx, data.packageLabel, { bold: true, size: 10.5, gapAfter: 2 });
    (data.includedCapabilities || []).forEach((cap) => drawWrappedText(doc, ctx, `• ${cap}`, { size: 9, color: COLORS.muted, gapAfter: 1.5 }));

    ctx.y += 2;
    drawSectionTitle(doc, ctx, 'Selected add-ons');
    if (!optionalCount) {
      drawWrappedText(doc, ctx, '(none selected)', { color: COLORS.muted });
    } else {
      drawTableHeader(doc, ctx, 'Feature', 'Price');
      (data.optionalSelected || []).forEach((f, i) => drawFeatureRow(doc, ctx, f.title, `+${fmtMoney(f.price)}`, { stripe: i % 2 === 1 }));
    }

    if ((data.bundledCategories || []).length) {
      ctx.y += 2;
      drawSectionTitle(doc, ctx, 'Bundle discounts applied (10% each)');
      data.bundledCategories.forEach((cat) => drawWrappedText(doc, ctx, `• ${cat}`, { size: 9, gapAfter: 1.5 }));
    }

    ctx.y += 3;
    drawSectionTitle(doc, ctx, 'Price calculation');
    drawPriceSummary(doc, ctx, {
      basePrice: data.basePrice, optionalSum,
      bundleSavings: data.bundleSavings,
      heroesDiscountAmount: data.heroesDiscount ? data.heroesDiscountAmount : 0,
      total: data.total,
    });
    drawNoticeBox(doc, ctx, 'Premium / custom-quote items below are NOT included in the estimated starting total -- each is scoped and priced individually with you.', 'info');

    // ---- Page 3+: premium requests, business brief, notes, next steps ----
    if (premiumCount) {
      ctx.y += 2;
      drawSectionTitle(doc, ctx, 'Premium custom-quote requests');
      drawTableHeader(doc, ctx, 'Item', 'Pricing');
      data.premiumSelected.forEach((title, i) => drawFeatureRow(doc, ctx, title, 'Custom quote', { stripe: i % 2 === 1, amountColor: COLORS.indigo }));
    }

    const brief = data.brief || {};
    const briefFields = [
      ['What they do', brief.description],
      ['Industry', brief.industry],
      ['Service area', brief.serviceArea],
      ['Services / products', brief.servicesList],
      ['Desired domain', brief.desiredDomain],
      ['Brand colors', brief.brandColors],
      ['Style references', brief.styleReferences],
      ['Address / hours', brief.addressHours],
      ['Social links', brief.socialLinks],
      ['Preferred launch date', brief.launchDate],
      ['Team / staff', brief.staff],
      ['Testimonials', brief.testimonials],
      ['FAQ', brief.faq],
      ['Blog topics', brief.blog],
      ['Gallery / portfolio', brief.gallery],
      ['Pricing to display', brief.pricing],
      ['Booking details', brief.booking],
      ['Newsletter platform', brief.newsletter],
      ['SMS notifications', brief.sms],
    ].filter(([, v]) => v && String(v).trim());

    if (briefFields.length) {
      ctx.y += 3;
      drawSectionTitle(doc, ctx, 'Customer business brief');
      briefFields.forEach(([label, value]) => drawFieldItem(doc, ctx, label, value));
    }

    if (data.notes && String(data.notes).trim()) {
      ctx.y += 2;
      drawSectionTitle(doc, ctx, 'Notes');
      drawWrappedText(doc, ctx, data.notes, {});
    }

    ctx.y += 3;
    drawSectionTitle(doc, ctx, 'Next steps');
    [
      'LTS reviews the submitted scope.',
      'LTS contacts the customer.',
      'Requirements, schedule, and final pricing are confirmed.',
      'Work begins only after final approval.',
    ].forEach((step, i) => drawWrappedText(doc, ctx, `${i + 1}. ${step}`, { size: 9.5, gapAfter: 2 }));

    ctx.y += 2;
    drawNoticeBox(doc, ctx, `Questions any time: dylan@lit-solutions.tech or 636-426-0289. Reference ${ctx.reference}.`, 'info');

    // ---- Footers (every page after the cover) ----
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 2; p <= totalPages; p += 1) {
      doc.setPage(p);
      drawPageFooter(doc, ctx, p, totalPages);
    }

    return doc;
  }

  global.LTS_WD_PDF = { buildWebsiteDesignerPdf, fmtMoney };
})(typeof window !== 'undefined' ? window : globalThis);
