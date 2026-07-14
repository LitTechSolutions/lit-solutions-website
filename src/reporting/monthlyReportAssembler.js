// F042 -- Monthly Website Care Report. Composes already-computed check
// results (F035/F038/F039/F040), backup records (F041), and
// human-authored evidence into one customer-facing report, running every
// automated result through evidenceCategorization.js so the "verified
// fact vs. automated observation vs. technician interpretation vs.
// recommendation vs. customer action" distinction is structural, not
// left to whoever writes the report copy.

const { categorizeCheckResult } = require("./evidenceCategorization");

/**
 * @typedef {Object} MonthlyReport
 * @property {string} organizationId
 * @property {string} websiteProfileId
 * @property {string} periodStart
 * @property {string} periodEnd
 * @property {import("./evidenceCategorization").EvidenceItem[]} evidence
 * @property {Record<import("../domain/websiteCheck").WebsiteCheckOutcome, number>} checkOutcomeCounts
 * @property {{ total: number, verified: number }} backupStatus
 */

/**
 * @param {{
 *   organizationId: string,
 *   websiteProfileId: string,
 *   periodStart: string,
 *   periodEnd: string,
 *   checkResults: import("../domain/websiteCheck").WebsiteCheckResult[],
 *   backupRecords: import("../domain/backupRecord").BackupRecord[],
 *   humanEvidence?: import("./evidenceCategorization").EvidenceItem[],
 * }} input
 * @returns {MonthlyReport}
 */
function assembleMonthlyReport(input) {
  if (!input || typeof input.organizationId !== "string" || input.organizationId.length === 0) {
    throw new Error("assembleMonthlyReport: organizationId is required");
  }
  if (typeof input.websiteProfileId !== "string" || input.websiteProfileId.length === 0) {
    throw new Error("assembleMonthlyReport: websiteProfileId is required");
  }
  const { organizationId, websiteProfileId, periodStart, periodEnd, checkResults = [], backupRecords = [], humanEvidence = [] } = input;

  for (const [label, records] of [
    ["checkResults", checkResults],
    ["backupRecords", backupRecords],
  ]) {
    const foreign = records.find((r) => r.organizationId !== organizationId || r.websiteProfileId !== websiteProfileId);
    if (foreign) {
      throw new Error(`assembleMonthlyReport: ${label} contains a record for a different organization/website -- caller failed to scope its query`);
    }
  }

  const automatedEvidence = checkResults.flatMap((result) => categorizeCheckResult(result));

  const checkOutcomeCounts = { pass: 0, warning: 0, fail: 0 };
  for (const result of checkResults) {
    checkOutcomeCounts[result.outcome] += 1;
  }

  const backupStatus = {
    total: backupRecords.length,
    verified: backupRecords.filter((record) => record.restoreVerified).length,
  };

  return {
    organizationId,
    websiteProfileId,
    periodStart,
    periodEnd,
    evidence: [...automatedEvidence, ...humanEvidence],
    checkOutcomeCounts,
    backupStatus,
  };
}

module.exports = { assembleMonthlyReport };
