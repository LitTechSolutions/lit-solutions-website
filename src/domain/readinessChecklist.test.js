const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertValidChecklistDefinition,
  assertValidChecklistItemAnswer,
  assertValidChecklistSubmissionStatus,
  CHECKLIST_AUDIENCES,
  CHECKLIST_SUBMISSION_STATUSES,
} = require("./readinessChecklist");

function definition(overrides = {}) {
  return {
    id: "def-1",
    title: "Security Readiness",
    items: [{ key: "mfa_enabled", label: "MFA enabled?", weight: 1, audience: "customer" }],
    ...overrides,
  };
}

test("assertValidChecklistDefinition accepts a well-formed definition with audience on every item", () => {
  assert.doesNotThrow(() => assertValidChecklistDefinition(definition()));
});

test("assertValidChecklistDefinition rejects an item missing audience", () => {
  assert.throws(
    () => assertValidChecklistDefinition(definition({ items: [{ key: "x", label: "x", weight: 1 }] })),
    /audience/
  );
});

test("assertValidChecklistDefinition rejects an invalid audience value", () => {
  assert.throws(
    () => assertValidChecklistDefinition(definition({ items: [{ key: "x", label: "x", weight: 1, audience: "manager" }] })),
    /audience/
  );
});

test("CHECKLIST_AUDIENCES is exactly customer/staff", () => {
  assert.deepEqual(CHECKLIST_AUDIENCES, ["customer", "staff"]);
});

test("assertValidChecklistItemAnswer accepts a minimal customer answer", () => {
  assert.doesNotThrow(() => assertValidChecklistItemAnswer({ itemKey: "mfa_enabled", met: true }));
});

test("assertValidChecklistItemAnswer accepts a full staff assessment", () => {
  assert.doesNotThrow(() =>
    assertValidChecklistItemAnswer({ itemKey: "mfa_enabled", met: true, comment: "done", staffNote: "verified via screenshare", staffVerified: true })
  );
});

test("assertValidChecklistItemAnswer rejects a missing itemKey", () => {
  assert.throws(() => assertValidChecklistItemAnswer({ met: true }), /itemKey/);
});

test("assertValidChecklistItemAnswer rejects a non-boolean met", () => {
  assert.throws(() => assertValidChecklistItemAnswer({ itemKey: "x", met: "yes" }), /met/);
});

test("assertValidChecklistItemAnswer rejects a non-string comment", () => {
  assert.throws(() => assertValidChecklistItemAnswer({ itemKey: "x", met: true, comment: 123 }), /comment/);
});

test("assertValidChecklistItemAnswer rejects a non-string staffNote", () => {
  assert.throws(() => assertValidChecklistItemAnswer({ itemKey: "x", met: true, staffNote: 123 }), /staffNote/);
});

test("assertValidChecklistItemAnswer rejects a non-boolean staffVerified", () => {
  assert.throws(() => assertValidChecklistItemAnswer({ itemKey: "x", met: true, staffVerified: "yes" }), /staffVerified/);
});

test("assertValidChecklistSubmissionStatus accepts every real status", () => {
  for (const status of CHECKLIST_SUBMISSION_STATUSES) {
    assert.doesNotThrow(() => assertValidChecklistSubmissionStatus(status));
  }
});

test("assertValidChecklistSubmissionStatus rejects an unknown status", () => {
  assert.throws(() => assertValidChecklistSubmissionStatus("approved"), /status/);
});

test("CHECKLIST_SUBMISSION_STATUSES is exactly draft/submitted/returned/verified", () => {
  assert.deepEqual(CHECKLIST_SUBMISSION_STATUSES, ["draft", "submitted", "returned", "verified"]);
});
