/* e2e.js — verifica reale della board Kanban della vista elenco con Chromium/Playwright. */

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
const firstTitle = manifest.modules[0].title;
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const dialogs = [];
watch(page, "board", dialogs);

await page.goto(`${BASE_URL}#/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#lib-shelves .lib-book", { timeout: 15000 });

check("titolo iniziale della libreria", (await page.title()).includes("Libreria"), await page.title());
check("descrizione aggiornata", (await page.locator('meta[name="description"]').getAttribute("content")).includes("board"));
check("vecchia vista elenco rimossa", await page.locator(".ml-card").count() === 0);
check("selettore vista presente", await page.locator("#view-switch button").count() === 2);
check("predefinita desktop: libreria", await page.locator("#lib-layout").isVisible() && await page.locator("#module-list").isHidden());

await page.click("#btn-list");
await page.waitForSelector("#module-list:not([hidden])", { timeout: 5000 });
check("elenco ora è una board", await page.locator("#kb-board").isVisible());
check("libreria nascosta", await page.locator("#lib-layout").isHidden());
check("titolo della board", (await page.title()).includes("Board"), await page.title());
check("stato premuto del selettore", await page.locator("#btn-list").getAttribute("aria-pressed") === "true" && await page.locator("#btn-map").getAttribute("aria-pressed") === "false");

const labels = await page.locator(".kb-column-name").allInnerTexts();
check("tre colonne con etichette corrette", JSON.stringify(labels) === JSON.stringify(["Da iniziare", "In corso", "Completati"]), labels.join(" | "));
const columnStyle = await page.locator(".kb-column").evaluateAll((nodes) => nodes.map((n) => ({
  status: n.dataset.status,
  dot: getComputedStyle(n.querySelector(".kb-dot")).backgroundColor,
  bg: getComputedStyle(n).backgroundColor,
  radius: getComputedStyle(n).borderTopLeftRadius,
})));
check("pallini delle colonne", JSON.stringify(columnStyle.map((c) => c.dot)) === JSON.stringify(["rgb(156, 163, 175)", "rgb(194, 87, 26)", "rgb(47, 111, 107)"]), columnStyle.map((c) => c.dot).join(" | "));
check("sfondo colonne #EFEDE6", columnStyle.every((c) => c.bg === "rgb(239, 237, 230)"));
check("colonne arrotondate", columnStyle.every((c) => c.radius === "18px"));

const cardCount = await page.locator("#kb-board .kb-card").count();
check("una card per modulo", cardCount === expectedModules, `${cardCount}/${expectedModules}`);
const articleCards = await page.locator("#kb-board .kb-card").evaluateAll((nodes) => nodes.every((n) => n.tagName === "ARTICLE"));
check("card semantica article", articleCards);
check("nessuna card interamente link", await page.locator("#kb-board a").count() === 0);

const first = page.locator('.kb-card[data-module-n="1"]');
const cardStyle = await first.evaluate((n) => {
  const s = getComputedStyle(n);
  return { border: s.borderLeftColor, bg: s.backgroundColor, shadow: s.boxShadow, edge: s.borderTopColor };
});
check("barra modulo dalla palette", cardStyle.border === "rgb(21, 94, 117)", cardStyle.border);
check("card bianca", cardStyle.bg === "rgb(255, 255, 255)", cardStyle.bg);
check("bordo #E3E0D6", cardStyle.edge === "rgb(227, 224, 214)", cardStyle.edge);
check("nessuna ombra pesante", cardStyle.shadow === "none", cardStyle.shadow);
check("card con titolo e contatori", (await first.locator(".kb-title").innerText()) === firstTitle && /\d+ argomenti · \d+ pagine/.test(await first.locator(".kb-meta").innerText()));
const bar = first.locator("progress.kb-bar");
check("progress bar con etichetta", await bar.count() === 1 && (await bar.getAttribute("aria-label")).includes("Avanzamento"));
check("percentuale a destra", (await first.locator(".kb-bar-pct").innerText()).trim() === "0%");
check("stato iniziale da iniziare", await first.getAttribute("data-status") === "todo");
check("live region presente", await page.locator("#kb-live[aria-live=\"polite\"]").count() === 1);

await first.locator(".kb-card-main").click();
check("click espande la card", await first.locator(".kb-card-main").getAttribute("aria-expanded") === "true");
check("dettagli con argomenti", await first.locator(".kb-topic").count() > 0);
check("dettagli con slide", await first.locator(".kb-slide").count() > 0);

await first.locator(".kb-slide").first().click();
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
await page.waitForFunction((id) => {
  const saved = JSON.parse(localStorage.getItem("farmacista:v1:kanban") || "{}");
  return (saved.modules?.[id]?.seen || []).includes(3);
}, manifest.modules[0].id, { timeout: 5000 });
check("swipe registra la slide raggiunta", true);
await page.keyboard.press("Escape");
await page.waitForFunction(() => document.querySelector("#viewer")?.hidden === true, null, { timeout: 5000 });
await page.locator(".brand").click();
await page.waitForSelector("#view-home:not([hidden])", { timeout: 5000 });

const moved = page.locator('.kb-card[data-module-n="1"]');
const movedPct = Number((await moved.locator(".kb-bar-pct").innerText()).replace("%", ""));
check("avanzamento registrato", movedPct > 0 && movedPct < 100, `${movedPct}%`);
check("card passa in corso", await moved.getAttribute("data-status") === "doing");
check("etichetta in corso", (await moved.locator(".kb-state").innerText()).trim() === "In corso");
check("azione Continua disponibile", await moved.locator('[data-action="continue"]').count() === 1);
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("farmacista:v1:kanban") || "{}"));
check("stato salvato con prefisso corretto", Array.isArray(stored?.modules?.[manifest.modules[0].id]?.seen), JSON.stringify(stored).slice(0, 80));

await moved.locator('[data-action="override"]').click();
const done = page.locator('.kb-card[data-module-n="1"]');
check("override segna completato", await done.getAttribute("data-status") === "done");
check("percentuale override 100", (await done.locator(".kb-bar-pct").innerText()).trim() === "100%");
check("azioni diventano Riapri", (await done.locator('[data-action="override"]').innerText()).trim() === "Riapri");
await done.locator('[data-action="override"]').click();
const reopened = page.locator('.kb-card[data-module-n="1"]');
check("override annullabile", await reopened.getAttribute("data-status") === "doing" && (await reopened.locator(".kb-bar-pct").innerText()).trim() !== "100%");

check("conferma azzeramento nascosta", await page.locator("#kb-confirm").isHidden());
await page.click("#kb-reset");
check("conferma in-page senza dialog nativo", await page.locator("#kb-confirm").isVisible() && dialogs.length === 0);
await page.click("#kb-confirm-no");
check("annullo conferma", await page.locator("#kb-confirm").isHidden());
await page.click("#kb-reset");
await page.click("#kb-confirm-yes");
check("azzeramento progressi", await page.locator('#kb-board .kb-card[data-status="doing"]').count() === 0 && await page.locator('#kb-board .kb-card[data-status="done"]').count() === 0);
check("nessun dialog nativo usato", dialogs.length === 0, dialogs.join(" | "));

async function recordFromCard(n, count) {
  const card = page.locator(`.kb-card[data-module-n="${n}"]`);
  if (await card.locator(".kb-card-main").getAttribute("aria-expanded") !== "true") {
    await card.locator(".kb-card-main").click();
  }
  for (let i = 0; i < count; i++) {
    await card.locator(".kb-slide").nth(i).click();
    await page.waitForSelector("#viewer:not([hidden])", { timeout: 5000 });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("#viewer")?.hidden === true, null, { timeout: 5000 });
    await page.locator(".brand").click();
    await page.waitForSelector("#view-home:not([hidden])", { timeout: 5000 });
  }
}

await recordFromCard(2, 1);
await recordFromCard(3, 3);

await page.selectOption("#kb-sort-select", "progress");
const doingByProgress = await page.locator('.kb-column[data-status="doing"] .kb-card').evaluateAll((nodes) => nodes.map((n) => n.dataset.moduleN));
check("ordinamento per avanzamento", doingByProgress[0] === "3", doingByProgress.join(","));
await page.selectOption("#kb-sort-select", "course");
const doingByCourse = await page.locator('.kb-column[data-status="doing"] .kb-card').evaluateAll((nodes) => nodes.map((n) => n.dataset.moduleN));
check("ordinamento per corso", doingByCourse[0] === "2", doingByCourse.join(","));

await page.fill("#kb-filter", "deontologico");
await page.waitForTimeout(120);
check("filtro locale della board", await page.locator("#kb-board .kb-card").count() === 1, `${await page.locator("#kb-board .kb-card").count()} card`);
check("colonne vuote nascoste", await page.locator(".kb-column").count() === 1);
check("contatore filtrato", (await page.locator("#kb-count").innerText()).includes("1 moduli mostrati"));
await page.fill("#kb-filter", "");
await page.waitForTimeout(120);
check("filtro rimosso", await page.locator("#kb-board .kb-card").count() === expectedModules);

await page.fill("#search-input", "vaccini");
await page.waitForTimeout(220);
const globalMatches = await page.locator("#kb-board .kb-card").count();
check("ricerca globale filtra la board", globalMatches >= 1 && globalMatches < expectedModules, `${globalMatches} card`);
await page.fill("#search-input", "");
await page.waitForTimeout(220);
check("ricerca globale ripristinata", await page.locator("#kb-board .kb-card").count() === expectedModules);

const main1 = page.locator('.kb-card[data-module-n="1"] .kb-card-main');
if (await main1.getAttribute("aria-expanded") === "true") await main1.click();
await main1.focus();
await page.keyboard.press("Enter");
check("Invio espande la card focalizzata", await main1.getAttribute("aria-expanded") === "true");
const boardOrder = await page.locator("#kb-board .kb-card").evaluateAll((nodes) => nodes.map((n) => n.dataset.moduleN));
const expectedNext = boardOrder[boardOrder.indexOf("1") + 1] || "";
await page.keyboard.press("ArrowRight");
const focusedN = await page.evaluate(() => document.activeElement?.closest(".kb-card")?.dataset.moduleN || "");
check("frecce navigano tra le card", focusedN === expectedNext, `${focusedN} vs ${expectedNext}`);
await page.keyboard.press("Enter");
const reachedMain = page.locator(`.kb-card[data-module-n="${focusedN}"] .kb-card-main`);
check("Invio espande la card raggiunta", await reachedMain.getAttribute("aria-expanded") === "true");
await page.keyboard.press("Escape");
check("Escape chiude i dettagli", await reachedMain.getAttribute("aria-expanded") === "false");

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("#kb-board .kb-card", { timeout: 15000 });
check("vista persistita dopo reload", await page.locator("#module-list").isVisible() && await page.locator("#lib-layout").isHidden());
check("progresso persistito dopo reload", await page.locator('.kb-card[data-module-n="2"]').getAttribute("data-status") === "doing");
await page.click("#btn-map");
await page.waitForSelector("#lib-layout:not([hidden])", { timeout: 5000 });
check("ritorno alla libreria", await page.locator("#lib-layout").isVisible() && (await page.title()).includes("Libreria"));
check("libreria intatta", await page.locator(".lib-book").count() === expectedModules);

const mobile = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
const mobilePage = await mobile.newPage();
const mobileDialogs = [];
watch(mobilePage, "mobile", mobileDialogs);
await mobilePage.goto(`${BASE_URL}#/`, { waitUntil: "domcontentloaded" });
await mobilePage.waitForSelector("#kb-board .kb-card", { state: "attached", timeout: 15000 });
check("mobile: board predefinita", await mobilePage.locator("#module-list").isVisible() && await mobilePage.locator("#lib-layout").isHidden());
check("mobile: titolo board", (await mobilePage.title()).includes("Board"));
const mobileMetrics = await mobilePage.locator("#module-list").evaluate((node) => ({
  width: node.getBoundingClientRect().width,
  overflowX: node.scrollWidth > node.clientWidth + 2,
  cards: node.querySelectorAll(".kb-card").length,
  columns: node.querySelectorAll(".kb-column").length,
}));
check("mobile: board visibile", mobileMetrics.width > 0);
check("mobile: nessun overflow orizzontale", !mobileMetrics.overflowX);
check("mobile: tutti i moduli", mobileMetrics.cards === expectedModules, `${mobileMetrics.cards}/${expectedModules}`);
check("mobile: colonne impilate", mobileMetrics.columns === 3, `${mobileMetrics.columns} colonne`);

check("console pulita", results.console.length === 0, JSON.stringify(results.console));
check("nessun pageerror", results.pageErrors.length === 0, JSON.stringify(results.pageErrors));
check("nessuna richiesta fallita", results.failedRequests.length === 0, JSON.stringify(results.failedRequests));
check("nessun errore HTTP", results.httpErrors.length === 0, JSON.stringify(results.httpErrors));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`SUMMARY ${JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length })}`);
process.exit(failed.length ? 1 : 0);
