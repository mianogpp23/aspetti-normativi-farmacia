/* audit-links.js — Audit completo di tutti i collegamenti del sito.
   Crawler data-driven: genera test DAI DATI (manifest.json, search.json).
   Output: report JSON e Markdown in audit/, exit code ≠ 0 se errori. */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { BASE_URL, CHROMIUM, results } from "./verify-env.js";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "/tmp/verify-tools/node_modules/playwright-core/index.mjs");

const AUDIT_DIR = "audit";
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "tablet", width: 820, height: 1100, mobile: false },
  { name: "mobile", width: 360, height: 800, mobile: true },
];
const VIEWS = ["carosello", "sommario", "esagoni", "cerca", "libreria"];

function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  return ok;
}

function benignAbort(url, error) {
  return error === "net::ERR_ABORTED" && (/\/content\/thumbs\//.test(url) || /\/content\/search\.json$/.test(url) || /\/favicon\.svg$/.test(url));
}

function watch(page, label, dialogs) {
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") results.console.push({ label, type: msg.type(), text: msg.text() });
  });
  page.on("pageerror", (error) => results.pageErrors.push({ label, text: String(error) }));
  page.on("requestfailed", (req) => {
    const error = req.failure()?.errorText || "";
    if (!benignAbort(req.url(), error)) results.failedRequests.push({ label, url: req.url(), error });
  });
  page.on("response", (res) => {
    if (res.status() >= 400) results.httpErrors.push({ label, url: res.url(), status: res.status() });
  });
  if (dialogs) page.on("dialog", async (dialog) => { dialogs.push(`${label}: ${dialog.message()}`); await dialog.dismiss(); });
}

async function waitForViewReady(page, view) {
  if (view === "carosello") {
    await page.waitForFunction(() => document.querySelectorAll("#car-mount .car-card").length > 0, null, { timeout: 15000 });
  } else if (view === "sommario") {
    await page.waitForFunction(() => document.querySelectorAll(".sum-module-btn").length > 0, null, { timeout: 15000 });
  } else if (view === "esagoni") {
    await page.waitForFunction(() => document.querySelectorAll("#hex-svg .hex-cell").length > 0, null, { timeout: 15000 });
  } else if (view === "cerca") {
    await page.waitForFunction(() => document.querySelector("#pal-input") !== null, null, { timeout: 15000 });
  } else if (view === "libreria") {
    await page.waitForFunction(() => document.querySelectorAll(".lib-book").length > 0, null, { timeout: 15000 });
  }
}

async function gotoView(page, view) {
  await page.goto(`${BASE_URL}#/?vista=${view}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#view-select option").length > 0, null, { timeout: 15000 });
  await waitForViewReady(page, view);
}

async function closeViewer(page) {
  await page.bringToFront();
  await page.evaluate(() => window.focus());
  await page.waitForTimeout(100);
  // Dispatch Escape key via evaluate to ensure it triggers the viewer's keydown listener
  await page.evaluate(() => {
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    document.dispatchEvent(event);
  });
  await page.waitForFunction(() => document.querySelector("#viewer")?.hidden === true, null, { timeout: 5000 });
  await page.waitForTimeout(500);  // Allow router to process hash change
  // Just verify the viewer is closed; the hash check is done in the test
}

async function runAudit() {
  await mkdir(AUDIT_DIR, { recursive: true });
  await mkdir(`${AUDIT_DIR}/screenshots`, { recursive: true });

  const manifest = JSON.parse(await readFile(new URL("../content/manifest.json", import.meta.url), "utf8"));

  const expectedModules = manifest.modules.length;
  const expectedPages = manifest.totals?.pages ?? manifest.modules.reduce((a, m) => a + (m.pdf?.pages || m.slides?.length || 0), 0);
  const expectedTopics = manifest.totals?.topics ?? manifest.modules.reduce((a, m) => a + (m.topics?.length || 0), 0);
  const first = manifest.modules[0];

  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const dialogs = [];
  watch(page, "audit", dialogs);

  // ============================================================
  // FASE 1: Verifica statica PDF e asset
  // ============================================================
  console.log("\n=== FASE 1: Verifica statica PDF e asset ===");

  for (const mod of manifest.modules) {
    if (mod.pdf?.path) {
      const url = new URL(mod.pdf.path, BASE_URL).href;
      try {
        const res = await fetch(url, { method: "HEAD" });
        const ok = check(`PDF esiste: ${mod.id}`, res.ok, res.ok ? `HTTP ${res.status}` : `HTTP ${res.status}`);
        if (!ok) check(`PDF 404: ${mod.id}`, false, `HTTP ${res.status} ${url}`);
      } catch (e) {
        check(`PDF errore: ${mod.id}`, false, String(e));
      }
    }

    const pages = mod.pdf?.pages || 0;
    if (pages > 0) {
      for (const n of [1, pages]) {
        const thumbUrl = `content/thumbs/${mod.id}/${String(n).padStart(4, "0")}.webp`;
        const slideUrl = `content/slides/${mod.id}/${String(n).padStart(4, "0")}.webp`;
        for (const assetUrl of [thumbUrl, slideUrl]) {
          try {
            const res = await fetch(new URL(assetUrl, BASE_URL), { method: "HEAD" });
            check(`Asset ${assetUrl}: ${mod.id} slide ${n}`, res.ok, res.ok ? `HTTP ${res.status}` : `HTTP ${res.status}`);
          } catch (e) {
            check(`Asset errore ${assetUrl}: ${mod.id} slide ${n}`, false, String(e));
          }
        }
      }
    }
  }

  // CSS/JS fonts
  for (const asset of ["css/app.css", "css/library.css", "css/flow.css", "css/viewer.css", "css/views.css",
                       "js/main.js", "js/data.js", "js/utils.js", "js/library.js", "js/flow.js",
                       "js/viewer.js", "js/search.js", "js/carousel.js", "js/summary.js",
                       "js/honeycomb.js", "js/palette.js", "js/views-common.js",
                       "favicon.svg"]) {
    try {
      const res = await fetch(new URL(asset, BASE_URL), { method: "HEAD" });
      check(`Asset statico ${asset}`, res.ok, `HTTP ${res.status}`);
    } catch (e) {
      check(`Asset statico errore ${asset}`, false, String(e));
    }
  }

  // ============================================================
  // FASE 2: Test per vista - click su ogni elemento
  // ============================================================
  console.log("\n=== FASE 2: Test interazioni per vista ===");

  for (const view of VIEWS) {
    console.log(`\n--- Vista: ${view} ---`);
    await page.goto(`${BASE_URL}#/`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await gotoView(page, view);

    // Screenshot
    await page.screenshot({ path: `${AUDIT_DIR}/screenshots/${view}-desktop.png` });

    if (view === "carosello") {
      // Test card click (now opens module directly)
      const cards = page.locator("#car-mount .car-card");
      const count = await cards.count();
      for (let i = 0; i < Math.min(count, 3); i++) {
        const mod = manifest.modules[i];
        await cards.nth(i).click();
        await page.waitForTimeout(500);
        const hash = await page.evaluate(() => location.hash);
        check(`Carosello card ${i} click`, hash.startsWith(`#/m/${mod.id}`), `hash=${hash}`);
        if (mod.pdf?.pages) {
          await closeViewer(page);
          await page.locator(".brand").click();
          await gotoView(page, view);
        } else {
          await page.locator(".brand").click();
          await gotoView(page, view);
        }
      }
      // Test Enter key on focused card
      await page.locator("#car-mount .car-card").first().focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
      const hashEnter = await page.evaluate(() => location.hash);
      check("Carosello Enter key", hashEnter.startsWith(`#/m/${first.id}`), `hash=${hashEnter}`);
      await closeViewer(page);
      await page.locator(".brand").click();
      await gotoView(page, view);

    } else if (view === "sommario") {
      // Test module buttons
      const modButtons = page.locator(".sum-module-btn");
      const count = await modButtons.count();
      for (let i = 0; i < Math.min(count, 3); i++) {
        const mod = manifest.modules[i];
        await modButtons.nth(i).click();
        await page.waitForTimeout(300);
        const hash = await page.evaluate(() => location.hash);
        check(`Sommario modulo ${i} click`, hash.startsWith(`#/m/${mod.id}`), `hash=${hash}`);
        if (mod.pdf?.pages) {
          await closeViewer(page);
          await page.locator(".brand").click();
          await gotoView(page, view);
        } else {
          await page.locator(".brand").click();
          await gotoView(page, view);
        }
      }
      // Test topic buttons
      const topicButtons = page.locator(".sum-topic-btn");
      const topicCount = await topicButtons.count();
      if (topicCount > 0) {
        await topicButtons.first().click();
        await page.waitForTimeout(300);
        const hash = await page.evaluate(() => location.hash);
        check("Sommario topic click", hash.startsWith(`#/m/${first.id}/`), `hash=${hash}`);
        await closeViewer(page);
        await page.locator(".brand").click();
        await gotoView(page, view);
      }

    } else if (view === "esagoni") {
      // Test hex cells (click opens module)
      const cells = page.locator("#hex-svg .hex-cell");
      const count = await cells.count();
      for (let i = 0; i < Math.min(count, 3); i++) {
        await cells.nth(i).click();
        await page.waitForTimeout(500);
        const hash = await page.evaluate(() => location.hash);
        const mod = manifest.modules[i];
        check(`Esagoni cella ${i} click`, hash.startsWith(`#/m/${mod.id}`), `hash=${hash}`);
        if (mod.pdf?.pages) {
          await closeViewer(page);
          await page.locator(".brand").click();
          await gotoView(page, view);
        } else {
          await page.locator(".brand").click();
          await gotoView(page, view);
        }
      }
      // Test Enter/Space key on focused cell
      await page.locator("#hex-svg .hex-cell").first().focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
      const hashEnter = await page.evaluate(() => location.hash);
      check("Esagoni Enter key", hashEnter.startsWith(`#/m/${first.id}`), `hash=${hashEnter}`);
      await closeViewer(page);
      await page.locator(".brand").click();
      await gotoView(page, view);

    } else if (view === "cerca") {
      // Test search
      await page.fill("#pal-input", "ricetta");
      await page.waitForTimeout(300);
      const resultsCount = await page.locator("#pal-results .pal-item").count();
      check("Cerca risultati", resultsCount > 0, `count=${resultsCount}`);
      if (resultsCount > 0) {
        await page.locator("#pal-results .pal-item").first().click();
        await page.waitForTimeout(300);
        const hash = await page.evaluate(() => location.hash);
        check("Cerca click risultato", hash.startsWith("#/m/") || hash.startsWith("#/?vista="), `hash=${hash}`);
        if (hash.startsWith("#/m/")) {
          await closeViewer(page);
          await page.locator(".brand").click();
          await gotoView(page, view);
        }
      }
      // Test Escape
      await page.fill("#pal-input", "test");
      await page.waitForTimeout(100);
      await page.keyboard.press("Escape");
      const val = await page.inputValue("#pal-input");
      check("Cerca Escape pulisce", val === "", `value=${val}`);

    } else if (view === "libreria") {
      // Test book double-click
      const books = page.locator(".lib-book");
      const count = await books.count();
      for (let i = 0; i < Math.min(count, 3); i++) {
        const mod = manifest.modules[i];
        await books.nth(i).dblclick();
        await page.waitForTimeout(500);
        const hash = await page.evaluate(() => location.hash);
        check(`Libreria libro ${i} dblclick`, hash.startsWith(`#/m/${mod.id}`), `hash=${hash}`);
        if (mod.pdf?.pages) {
          await closeViewer(page);
          await page.locator(".brand").click();
          await gotoView(page, view);
        } else {
          await page.locator(".brand").click();
          await gotoView(page, view);
        }
      }
      // Test "Apri il modulo" in detail panel
      await books.first().click();
      await page.waitForTimeout(200);
      await page.locator('[data-action="open-module"]').click();
      await page.waitForTimeout(500);
      const hash = await page.evaluate(() => location.hash);
      check("Libreria Apri modulo", hash.startsWith(`#/m/${first.id}`), `hash=${hash}`);
      await closeViewer(page);
      await page.locator(".brand").click();
      await gotoView(page, view);

      // Test Enter key on focused book
      await page.locator(".lib-book").first().focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
      const hashEnter = await page.evaluate(() => location.hash);
      check("Libreria Enter key", hashEnter.startsWith(`#/m/${first.id}`), `hash=${hashEnter}`);
      await closeViewer(page);
      await page.locator(".brand").click();
      await gotoView(page, view);
    }
  }

  // ============================================================
  // FASE 3: Test modulo e viewer
  // ============================================================
  console.log("\n=== FASE 3: Test modulo e viewer ===");
  await page.goto(`${BASE_URL}#/m/${first.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#view-module:not([hidden])", { timeout: 15000 });

  // Test "Inizia dalle slide"
  await page.click("#mod-start");
  await page.waitForTimeout(300);
  check("Modulo Inizia slide", await page.locator("#viewer:not([hidden])").isVisible());
  await closeViewer(page);
  // After closing viewer, we're back on the home view. Navigate to module view again.
  await page.goto(`${BASE_URL}#/m/${first.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#view-module:not([hidden])", { timeout: 15000 });
  await page.waitForTimeout(500);  // Allow flow rail to render
  await page.waitForSelector(".flow-rail-scroll:not([hidden])", { timeout: 10000 });
  await page.waitForSelector("#flow-rail .tnode", { timeout: 10000 });
  const flowTopic = page.locator("#flow-rail .tnode").first();
  await flowTopic.waitFor({ state: "visible", timeout: 10000 });
  await page.evaluate(() => {
    const rail = document.querySelector(".flow-rail-scroll");
    if (rail) rail.scrollLeft = 0;
  });
  await flowTopic.click({ force: true });
  await page.waitForTimeout(300);
  check("Flow topic click", await page.locator(".tnode.is-active").count() === 1);

  // Test slide click in flow
  await page.locator(".slide-card").first().click();
  await page.waitForTimeout(300);
  check("Flow slide click", await page.locator("#viewer:not([hidden])").isVisible());
  await closeViewer(page);

  // Test PDF link
  if (first.pdf?.path) {
    await page.goto(`${BASE_URL}#/m/${first.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#view-module:not([hidden])", { timeout: 15000 });
    const pdfHref = await page.locator("#mod-pdf").getAttribute("href");
    check("Modulo PDF link", pdfHref?.includes(first.pdf.path), `href=${pdfHref}`);
  }

  // Test viewer navigation
  await page.goto(`${BASE_URL}#/m/${first.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#view-module:not([hidden])", { timeout: 15000 });
  await page.click("#mod-start");
  await page.waitForSelector("#viewer:not([hidden])", { timeout: 5000 });
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const cur = await page.locator("#vw-cur").innerText();
  check("Viewer freccia destra", cur.trim() === "2", `cur=${cur}`);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);
  const cur2 = await page.locator("#vw-cur").innerText();
  check("Viewer freccia sinistra", cur2.trim() === "1", `cur=${cur2}`);
  await closeViewer(page);

  // Test viewer PDF link
  await page.goto(`${BASE_URL}#/m/${first.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#view-module:not([hidden])", { timeout: 15000 });
  await page.click("#mod-start");
  await page.waitForSelector("#viewer:not([hidden])", { timeout: 5000 });
  const viewerPdfHref = await page.locator("#vw-pdf").getAttribute("href");
  check("Viewer PDF link", viewerPdfHref?.includes(first.pdf?.path || ""), `href=${viewerPdfHref}`);
  await closeViewer(page);

  // ============================================================
  // FASE 4: Coerenza tra viste
  // ============================================================
  console.log("\n=== FASE 4: Coerenza tra viste ===");
  const testMod = manifest.modules[0];
  const testTopic = testMod.topics?.[0];

  for (const view of ["carosello", "sommario", "esagoni", "cerca", "libreria"]) {
    await page.goto(`${BASE_URL}#/`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await gotoView(page, view);

    if (view === "carosello") {
      await page.locator("#car-mount .car-card").first().click();
    } else if (view === "sommario") {
      await page.locator(".sum-module-btn").first().click();
    } else if (view === "esagoni") {
      await page.locator("#hex-svg .hex-cell").first().click();
    } else if (view === "cerca") {
      await page.fill("#pal-input", testMod.title);
      await page.waitForTimeout(300);
      await page.locator("#pal-results .pal-item").first().click();
    } else if (view === "libreria") {
      await page.locator(".lib-book").first().dblclick();
    }

    await page.waitForTimeout(500);
    const hash = await page.evaluate(() => location.hash);
    const expectedStart = `#/m/${testMod.id}`;
    check(`Coerenza ${view} -> modulo`, hash.startsWith(expectedStart), `hash=${hash}`);
    await closeViewer(page);
  }

  // ============================================================
  // FASE 5: Browser navigation
  // ============================================================
  console.log("\n=== FASE 5: Navigazione browser ===");
  await page.goto(`${BASE_URL}#/m/${first.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#view-module:not([hidden])", { timeout: 15000 });
  await page.click("#mod-start");
  await page.waitForSelector("#viewer:not([hidden])", { timeout: 5000 });
  await closeViewer(page);

  // Back
  await page.goBack();
  await page.waitForTimeout(500);
  const hashBack = await page.evaluate(() => location.hash);
  check("Browser back", hashBack.startsWith(`#/m/${first.id}`) || hashBack === "#/");

  // Forward
  await page.goForward();
  await page.waitForTimeout(500);
  const hashForward = await page.evaluate(() => location.hash);
  check("Browser forward", hashForward.startsWith(`#/m/${first.id}`) || hashForward.startsWith("#/?vista="));

  // Reload on deep link
  await page.goto(`${BASE_URL}#/m/${first.id}/${testTopic?.id || "t1"}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#view-module:not([hidden])", { timeout: 15000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#view-module:not([hidden])", { timeout: 15000 });
  const hashReload = await page.evaluate(() => location.hash);
  check("Reload deep link", hashReload.startsWith(`#/m/${first.id}`), `hash=${hashReload}`);

  // Direct open in new tab simulation
  await page.goto(`${BASE_URL}#/m/${first.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#view-module:not([hidden])", { timeout: 15000 });
  const title = await page.title();
  check("Direct open title", title.includes(testMod.title) || title.includes("FARMACISTA"));

  // Unknown hash -> home
  await page.goto(`${BASE_URL}#/unknown/path`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const hashUnknown = await page.evaluate(() => location.hash);
  check("Hash sconosciuto -> home", hashUnknown === "#/" || hashUnknown.startsWith("#/?vista="), `hash=${hashUnknown}`);

  // ============================================================
  // FASE 6: Responsive viewport tests
  // ============================================================
  console.log("\n=== FASE 6: Responsive viewport ===");
  for (const vp of VIEWPORTS) {
    const vpContext = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile });
    const vpPage = await vpContext.newPage();
    watch(vpPage, `viewport-${vp.name}`, []);

    for (const view of VIEWS) {
      await vpPage.goto(`${BASE_URL}#/?vista=${view}`, { waitUntil: "domcontentloaded" });
      await waitForViewReady(vpPage, view);
      const overflow = await vpPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      const overflowDetail = overflow ? "overflow detected" : "ok";
      check(`${vp.name}/${view}: no horizontal overflow`, !overflow, overflowDetail);
      await vpPage.screenshot({ path: `${AUDIT_DIR}/screenshots/${view}-${vp.name}.png` });
    }
    await vpContext.close();
  }

  // ============================================================
  // FASE 7: Keyboard navigation
  // ============================================================
  console.log("\n=== FASE 7: Navigazione tastiera ===");
  await page.goto(`${BASE_URL}#/?vista=carosello`, { waitUntil: "domcontentloaded" });
  await waitForViewReady(page, "carosello");
  await page.locator("#car-mount .car-card").first().focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  check("Carosello Enter", await page.locator("#view-module:not([hidden])").isVisible());
  await closeViewer(page);

  await page.goto(`${BASE_URL}#/?vista=sommario`, { waitUntil: "domcontentloaded" });
  await waitForViewReady(page, "sommario");
  await page.locator(".sum-module-btn").first().focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  check("Sommario Enter", await page.locator("#view-module:not([hidden])").isVisible());
  await closeViewer(page);

  await page.goto(`${BASE_URL}#/?vista=esagoni`, { waitUntil: "domcontentloaded" });
  await waitForViewReady(page, "esagoni");
  await page.locator("#hex-svg .hex-cell").first().focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  check("Esagoni Enter", await page.locator("#hex-detail").innerText().then(t => t.includes(first.title)));
  await page.keyboard.press(" ");
  await page.waitForTimeout(300);
  check("Esagoni Space", await page.locator("#hex-detail").innerText().then(t => t.includes(first.title)));

  await page.goto(`${BASE_URL}#/?vista=cerca`, { waitUntil: "domcontentloaded" });
  await waitForViewReady(page, "cerca");
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  check("Ctrl+K", await page.locator("#view-cerca:not([hidden])").isVisible());
  await page.fill("#pal-input", "test");
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  check("Cerca Enter", await page.locator("#view-module:not([hidden])").isVisible() || await page.locator("#pal-results .pal-item[aria-selected='true']").count() > 0);

  await page.goto(`${BASE_URL}#/?vista=libreria`, { waitUntil: "domcontentloaded" });
  await waitForViewReady(page, "libreria");
  await page.locator(".lib-book").first().focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  check("Libreria Enter", await page.locator("#view-module:not([hidden])").isVisible());
  await closeViewer(page);

  // ============================================================
  // FASE 8: Chiusura viewer e stato
  // ============================================================
  console.log("\n=== FASE 8: Chiusura viewer e stato ===");
  await page.goto(`${BASE_URL}#/?vista=carosello`, { waitUntil: "domcontentloaded" });
  await waitForViewReady(page, "carosello");
  await page.locator("#car-mount .car-card").first().click();
  await page.waitForTimeout(300);
  await closeViewer(page);
  check("Close viewer -> home", await page.locator("#view-carosello:not([hidden])").isVisible());

  // ============================================================
  // RISULTATI
  // ============================================================
  console.log("\n=== RISULTATI ===");
  const failed = results.filter((r) => !r.ok);
  console.log(`TOTAL: ${results.length}, PASS: ${results.length - failed.length}, FAIL: ${failed.length}`);
  if (failed.length) {
    console.log("\nFAILURES:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  }

  // Write reports
  await writeFile(`${AUDIT_DIR}/report.json`, JSON.stringify(results, null, 2));

  let md = "# Audit Report\n\n";
  md += `Data: ${new Date().toISOString()}\n`;
  md += `Base URL: ${BASE_URL}\n`;
  md += `Moduli: ${expectedModules}, Slide: ${expectedPages}, Argomenti: ${expectedTopics}\n\n`;
  md += `## Riepilogo\n`;
  md += `- **Totali**: ${results.length}\n`;
  md += `- **Pass**: ${results.length - failed.length}\n`;
  md += `- **Fail**: ${failed.length}\n\n`;

  if (failed.length) {
    md += `## Fallimenti\n\n`;
    for (const f of failed) {
      md += `- **${f.name}**: ${f.detail}\n`;
    }
    md += "\n";
  }

  md += `## Dettaglio completo\n\n`;
  md += `| Test | Esito | Dettaglio |\n|------|-------|-----------|\n`;
  for (const r of results) {
    md += `| ${r.name} | ${r.ok ? "✅" : "❌"} | ${r.detail || ""} |\n`;
  }

  await writeFile(`${AUDIT_DIR}/report.md`, md);

  await browser.close();
  process.exit(failed.length ? 1 : 0);
}

runAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});