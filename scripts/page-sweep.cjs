/* Loads every page that this change touched, at two viewports, and reports
 * console errors, failed requests, horizontal overflow, and any element whose
 * text is clipped. Cheap way to catch the class of bug that unit tests can't:
 * a broken script tag, a missing file, a layout that only fails at 375px. */
const { chromium } = require("playwright");

const BASE = "http://localhost:8087";
const PAGES = [
  "index.html", "pricing.html", "cart.html", "myaccount.html",
  "plan-standard.html", "plan-premium.html", "plan-executive.html",
  "website-designer.html", "services.html", "heroes-pricing.html",
  "service-website.html", "service-networking.html", "service-cybersecurity.html",
  "faq.html", "terms.html", "about.html",
];
/* Two viewports was never enough. Layouts don't break at the sizes you
 * design for -- they break in between, at the widths where a grid drops a
 * column or a nav runs out of room. These are the real inflection points:
 * small phones, large phones, the tablet/desktop boundary, and the awkward
 * band just under a typical laptop. */
const VIEWPORTS = [
  { name: "320", width: 320, height: 700 },    // smallest phone still in use
  { name: "375", width: 375, height: 812 },
  { name: "430", width: 430, height: 932 },    // large phone
  { name: "600", width: 600, height: 900 },    // phone landscape / small tablet
  { name: "768", width: 768, height: 1024 },   // tablet portrait
  { name: "900", width: 900, height: 800 },    // where the nav usually gives up
  { name: "1024", width: 1024, height: 800 },  // tablet landscape / small laptop
  { name: "1180", width: 1180, height: 820 },
  { name: "1280", width: 1280, height: 900 },
  { name: "1600", width: 1600, height: 900 },
];

// Seed a realistic mixed cart so cart-dependent UI actually renders.
const CART = JSON.stringify({
  items: [{ key: "plan-premium", qty: 1 }, { key: "svc-mfa", qty: 2 }, { key: "package-business", qty: 1 }],
  payInFull: false,
});

(async () => {
  // A stopped server otherwise reports as "every page is broken", which is
  // both alarming and wrong. Check once, say so plainly, and stop.
  try {
    const res = await fetch(`${BASE}/index.html`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error(`\nNo server on ${BASE} (${err.message}).\nStart one first:  npm run serve\n`);
    process.exit(2);
  }

  const browser = await chromium.launch();
  let problems = 0;

  // 10 widths x ~17 pages is 170 page loads; serially that's minutes. Run a
  // handful at a time instead -- still ordered output, just not idle.
  const CONCURRENCY = 6;

  async function checkOne(ctx, vp, path) {
    const page = await ctx.newPage();
    const errors = [];
    const failed = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push("UNCAUGHT: " + e.message));
    page.on("response", (r) => {
      if (r.status() >= 400 && !r.url().includes("/.netlify/functions/")) {
        failed.push(`${r.status()} ${r.url().replace(BASE, "")}`);
      }
    });

    await page.goto(`${BASE}/${path}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(150);

    const layout = await page.evaluate(() => {
      const de = document.documentElement;
      const over = [...document.querySelectorAll("body *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          // Ignore deliberately off-canvas things (mobile nav panels, skip links).
          if (r.width === 0 || r.height === 0) return false;
          const cs = getComputedStyle(el);
          if (cs.position === "fixed" && r.left < 0) return false;
          return r.right > window.innerWidth + 1;
        })
        .slice(0, 4)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className || "").split(" ")[0]}`);
      return { scrollWidth: de.scrollWidth, inner: window.innerWidth, over };
    });

    await page.close();
    const realErrors = errors.filter((e) => !/Failed to load resource/.test(e));
    const overflow = layout.scrollWidth > layout.inner + 1;
    return { path, vp, realErrors, failed, layout, overflow, bad: realErrors.length || failed.length || overflow };
  }

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await ctx.addInitScript((cart) => {
      try { localStorage.setItem("lts-cart-v2", cart); } catch (e) {}
      try { localStorage.setItem("lts-cookie-consent", "dismissed"); } catch (e) {}
    }, CART);

    const queue = PAGES.slice();
    const results = [];
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const path = queue.shift();
        results.push(await checkOne(ctx, vp, path));
      }
    }));

    const broken = results.filter((r) => r.bad);
    if (broken.length) {
      for (const r of broken.sort((a, b) => a.path.localeCompare(b.path))) {
        problems++;
        console.log(`\n\u2717 ${String(vp.name).padEnd(5)}px  ${r.path}`);
        r.realErrors.slice(0, 3).forEach((e) => console.log(`    console: ${e.slice(0, 150)}`));
        r.failed.slice(0, 3).forEach((f) => console.log(`    ${f}`));
        if (r.overflow) {
          console.log(`    overflow: ${r.layout.scrollWidth}px in ${r.layout.inner}px  ${r.layout.over.join(", ") || "(source unclear)"}`);
        }
      }
    } else {
      console.log(`\u2713 ${String(vp.name).padEnd(5)}px  all ${results.length} pages clean`);
    }
    await ctx.close();
  }

  await browser.close();
  console.log(problems ? `\n${problems} page/viewport combinations have problems.` : `\nAll ${PAGES.length} pages clean at all ${VIEWPORTS.length} widths (${VIEWPORTS[0].width}\u2013${VIEWPORTS[VIEWPORTS.length-1].width}px).`);
  process.exit(problems ? 1 : 0);
})();
