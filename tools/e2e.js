/* e2e.js — verifica reale della dashboard della vista elenco con Chromium/Playwright. */

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
const expectedModules = manifest.modules.length;
const expectedPages = manifest.totals?.pages ?? manifest.modules.reduce((a, m) => a + (m.pdf?.pages || m.slides?.length || 0), 0);
const expectedTopics = manifest.totals?.topics ?? manifest.modules.reduce((a, m) => a + (m.topics?.length || 0), 0);
const first = manifest.modules[0];
const second = manifest.modules[1];
const third = manifest.modules[2];
const noPdf = manifest.modules.find((m) => !(m.pdf?.pages || m.slides?.length));
const STORAGE_KEY = "farmacista:v1:dashboard";
const LEGACY_KEY = "farmacista:v1:kanban";
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const dialogs = [];
watch(page, "dashboard", dialogs);

await page.goto(`${BASE_URL}#/`, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("#lib-shelves .lib-book", { timeout: 15000 });

check("titolo iniziale della libreria", (await page.title()).includes("Libreria"), await page.title());
const meta = await page.locator('meta[name="description"]').getAttribute("content");
check("meta description invariata", meta?.includes("board Kanban"), meta);
check("vecchia board rimossa", await page.locator(".kb-board, .kb-column, .kb-card").count() === 0);
check("selettore vista presente", await page.locator("#view-switch button").count() === 2);
check("predefinita desktop: libreria", await page.locator("#lib-layout").isVisible() && await page.locator("#module-list").isHidden());

await page.click("#btn-list");
await page.waitForSelector("#module-list:not([hidden])", { timeout: 5000 });
check("elenco ora è una dashboard", await page.locator('[data-testid="dashboard"]').isVisible());
check("libreria nascosta", await page.locator("#lib-layout").isHidden());
check("titolo della dashboard", (await page.title()).includes("Dashboard"), await page.title());
check("heading interno della dashboard", (await page.locator("#home-title").innerText()).includes("Dashboard"));
check("stato premuto del selettore", await page.locator("#btn-list").getAttribute("aria-pressed") === "true" && await page.locator("#btn-map").getAttribute("aria-pressed") === "false");

const stats = await page.locator("#dash-stats .dash-stat-value").allInnerTexts();
check("quattro statistiche", stats.length === 4, stats.join(" | "));
check("coerenza dati: moduli/argomenti/pagine", JSON.stringify(stats.slice(0, 3)) === JSON.stringify([String(expectedModules), String(expectedTopics), String(expectedPages)]), stats.join(" | "));
check("avanzamento iniziale 0%", stats[3].trim() === "0%", stats[3]);
check("intestazione Buongiorno senza progressi", (await page.locator("#dash-greeting").innerText()).trim() === "Buongiorno");
check("barra complessiva a 0", await page.locator("#dash-overall-bar").evaluate((n) => Number(n.value)) === 0);

const resumeText = await page.locator("#dash-resume").innerText();
check("ripresa vuota veritiera", resumeText.includes("non ancora iniziato") && !/\b\d+ di \d+\b/.test(resumeText), resumeText.replace(/\n/g, " / "));
check("azione Inizia senza progressi", (await page.locator('#dash-resume [data-action="resume-start"]').innerText()).includes("Inizia"));
const nextItems = await page.locator("#dash-next .dash-next-btn").evaluateAll((nodes) => nodes.map((n) => ({ moduleId: n.dataset.moduleId, topicId: n.dataset.topicId })));
check("prossimi argomenti reali dal manifest", nextItems.length > 0 && nextItems.every((x) => manifest.modules.some((m) => m.id === x.moduleId && (m.topics || []).some((t) => t.id === x.topicId))), JSON.stringify(nextItems));

const moduleCount = await page.locator("#dash-modules .dash-module").count();
check("una riga per modulo", moduleCount === expectedModules, `${moduleCount}/${expectedModules}`);
check("conteggio nella sezione pagine", (await page.locator("#dash-count").innerText()).includes(`${expectedModules} moduli`));
check("live region presente", await page.locator('#dash-live[aria-live="polite"]').count() === 1);

if (noPdf) {
  const noPdfRow = page.locator(`.dash-module[data-module-id="${noPdf.id}"]`);
  await noPdfRow.locator(".dash-module-main").click();
  check("modulo senza PDF: Continua disabilitato", await noPdfRow.locator('[data-action="continue"]').isDisabled());
  check("modulo senza PDF: Segna completato disabilitato", await noPdfRow.locator('[data-action="override"]').isDisabled());
  check("modulo senza PDF resta Da iniziare", await noPdfRow.locator(".dash-status-todo").count() === 1);
  await noPdfRow.locator(".dash-module-main").click();
} else {
  check("modulo senza PDF presente nel manifest", false, "nessun modulo senza pagine trovato");
}

const firstRow = page.locator(`.dash-module[data-module-id="${first.id}"]`);
const rowStyle = await firstRow.evaluate((n) => {
  const s = getComputedStyle(n);
  const key = getComputedStyle(n.querySelector(".dash-module-key"));
  return { key: key.color, width: s.borderLeftWidth, bg: s.backgroundColor, edge: s.borderTopColor };
});
check("colore modulo dalla palette", rowStyle.key === "rgb(21, 94, 117)", rowStyle.key);
check("nessuna barra laterale decorativa", rowStyle.width === "1px", rowStyle.width);
check("riga modulo bianca", rowStyle.bg === "rgb(255, 255, 255)", rowStyle.bg);
check("bordo #E3E0D6", rowStyle.edge === "rgb(227, 224, 214)", rowStyle.edge);
check("titolo e contatori nel modulo", (await firstRow.locator(".dash-module-title").innerText()).trim() === first.title && /\d+ argomenti · \d+ pagine/.test(await firstRow.locator(".dash-module-meta").innerText()));
const bar = firstRow.locator("progress.dash-progress");
check("progress bar con etichetta", await bar.count() === 1 && (await bar.getAttribute("aria-label")).includes("Avanzamento"));
check("percentuale a destra", (await firstRow.locator(".dash-module-meter b").innerText()).trim() === "0%");
check("stato iniziale da iniziare", await firstRow.locator(".dash-status-todo").count() === 1);
check("dettagli chiusi all'avvio", await firstRow.locator(".dash-module-detail").isHidden());

const mainFirst = firstRow.locator(".dash-module-main");
await mainFirst.click();
check("click espande il modulo", await mainFirst.getAttribute("aria-expanded") === "true");
check("dettagli con argomenti", await firstRow.locator(".dash-topic-btn").count() > 0);
check("dettagli con slide", await firstRow.locator(".dash-slide").count() > 0);
check("azioni separate da pulsanti", await firstRow.locator('button[data-action="open"], button[data-action="continue"]').count() === 2);
check("nessun link dentro la dashboard", await page.locator("#module-list a").count() === 0);

await firstRow.locator(".dash-slide").first().click();
await page.waitForSelector("#viewer:not([hidden])", { timeout: 5000 });
check("slide apre il visore esistente", await page.locator("#viewer").isVisible());
check("visore sulla slide giusta", (await page.locator("#vw-cur").innerText()).trim() === "1");

await page.keyboard.press("ArrowRight");
check("frecce visore cambiano slide", (await page.locator("#vw-cur").innerText()).trim() === "2");
const stageBox = await page.locator("#vw-stage").boundingBox();
const stageY = stageBox.y + stageBox.height / 2;
await page.mouse.move(stageBox.x + stageBox.width * 0.75, stageY);
await page.mouse.down();
await page.mouse.move(stageBox.x + stageBox.width * 0.25, stageY, { steps: 8 });
await page.mouse.up();
check("swipe visore cambia slide", (await page.locator("#vw-cur").innerText()).trim() === "3");
const swipeRecorded = await page.waitForFunction(([key, id]) => {
  const saved = JSON.parse(localStorage.getItem(key) || "{}");
  return (saved.modules?.[id]?.seen || []).includes(3);
}, [STORAGE_KEY, first.id], { timeout: 5000 }).then(() => true, () => false);
check("swipe registra la slide raggiunta", swipeRecorded);

await page.keyboard.press("Escape");
await page.waitForFunction(() => document.querySelector("#viewer")?.hidden === true, null, { timeout: 5000 });
await page.locator(".brand").click();
await page.waitForSelector("#view-home:not([hidden])", { timeout: 5000 });

const moved = page.locator(`.dash-module[data-module-id="${first.id}"]`);
const movedPct = Number((await moved.locator(".dash-module-meter b").innerText()).replace("%", ""));
check("avanzamento registrato", movedPct > 0 && movedPct < 100, `${movedPct}%`);
check("stato in corso", await moved.locator(".dash-status-doing").count() === 1);
check("etichetta in corso", (await moved.locator(".dash-status").innerText()).trim() === "In corso");
check("azione Continua disponibile", await moved.locator('[data-action="continue"]').count() === 1);
check("ripresa mostra Continua con progressi", (await page.locator('#dash-resume [data-action="resume-continue"]').innerText()).includes("Continua"));
check("intestazione Bentornato con progressi", (await page.locator("#dash-greeting").innerText()).trim() === "Bentornato");
const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}"), STORAGE_KEY);
check("stato salvato con prefisso corretto", Array.isArray(stored?.modules?.[first.id]?.seen), JSON.stringify(stored).slice(0, 90));

await moved.locator('[data-action="override"]').click();
const done = page.locator(`.dash-module[data-module-id="${first.id}"]`);
check("override segna completato", await done.locator(".dash-status-done").count() === 1);
check("percentuale override 100", (await done.locator(".dash-module-meter b").innerText()).trim() === "100%");
check("azioni diventano Riapri", (await done.locator('[data-action="override"]').innerText()).trim() === "Riapri");
await done.locator('[data-action="override"]').click();
const reopened = page.locator(`.dash-module[data-module-id="${first.id}"]`);
check("override annullabile", await reopened.locator(".dash-status-done").count() === 0 && (await reopened.locator(".dash-module-meter b").innerText()).trim() !== "100%");

check("conferma azzeramento nascosta", await page.locator("#dash-confirm").isHidden());
await page.click("#dash-reset");
check("conferma in-page senza dialog nativo", await page.locator("#dash-confirm").isVisible() && dialogs.length === 0);
await page.click("#dash-confirm-no");
check("annullo conferma", await page.locator("#dash-confirm").isHidden());
await page.click("#dash-reset");
await page.click("#dash-confirm-yes");
check("azzeramento avanzamento", await page.locator("#dash-modules .dash-status-doing, #dash-modules .dash-status-done").count() === 0);
check("nessun dialog nativo usato", dialogs.length === 0, dialogs.join(" | "));

async function recordFromModule(index, count) {
  const mod = manifest.modules[index];
  const row = page.locator(`.dash-module[data-module-id="${mod.id}"]`);
  if (await row.locator(".dash-module-main").getAttribute("aria-expanded") !== "true") await row.locator(".dash-module-main").click();
  for (let i = 0; i < count; i++) {
    await row.locator(".dash-slide").nth(i).click();
    await page.waitForSelector("#viewer:not([hidden])", { timeout: 5000 });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("#viewer")?.hidden === true, null, { timeout: 5000 });
    await page.locator(".brand").click();
    await page.waitForSelector("#view-home:not([hidden])", { timeout: 5000 });
  }
}

await recordFromModule(1, 1);
await recordFromModule(2, 3);

await page.selectOption("#dash-sort-select", "progress");
const progressIds = await page.locator("#dash-modules .dash-module").evaluateAll((nodes) => nodes.slice(0, 3).map((n) => n.dataset.moduleId));
check("ordinamento per avanzamento", [first.id, second.id, third.id].every((id) => progressIds.includes(id)), progressIds.join(","));
await page.selectOption("#dash-sort-select", "course");
const courseIds = await page.locator("#dash-modules .dash-module").evaluateAll((nodes) => nodes.map((n) => n.dataset.moduleId));
check("ordinamento per corso", courseIds[0] === first.id, courseIds.slice(0, 3).join(","));

await page.fill("#dash-filter", "deontologico");
await page.waitForTimeout(120);
const filteredIds = await page.locator("#dash-modules .dash-module").evaluateAll((nodes) => nodes.map((n) => n.dataset.moduleId));
const filterToken = norm("deontologico");
const filteredValid = filteredIds.length >= 1 && filteredIds.length < expectedModules && filteredIds.every((id) => {
  const mod = manifest.modules.find((m) => m.id === id);
  return mod && haystack(mod).includes(filterToken);
});
check("filtro locale della dashboard", filteredValid, `${filteredIds.length} moduli: ${filteredIds.join(",")}`);
check("contatore filtrato", (await page.locator("#dash-count").innerText()).includes(`${filteredIds.length} moduli`));
await page.fill("#dash-filter", "");
await page.waitForTimeout(120);
check("filtro rimosso", await page.locator("#dash-modules .dash-module").count() === expectedModules);

await page.fill("#search-input", "vaccini");
await page.waitForTimeout(220);
const globalIds = await page.locator("#dash-modules .dash-module").evaluateAll((nodes) => nodes.map((n) => n.dataset.moduleId));
const globalToken = norm("vaccini");
const globalValid = globalIds.length >= 1 && globalIds.length < expectedModules && globalIds.every((id) => {
  const mod = manifest.modules.find((m) => m.id === id);
  return mod && haystack(mod).includes(globalToken);
});
check("ricerca globale filtra la dashboard", globalValid, `${globalIds.length} moduli: ${globalIds.join(",")}`);
await page.fill("#search-input", "");
await page.waitForTimeout(220);
check("ricerca globale ripristinata", await page.locator("#dash-modules .dash-module").count() === expectedModules);

const firstMain = page.locator(`.dash-module[data-module-id="${first.id}"] .dash-module-main`);
if (await firstMain.getAttribute("aria-expanded") === "true") await firstMain.click();
await firstMain.focus();
await page.keyboard.press("Enter");
check("Invio espande il modulo focalizzato", await firstMain.getAttribute("aria-expanded") === "true");
const moduleOrder = await page.locator("#dash-modules .dash-module").evaluateAll((nodes) => nodes.map((n) => n.dataset.moduleId));
const expectedNext = moduleOrder[moduleOrder.indexOf(first.id) + 1] || "";
await page.keyboard.press("ArrowRight");
const focusedId = await page.evaluate(() => document.activeElement?.closest(".dash-module")?.dataset.moduleId || "");
check("frecce navigano tra i moduli", focusedId === expectedNext, `${focusedId} vs ${expectedNext}`);
const reachedMain = page.locator(`.dash-module[data-module-id="${focusedId}"] .dash-module-main`);
if (await reachedMain.getAttribute("aria-expanded") === "true") await reachedMain.click();
await reachedMain.focus();
await page.keyboard.press("Enter");
check("Invio espande il modulo raggiunto", await reachedMain.getAttribute("aria-expanded") === "true");
await page.keyboard.press("Escape");
check("Escape chiude i dettagli", await reachedMain.getAttribute("aria-expanded") === "false");

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("#dash-modules .dash-module", { timeout: 15000 });
check("vista persistita dopo reload", await page.locator("#module-list").isVisible() && await page.locator("#lib-layout").isHidden());
check("progresso persistito dopo reload", await page.locator(`.dash-module[data-module-id="${second.id}"] .dash-status-doing`).count() === 1);
await page.click("#btn-map");
await page.waitForSelector("#lib-layout:not([hidden])", { timeout: 5000 });
check("ritorno alla libreria", await page.locator("#lib-layout").isVisible() && (await page.title()).includes("Libreria"));
check("libreria intatta", await page.locator(".lib-book").count() === expectedModules);

const migrationContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await migrationContext.addInitScript(([legacy, id]) => {
  localStorage.setItem(legacy, JSON.stringify({ modules: { [id]: { seen: [1, 2], last: 2 } } }));
}, [LEGACY_KEY, first.id]);
const migrationPage = await migrationContext.newPage();
watch(migrationPage, "migration", []);
await migrationPage.goto(`${BASE_URL}#/`, { waitUntil: "domcontentloaded" });
await migrationPage.waitForSelector("#lib-shelves .lib-book", { timeout: 15000 });
await migrationPage.click("#btn-list");
await migrationPage.waitForSelector("#dash-modules .dash-module", { timeout: 5000 });
const migrated = await migrationPage.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}"), STORAGE_KEY);
check("migrazione una tantum da STATE kanban", (migrated.modules?.[first.id]?.seen || []).includes(2), JSON.stringify(migrated).slice(0, 90));
const legacyAfter = await migrationPage.evaluate((key) => localStorage.getItem(key), LEGACY_KEY);
check("chiave legacy rimossa dopo migrazione", legacyAfter === null, String(legacyAfter).slice(0, 90));
check("migrazione conserva il progresso visibile", await migrationPage.locator(`.dash-module[data-module-id="${first.id}"] .dash-status-doing`).count() === 1);
await migrationPage.evaluate(([key, legacy, id]) => {
  localStorage.setItem(key, JSON.stringify({ modules: { [id]: { seen: [7], last: 7 } } }));
  localStorage.setItem(legacy, JSON.stringify({ modules: { [id]: { seen: [1, 2], last: 2 } } }));
}, [STORAGE_KEY, LEGACY_KEY, first.id]);
await migrationPage.reload({ waitUntil: "domcontentloaded" });
await migrationPage.waitForSelector("#module-list:not([hidden])", { timeout: 5000 });
await migrationPage.waitForSelector("#dash-modules .dash-module", { timeout: 5000 });
const precedence = await migrationPage.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}"), STORAGE_KEY);
check("prevale lo stato dashboard quando esistono entrambe le chiavi", (precedence.modules?.[first.id]?.seen || []).includes(7) && !(precedence.modules?.[first.id]?.seen || []).includes(2), JSON.stringify(precedence).slice(0, 90));
await migrationContext.close();

if (noPdf) {
  const noPdfContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await noPdfContext.addInitScript(([key, id]) => {
    localStorage.setItem(key, JSON.stringify({ modules: { [id]: { seen: [], last: null, override: "done" } } }));
  }, [STORAGE_KEY, noPdf.id]);
  const noPdfPage = await noPdfContext.newPage();
  watch(noPdfPage, "no-pdf", []);
  await noPdfPage.goto(`${BASE_URL}#/`, { waitUntil: "domcontentloaded" });
  await noPdfPage.waitForSelector("#lib-shelves .lib-book", { timeout: 15000 });
  await noPdfPage.click("#btn-list");
  await noPdfPage.waitForSelector("#dash-modules .dash-module", { timeout: 5000 });
  const resumeNoPdfText = await noPdfPage.locator("#dash-resume").innerText();
  check("ripresa ignora modulo senza pagine", !resumeNoPdfText.includes(noPdf.title), resumeNoPdfText.replace(/\n/g, " / "));
  await noPdfContext.close();
}

const tablet = await browser.newContext({ viewport: { width: 820, height: 1100 } });
const tabletPage = await tablet.newPage();
watch(tabletPage, "tablet", []);
await tabletPage.goto(`${BASE_URL}#/`, { waitUntil: "domcontentloaded" });
await tabletPage.waitForSelector("#lib-shelves .lib-book", { timeout: 15000 });
await tabletPage.click("#btn-list");
await tabletPage.waitForSelector("#dash-modules .dash-module", { timeout: 5000 });
const tabletMetrics = await tabletPage.locator("#module-list").evaluate((node) => ({
  overflowX: node.scrollWidth > node.clientWidth + 2,
  columns: getComputedStyle(node.querySelector(".dash-grid")).gridTemplateColumns.split(" ").length,
  stats: node.querySelectorAll(".dash-stat").length,
}));
check("tablet: nessun overflow orizzontale", !tabletMetrics.overflowX);
check("tablet: griglia a colonna singola", tabletMetrics.columns === 1, String(tabletMetrics.columns));
check("tablet: quattro statistiche", tabletMetrics.stats === 4);
await tablet.close();

const mobile = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
const mobilePage = await mobile.newPage();
const mobileDialogs = [];
watch(mobilePage, "mobile", mobileDialogs);
await mobilePage.goto(`${BASE_URL}#/`, { waitUntil: "domcontentloaded" });
await mobilePage.waitForSelector("#dash-modules .dash-module", { state: "attached", timeout: 15000 });
check("mobile: dashboard predefinita", await mobilePage.locator("#module-list").isVisible() && await mobilePage.locator("#lib-layout").isHidden());
check("mobile: titolo dashboard", (await mobilePage.title()).includes("Dashboard"));
const mobileMetrics = await mobilePage.locator("#module-list").evaluate((node) => ({
  width: node.getBoundingClientRect().width,
  overflowX: node.scrollWidth > node.clientWidth + 2,
  modules: node.querySelectorAll(".dash-module").length,
  stats: node.querySelectorAll(".dash-stat").length,
}));
check("mobile: dashboard visibile", mobileMetrics.width > 0);
check("mobile: nessun overflow orizzontale", !mobileMetrics.overflowX);
check("mobile: tutti i moduli", mobileMetrics.modules === expectedModules, `${mobileMetrics.modules}/${expectedModules}`);
check("mobile: quattro statistiche", mobileMetrics.stats === 4);
await mobile.close();

check("console pulita", results.console.length === 0, JSON.stringify(results.console));
check("nessun pageerror", results.pageErrors.length === 0, JSON.stringify(results.pageErrors));
check("nessuna richiesta fallita", results.failedRequests.length === 0, JSON.stringify(results.failedRequests));
check("nessun errore HTTP", results.httpErrors.length === 0, JSON.stringify(results.httpErrors));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`SUMMARY ${JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length })}`);
process.exit(failed.length ? 1 : 0);
