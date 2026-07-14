const test = require("node:test");
const assert = require("node:assert/strict");
const { shapeTicketSubmission } = require("./ticketSubmission");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "ticket-fixed-id";

function baseInput(overrides = {}) {
  return {
    organizationId: "org-a",
    category: "website_change",
    subject: "Update our hours on the contact page",
    description: "Our new hours are Mon-Fri 9-5, currently the site shows the old hours.",
    submittedBy: "user-1",
    ...overrides,
  };
}

test("shapes a valid submission into a submitted ticket", () => {
  const ticket = shapeTicketSubmission(baseInput(), { now: FIXED_NOW, idGenerator: FIXED_ID });
  assert.equal(ticket.status, "submitted");
  assert.equal(ticket.id, "ticket-fixed-id");
  assert.equal(ticket.version, 1);
});

test("trims whitespace from subject and description", () => {
  const ticket = shapeTicketSubmission(baseInput({ subject: "  hi  ", description: "  there  " }), { now: FIXED_NOW, idGenerator: FIXED_ID });
  assert.equal(ticket.subject, "hi");
  assert.equal(ticket.description, "there");
});

test("rejects a missing subject", () => {
  assert.throws(() => shapeTicketSubmission(baseInput({ subject: "" }), { now: FIXED_NOW }), /subject is required/);
});

test("rejects an invalid category", () => {
  assert.throws(() => shapeTicketSubmission(baseInput({ category: "not_a_real_category" }), { now: FIXED_NOW }), /category must be one of/);
});

test("accepts optional details when they're real content", () => {
  const ticket = shapeTicketSubmission(baseInput({ details: { pageUrl: "https://example.com/contact" } }), { now: FIXED_NOW, idGenerator: FIXED_ID });
  assert.equal(ticket.details.pageUrl, "https://example.com/contact");
});

test("rejects placeholder-junk values in optional details (audit finding F018)", () => {
  for (const junk of ["n/a", "N/A", "none", "4", "-", "TBD"]) {
    assert.throws(
      () => shapeTicketSubmission(baseInput({ details: { deviceType: junk } }), { now: FIXED_NOW }),
      /placeholder value/,
      `expected "${junk}" to be rejected as placeholder junk`
    );
  }
});

test("submission does not check plan entitlement -- no such field exists in the shaped output", () => {
  const ticket = shapeTicketSubmission(baseInput(), { now: FIXED_NOW, idGenerator: FIXED_ID });
  assert.equal("planEntitlement" in ticket, false);
  assert.equal("entitlementCheck" in ticket, false);
});
