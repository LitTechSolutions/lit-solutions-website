// documents.js -- customer paperwork: invoices, receipts, and other
// documents the admin uploads and attaches to a specific customer's
// account, which that customer can then view in their own dashboard
// (myaccount.html). This isn't a billing engine -- payments still happen
// through Square (payment.html) -- it's a record locker so a customer can
// see what they were invoiced/charged and pull up a receipt later without
// emailing to ask.
//
// Documents are associated by customerId (the account's immutable id),
// resolved from the email the admin types in at upload time -- not by
// email directly, so a document stays correctly attached even if the
// customer later changes their login email via account.js.
//
// GET                              -> signed-in customer: their own documents (list, no file data)
// GET ?customerEmail=x@y.com       -> admin/staff only: that customer's documents (list, no file data)
// GET ?id=xyz                      -> full single record (with a freshly-signed fileUrl, if a file is
//                                      attached) -- admin/staff, or the owning customer themselves
//                                      (server-side ownership check)
// POST { action: "upload", customerEmail, title, type, amount, status,
//         date, notes, fileDataUri, fileName }   -> admin/staff only
// POST { action: "delete", documentId }           -> admin/staff only
//
// Attachments are stored in Cloudinary (see _lib/cloudinary_store.js),
// not as base64 in this Blobs record -- customer paperwork is private
// data, so uploads use Cloudinary's "authenticated" delivery type (not
// reachable by a bare URL) and every view mints a fresh, short-lived
// signed URL server-side, after the ownership check above already ran.
// Records written before this migration may still carry a legacy
// `fileDataUri` directly; those are served as-is rather than broken by
// this change (see resolveFileUrl below).

const { readCookie, getSession, json } = require("./_lib/auth_utils");
const { getJSON, setJSON, deleteKey, store } = require("./_lib/blob_store");
const { createNotification } = require("./notifications");
const { sendEmail } = require("./_lib/email");
const { isRecognizedDataUri } = require("./_lib/file_signatures");
const { uploadPrivateAsset, signedUrlForPrivateAsset, destroyAsset } = require("./_lib/cloudinary_store");

const MAX_DATA_URI_LENGTH = 4 * 1024 * 1024; // ~4MB base64 string
const VALID_TYPES = ["invoice", "receipt", "paperwork", "other"];
const VALID_STATUSES = ["paid", "unpaid", "n/a"];

async function findUserByEmail(email, deps = {}) {
  const getJSONFn = deps.getJSON || getJSON;
  return getJSONFn("users", email.toLowerCase());
}

function isStaff(session) {
  return session.role === "admin" || session.role === "staff";
}

function stripFile(record) {
  const { fileDataUri, cloudinaryPublicId, cloudinaryResourceType, cloudinaryFormat, ...rest } = record;
  return rest;
}

// A record has either the new Cloudinary fields (mint a fresh signed URL,
// nothing about the asset cached/stored) or a legacy raw fileDataUri
// (pre-migration record -- pass it through as-is), or no attachment at
// all. Never both; upload() below only ever writes one or the other.
function resolveFileUrl(record, deps = {}) {
  if (record.cloudinaryPublicId) {
    const signedUrlForPrivateAssetFn = deps.signedUrlForPrivateAsset || signedUrlForPrivateAsset;
    return signedUrlForPrivateAssetFn({
      publicId: record.cloudinaryPublicId,
      resourceType: record.cloudinaryResourceType,
      format: record.cloudinaryFormat,
    });
  }
  return record.fileDataUri || null;
}

exports.handler = async (event, context, deps = {}) => {
  const getSessionFn = deps.getSession || getSession;
  const getJSONFn = deps.getJSON || getJSON;
  const setJSONFn = deps.setJSON || setJSON;
  const deleteKeyFn = deps.deleteKey || deleteKey;
  const createNotificationFn = deps.createNotification || createNotification;
  const sendEmailFn = deps.sendEmail || sendEmail;

  const token = readCookie(event, "lts_session");
  const session = token ? await getSessionFn(token) : null;
  if (!session) return json(401, { error: "Sign in required." });

  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};

    if (params.id) {
      const record = await getJSONFn("documents", params.id);
      if (!record) return json(404, { error: "Document not found." });
      if (!isStaff(session) && record.customerId !== session.userId) {
        return json(403, { error: "Not authorized." });
      }
      const { cloudinaryPublicId, cloudinaryResourceType, cloudinaryFormat, cloudinaryBytes, fileDataUri, ...clientRecord } = record;
      return json(200, { ...clientRecord, fileUrl: resolveFileUrl(record, deps) });
    }

    // The two branches below still list every record directly from the
    // Blobs store rather than through getJSON/setJSON -- not converted to
    // deps injection with the rest of this handler, since that's a larger,
    // separate change; unaffected by the Cloudinary migration.
    const docsStore = store("documents");

    if (params.customerEmail) {
      if (!isStaff(session)) return json(403, { error: "Not authorized." });
      const customer = await findUserByEmail(params.customerEmail, deps);
      if (!customer) return json(404, { error: "No account found with that email." });
      const { blobs } = await docsStore.list();
      const items = [];
      for (const b of blobs) {
        const record = await docsStore.get(b.key, { type: "json" });
        if (record && record.customerId === customer.id) items.push(stripFile({ id: b.key, ...record }));
      }
      items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      return json(200, { customer: { name: customer.name, email: customer.email }, documents: items });
    }

    // No params: the signed-in user's own documents.
    const { blobs } = await docsStore.list();
    const items = [];
    for (const b of blobs) {
      const record = await docsStore.get(b.key, { type: "json" });
      if (record && record.customerId === session.userId) items.push(stripFile({ id: b.key, ...record }));
    }
    items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return json(200, { documents: items });
  }

  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  if (!isStaff(session)) return json(403, { error: "Not authorized." });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }

  if (body.action === "upload") {
    if (!body.customerEmail) return json(400, { error: "customerEmail is required." });
    const customer = await findUserByEmail(body.customerEmail, deps);
    if (!customer) return json(404, { error: "No account found with that email. The customer needs to register at myaccount.html first." });
    if (!body.title || !body.title.trim()) return json(400, { error: "Title is required." });
    if (!VALID_TYPES.includes(body.type)) return json(400, { error: `type must be one of: ${VALID_TYPES.join(", ")}` });
    if (body.status && !VALID_STATUSES.includes(body.status)) return json(400, { error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    let cloudinaryAsset = null;
    if (body.fileDataUri) {
      // Sniff the real file signature rather than trusting the data: URI's
      // declared MIME type (see _lib/file_signatures.js) -- SVG is
      // deliberately not allowed here since it can carry executable script.
      if (!isRecognizedDataUri(body.fileDataUri, { allowSvg: false, allowPdf: true })) {
        return json(400, { error: "Attachment must be a PDF, PNG, JPEG, or WEBP image." });
      }
      if (body.fileDataUri.length > MAX_DATA_URI_LENGTH) return json(400, { error: "Attachment too large (max ~3MB)." });

      const uploadPrivateAssetFn = deps.uploadPrivateAsset || uploadPrivateAsset;
      try {
        cloudinaryAsset = await uploadPrivateAssetFn(body.fileDataUri);
      } catch (e) {
        return json(502, { error: "Could not store the attachment. Try again shortly." });
      }
    }

    const documentId = require("crypto").randomBytes(10).toString("hex");
    await setJSONFn("documents", documentId, {
      customerId: customer.id,
      customerEmail: customer.email,
      title: body.title.trim(),
      type: body.type,
      amount: body.amount || "",
      status: body.status || "n/a",
      date: body.date || new Date().toISOString().slice(0, 10),
      notes: body.notes || "",
      ...(cloudinaryAsset
        ? {
            cloudinaryPublicId: cloudinaryAsset.publicId,
            cloudinaryResourceType: cloudinaryAsset.resourceType,
            cloudinaryFormat: cloudinaryAsset.format,
            cloudinaryBytes: cloudinaryAsset.bytes,
          }
        : {}),
      fileName: body.fileName || "",
      uploadedBy: session.userId,
      uploadedAt: Date.now(),
    });

    const TYPE_LABEL = { invoice: "invoice", receipt: "receipt", paperwork: "document", other: "document" };
    await createNotificationFn(customer.id, {
      title: `New ${TYPE_LABEL[body.type] || "document"}: ${body.title.trim()}`,
      body: "Uploaded by Little Technical Solutions LLC. View it in your dashboard.",
      href: "myaccount.html#documents",
    });
    if ((customer.preferences || {}).emailNotifications !== false) {
      await sendEmailFn({
        to: customer.email,
        subject: `New ${TYPE_LABEL[body.type] || "document"} from Little Technical Solutions LLC`,
        html: `<p>We uploaded a new ${TYPE_LABEL[body.type] || "document"} to your account: <strong>${body.title.trim()}</strong>.</p><p>Sign in to view it: <a href="https://lit-solutions.tech/myaccount.html#documents">myaccount.html#documents</a></p>`,
      });
    }

    return json(201, { id: documentId, message: "Uploaded." });
  }

  if (body.action === "delete") {
    if (!body.documentId) return json(400, { error: "documentId is required." });
    const record = await getJSONFn("documents", body.documentId);
    if (record && record.cloudinaryPublicId) {
      const destroyAssetFn = deps.destroyAsset || destroyAsset;
      try {
        await destroyAssetFn({ publicId: record.cloudinaryPublicId, resourceType: record.cloudinaryResourceType });
      } catch (e) {
        // Don't let a Cloudinary hiccup block deleting the customer-facing
        // record -- an orphaned asset is a minor storage-cost cleanup
        // item, not a reason to keep showing the customer a document
        // they were told is gone.
      }
    }
    await deleteKeyFn("documents", body.documentId);
    return json(200, { message: "Deleted." });
  }

  return json(400, { error: "Unknown action." });
};
