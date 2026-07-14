// F044 -- IT Support Request & Remote/On-Site Classification. Generic
// classifier from explicit signals (does this need physical access? is
// there a safety concern?) rather than an invented category taxonomy --
// mirrors priorityScoring.js's safety-override pattern (F021): a safety
// risk always routes to safety-conscious handling regardless of the
// other signals, since that's a direct reading of the objective text
// ("safety-conscious handling") rather invented policy.

const { assertValidITSupportSignals } = require("../domain/itSupportRequest");

/**
 * @param {import("../domain/itSupportRequest").ITSupportSignals} signals
 * @returns {{ classification: import("../domain/itSupportRequest").HandlingClassification, reason: string }}
 */
function classifyHandling(signals) {
  assertValidITSupportSignals(signals);

  if (signals.safetyRisk) {
    return { classification: "safety_conscious", reason: "safety risk present -- always routes to safety-conscious handling" };
  }
  if (signals.requiresPhysicalAccess) {
    return { classification: "on_site", reason: "physical access required" };
  }
  return { classification: "remote", reason: "no physical access or safety concern signaled" };
}

module.exports = { classifyHandling };
