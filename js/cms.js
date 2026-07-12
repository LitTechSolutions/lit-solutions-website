// cms.js -- fetch-and-render for admin-editable content (blog posts,
// portfolio items, testimonials) on the public pages. This is the
// "small client-side fetch-and-override snippet" the accounts module
// notes call for: admin.html saves structured JSON via content.js, and
// this is what makes it show up on the static pages without a rebuild.
//
// Each render function degrades gracefully: if the content endpoint isn't
// reachable (e.g. this site deployed without the accounts module, or
// nothing has been added yet), the page's existing static content/empty
// state is left exactly as it was -- nothing is removed or hidden until
// there's real data to replace it with.
(function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function paragraphs(text) {
    return String(text || "").split(/\n\s*\n/).map(function (p) {
      return "<p>" + esc(p.trim()).replace(/\n/g, "<br>") + "</p>";
    }).join("\n");
  }

  async function fetchContent(slug) {
    try {
      var res = await fetch("/.netlify/functions/content?slug=" + encodeURIComponent(slug));
      if (!res.ok) return [];
      var body = await res.json();
      return (body && Array.isArray(body.data)) ? body.data : [];
    } catch (e) {
      return [];
    }
  }

  // Favorites/recently-viewed (REQ-93/94) -- entirely opt-in and silent for
  // anonymous visitors: no signed-out prompt clutter on public pages, the
  // bookmark button just never appears unless someone is signed in.
  async function isSignedIn() {
    try {
      var res = await fetch("/.netlify/functions/account", { credentials: "same-origin" });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async function favoritesApi(body) {
    try {
      var res = await fetch("/.netlify/functions/favorites", {
        method: body ? "POST" : "GET",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return res.ok ? await res.json() : null;
    } catch (e) {
      return null;
    }
  }

  function bookmarkButtonHtml(active) {
    return '<button type="button" class="bookmark-btn' + (active ? " is-active" : "") + '" aria-pressed="' + (active ? "true" : "false") + '">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="' + (active ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>' +
      '<span>' + (active ? "Bookmarked" : "Bookmark") + '</span></button>';
  }

  function wireBookmarkButton(mount, item, isFavorite) {
    mount.innerHTML = bookmarkButtonHtml(isFavorite);
    var btn = mount.querySelector("button");
    btn.addEventListener("click", async function () {
      var makeActive = !btn.classList.contains("is-active");
      await favoritesApi(makeActive
        ? { action: "add", itemId: item.itemId, label: item.label, href: item.href }
        : { action: "remove", itemId: item.itemId });
      btn.classList.toggle("is-active", makeActive);
      btn.setAttribute("aria-pressed", makeActive ? "true" : "false");
      btn.querySelector("span").textContent = makeActive ? "Bookmarked" : "Bookmark";
      btn.querySelector("svg").setAttribute("fill", makeActive ? "currentColor" : "none");
    });
  }

  // Called on single-item pages (blog-post.html and the 3 static blog
  // articles): mounts a bookmark toggle into `selector` and records the
  // visit in the signed-in customer's recently-viewed list. No-ops
  // entirely if nobody is signed in.
  async function mountBookmark(selector, item) {
    var mount = document.querySelector(selector);
    if (!mount) return;
    if (!(await isSignedIn())) return;

    favoritesApi({ action: "view", itemId: item.itemId, label: item.label, href: item.href });
    var data = await favoritesApi(null);
    var isFavorite = !!(data && data.items || []).some(function (i) { return i.itemId === item.itemId; });
    wireBookmarkButton(mount, item, isFavorite);
  }

  var DOC_ICON = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h16v16H4z" opacity="0"/><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 13h8M8 16h5"/></svg>';

  function renderBlogCard(post) {
    var meta = [esc(post.date || ""), esc(post.category || "")].filter(Boolean).join(" &middot; ");
    return '<a href="blog-post.html?slug=' + encodeURIComponent(post.slug) + '" class="blog-card reveal is-visible">' +
      '<div class="blog-card-art">' + DOC_ICON + '</div>' +
      '<div class="blog-card-body">' +
      '<div class="blog-card-meta">' + meta + '</div>' +
      '<h2>' + esc(post.title) + '</h2>' +
      '<p>' + esc(post.excerpt || "") + '</p>' +
      '<span class="card__link">Read more &rarr;</span>' +
      '</div></a>';
  }

  // Called on blog.html: prepends any admin-added posts to the existing
  // static grid (the 3 original articles stay exactly as they are).
  async function mountBlogList(gridSelector) {
    var grid = document.querySelector(gridSelector);
    if (!grid) return;
    var posts = await fetchContent("blog-posts");
    if (!posts.length) return;
    var html = posts.slice().reverse().map(renderBlogCard).join("\n");
    grid.insertAdjacentHTML("afterbegin", html);
  }

  // Called on blog-post.html: reads ?slug= and renders the matching
  // admin-added post, or a not-found message.
  async function mountBlogPost() {
    var slug = new URLSearchParams(window.location.search).get("slug") || "";
    var posts = await fetchContent("blog-posts");
    var post = posts.find(function (p) { return p.slug === slug; });

    var breadcrumbEl = document.getElementById("cmsPostEyebrow");
    var categoryEl = document.getElementById("cmsPostCategory");
    var titleEl = document.getElementById("cmsPostTitle");
    var metaEl = document.getElementById("cmsPostMeta");
    var bodyEl = document.getElementById("cmsPostBody");
    var imgWrap = document.getElementById("cmsPostImageWrap");

    if (!post) {
      if (titleEl) titleEl.textContent = "Post not found";
      if (breadcrumbEl) breadcrumbEl.textContent = "Not found";
      if (bodyEl) bodyEl.innerHTML = '<p>That article doesn’t exist or may have been removed. <a href="blog.html">Back to the blog</a>.</p>';
      return;
    }

    document.title = post.title + " — Little Technical Solutions LLC Blog";
    if (breadcrumbEl) breadcrumbEl.textContent = post.title;
    if (categoryEl) categoryEl.textContent = post.category || "Blog";
    if (titleEl) titleEl.textContent = post.title;
    if (metaEl) metaEl.textContent = [post.date, post.category, "Little Technical Solutions LLC"].filter(Boolean).join(" · ");
    if (bodyEl) bodyEl.innerHTML = paragraphs(post.body);
    if (imgWrap && post.imageDataUri) {
      imgWrap.innerHTML = '<img src="' + post.imageDataUri + '" alt="" style="width:100%; border-radius:8px; margin-bottom:2rem;">';
    }
    mountBookmark("#cmsBookmarkMount", { itemId: "blog:" + post.slug, label: post.title, href: "blog-post.html?slug=" + encodeURIComponent(post.slug) });
  }

  // Called on portfolio.html: if any items exist, replaces the honest
  // "still building it out" placeholder with a real grid. If none exist
  // yet, the placeholder is left exactly as it was.
  async function mountPortfolio(placeholderSelector, gridMountSelector) {
    var items = await fetchContent("portfolio-items");
    if (!items.length) return;
    var placeholder = document.querySelector(placeholderSelector);
    if (placeholder) placeholder.style.display = "none";
    var mount = document.querySelector(gridMountSelector);
    if (!mount) return;
    mount.innerHTML = items.map(function (item) {
      var img = item.imageDataUri
        ? '<img class="portfolio-card-img" src="' + item.imageDataUri + '" alt="">'
        : '<div class="portfolio-card-img portfolio-card-img--empty"></div>';
      return '<div class="portfolio-card reveal is-visible">' + img +
        '<div class="portfolio-card-body"><h3>' + esc(item.title) + '</h3><p>' + esc(item.description) + '</p>' +
        '<div class="portfolio-card-bookmark" data-item-id="' + esc(item.id) + '" data-label="' + esc(item.title) + '"></div>' +
        '</div></div>';
    }).join("\n");
    mount.hidden = false;

    if (await isSignedIn()) {
      var favData = await favoritesApi(null);
      var favIds = (favData && favData.items || []).map(function (i) { return i.itemId; });
      mount.querySelectorAll(".portfolio-card-bookmark").forEach(function (holder) {
        var itemId = "portfolio:" + holder.getAttribute("data-item-id");
        wireBookmarkButton(holder, { itemId: itemId, label: holder.getAttribute("data-label"), href: "portfolio.html" }, favIds.indexOf(itemId) !== -1);
      });
    }
  }

  // Called on testimonials.html: same pattern as portfolio.
  async function mountTestimonials(placeholderSelector, gridMountSelector) {
    var items = await fetchContent("testimonials");
    if (!items.length) return;
    var placeholder = document.querySelector(placeholderSelector);
    if (placeholder) placeholder.style.display = "none";
    var mount = document.querySelector(gridMountSelector);
    if (!mount) return;
    mount.innerHTML = items.map(function (item) {
      return '<div class="testimonial-card reveal is-visible">' +
        '<p class="testimonial-quote">&ldquo;' + esc(item.quote) + '&rdquo;</p>' +
        '<p class="testimonial-author">' + esc(item.author) + (item.roleOrCompany ? ", " + esc(item.roleOrCompany) : "") + '</p></div>';
    }).join("\n");
    mount.hidden = false;
  }

  // Called on gallery.html: same placeholder-replacement pattern as
  // portfolio/testimonials. Unlike portfolio items, a gallery photo has no
  // detail page of its own, so it's not wired into mountBookmark.
  async function mountGallery(placeholderSelector, gridMountSelector) {
    var items = await fetchContent("gallery-images");
    if (!items.length) return;
    var placeholder = document.querySelector(placeholderSelector);
    if (placeholder) placeholder.style.display = "none";
    var mount = document.querySelector(gridMountSelector);
    if (!mount) return;
    mount.innerHTML = items.map(function (item) {
      return '<figure class="gallery-figure reveal is-visible">' +
        '<img class="gallery-figure-img" src="' + item.imageDataUri + '" alt="' + esc(item.altText) + '">' +
        (item.caption ? '<figcaption>' + esc(item.caption) + '</figcaption>' : '') +
        '</figure>';
    }).join("\n");
    mount.hidden = false;
  }

  window.ltsCms = {
    mountBlogList: mountBlogList,
    mountBlogPost: mountBlogPost,
    mountPortfolio: mountPortfolio,
    mountTestimonials: mountTestimonials,
    mountBookmark: mountBookmark,
    mountGallery: mountGallery,
  };
})();
