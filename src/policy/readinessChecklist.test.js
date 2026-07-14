const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreChecklist } = require("./readinessChecklist");

function definition(overrides = {}) {
  return {
    id: "security-readiness-v1",
    title: "Security Readiness",
    items: [
      { key: "mfa_enabled", label: "MFA enabled on critical accounts?", weight: 2 },
      { key: "backups_configured", label: "Backups configured?", weight: 1 },
      { key: "recovery_contact_set", label: "Recovery contact set?", weight: 1 },
    ],
    ...overrides,
  };
}

test("full score when every item is met", () => {
  const responses = [
    { itemKey: "mfa_enabled", met: true },
    { itemKey: "backups_configured", met: true },
    { itemKey: "recovery_contact_set", met: true },
  ];
  const result = scoreChecklist(definition(), responses);
  assert.equal(result.score, 1);
  assert.deepEqual(result.unmetItemKeys, []);
});

test("zero score when nothing is met", () => {
  const result = scoreChecklist(definition(), []);
  assert.equal(result.score, 0);
  assert.equal(result.unmetItemKeys.length, 3);
});

test("weighted partial score reflects item importance, not just count", () => {
  // mfa_enabled (weight 2) unmet, the two weight-1 items met -> 2 of 4 total weight = 0.5
  const responses = [
    { itemKey: "backups_configured", met: true },
    { itemKey: "recovery_contact_set", met: true },
  ];
  const result = scoreChecklist(definition(), responses);
  assert.equal(result.score, 0.5);
  assert.deepEqual(result.unmetItemKeys, ["mfa_enabled"]);
});

test("an item not answered at all counts as unmet, not skipped", () => {
  const result = scoreChecklist(definition(), [{ itemKey: "mfa_enabled", met: true }]);
  assert.ok(result.unmetItemKeys.includes("backups_configured"));
  assert.ok(result.unmetItemKeys.includes("recovery_contact_set"));
});

test("summary is plain language, not a raw score dump", () => {
  const result = scoreChecklist(definition(), [{ itemKey: "mfa_enabled", met: true }]);
  assert.match(result.summary, /of 3 readiness items/);
});

test("checklist content (items/labels) is caller-supplied, not hardcoded -- an MFA-specific checklist works the same way", () => {
  const mfaChecklist = definition({
    id: "mfa-checklist-v1",
    title: "Account Protection & MFA",
    items: [
      { key: "email_mfa", label: "Primary email has MFA?", weight: 1 },
      { key: "banking_mfa", label: "Banking has MFA?", weight: 1 },
    ],
  });
  const result = scoreChecklist(mfaChecklist, [{ itemKey: "email_mfa", met: true }]);
  assert.equal(result.score, 0.5);
});

test("rejects a malformed checklist definition", () => {
  assert.throws(() => scoreChecklist({ id: "x", items: [] }, []));
});
