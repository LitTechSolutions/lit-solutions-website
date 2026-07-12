// favorites.js -- lets a signed-in customer bookmark blog posts and
// portfolio items for later, keeps a short "recently viewed" list so they
// can find their way back to something they looked at without bookmarking
// it, and lets them save a site-search query to re-run later. All three
// lists are keyed to the account, not the browser, so they follow the
// customer across devices. One record per account (not one row per item)
// since the lists are always read/written together.
//
// GET                                        -> { items, recentlyViewed, savedSearches }
// POST { action: "add", itemId, label, href }
// POST { action: "remove", itemId }
// POST { action: "view", itemId, label, href }   -> records/reorders a recently-viewed entry
// POST { action: "clear-recent" }
// POST { action: "save-search", query, href }
// POST { action: "remove-search", query }

const { readCookie, getSession, json } = require("./_lib/auth_utils");
const { getJSON, setJSON } = require("./_lib/blob_store");

const MAX_RECENT = 20;
const MAX_SAVED_SEARCHES = 30;

function empty() {
  return { items: [], recentlyViewed: [], savedSearches: [] };
}

exports.handler = async (event) => {
  const token = readCookie(event, "lts_session");
  const session = token ? await getSession(token) : null;
  if (!session) return json(401, { error: "Sign in required." });

  const data = Object.assign(empty(), await getJSON("favorites", session.userId));

  if (event.httpMethod === "GET") {
    return json(200, data);
  }

  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid JSON" }); }

  if (body.action === "add") {
    if (!body.itemId || !body.label || !body.href) return json(400, { error: "itemId, label, and href are required." });
    if (!data.items.some((i) => i.itemId === body.itemId)) {
      data.items.unshift({
        itemId: String(body.itemId).slice(0, 200),
        label: String(body.label).slice(0, 200),
        href: String(body.href).slice(0, 300),
        addedAt: Date.now(),
      });
      await setJSON("favorites", session.userId, data);
    }
    return json(200, { message: "Saved.", items: data.items });
  }

  if (body.action === "remove") {
    if (!body.itemId) return json(400, { error: "itemId is required." });
    data.items = data.items.filter((i) => i.itemId !== body.itemId);
    await setJSON("favorites", session.userId, data);
    return json(200, { message: "Removed.", items: data.items });
  }

  if (body.action === "view") {
    if (!body.itemId || !body.label || !body.href) return json(400, { error: "itemId, label, and href are required." });
    data.recentlyViewed = data.recentlyViewed.filter((i) => i.itemId !== body.itemId);
    data.recentlyViewed.unshift({
      itemId: String(body.itemId).slice(0, 200),
      label: String(body.label).slice(0, 200),
      href: String(body.href).slice(0, 300),
      viewedAt: Date.now(),
    });
    data.recentlyViewed = data.recentlyViewed.slice(0, MAX_RECENT);
    await setJSON("favorites", session.userId, data);
    return json(200, { message: "Recorded." });
  }

  if (body.action === "clear-recent") {
    data.recentlyViewed = [];
    await setJSON("favorites", session.userId, data);
    return json(200, { message: "Cleared." });
  }

  if (body.action === "save-search") {
    const query = String(body.query || "").trim();
    if (!query) return json(400, { error: "query is required." });
    data.savedSearches = data.savedSearches.filter((s) => s.query.toLowerCase() !== query.toLowerCase());
    data.savedSearches.unshift({ query: query.slice(0, 200), href: String(body.href || "").slice(0, 300), savedAt: Date.now() });
    data.savedSearches = data.savedSearches.slice(0, MAX_SAVED_SEARCHES);
    await setJSON("favorites", session.userId, data);
    return json(200, { message: "Search saved.", savedSearches: data.savedSearches });
  }

  if (body.action === "remove-search") {
    const query = String(body.query || "").trim();
    data.savedSearches = data.savedSearches.filter((s) => s.query.toLowerCase() !== query.toLowerCase());
    await setJSON("favorites", session.userId, data);
    return json(200, { message: "Removed.", savedSearches: data.savedSearches });
  }

  return json(400, { error: "Unknown action." });
};
