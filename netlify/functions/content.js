// content.js -- structured content editing for the site's public pages
// (blog posts, portfolio items, testimonials). Role-gated server-side for
// writes; reads are public and unauthenticated on purpose, since the whole
// point is that blog.html/portfolio.html/testimonials.html fetch this at
// page load, for every visitor, without anyone being signed in. (This is a
// deliberate difference from a generic multi-tenant CMS pattern where reads
// might also be gated -- there's nothing sensitive in these three slugs.)
//
// Each slug stores one JSON array under `data`, replaced wholesale on save
// -- simple, and plenty for the number of posts/items a business this size
// will ever have. The admin panel manages the array client-side (add/edit/
// remove an item, then POST the whole thing back).
//
// GET  ?slug=blog-posts|portfolio-items|testimonials
//        -> public -> { data: [...], updatedAt } (data: [] if never saved)
// GET  (no slug)
//        -> admin/staff only -> { slugs: [...] } (debug/listing utility)
// POST { slug, data }
//        -> admin/staff only -> overwrites the whole array for that slug

const { readCookie, getSession, json } = require("./_lib/auth_utils");
const { getJSON, setJSON, store } = require("./_lib/blob_store");

const KNOWN_SLUGS = ["blog-posts", "portfolio-items", "testimonials", "gallery-images"];
const MAX_BYTES = 6 * 1024 * 1024; // Netlify Functions request-body ceiling is ~6MB

exports.handler = async (event) => {
  if (event.httpMethod === "GET") {
    const slug = event.queryStringParameters && event.queryStringParameters.slug;
    if (!slug) {
      const token = readCookie(event, "lts_session");
      const session = token ? await getSession(token) : null;
      if (!session || (session.role !== "admin" && session.role !== "staff")) {
        return json(401, { error: "Sign in required." });
      }
      const contentStore = store("content");
      const { blobs } = await contentStore.list();
      return json(200, { slugs: blobs.map((b) => b.key) });
    }
    const record = await getJSON("content", slug);
    return json(200, record || { data: [], updatedAt: null });
  }

  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const token = readCookie(event, "lts_session");
  const session = token ? await getSession(token) : null;
  if (!session) return json(401, { error: "Sign in required." });
  if (session.role !== "admin" && session.role !== "staff") return json(403, { error: "Not authorized." });

  if ((event.body || "").length > MAX_BYTES) return json(400, { error: "Content too large." });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }
  if (!KNOWN_SLUGS.includes(body.slug)) return json(400, { error: `slug must be one of: ${KNOWN_SLUGS.join(", ")}` });
  if (!Array.isArray(body.data)) return json(400, { error: "data must be an array." });

  await setJSON("content", body.slug, { data: body.data, updatedAt: Date.now(), updatedBy: session.userId });
  return json(200, { message: "Saved." });
};
