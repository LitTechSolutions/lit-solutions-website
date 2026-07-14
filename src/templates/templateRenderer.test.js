const test = require("node:test");
const assert = require("node:assert/strict");
const { renderTemplate, assertValidTemplateDefinition } = require("./templateRenderer");

function definition(overrides = {}) {
  return {
    id: "tmpl-1",
    key: "ticket_created",
    subject: "Your request has been received, {{customerName}}",
    body: "Hi {{customerName}}, we received your request \"{{ticketSubject}}\" and will follow up soon.",
    allowedVariables: ["customerName", "ticketSubject"],
    ...overrides,
  };
}

test("renders subject and body with provided variables", () => {
  const result = renderTemplate(definition(), { customerName: "Jamie", ticketSubject: "Update hours" });
  assert.equal(result.subject, "Your request has been received, Jamie");
  assert.equal(result.body, 'Hi Jamie, we received your request "Update hours" and will follow up soon.');
});

test("rejects a template that references an undeclared variable at definition time", () => {
  assert.throws(
    () => assertValidTemplateDefinition(definition({ body: "Hi {{customerName}}, your internal note is {{internalNotes}}." })),
    /undeclared variable/
  );
});

test("rejects rendering when the caller supplies a variable the template did not declare", () => {
  assert.throws(
    () => renderTemplate(definition(), { customerName: "Jamie", ticketSubject: "x", secretInternalField: "leak" }),
    /did not declare/
  );
});

test("rejects rendering when a required variable is missing", () => {
  assert.throws(() => renderTemplate(definition(), { customerName: "Jamie" }), /missing required variable/);
});

test("a template with zero variables renders as-is", () => {
  const staticTemplate = definition({ subject: "Welcome!", body: "Thanks for signing up.", allowedVariables: [] });
  const result = renderTemplate(staticTemplate, {});
  assert.equal(result.body, "Thanks for signing up.");
});

test("cannot leak data through a variable that isn't in the allowlist, even if the template body doesn't reference it", () => {
  // The check happens on the SUPPLIED variables map, not just what the body uses.
  assert.throws(() => renderTemplate(definition(), { customerName: "Jamie", ticketSubject: "x", paymentAmount: "$500" }));
});
