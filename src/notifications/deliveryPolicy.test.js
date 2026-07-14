const test = require("node:test");
const assert = require("node:assert/strict");
const { decideDelivery } = require("./deliveryPolicy");
const { defaultNotificationPreference } = require("../domain/notificationPreference");

test("urgent events always include in-app delivery even with no stored preference", () => {
  const decision = decideDelivery(null, "urgent");
  assert.ok(decision.channels.includes("in_app"));
});

test("urgent events include in-app even if the stored preference tries to omit it", () => {
  const preference = { userId: "u1", channelsByUrgency: { urgent: ["email"] }, updatedAt: "2026-01-01T00:00:00.000Z" };
  const decision = decideDelivery(preference, "urgent");
  assert.ok(decision.channels.includes("in_app"));
  assert.ok(decision.channels.includes("email"));
});

test("default preference delivers low-urgency events in-app only", () => {
  const preference = defaultNotificationPreference("u1", new Date("2026-01-01T00:00:00.000Z"));
  const decision = decideDelivery(preference, "low");
  assert.deepEqual(decision.channels, ["in_app"]);
});

test("default preference delivers normal/high urgency via both channels", () => {
  const preference = defaultNotificationPreference("u1", new Date("2026-01-01T00:00:00.000Z"));
  assert.deepEqual(decideDelivery(preference, "normal").channels, ["in_app", "email"]);
  assert.deepEqual(decideDelivery(preference, "high").channels, ["in_app", "email"]);
});

test("an unconfigured urgency level (gap in preference) defaults to no delivery, not a guess", () => {
  const preference = { userId: "u1", channelsByUrgency: { normal: ["in_app"] }, updatedAt: "2026-01-01T00:00:00.000Z" };
  const decision = decideDelivery(preference, "low");
  assert.deepEqual(decision.channels, []);
  assert.match(decision.reason, /no delivery configured/);
});

test("an unrecognized urgency value fails safe toward urgent (over-notify, not under)", () => {
  const decision = decideDelivery(null, "not_a_real_urgency");
  assert.ok(decision.channels.includes("in_app"));
});
