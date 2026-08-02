// purchase_receipt.js -- the branded, server-generated record of a Stripe
// purchase. The same PDF is attached to the customer's email and filed in
// Documents, so the two records can never disagree.

const fs = require("node:fs");
const path = require("node:path");

function loadJsPDF() {
  const mod = require(path.join(__dirname, "..", "..", "..", "assets", "vendor", "jspdf", "jspdf.umd.min.js"));
  return mod.jsPDF || (mod.default && mod.default.jsPDF) || (global.jspdf && global.jspdf.jsPDF);
}

function logoDataUri() {
  const logoPath = path.join(__dirname, "..", "..", "..", "assets", "logo-icon.png");
  return `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
}

function money(cents) {
  return `$${((Number(cents) || 0) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function orderSummary(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.length
    ? items.map((item) => `${item.name || item.key}${item.quantity > 1 ? ` x ${item.quantity}` : ""}`).join(", ")
    : (order.invoice && order.invoice.reference ? `Invoice ${order.invoice.reference}` : "Technology services");
}

function orderNeedsBrief(order) {
  return (order.items || []).some((item) =>
    /^plan-/.test(item.key || "") || /^package-/.test(item.key || "") || /^quote:/.test(item.key || "")
  );
}

function safeFilename(value) {
  const stem = String(value || "purchase")
    .replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48) || "purchase";
  return `LTS-receipt-${stem}.pdf`;
}

/**
 * @param {{order: object, customer?: object, issuedAt?: string}} input
 * @returns {{base64:string, filename:string, title:string}}
 */
function renderPurchaseReceiptPdf(input) {
  const order = input.order || {};
  const customer = input.customer || {};
  const issuedAt = input.issuedAt || order.paidAt || new Date().toISOString();
  const jsPDF = loadJsPDF();
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 54;
  const RIGHT = W - M;
  const BLUE = [0, 98, 204];
  const NAVY = [8, 36, 73];
  const INK = [29, 29, 31];
  const SOFT = [92, 92, 97];
  const LINE = [224, 226, 230];
  const PALE = [245, 248, 252];
  const GREEN = [23, 128, 73];
  const p = order.pricing || {};
  const paidCents = order.amountPaidCents != null ? order.amountPaidCents : p.chargedTodayCents;
  const summary = orderSummary(order);
  const title = order.invoice ? "Payment Receipt" : "Project Purchase Summary & Receipt";
  let y = M;

  // Brand header.
  doc.addImage(logoDataUri(), "PNG", M, y - 4, 54, 52);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...NAVY);
  doc.text("LITTLE TECHNICAL", M + 66, y + 17);
  doc.setTextColor(...BLUE);
  doc.text("SOLUTIONS LLC", M + 66, y + 35);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...SOFT);
  doc.text("lit-solutions.tech", RIGHT, y + 14, { align: "right" });
  doc.text("804-309-0968", RIGHT, y + 29, { align: "right" });
  doc.text("P.O. Box 102, Montross, VA 22520", RIGHT, y + 44, { align: "right" });
  y += 78;

  doc.setDrawColor(...LINE);
  doc.line(M, y, RIGHT, y);
  y += 34;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(23);
  doc.setTextColor(...INK);
  doc.text(title, M, y);
  doc.setFillColor(230, 247, 237);
  doc.roundedRect(RIGHT - 64, y - 19, 64, 26, 13, 13, "F");
  doc.setFontSize(9);
  doc.setTextColor(...GREEN);
  doc.text("PAID", RIGHT - 32, y - 2, { align: "center" });
  y += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...SOFT);
  doc.text(`Order ${String(order.id || "-")}`, M, y);
  doc.text(new Date(issuedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), RIGHT, y, { align: "right" });
  y += 30;

  // Customer and project summary.
  doc.setFillColor(...PALE);
  doc.roundedRect(M, y, RIGHT - M, 88, 12, 12, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...SOFT);
  doc.text("CUSTOMER", M + 16, y + 21);
  doc.text(order.invoice ? "PAYMENT FOR" : "PROJECT", M + 256, y + 21);
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(String(customer.name || order.customerName || "Customer").slice(0, 35), M + 16, y + 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  doc.text(String(customer.email || order.customerEmail || "").slice(0, 42), M + 16, y + 59);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(summary, 210).slice(0, 2), M + 256, y + 42);
  y += 116;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  doc.text("PURCHASE DETAILS", M, y);
  y += 17;

  const rows = (order.items || []).map((item) => ({
    label: `${item.name || item.key}${item.quantity > 1 ? ` x ${item.quantity}` : ""}`,
    value: "Included",
  }));
  if (!rows.length) rows.push({ label: summary, value: "Included" });
  rows.forEach((row) => {
    doc.setDrawColor(...LINE);
    doc.line(M, y + 26, RIGHT, y + 26);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(row.label, 360).slice(0, 2), M, y + 12);
    doc.setTextColor(...SOFT);
    doc.text(row.value, RIGHT, y + 12, { align: "right" });
    y += 34;
  });

  y += 12;
  const totals = [
    { label: "Paid today", value: money(paidCents), strong: true },
  ];
  if (p.monthlyCents) totals.push({ label: "Ongoing website plan", value: `${money(p.monthlyCents)} / month` });
  if (p.balanceAtLaunchCents) totals.push({ label: "Remaining balance due at launch", value: money(p.balanceAtLaunchCents) });
  if (order.hero) totals.push({ label: "American Heroes Discount", value: "Applied" });
  totals.forEach((row) => {
    doc.setFont("helvetica", row.strong ? "bold" : "normal");
    doc.setFontSize(row.strong ? 13 : 10);
    doc.setTextColor(...(row.strong ? INK : SOFT));
    doc.text(row.label, M + 256, y);
    doc.text(row.value, RIGHT, y, { align: "right" });
    y += row.strong ? 26 : 20;
  });

  y = Math.max(y + 20, 510);
  doc.setFillColor(...NAVY);
  doc.roundedRect(M, y, RIGHT - M, 106, 14, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(order.invoice ? "Payment recorded" : "What happens next", M + 18, y + 27);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(224, 233, 244);
  const next = order.invoice
    ? "We have matched this payment to the reference on your order. Keep this document for your records."
    : orderNeedsBrief(order)
      ? "Complete the project brief in your customer dashboard. We will review it and contact you within one business day before work begins."
      : "We have your order and will contact you within one business day to confirm the details and next steps.";
  doc.text(doc.splitTextToSize(next, RIGHT - M - 36), M + 18, y + 49);
  doc.setTextColor(151, 197, 255);
  doc.setFont("helvetica", "bold");
  doc.text("Open your dashboard: lit-solutions.tech/myaccount.html", M + 18, y + 88);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...SOFT);
  doc.text("Securely processed by Stripe. Little Technical Solutions LLC does not store your card details.", M, H - 42);
  doc.text("Questions? dylan@lit-solutions.tech  |  804-309-0968", M, H - 26);
  doc.text("Page 1 of 1", RIGHT, H - 26, { align: "right" });

  return {
    base64: Buffer.from(doc.output("arraybuffer")).toString("base64"),
    filename: safeFilename(order.invoice && order.invoice.reference ? order.invoice.reference : summary),
    title,
  };
}

module.exports = { renderPurchaseReceiptPdf, money, orderSummary, orderNeedsBrief };
