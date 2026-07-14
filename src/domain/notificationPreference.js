// Domain type for F012's delivery-preferences half (the notification
// record itself already exists and is reusable -- see
// netlify/functions/notifications.js and ARCHITECTURE.md's reuse table).

/**
 * @typedef {"low" | "normal" | "high" | "urgent"} NotificationUrgency
 */

/**
 * @typedef {"in_app" | "email"} NotificationChannel
 */

/**
 * @typedef {Object} NotificationPreference
 * @property {string} userId
 * @property {Record<NotificationUrgency, NotificationChannel[]>} channelsByUrgency - Which channels fire at each urgency level.
 * @property {string} updatedAt
 */

const URGENCIES = ["low", "normal", "high", "urgent"];
const CHANNELS = ["in_app", "email"];

/**
 * @param {Partial<NotificationPreference>} candidate
 * @returns {asserts candidate is NotificationPreference}
 */
function assertValidNotificationPreference(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("notificationPreference: expected an object");
  if (typeof candidate.userId !== "string" || candidate.userId.length === 0) throw new Error("notificationPreference: userId is required");
  if (!candidate.channelsByUrgency || typeof candidate.channelsByUrgency !== "object") {
    throw new Error("notificationPreference: channelsByUrgency is required");
  }
  for (const urgency of URGENCIES) {
    const channels = candidate.channelsByUrgency[urgency];
    if (channels === undefined) continue;
    if (!Array.isArray(channels) || channels.some((c) => !CHANNELS.includes(c))) {
      throw new Error(`notificationPreference: channelsByUrgency.${urgency} must be an array of ${CHANNELS.join("/")}`);
    }
  }
}

/**
 * In-app notifications for "urgent" events are never fully suppressible --
 * a customer can turn off email, but not lose visibility of urgent
 * in-app alerts entirely. Matches SYS-NFR-016 (a first-time customer must
 * be able to see what needs their attention without training/configuration).
 * @returns {NotificationPreference}
 */
function defaultNotificationPreference(userId, now = new Date()) {
  return {
    userId,
    channelsByUrgency: {
      low: ["in_app"],
      normal: ["in_app", "email"],
      high: ["in_app", "email"],
      urgent: ["in_app", "email"],
    },
    updatedAt: now.toISOString(),
  };
}

module.exports = { URGENCIES, CHANNELS, assertValidNotificationPreference, defaultNotificationPreference };
