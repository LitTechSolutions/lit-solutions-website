// F036 -- Uptime & Incident Alerting. Generic monitoring incident state
// machine. The actual uptime-check mechanism (HTTP polling, SSRF-safe
// fetch) is not implemented here -- per Session 0 discovery, this should
// eventually reuse the same scheduled-function pattern already designed
// in the existing lead-followup spec (the only precedent for background
// jobs in this codebase) wrapped around a check engine adapted from the
// website-audit spec, rather than a third bespoke implementation.

const STATUSES = ["up", "investigating", "down", "resolved"];

const ALLOWED_TRANSITIONS = {
  up: new Set(["investigating", "down"]),
  investigating: new Set(["down", "up"]), // investigating can resolve back to up without ever confirming "down"
  down: new Set(["resolved"]),
  resolved: new Set(["up"]), // a fresh check confirms normal service; "resolved" isn't itself steady-state
};

/**
 * @param {string} currentStatus
 * @param {string} nextStatus
 * @returns {{ allowed: boolean, reason: string }}
 */
function transitionIncidentStatus(currentStatus, nextStatus) {
  if (!STATUSES.includes(currentStatus) || !STATUSES.includes(nextStatus)) {
    return { allowed: false, reason: "unknown incident status" };
  }
  if (!ALLOWED_TRANSITIONS[currentStatus].has(nextStatus)) {
    return { allowed: false, reason: `cannot move from "${currentStatus}" to "${nextStatus}"` };
  }
  return { allowed: true, reason: `"${currentStatus}" -> "${nextStatus}" is a legal transition` };
}

module.exports = { transitionIncidentStatus, STATUSES, ALLOWED_TRANSITIONS };
