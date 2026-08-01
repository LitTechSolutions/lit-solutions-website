// brief_pdf.js -- renders a submitted project brief to PDF, server-side.
//
// Deliberately generated here rather than in the browser. The obvious
// alternative was to let the page build the PDF with jsPDF and upload it, but
// that means emailing Dylan a file a customer supplied -- an arbitrary binary
// attachment, and no guarantee its contents match what was actually submitted.
// Rendering from the stored answers means the PDF, the customer's Documents
// copy and Dylan's email are provably the same data.
//
// jsPDF's UMD build runs fine under Node (verified: emits a real %PDF- file),
// so the vendored browser copy is reused rather than adding a dependency.

const path = require("node:path");

const BRIEF_FIELDS = [
  { key: "businessName", label: "Business name" },
  { key: "contactName", label: "Main contact" },
  { key: "contactPhone", label: "Best phone number" },
  { key: "businessDescription", label: "What the business does" },
  { key: "targetCustomer", label: "Who the site is for" },
  { key: "services", label: "Services to list" },
  { key: "serviceArea", label: "Service area" },
  { key: "hours", label: "Business hours" },
  { key: "existingDomain", label: "Domain (existing or wanted)" },
  { key: "brandColors", label: "Brand colours / style notes" },
  { key: "sitesYouLike", label: "Sites they like, and why" },
  { key: "contentReady", label: "Content they already have" },
  { key: "mustHaves", label: "Must-haves" },
  { key: "launchDate", label: "Hoped-for launch" },
  { key: "anythingElse", label: "Anything else" },
];

function loadJsPDF() {
  const mod = require(path.join(__dirname, "..", "..", "..", "assets", "vendor", "jspdf", "jspdf.umd.min.js"));
  return mod.jsPDF || (mod.default && mod.default.jsPDF) || (global.jspdf && global.jspdf.jsPDF);
}

/**
 * @param {{ order: object, answers: object, customer: object, submittedAt: string }} input
 * @returns {{ base64: string, filename: string }}
 */
function renderBriefPdf(input) {
  const jsPDF = loadJsPDF();
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  const M = 56;                       // margin
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const TEXT_W = W - M * 2;
  let y = M;

  function ensureRoom(needed) {
    if (y + needed <= H - M) return;
    doc.addPage();
    y = M;
  }

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Website Project Brief", M, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text("Little Technical Solutions LLC", M, y);
  y += 26;
  doc.setTextColor(0);

  // Order summary strip
  doc.setDrawColor(220);
  doc.setFillColor(246, 247, 249);
  doc.rect(M, y, TEXT_W, 58, "F");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text("PLAN", M + 12, y + 18);
  doc.text("CUSTOMER", M + 190, y + 18);
  doc.text("SUBMITTED", M + 370, y + 18);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(String(input.order.planName || input.order.planKey || "—"), M + 12, y + 36);
  doc.text(String(input.customer.email || "—").slice(0, 28), M + 190, y + 36);
  doc.text(new Date(input.submittedAt).toLocaleString("en-US"), M + 370, y + 36);
  doc.setFont("helvetica", "normal");
  y += 78;

  // Answers
  for (const field of BRIEF_FIELDS) {
    const value = String(input.answers[field.key] == null ? "" : input.answers[field.key]).trim() || "—";
    const lines = doc.splitTextToSize(value, TEXT_W);
    ensureRoom(18 + lines.length * 13 + 12);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(60);
    doc.text(field.label, M, y);
    y += 15;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(lines, M, y);
    y += lines.length * 13 + 14;
  }

  // Footer on every page
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Order ${input.order.id}`, M, H - 28);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 28, { align: "right" });
  }

  const safeName = String(input.answers.businessName || input.customer.email || "brief")
    .replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "brief";

  return {
    base64: Buffer.from(doc.output("arraybuffer")).toString("base64"),
    filename: `project-brief-${safeName}.pdf`,
  };
}

module.exports = { renderBriefPdf, BRIEF_FIELDS };
