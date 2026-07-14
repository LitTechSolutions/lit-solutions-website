// messages.js -- two-way messaging between a customer and staff. A
// customer reads/writes their own single thread; staff look a customer up
// by email to read/reply to that thread, or list every customer who has
// an open conversation (an inbox view). This is plain text messaging, not
// the contact/intake forms (those still exist separately for anonymous
// visitors) -- this is specifically for a signed-in customer to reach the
// business and get an answer they can come back and re-read later.
//
// GET                              -> signed-in customer: their own thread (marks staff
//                                      messages as read by them)
// GET ?customerEmail=x@y.com       -> admin/staff only: that customer's thread (marks
//                                      customer messages as read by staff)
// GET ?inbox=1                     -> admin/staff only: one row per customer with any
//                                      messages, newest activity first, with unread counts
// POST { body }                    -> signed-in customer sends a message to staff
// POST { customerEmail, body }     -> admin/staff only: staff sends a message to that customer

const { readCookie, getSession, json, rateLimited } = require("./_lib/auth_utils");
const { getJSON, setJSON, store } = require("./_lib/blob_store");
const { sendEmail } = require("./_lib/email");

const MAX_BODY_LENGTH = 8000;

function isStaff(session) {
  return session.role === "admin" || session.role === "staff";
}

async function findUserByEmail(email) {
  return getJSON("users", email.toLowerCase());
}

// Matches the esc() helper already used consistently in
// website-designer.js for building outbound HTML email from user input --
// message body/sender name are both customer-controlled and must never be
// interpolated into an HTML email unescaped.
function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

async function notifyNewMessage(event, { toEmail, fromName, body }) {
  const snippet = body.length > 240 ? body.slice(0, 240) + "…" : body;
  const safeSnippet = esc(snippet).replace(/\n/g, "<br>");
  await sendEmail({
    to: toEmail,
    subject: `New message from ${fromName} — Little Technical Solutions LLC`,
    html: `<p>${esc(fromName)} sent you a message:</p><blockquote>${safeSnippet}</blockquote>` +
      `<p>Sign in to read the full conversation and reply.</p>`,
  });
}

exports.handler = async (event) => {
  const token = readCookie(event, "lts_session");
  const session = token ? await getSession(token) : null;
  if (!session) return json(401, { error: "Sign in required." });

  const msgStore = store("messages");

  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};

    if (params.inbox) {
      if (!isStaff(session)) return json(403, { error: "Not authorized." });
      const { blobs } = await msgStore.list();
      const byCustomer = new Map();
      for (const b of blobs) {
        const m = await msgStore.get(b.key, { type: "json" });
        if (!m) continue;
        const existing = byCustomer.get(m.customerId);
        if (!existing || m.createdAt > existing.lastMessageAt) {
          byCustomer.set(m.customerId, {
            customerId: m.customerId,
            customerEmail: m.customerEmail,
            lastMessageAt: m.createdAt,
            lastMessageSnippet: m.body.length > 80 ? m.body.slice(0, 80) + "…" : m.body,
            unreadCount: existing ? existing.unreadCount : 0,
          });
        }
        if (m.from === "customer" && !m.readByStaff) {
          const row = byCustomer.get(m.customerId);
          row.unreadCount += 1;
        }
      }
      const rows = Array.from(byCustomer.values()).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
      return json(200, { customers: rows });
    }

    if (params.customerEmail) {
      if (!isStaff(session)) return json(403, { error: "Not authorized." });
      const customer = await findUserByEmail(params.customerEmail);
      if (!customer) return json(404, { error: "No account found with that email." });
      const { blobs } = await msgStore.list();
      const items = [];
      for (const b of blobs) {
        const m = await msgStore.get(b.key, { type: "json" });
        if (m && m.customerId === customer.id) items.push({ id: b.key, ...m });
      }
      items.sort((a, b) => a.createdAt - b.createdAt);
      for (const item of items) {
        if (item.from === "customer" && !item.readByStaff) {
          item.readByStaff = true;
          await setJSON("messages", item.id, { ...item, id: undefined });
        }
      }
      return json(200, { customer: { name: customer.name, email: customer.email }, messages: items });
    }

    // No params: the signed-in user's own thread.
    const { blobs } = await msgStore.list();
    const items = [];
    for (const b of blobs) {
      const m = await msgStore.get(b.key, { type: "json" });
      if (m && m.customerId === session.userId) items.push({ id: b.key, ...m });
    }
    items.sort((a, b) => a.createdAt - b.createdAt);
    for (const item of items) {
      if (item.from === "staff" && !item.readByCustomer) {
        item.readByCustomer = true;
        await setJSON("messages", item.id, { ...item, id: undefined });
      }
    }
    return json(200, { messages: items });
  }

  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }
  if (!body.body || !body.body.trim()) return json(400, { error: "Message text is required." });
  if (body.body.length > MAX_BODY_LENGTH) return json(400, { error: "Message is too long." });

  if (body.customerEmail) {
    // Staff sending to a customer.
    if (!isStaff(session)) return json(403, { error: "Not authorized." });
    const customer = await findUserByEmail(body.customerEmail);
    if (!customer) return json(404, { error: "No account found with that email. The customer needs to register at myaccount.html first." });

    const messageId = require("crypto").randomBytes(10).toString("hex");
    await setJSON("messages", messageId, {
      customerId: customer.id, customerEmail: customer.email,
      from: "staff", fromName: "Little Technical Solutions LLC",
      body: body.body.trim(), createdAt: Date.now(),
      readByStaff: true, readByCustomer: false,
    });
    if ((customer.preferences || {}).emailNotifications !== false) {
      await notifyNewMessage(event, { toEmail: customer.email, fromName: "Little Technical Solutions LLC", body: body.body.trim() });
    }
    return json(201, { id: messageId, message: "Sent." });
  }

  // Customer sending to staff -- rate-limited per account (not per IP, since
  // the abuse case here is one signed-in customer sending unlimited messages,
  // each of which triggers an outbound email to Dylan).
  if (await rateLimited("messages-send", session.userId, 20, 3600)) {
    return json(429, { error: "Too many messages sent. Please try again later." });
  }

  const messageId = require("crypto").randomBytes(10).toString("hex");
  const meRecord = await (async () => {
    const usersStore = store("users");
    const { blobs } = await usersStore.list();
    for (const b of blobs) {
      const u = await usersStore.get(b.key, { type: "json" });
      if (u && u.id === session.userId) return u;
    }
    return null;
  })();
  if (!meRecord) return json(404, { error: "Account not found." });

  await setJSON("messages", messageId, {
    customerId: meRecord.id, customerEmail: meRecord.email,
    from: "customer", fromName: meRecord.name,
    body: body.body.trim(), createdAt: Date.now(),
    readByStaff: false, readByCustomer: true,
  });
  const notifyTo = process.env.ADMIN_NOTIFY_EMAIL;
  if (notifyTo) {
    await notifyNewMessage(event, { toEmail: notifyTo, fromName: meRecord.name, body: body.body.trim() });
  }
  return json(201, { id: messageId, message: "Sent." });
};
