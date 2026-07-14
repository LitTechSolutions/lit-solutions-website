const test = require("node:test");
const assert = require("node:assert/strict");
const { assembleMonthlyReport } = require("./monthlyReportAssembler");

function checkResult(overrides = {}) {
  return {
    id: "check-1",
    organizationId: "org-a",
    websiteProfileId: "site-1",
    checkType: "performance",
    outcome: "pass",
    checkedAt: "2026-07-01T00:00:00.000Z",
    evidence: { pageWeightBytes: 1200000 },
    ...overrides,
  };
}

function backupRecord(overrides = {}) {
  return {
    id: "backup-1",
    organizationId: "org-a",
    websiteProfileId: "site-1",
    category: "source",
    location: "Netlify deploy history",
    takenAt: "2026-07-01T00:00:00.000Z",
    restoreVerified: true,
    ...overrides,
  };
}

function baseInput(overrides = {}) {
  return {
    organizationId: "org-a",
    websiteProfileId: "site-1",
    periodStart: "2026-07-01T00:00:00.000Z",
    periodEnd: "2026-07-31T23:59:59.000Z",
    checkResults: [checkResult()],
    backupRecords: [backupRecord()],
    ...overrides,
  };
}

test("counts check outcomes by type", () => {
  const report = assembleMonthlyReport(
    baseInput({ checkResults: [checkResult({ outcome: "pass" }), checkResult({ id: "check-2", outcome: "warning" }), checkResult({ id: "check-3", outcome: "fail" })] })
  );
  assert.deepEqual(report.checkOutcomeCounts, { pass: 1, warning: 1, fail: 1 });
});

test("summarizes backup status: total vs. restore-verified", () => {
  const report = assembleMonthlyReport(
    baseInput({ backupRecords: [backupRecord({ restoreVerified: true }), backupRecord({ id: "backup-2", restoreVerified: false })] })
  );
  assert.deepEqual(report.backupStatus, { total: 2, verified: 1 });
});

test("automated check results flow through as automated_observation evidence items", () => {
  const report = assembleMonthlyReport(baseInput());
  assert.ok(report.evidence.length > 0);
  assert.ok(report.evidence.every((item) => item.category === "automated_observation"));
});

test("human evidence is included alongside automated evidence", () => {
  const humanItem = { category: "recommendation", text: "Consider upgrading your hosting plan.", authoredBy: "user-tech-1" };
  const report = assembleMonthlyReport(baseInput({ humanEvidence: [humanItem] }));
  assert.ok(report.evidence.includes(humanItem));
});

test("throws if a check result belongs to a different organization/website (caller scoping bug)", () => {
  assert.throws(
    () => assembleMonthlyReport(baseInput({ checkResults: [checkResult({ organizationId: "org-b" })] })),
    /different organization\/website/
  );
});

test("requires organizationId and websiteProfileId", () => {
  assert.throws(() => assembleMonthlyReport({ websiteProfileId: "site-1" }));
  assert.throws(() => assembleMonthlyReport({ organizationId: "org-a" }));
});

test("works with zero check results and zero backups (new website, nothing checked yet)", () => {
  const report = assembleMonthlyReport(baseInput({ checkResults: [], backupRecords: [] }));
  assert.deepEqual(report.checkOutcomeCounts, { pass: 0, warning: 0, fail: 0 });
  assert.deepEqual(report.backupStatus, { total: 0, verified: 0 });
});
