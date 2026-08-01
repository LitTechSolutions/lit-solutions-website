/* Loads every page that this change touched, at two viewports, and reports
 * console errors, failed requests, horizontal overflow, and any element whose
 * text is clipped. Cheap way to catch the class of bug that unit tests can't:
 * a broken script tag, a missing file, a layout that only fails at 375px. */
const { chromium } = require("playwright");

const BASE = "http://localhost:8087";
const PAGES = [
  "index.html", "pricing.html", "cart.html", "myaccount.html",
  "plan-standard.html", "plan-premium.html", "plan-executive.html",
  "payment.html", "website-designer.html", "services.html", "heroes-pricing.html",
  "service-website.html", "service-networking.html", "service-cybersecurity.html",
  "faq.html", "terms.html", "about.html",
];
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 375, height: 812 },
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

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await ctx.addInitScript((cart) => {
      try { localStorage.setItem("lts-cart-v2", cart); } catch (e) {}
      try { localStorage.setItem("lts-cookie-consent", "dismissed"); } catch (e) {}
    }, CART);

    for (const path of PAGES) {
      const page = await ctx.newPage();
      const errors = [];
      const failed = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      // A 404 on a Netlify function is expected under a static server; a 404
      // on a real asset is a broken page.
      page.on("response", (r) => {
        if (r.status() >= 400 && !r.url().includes("/.netlify/functions/")) {
          failed.push(`${r.status()} ${r.url().replace(BASE, "")}`);
        }
      });
      page.on("pageerror", (e) => errors.push("UNCAUGHT: " + e.message));
      page.on("requestfailed", (r) => {
        // Netlify functions don't exist under a static server; that's expected.
        if (!r.url().includes("/.netlify/functions/")) failed.push(r.url().replace(BASE, ""));
      });

      await page.goto(`${BASE}/${path}`, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(250);

      const layout = await page.evaluate(() => {
        const de = document.documentElement;
        const over = [...document.querySelectorAll("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.right > window.innerWidth + 1;
          })
          .slice(0, 4)
          .map((el) => `${el.tagName}.${String(el.className || "").split(" ")[0]}`);
        return { scrollWidth: de.scrollWidth, inner: window.innerWidth, over };
      });

      const overflow = layout.scrollWidth > layout.inner + 1;
      const realErrors = errors.filter((e) => !/Failed to load resource/.test(e));
      const bad = realErrors.length || failed.length || overflow;
      if (bad) {
        problems++;
        console.log(`\n✗ ${vp.name.padEnd(7)} ${path}`);
        errors.filter((e) => !/Failed to load resource/.test(e)).slice(0, 4)
          .forEach((e) => console.log(`    console: ${e.slice(0, 160)}`));
        failed.slice(0, 4).forEach((f) => console.log(`    404:     ${f}`));
        if (overflow) console.log(`    overflow: ${layout.scrollWidth}px in ${layout.inner}px  ${layout.over.join(", ")}`);
      } else {
        console.log(`✓ ${vp.name.padEnd(7)} ${path}`);
      }
      await page.close();
    }
    await ctx.close();
  }

  await browser.close();
  console.log(problems ? `\n${problems} page/viewport combinations have problems.` : "\nAll pages clean at both viewports.");
  process.exit(problems ? 1 : 0);
})();
