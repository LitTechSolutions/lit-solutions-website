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
//   images        : key = imageId                 -> { cloudinaryPublicId, cloudinaryResourceType, cloudinaryUrl,
//                                                        alt, caption, uploadedBy, uploadedAt } (or a legacy
//                                                        raw `dataUri` on records predating the Cloudinary
//                                                        migration -- see _lib/cloudinary_store.js)
//   documents     : key = documentId               -> { customerId, customerEmail, title, type, amount,
//                   (invoices/receipts/paperwork,      status, date, notes, fileName, uploadedBy, uploadedAt,
//                   admin-uploaded per customer)        cloudinaryPublicId, cloudinaryResourceType,
//                                                        cloudinaryFormat, cloudinaryBytes } (or a legacy raw
//                                                        `fileDataUri` on pre-migration records)
//   messages      : key = messageId                 -> { customerId, customerEmail, from ("customer"|"staff"),
//                   (two-way customer<->staff thread)   fromName, body, createdAt, readByStaff, readByCustomer }
//   favorites     : key = userId (one record/user) -> { items: [{itemId,label,href,addedAt}],
//                   (bookmarks + recently viewed +      recentlyViewed: [{itemId,label,href,viewedAt}],
//                   saved searches)                     savedSearches: [{query,href,savedAt}] }
//   notifications : key = notificationId            -> { userId, title, body, href, read, createdAt }
//                   (one-way in-app alerts, separate from the messages thread)
//   ratelimit     : key = action + ":" + ip        -> { count, windowStart }
//   leads         : key = submission id (WD-...)   -> { package, businessName, customerName, email, phone,
//                   (Website Designer submissions)      domain, notes, subtotal, estimateTotal,
//                                                        heroesDiscount, bundledCategories, bundleSavings,
//                                                        optionalSelected, customRequest, selectedBundles,
//                                                        createdAt, ip }
//   inquiries     : key = submission id (CONTACT-/    -> { form: "contact"|"booking"|"newsletter"|"intake",
//                   BOOKING-/NEWSLETTER-/INTAKE-...)      ...form-specific fields (see site-forms.js), createdAt, ip }

const { getStore } = require("@netlify/blobs");

// Netlify normally injects Blobs context (site ID + token) automatically
// for every Function invocation -- no config needed. On some deploys that
// auto-detection doesn't kick in (MissingBlobsEnvironmentError), so this
// falls back to explicit credentials when NETLIFY_BLOBS_TOKEN is set.
// SITE_ID is already auto-injected by Netlify; the token is a Personal
// Access Token you create yourself (User settings > Applications >
// New access token) and add as an env var -- see README_ADMIN_SETUP.md.
function store(name) {
  const siteID = process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const opts = siteID && token ? { name, siteID, token, consistency: "strong" } : { name, consistency: "strong" };
  return getStore(opts);
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
