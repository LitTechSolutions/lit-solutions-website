// F012 -- Notification Center & Delivery Preferences (delivery-decision
// half; the notification record itself is netlify/functions/notifications.js,
// already reusable per ARCHITECTURE.md). Pure function: given a user's
// preference and an event's urgency, which channels should fire.

const { URGENCIES, defaultNotificationPreference } = require("../domain/notificationPreference");

/**
 * @typedef {Object} DeliveryDecision
 * @property {import("../domain/notificationPreference").NotificationChannel[]} channels
 * @property {string} reason
 */

/**
 * @param {import("../domain/notificationPreference").NotificationPreference | null | undefined} preference
 * @param {import("../domain/notificationPreference").NotificationUrgency} urgency
 * @returns {DeliveryDecision}
 */
function decideDelivery(preference, urgency) {
  if (!URGENCIES.includes(urgency)) {
    // Fail safe toward over-notifying on a malformed urgency, not under --
    // an unrecognized urgency is treated as "urgent" so nothing important
    // is silently dropped by a typo or a not-yet-handled event type.
    return decideDelivery(preference, "urgent");
  }

  const effectivePreference = preference || defaultNotificationPreference("unknown-user");
  const configuredChannels = effectivePreference.channelsByUrgency?.[urgency];

  if (urgency === "urgent") {
    // In-app visibility for urgent events is never fully user-suppressible
    // (see defaultNotificationPreference's rationale) -- always include it
    // even if a stored preference somehow omitted it.
    const channels = new Set(configuredChannels || []);
    channels.add("in_app");
    return { channels: [...channels], reason: "urgent events always include in-app delivery" };
  }

  if (!configuredChannels) {
    return { channels: [], reason: `no delivery configured for urgency "${urgency}" -- defaulting to no delivery, not guessing` };
  }

  return { channels: configuredChannels, reason: `delivered per user preference for urgency "${urgency}"` };
}

module.exports = { decideDelivery };
