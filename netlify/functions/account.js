// account.js -- lets the signed-in admin update their own email and/or
// password from the dashboard, so future changes don't require touching
// the Netlify Blobs dashboard by hand. Every change requires re-entering
// the current password (defense in depth, even though the request is
// already authenticated by session cookie) and revokes all sessions
// afterward -- same "rotate on privilege change" rule as password reset --
// so a stolen session cookie can't quietly change the account out from
// under you.
//
// GET                                                    -> { user: { id, name, email, role, preferences } }
// POST { action: "update-name", newName }
// POST { action: "update-preferences", preferences: { timezone?, emailNotifications? } }
// POST { action: "update-password", currentPassword, newPassword }
// POST { action: "update-email", currentPassword, newEmail }

const { readCookie, getSession, verifyPassword, hashPassword, revokeAllSessionsForUser, clearSessionCookie, json, rateLimited } = require("./_lib/auth_utils");
const { getJSON, setJSON, deleteKey, store } = require("./_lib/blob_store");

function withDefaultPreferences(preferences) {
  return Object.assign({ timezone: "", emailNotifications: true }, preferences || {});
}

async function findUserRecord(userId) {
  const usersStore = store("users");
  const { blobs } = await usersStore.list();
  for (const b of blobs) {
    const u = await usersStore.get(b.key, { type: "json" });
    if (u && u.id === userId) return { key: b.key, user: u };
  }
  return null;
}

exports.handler = async (event) => {
  const token = readCookie(event, "lts_session");
  const session = token ? await getSession(token) : null;
  if (!session) return json(401, { error: "Sign in required." });

  if (event.httpMethod === "GET") {
    const found = await findUserRecord(session.userId);
    if (!found) return json(404, { error: "Account not found." });
    return json(200, { user: { id: found.user.id, name: found.user.name, email: found.user.email, role: found.user.role, preferences: withDefaultPreferences(found.user.preferences) } });
  }

  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || "unknown";
  if (await rateLimited("account-update", ip, 6, 900)) {
    return json(429, { error: "Too many attempts. Try again later." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }

  const found = await findUserRecord(session.userId);
  if (!found) return json(404, { error: "Account not found." });
  const { key, user } = found;

  if (body.action === "update-name") {
    const newName = (body.newName || "").trim();
    if (!newName) return json(400, { error: "Name is required." });
    if (newName.length > 120) return json(400, { error: "Name is too long." });
    user.name = newName;
    await setJSON("users", key, user);
    return json(200, { message: "Name updated.", user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }

  if (body.action === "update-preferences") {
    const incoming = body.preferences || {};
    const prefs = withDefaultPreferences(user.preferences);
    if (incoming.timezone !== undefined) prefs.timezone = String(incoming.timezone).slice(0, 60);
    if (incoming.emailNotifications !== undefined) prefs.emailNotifications = !!incoming.emailNotifications;
    user.preferences = prefs;
    await setJSON("users", key, user);
    return json(200, { message: "Preferences updated.", preferences: prefs });
  }

  if (!body.currentPassword) return json(400, { error: "Current password is required to make changes." });
  const ok = await verifyPassword(body.currentPassword, user.passwordHash);
  if (!ok) return json(401, { error: "Current password is incorrect." });

  if (body.action === "update-password") {
    if (!body.newPassword || body.newPassword.length < 10) return json(400, { error: "New password must be at least 10 characters." });
    user.passwordHash = await hashPassword(body.newPassword);
    await setJSON("users", key, user);
    await revokeAllSessionsForUser(user.id);
    return json(200, { message: "Password updated. Please sign in again." }, { "Set-Cookie": clearSessionCookie() });
  }

  if (body.action === "update-email") {
    const newEmail = (body.newEmail || "").toLowerCase().trim();
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return json(400, { error: "A valid email is required." });
    if (newEmail === key) return json(400, { error: "That's already your current email." });
    const existing = await getJSON("users", newEmail);
    if (existing) return json(409, { error: "That email is already in use." });

    user.email = newEmail;
    await setJSON("users", newEmail, user);
    await deleteKey("users", key);
    await revokeAllSessionsForUser(user.id);
    return json(200, { message: "Email updated. Please sign in again with your new email." }, { "Set-Cookie": clearSessionCookie() });
  }

  return json(400, { error: "Unknown action." });
};
