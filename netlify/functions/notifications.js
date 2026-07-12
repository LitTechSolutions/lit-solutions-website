// notifications.js -- a lightweight in-app notification center, separate
// from the customer<->staff messages thread (messages.js). Notifications
// are one-way, system-generated alerts ("a new document was uploaded for
// you") plus anything staff choose to send manually -- not a conversation,
// and not the same as the message-received email (which is opt-out via
// account.js preferences); the in-app notification always appears
// regardless of email preference so nothing is silently missed.
//
// GET                                       -> { items, unreadCount }
// POST { action: "mark-read", id }
// POST { action: "mark-all-read" }
// POST { action: "create", userEmail, title, body, href } -> admin/staff only

const { readCookie, getSession, json } = require("./_lib/auth_utils");
const { getJSON, store } = require("./_lib/blob_store");

function isStaff(session) {
  return session.role === "admin" || session.role === "staff";
}

async function findUserByEmail(email) {
  return getJSON("users", email.toLowerCase());
}

// Used internally by other functions (e.g. documents.js) to raise a
// notification without going through the HTTP handler.
async function createNotification(userId, { title, body, href }) {
  const notifStore = store("notifications");
  const id = require("crypto").randomBytes(10).toString("hex");
  await notifStore.setJSON(id, {
    userId,
    title: String(title).slice(0, 200),
    body: String(body || "").slice(0, 2000),
    href: href || "",
    read: false,
    createdAt: Date.now(),
  });
  return id;
}

async function handler(event) {
  const token = readCookie(event, "lts_session");
  const session = token ? await getSession(token) : null;
  if (!session) return json(401, { error: "Sign in required." });

  const notifStore = store("notifications");

  if (event.httpMethod === "GET") {
    const { blobs } = await notifStore.list();
    const items = [];
    for (const b of blobs) {
      const n = await notifStore.get(b.key, { type: "json" });
      if (n && n.userId === session.userId) items.push({ id: b.key, ...n });
    }
    items.sort((a, b) => b.createdAt - a.createdAt);
    const unreadCount = items.filter((n) => !n.read).length;
    return json(200, { items, unreadCount });
  }

  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }

  if (body.action === "mark-read") {
    if (!body.id) return json(400, { error: "id is required." });
    const n = await notifStore.get(body.id, { type: "json" });
    if (!n || n.userId !== session.userId) return json(404, { error: "Notification not found." });
    n.read = true;
    await notifStore.setJSON(body.id, n);
    return json(200, { message: "Marked read." });
  }

  if (body.action === "mark-all-read") {
    const { blobs } = await notifStore.list();
    for (const b of blobs) {
      const n = await notifStore.get(b.key, { type: "json" });
      if (n && n.userId === session.userId && !n.read) {
        n.read = true;
        await notifStore.setJSON(b.key, n);
      }
    }
    return json(200, { message: "All marked read." });
  }

  if (body.action === "create") {
    if (!isStaff(session)) return json(403, { error: "Not authorized." });
    if (!body.userEmail) return json(400, { error: "userEmail is required." });
    if (!body.title || !body.title.trim()) return json(400, { error: "Title is required." });
    const user = await findUserByEmail(body.userEmail);
    if (!user) return json(404, { error: "No account found with that email." });
    const id = await createNotification(user.id, { title: body.title.trim(), body: body.body || "", href: body.href || "" });
    return json(201, { id, message: "Sent." });
  }

  return json(400, { error: "Unknown action." });
}

module.exports = { handler, createNotification };
