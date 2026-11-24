/* e2e.js — verifica reale delle quattro viste, del selettore e del lettore PDF. */

import { mkdir, readFile } from "node:fs/promises";
import { BASE_URL, OUT_DIR, CHROMIUM, results } from "./verify-env.js";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "/tmp/verify-tools/node_modules/playwright-core/index.mjs");

function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function norm(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function haystack(mod) {
  return norm([
    `M${String(mod.n ?? 0).padStart(2, "0")}`,
    mod.title,
    (mod.topics || []).map((t) => t.title).join(" "),
    (mod.slides || []).map((s) => s.title).join(" "),
  ].join(" "));
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

const manifest = JSON.parse(await readFile(new URL("../content/manifest.json", import.meta.url), "utf8"));
const searchIndex = JSON.parse(await readFile(new URL("../content/search.json", import.meta.url), "utf8"));
const expectedModules = manifest.modules.length;
const expectedPages = manifest.totals?.pages ?? manifest.modules.reduce((a, m) => a + (m.pdf?.pages || m.slides?.length || 0), 0);
const expectedTopics = manifest.totals?.topics ?? manifest.modules.reduce((a, m) => a + (m.topics?.length || 0), 0);
const navTopics = manifest.modules.reduce((a, m) => a + ((m.topics?.length) || (m.pdf?.pages ? 1 : 0)), 0);
const first = manifest.modules[0];
const second = manifest.modules[1];
const noPdf = manifest.modules.find((m) => !(m.pdf?.pages || m.slides?.length));
const DASH_KEY = "farmacista:v1:dashboard";
const LEGACY_KEY = "farmacista:v1:kanban";
const GLOBAL_KEY = "farmacista:v1:global-view";
const VIEWS = ["carosello", "sommario", "esagoni", "cerca", "libreria", "dashboard"];
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const dialogs = [];
watch(page, "principale", dialogs);

async function goto(view) {
  await page.goto(`${BASE_URL}#/?vista=${view}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#view-select option").length > 0, null, { timeout: 15000 });
  await page.waitForFunction((v) => {
    const sel = document.querySelector(`#view-${v}:not([hidden])`);
    if (!sel) return false;
    if (v === "carosello") return document.querySelectorAll("#car-mount .car-card").length > 0;
    if (v === "sommario") return document.querySelectorAll(".sum-module-btn").length > 0;
    if (v === "esagoni") return document.querySelectorAll("#hex-svg .hex-cell").length > 0;
    if (v === "cerca") return document.querySelector("#pal-input") !== null;
    return true;
  }, view, { timeout: 15000 });
}

async function selectView(view) {
  await page.selectOption("#view-select", view);
  await page.waitForFunction((v) => location.hash === `#/?vista=${v}`, view, { timeout: 5000 });
}

async function closeViewer() {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("#viewer")?.hidden === true, null, { timeout: 5000 });
}

await page.goto(`${BASE_URL}#/`, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await goto("carosello");

check("titolo iniziale del carosello", (await page.title()).includes("Carosello"), await page.title());
const meta = await page.locator('meta[name="description"]').getAttribute("content");
check("meta description invariata", meta?.includes("board Kanban"), meta);
check("selettore sempre visibile", await page.locator("#view-select").isVisible() && await page.locator("#view-select option").count() === VIEWS.length);
check("opzioni del selettore complete", JSON.stringify(await page.locator("#view-select option").evaluateAll((nodes) => nodes.map((n) => n.value))) === JSON.stringify(VIEWS));
check("carosello predefinita nell'URL", await page.evaluate(() => location.hash) === "#/?vista=carosello");
check("carosello predefinita nel localStorage", await page.evaluate((key) => localStorage.getItem(key), GLOBAL_KEY) === "carosello");
check("solo la carosello è visibile", await page.locator("#view-carosello").isVisible() && await page.locator("#view-sommario").isHidden() && await page.locator("#view-esagoni").isHidden() && await page.locator("#view-cerca").isHidden() && await page.locator("#view-module").isHidden());

const cards = page.locator("#car-mount .car-card");
check("carosello: una card per modulo", await cards.count() === expectedModules, `${await cards.count()}/${expectedModules}`);
check("carosello: prima card attiva", await cards.first().getAttribute("aria-current") === "true");
check("carosello: etichette reali", (await cards.first().getAttribute("aria-label")).includes(first.title) && (await cards.first().innerText()).includes(String(first.pdf?.pages ?? first.slides?.length)));
check("carosello: frecce agli estremi", await page.locator("#car-prev").isDisabled() && await page.locator("#car-next").isEnabled());
await page.click("#car-next");
check("carosello: freccia successiva", await cards.nth(1).getAttribute("aria-current") === "true" && (await page.locator("#car-count").innerText()).includes("02"));
await page.click("#car-prev");
await cards.first().focus();
await page.keyboard.press("ArrowRight");
check("carosello: navigazione tastiera", await cards.nth(1).getAttribute("aria-current") === "true");
await page.click("#car-dots .car-dot:nth-child(3)");
check("carosello: dots", await cards.nth(2).getAttribute("aria-current") === "true");
check("carosello: palette condivisa", await cards.first().evaluate((n) => n.style.getPropertyValue("--card-color").trim()) === "#155E75");

await selectView("sommario");
check("sommario visibile e titolo", await page.locator("#view-sommario").isVisible() && (await page.title()).includes("Sommario"));
check("sommario: un pulsante per modulo", await page.locator(".sum-module-btn").count() === expectedModules);
check("sommario: due colonne", await page.locator(".sum-col:not([hidden])").count() === 2);
check("sommario: serif", await page.locator(".sum-book").evaluate((n) => getComputedStyle(n).fontFamily.toLowerCase().includes("georgia") || getComputedStyle(n).fontFamily.toLowerCase().includes("serif")));
const sumTotal = await page.locator("#sum-total").innerText();
check("sommario: totali dal manifest", sumTotal.includes(String(expectedModules)) && sumTotal.includes(String(navTopics)) && sumTotal.includes(String(expectedPages)), sumTotal);
const firstSumPage = await page.locator(".sum-module-btn").first().locator(".sum-page").innerText();
check("sommario: prima pagina cumulativa", firstSumPage.trim() === "1", firstSumPage);
check("sommario: argomenti con pagine reali", await page.locator(".sum-topic-btn").count() === navTopics);

await selectView("esagoni");
check("esagoni visibile e titolo", await page.locator("#view-esagoni").isVisible() && (await page.title()).includes("Esagoni"));
check("esagoni: 19 celle", await page.locator("#hex-svg .hex-cell").count() === expectedModules, `${await page.locator("#hex-svg .hex-cell").count()}/${expectedModules}`);
check("esagoni: SVG accessibile", await page.locator("#hex-svg").getAttribute("role") === "img" && (await page.locator("#hex-svg title").textContent()).includes("Alveare"));
check("esagoni: dettaglio iniziale", (await page.locator("#hex-detail").innerText()).includes(first.title));
const hexColors = await page.locator("#hex-svg .hex-cell").evaluateAll((nodes) => nodes.map((n) => n.style.getPropertyValue("--hex-color").trim()));
check("esagoni: palette condivisa", new Set(hexColors).size === 8, `${new Set(hexColors).size} colori`);
await page.locator("#hex-svg .hex-cell").first().focus();
await page.keyboard.press("ArrowRight");
check("esagoni: navigazione geometrica", (await page.locator("#hex-detail").innerText()).includes(second.title));
check("esagoni: pulsante apre il modulo", await page.locator("#hex-open").count() === 1);

await page.keyboard.press("Control+k");
await page.waitForFunction(() => document.querySelector("#view-cerca:not([hidden])") !== null, null, { timeout: 5000 });
check("Ctrl+K apre la palette", await page.locator("#view-cerca").isVisible() && await page.evaluate(() => document.activeElement?.id) === "pal-input");
check("palette: conteggi reali", (await page.locator("#pal-count").innerText()).includes(String(expectedModules)) && (await page.locator("#pal-count").innerText()).includes(String(expectedPages)));
check("palette: tre gruppi", await page.locator(".pal-group").count() === 3);
await page.fill("#pal-input", "ricetta");
await page.waitForTimeout(120);
const palText = await page.locator("#pal-results").innerText();
check("palette: risultati per ricerca reale", norm(palText).includes("ricetta") && await page.locator("#pal-results .pal-item").count() > 0);
await page.locator("#pal-input").focus();
await page.keyboard.press("ArrowDown");
check("palette: navigazione tastiera", await page.locator('#pal-results .pal-item[aria-selected="true"]').count() === 1);
await page.locator("#pal-esc").click();
check("palette: Esc nella barra pulisce la query", (await page.inputValue("#pal-input")) === "");

await selectView("carosello");
await page.locator("#car-mount .car-card").first().focus();
await page.keyboard.press("/");
check("barra apre la palette", await page.locator("#view-cerca").isVisible() && await page.evaluate(() => document.activeElement?.id) === "pal-input");

await page.fill("#search-input", "vaccini");
await page.waitForTimeout(260);
check("ricerca globale sincronizza la palette", (await page.inputValue("#pal-input")) === "vaccini");
await page.fill("#search-input", "");
await page.waitForTimeout(260);

await goto("carosello");
await cards.first().focus();
await page.keyboard.press("Enter");
await page.waitForSelector("#view-module:not([hidden])", { timeout: 5000 });
check("carosello: invio apre il modulo", await page.locator("#view-module").isVisible());
await page.waitForSelector("#viewer:not([hidden])", { timeout: 5000 });
check("visore: slide iniziale", (await page.locator("#vw-cur").innerText()).trim() === "1");
await page.keyboard.press("ArrowRight");
check("visore: frecce", (await page.locator("#vw-cur").innerText()).trim() === "2");
const stage = await page.locator("#vw-stage").boundingBox();
await page.mouse.move(stage.x + stage.width * 0.75, stage.y + stage.height / 2);
await page.mouse.down();
await page.mouse.move(stage.x + stage.width * 0.25, stage.y + stage.height / 2, { steps: 8 });
await page.mouse.up();
check("visore: swipe", (await page.locator("#vw-cur").innerText()).trim() === "3");
await closeViewer();
await page.locator(".brand").click();
await page.waitForSelector("#view-carosello:not([hidden])", { timeout: 5000 });
check("brand torna alla vista attiva", await page.locator("#view-carosello").isVisible() && await page.locator("#view-select").isVisible());

await page.selectOption("#view-select", "dashboard");
await page.waitForSelector("#dash-modules .dash-module", { timeout: 5000 });
check("dashboard storica intatta", await page.locator('[data-testid="dashboard"]').isVisible() && await page.locator("#dash-modules .dash-module").count() === expectedModules);
const stats = await page.locator("#dash-stats .dash-stat-value").allInnerTexts();
check("dashboard: coerenza dati", JSON.stringify(stats.slice(0, 3)) === JSON.stringify([String(expectedModules), String(expectedTopics), String(expectedPages)]), stats.join(" | "));
const row = page.locator(`.dash-module[data-module-id="${first.id}"]`);
await row.locator(".dash-module-main").click();
await row.locator(".dash-slide").first().click();
await page.waitForSelector("#viewer:not([hidden])", { timeout: 5000 });
await closeViewer();
await page.locator(".brand").click();
await page.waitForSelector("#view-home:not([hidden])", { timeout: 5000 });
check("dashboard: progresso registrato", Number((await row.locator(".dash-module-meter b").innerText()).replace("%", "")) > 0);
await row.locator('[data-action="override"]').click();
check("dashboard: completamento", await row.locator(".dash-status-done").count() === 1);
await page.click("#dash-reset");
await page.click("#dash-confirm-yes");
check("dashboard: azzeramento", await page.locator("#dash-modules .dash-status-done").count() === 0);
await page.fill("#dash-filter", "deontologico");
await page.waitForTimeout(120);
const filteredIds = await page.locator("#dash-modules .dash-module").evaluateAll((nodes) => nodes.map((n) => n.dataset.moduleId));
const filterToken = norm("deontologico");
check("dashboard: filtro locale reale", filteredIds.length > 0 && filteredIds.length < expectedModules && filteredIds.every((id) => {
  const mod = manifest.modules.find((m) => m.id === id);
  return mod && haystack(mod).includes(filterToken);
}), `${filteredIds.length} moduli`);
await page.fill("#dash-filter", "");

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("#dash-modules .dash-module", { timeout: 15000 });
check("vista persistita dopo reload", await page.evaluate(() => location.hash) === "#/?vista=dashboard" && await page.locator("#module-list").isVisible());

await selectView("libreria");
check("libreria storica intatta", await page.locator("#lib-layout").isVisible() && await page.locator(".lib-book").count() === expectedModules);

const migration = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await migration.addInitScript(([legacy, globalKey, id]) => {
  localStorage.setItem(legacy, JSON.stringify({ modules: { [id]: { seen: [1, 2], last: 2 } } }));
  localStorage.setItem(globalKey, "dashboard");
}, [LEGACY_KEY, GLOBAL_KEY, first.id]);
const migrationPage = await migration.newPage();
watch(migrationPage, "migrazione", []);
await migrationPage.goto(`${BASE_URL}#/?vista=dashboard`, { waitUntil: "domcontentloaded" });
await migrationPage.waitForSelector("#dash-modules .dash-module", { timeout: 15000 });
const migrated = await migrationPage.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}"), DASH_KEY);
check("migrazione da chiave legacy", (migrated.modules?.[first.id]?.seen || []).includes(2), JSON.stringify(migrated).slice(0, 90));
check("chiave legacy rimossa", await migrationPage.evaluate((key) => localStorage.getItem(key), LEGACY_KEY) === null);
await migration.close();

if (noPdf) {
  const npContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await npContext.addInitScript(([key, globalKey, id]) => {
    localStorage.setItem(key, JSON.stringify({ modules: { [id]: { seen: [], last: null, override: "done" } } }));
    localStorage.setItem(globalKey, "dashboard");
  }, [DASH_KEY, GLOBAL_KEY, noPdf.id]);
  const npPage = await npContext.newPage();
  watch(npPage, "no-pdf", []);
  await npPage.goto(`${BASE_URL}#/?vista=dashboard`, { waitUntil: "domcontentloaded" });
  await npPage.waitForSelector("#dash-modules .dash-module", { timeout: 15000 });
  const txt = await npPage.locator("#dash-resume").innerText();
  check("ripresa ignora modulo senza pagine", !txt.includes(noPdf.title));
  await npContext.close();
}

for (const [label, width, height, mobile] of [["tablet", 820, 1100, false], ["mobile", 360, 800, true]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
  const responsive = await ctx.newPage();
  watch(responsive, label, []);
  for (const view of ["carosello", "sommario", "esagoni", "cerca"]) {
    await responsive.goto(`${BASE_URL}#/?vista=${view}`, { waitUntil: "domcontentloaded" });
    await responsive.waitForSelector(`#view-${view}:not([hidden])`, { timeout: 15000 });
    const metrics = await responsive.evaluate(() => ({
      bodyOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      pickerVisible: Boolean(document.querySelector("#view-select")?.getBoundingClientRect().width),
      sectionWidth: document.querySelector(".view:not([hidden])")?.getBoundingClientRect().width || 0,
    }));
    check(`${label}/${view}: nessun overflow orizzontale`, !metrics.bodyOverflow, JSON.stringify(metrics));
    check(`${label}/${view}: selettore visibile`, metrics.pickerVisible && metrics.sectionWidth > 0);
  }
  await ctx.close();
}

check("nessun modulo assente dall'indice di ricerca", new Set(searchIndex.map((r) => r.m)).size === expectedModules - (noPdf ? 1 : 0), `${new Set(searchIndex.map((r) => r.m)).size}/${expectedModules}`);
check("console pulita", results.console.length === 0, JSON.stringify(results.console));
check("nessun pageerror", results.pageErrors.length === 0, JSON.stringify(results.pageErrors));
check("nessuna richiesta fallita", results.failedRequests.length === 0, JSON.stringify(results.failedRequests));
check("nessun errore HTTP", results.httpErrors.length === 0, JSON.stringify(results.httpErrors));
check("nessun dialog nativo", dialogs.length === 0, dialogs.join(" | "));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`SUMMARY ${JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length })}`);
process.exit(failed.length ? 1 : 0);
