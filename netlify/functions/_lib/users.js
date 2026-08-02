// users.js -- the one way to load the account behind a session.
//
// This exists because of a real outage. A session record is
// `{ userId, role, expiresAt }` -- created by auth_utils.createSession(userId,
// role) -- and it has NO email on it. Code that assumed `session.email` got
// `undefined`, and `getJSON("users", String(session.email || "").toLowerCase())`
// therefore asked the blob store for the key "". Netlify Blobs turned that
// empty key into an undefined URL, retried it with backoff for twenty-five
// seconds, and the function timed out with
// `TypeError: Failed to parse URL from undefined` -- an error naming neither
// the store, the key, nor the caller.
//
// So: never look a user up by session.email. There isn't one. Look up by
// session.userId, and read the email off the record you get back.

const { getJSON, store } = require("./blob_store");

/**
 * The users store is keyed by lowercased email, so finding someone by id
 * means scanning. Small by design -- this is a local business, not a social
 * network -- and it is exactly what account.js has always done.
 *
 * @returns {Promise<{key: string, user: object}|null>}
 */
async function findUserRecordById(userId, deps = {}) {
  if (!userId) return null;
  const storeFn = deps.store || store;
  const usersStore = storeFn("users");
  const { blobs } = await usersStore.list();
  for (const b of blobs) {
    const u = await usersStore.get(b.key, { type: "json" });
    if (u && u.id === userId) return { key: b.key, user: u };
  }
  return null;
}

/** Just the record, when the blob key isn't needed. */
async function findUserById(userId, deps = {}) {
  const found = await findUserRecordById(userId, deps);
  return found ? found.user : null;
}

/**
 * By email, for the routes that genuinely have one (an admin acting on a
 * customer they named). Guards the empty string, because that is the input
 * that caused the outage above.
 */
async function findUserByEmail(email, deps = {}) {
  const key = String(email || "").trim().toLowerCase();
  if (!key) return null;
  const getJSONFn = deps.getJSON || getJSON;
  return getJSONFn("users", key);
}

/** The signed-in user's email, which only the user record actually knows. */
async function emailForSession(session, deps = {}) {
  if (!session) return null;
  const user = await findUserById(session.userId, deps);
  return (user && user.email) || null;
}

module.exports = { findUserRecordById, findUserById, findUserByEmail, emailForSession };
