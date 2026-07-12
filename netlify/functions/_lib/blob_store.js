// blob_store.js -- thin wrappers around @netlify/blobs so every function
// uses the same store names and key conventions instead of hardcoding
// strings. Netlify Blobs is a persistent key-value store scoped to the
// deployed site, available to Functions without a separate database
// account.
//
// Store layout:
//   users         : key = email (lowercased)    -> { id, email, name, passwordHash, role, verified, createdAt,
//                                                      preferences: { language, timezone, emailNotifications } }
//   sessions      : key = sessionId              -> { userId, expiresAt, role }
//   tokens        : key = token (verify/reset)    -> { type, userId, used }
//   content       : key = slug (blog-posts,       -> { data: [...], updatedAt, updatedBy }
//                   portfolio-items, testimonials)
//   images        : key = imageId                 -> { dataUri, alt, caption, uploadedBy, uploadedAt }
//   documents     : key = documentId               -> { customerId, customerEmail, title, type, amount,
//                   (invoices/receipts/paperwork,      status, date, notes, fileDataUri, fileName,
//                   admin-uploaded per customer)        uploadedBy, uploadedAt }
//   messages      : key = messageId                 -> { customerId, customerEmail, from ("customer"|"staff"),
//                   (two-way customer<->staff thread)   fromName, body, createdAt, readByStaff, readByCustomer }
//   favorites     : key = userId (one record/user) -> { items: [{itemId,label,href,addedAt}],
//                   (bookmarks + recently viewed +      recentlyViewed: [{itemId,label,href,viewedAt}],
//                   saved searches)                     savedSearches: [{query,href,savedAt}] }
//   notifications : key = notificationId            -> { userId, title, body, href, read, createdAt }
//                   (one-way in-app alerts, separate from the messages thread)
//   ratelimit     : key = action + ":" + ip        -> { count, windowStart }

const { getStore } = require("@netlify/blobs");

function store(name) {
  return getStore({ name, consistency: "strong" });
}

async function getJSON(storeName, key) {
  const raw = await store(storeName).get(key, { type: "json" });
  return raw || null;
}

async function setJSON(storeName, key, value) {
  await store(storeName).setJSON(key, value);
}

async function deleteKey(storeName, key) {
  await store(storeName).delete(key);
}

module.exports = { store, getJSON, setJSON, deleteKey };
