/* e2e.js — verifica reale della libreria interattiva con Chromium/Playwright. */

import { mkdir, readFile } from "node:fs/promises";
import { BASE_URL, OUT_DIR, CHROMIUM, results } from "./verify-env.js";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "/tmp/verify-tools/node_modules/playwright-core/index.mjs");

function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function benignAbort(url, error) {
  return error === "net::ERR_ABORTED" && /\/content\/thumbs\//.test(url);
}

function watch(page, label) {
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
}

const manifest = JSON.parse(await readFile(new URL("../content/manifest.json", import.meta.url), "utf8"));
const expectedModules = manifest.modules.length;
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
watch(page, "libreria");

await page.goto(`${BASE_URL}#/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#lib-shelves .lib-book", { timeout: 15000 });

check("titolo della pagina", (await page.title()).includes("Libreria"), await page.title());
check("descrizione aggiornata", (await page.locator('meta[name="description"]').getAttribute("content")).includes("libreria"));
check("nessun residuo 'mappa mentale' nella vista", !(await page.locator("#view-home").innerText()).toLowerCase().includes("mappa mentale"));

const bookCount = await page.locator(".lib-book").count();
check("un volume per modulo", bookCount === expectedModules, `${bookCount}/${expectedModules}`);
const shelfCount = await page.locator(".lib-shelf").count();
check("scaffali generati", shelfCount >= 2 && shelfCount <= expectedModules, `${shelfCount} scaffali`);

const panel = await page.locator(".lib-main > .lib-card").evaluate((node) => {
  const s = getComputedStyle(node);
  return { radius: s.borderTopLeftRadius, background: s.backgroundColor };
});
check("pannello arrotondato 18px", panel.radius === "18px", panel.radius);
check("sfondo pannello #EFEDE6", panel.background === "rgb(239, 237, 230)", panel.background);

const plank = await page.locator(".lib-plank").first().evaluate((node) => {
  const before = getComputedStyle(node, "::before");
  const after = getComputedStyle(node, "::after");
  return { bar: before.height, barColor: before.backgroundColor, thread: after.height, threadColor: after.backgroundColor };
});
check("asse scaffold 16px", plank.bar === "16px", plank.bar);
check("colore asse #B9B2A3", plank.barColor === "rgb(185, 178, 163)", plank.barColor);
check("filo scaffold 5px", plank.thread === "5px", plank.thread);
check("colore filo #9C9484", plank.threadColor === "rgb(156, 148, 132)", plank.threadColor);

const widthSet = await page.locator(".lib-book").evaluateAll((nodes) => new Set(nodes.map((n) => getComputedStyle(n).width)).size);
check("larghezze volumi calcolate dinamicamente", widthSet >= 2, `${widthSet} larghezze distinte`);

const shelfKeys = await page.locator(".lib-shelf").evaluateAll((nodes) => nodes.map((n) => n.querySelectorAll(".lib-book").length));
check("riempimento scaffale prima del ritorno a capo", shelfKeys.slice(0, -1).every((n) => n > 0), shelfKeys.join(","));

const first = page.locator(".lib-book").first();
await first.click();
check("selezione volume", await first.getAttribute("aria-pressed") === "true");
check("scheda volume compilata", (await page.locator("#lib-info").innerText()).includes("Scaffale"));
check("breadcrumb aggiornato", (await page.locator("#lib-crumbs").innerText()).includes("Scaffale"));
check("live region presente", await page.locator("#lib-live").count() === 1);

await page.keyboard.press("ArrowRight");
const focusedLabel = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || "");
check("frecce navigano tra i volumi", focusedLabel.includes("Volume M02"), focusedLabel);

const focusedBeforeRelayout = await page.evaluate(() => document.activeElement?.dataset.moduleId);
await page.setViewportSize({ width: 1100, height: 900 });
await page.waitForTimeout(250);
const focusedAfterRelayout = await page.evaluate(() => document.activeElement?.dataset.moduleId);
check("ricomposizione preserva il focus", Boolean(focusedBeforeRelayout) && focusedAfterRelayout === focusedBeforeRelayout, `${focusedBeforeRelayout} → ${focusedAfterRelayout}`);
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(250);

await page.keyboard.press("Escape");
check("Escape deseleziona", await page.locator('.lib-book[aria-pressed="true"]').count() === 0);

await page.locator("#search-input").fill("stupefacenti");
await page.waitForTimeout(150);
const matches = await page.locator(".lib-book.is-match").count();
check("ricerca evidenzia i volumi", matches >= 1, `${matches} corrispondenze`);
await page.locator("#search-input").fill("");

const targetId = await first.getAttribute("data-module-id");
await first.dblclick();
await page.waitForSelector("#view-module:not([hidden])", { timeout: 5000 });
check("doppio click apre il modulo", (await page.evaluate(() => location.hash)).includes(targetId));
check("vista modulo attiva", (await page.locator("#mod-title").innerText()).length > 0);
check("percorso argomenti presente", await page.locator("#flow-rail li").count() > 0);

await page.locator("#mod-start").click();
await page.waitForSelector("#viewer:not([hidden])", { timeout: 5000 });
check("visore slide full-screen", await page.locator("#viewer").isVisible());
await page.keyboard.press("ArrowRight");
check("frecce visore cambiano slide", Number(await page.locator("#vw-cur").innerText()) === 2);
await page.keyboard.press("Escape");
check("Escape chiude il visore", await page.locator("#viewer").isHidden());

await page.locator(".brand").click();
await page.waitForSelector("#view-home:not([hidden])", { timeout: 5000 });
check("ritorno alla libreria", (await page.title()).includes("Libreria"));
check("volumi ancora presenti", await page.locator(".lib-book").count() === expectedModules);

await page.locator("#btn-list").click();
check("vista elenco disponibile", await page.locator("#module-list").isVisible());
check("elenco ha tutti i moduli", await page.locator("#module-list .ml-card").count() === expectedModules);
await page.locator("#btn-list").click();
check("ritorno alla libreria dall'elenco", await page.locator("#lib-layout").isVisible());

const mobile = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
const mobilePage = await mobile.newPage();
watch(mobilePage, "mobile");
await mobilePage.goto(`${BASE_URL}#/`, { waitUntil: "domcontentloaded" });
await mobilePage.waitForSelector("#lib-shelves .lib-book", { state: "attached", timeout: 15000 });
await mobilePage.click("#btn-list");
await mobilePage.waitForSelector("#lib-shelves .lib-book", { state: "visible", timeout: 15000 });
const mobileMetrics = await mobilePage.locator("#lib-stage").evaluate((node) => ({
  visible: node.getBoundingClientRect().width > 0,
  overflowX: node.scrollWidth > node.clientWidth + 2,
  bookCount: node.querySelectorAll(".lib-book").length,
}));
check("mobile: libreria visibile", mobileMetrics.visible);
check("mobile: nessun overflow orizzontale", !mobileMetrics.overflowX);
check("mobile: tutti i volumi", mobileMetrics.bookCount === expectedModules, `${mobileMetrics.bookCount}/${expectedModules}`);

check("console pulita", results.console.length === 0, JSON.stringify(results.console));
check("nessun pageerror", results.pageErrors.length === 0, JSON.stringify(results.pageErrors));
check("nessuna richiesta fallita", results.failedRequests.length === 0, JSON.stringify(results.failedRequests));
check("nessun errore HTTP", results.httpErrors.length === 0, JSON.stringify(results.httpErrors));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`SUMMARY ${JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length })}`);
process.exit(failed.length ? 1 : 0);
