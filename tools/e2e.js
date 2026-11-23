#!/usr/bin/env node
/* e2e.js — verifica reale della mappa mentale con Chromium/Playwright. */

import { mkdir } from "node:fs/promises";
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
    if (msg.type() === "error" || msg.type() === "warning") results.console.push(`${label}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => results.pageErrors.push(`${label}: ${String(err)}`));
  page.on("requestfailed", (req) => {
    const err = req.failure()?.errorText || "failed";
    if (!benignAbort(req.url(), err)) results.failedRequests.push(`${label} ${req.url()} :: ${err}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) results.httpErrors.push(`${label} ${res.status()} ${res.url()}`);
  });
}

const pad4 = (n) => String(n).padStart(4, "0");
function topicsFor(mod, pages) {
  if (mod.topics?.length) return mod.topics;
  if (pages > 0) return [{ from: 1, to: pages }];
  return [];
}
function expectedCounts(manifest) {
  const modules = manifest.modules || [];
  const topicCount = modules.reduce((sum, mod) => {
    const pages = mod.pdf?.pages || 0;
    return sum + topicsFor(mod, pages).length;
  }, 0);
  const slides = new Set();
  for (const mod of modules) {
    const pages = mod.pdf?.pages || 0;
    for (const topic of topicsFor(mod, pages)) {
      for (let n = topic.from; n <= Math.min(topic.to, pages); n++) slides.add(`${mod.id}:${pad4(n)}`);
    }
  }
  return { modules: modules.length, topics: topicCount, slides: slides.size };
}

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  watch(page, "desktop");

  const response = await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 60000 });
  check("homepage HTTP 200", response?.status() === 200, `status=${response?.status()}`);
  await page.waitForSelector('#mind-nodes .mind-node[data-kind="module"]', { timeout: 20000 });

  const manifest = await (await fetch(new URL("content/manifest.json", BASE_URL))).json();
  const expected = expectedCounts(manifest);

  const title = await page.title();
  check("titolo mappa mentale", /mappa mentale/i.test(title), title);
  const bodyText = await page.locator("body").innerText();
  check("nessun testo universo/sunburst", !/universo|sunburst|pianeta/i.test(bodyText));
  const srOnlyHidden = await page.evaluate(() => Array.from(document.querySelectorAll("#mind-stage .sr-only")).every((el) => {
    const r = el.getBoundingClientRect();
    return getComputedStyle(el).position === "absolute" && r.width <= 1 && r.height <= 1;
  }));
  check("testi screen reader nascosti", srOnlyHidden);

  const moduleCount = await page.locator('#mind-nodes .mind-node[data-kind="module"]').count();
  const topicCount = await page.locator('#mind-nodes .mind-node[data-kind="topic"]').count();
  const slideCount = await page.locator('#mind-nodes .mind-node[data-kind="slide"]').count();
  check("tutti i moduli espansi", moduleCount === expected.modules, `${moduleCount}/${expected.modules}`);
  check("tutti gli argomenti espansi", topicCount === expected.topics, `${topicCount}/${expected.topics}`);
  check("tutte le slide visibili", slideCount === expected.slides, `${slideCount}/${expected.slides}`);
  check("radice presente", await page.locator('#mind-nodes .mind-node[data-kind="root"]').count() === 1);

  const colors = await page.locator('#mind-nodes .mind-node[data-kind="module"]').evaluateAll((els) => {
    return [...new Set(els.map((el) => getComputedStyle(el).backgroundColor))];
  });
  check("8 colori modulo distinti", colors.length === 8, `colori=${colors.length}`);

  const widths = await page.evaluate(() => {
    const root = document.querySelector('#mind-links .mind-link-module');
    const topic = document.querySelector('#mind-links .mind-link-topic');
    return [root && getComputedStyle(root).strokeWidth, topic && getComputedStyle(topic).strokeWidth];
  });
  check("connettori 3px e 2.5px", widths[0] === "3px" && widths[1] === "2.5px", widths.join(" / "));

  const firstModule = page.locator('#mind-nodes .mind-node[data-kind="module"]').first();
  await firstModule.hover();
  await page.waitForTimeout(120);
  const tooltipVisible = await page.locator("#mind-tooltip").isVisible();
  const tooltipText = tooltipVisible ? await page.locator("#mind-tooltip").innerText() : "";
  check("tooltip al passaggio del mouse", tooltipVisible && tooltipText.trim().length > 0);
  await page.mouse.move(1420, 14);
  await page.waitForTimeout(120);

  await page.fill("#search-input", "stupefacenti");
  await page.waitForTimeout(350);
  const matches = await page.locator('#mind-nodes .mind-node.is-match').count();
  check("ricerca con auto-espansione", matches > 0, `match=${matches}`);
  check("ricerca: messaggio live", /risultati/i.test(await page.locator("#mind-live").innerText()));
  await page.fill("#search-input", "");
  await page.waitForTimeout(300);
  check("ricerca azzerata", await page.locator('#mind-nodes .mind-node.is-match').count() === 0);

  await firstModule.click();
  await firstModule.click();
  await page.waitForTimeout(400);
  const rapidTopics = await page.locator('#mind-nodes .mind-node[data-kind="topic"]').count();
  check("doppio click rapido conserva il secondo toggle", rapidTopics === expected.topics, `${rapidTopics}/${expected.topics}`);
  await firstModule.click();
  await page.waitForTimeout(350);
  const afterCollapse = await page.locator('#mind-nodes .mind-node[data-kind="topic"]').count();
  check("clic su modulo comprime il ramo", afterCollapse < expected.topics, `${afterCollapse}/${expected.topics}`);
  await page.click('#mind-controls button[data-action="expand-all"]');
  await page.waitForTimeout(350);
  check("espandi tutto", await page.locator('#mind-nodes .mind-node[data-kind="topic"]').count() === expected.topics);
  await page.click('#mind-controls button[data-action="collapse-all"]');
  await page.waitForTimeout(350);
  check("comprimi tutto", await page.locator('#mind-nodes .mind-node[data-kind="topic"]').count() === 0);
  await page.click('#mind-controls button[data-action="expand-all"]');
  await page.waitForTimeout(350);

  await firstModule.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
  const focusKind = await page.evaluate(() => document.activeElement?.dataset?.kind);
  check("frecce: navigazione geometrica", focusKind === "topic", `kind=${focusKind}`);
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-expanded") === "false", null, { timeout: 3000 }).catch(() => {});
  const topicCollapsed = await page.evaluate(() => document.activeElement?.getAttribute("aria-expanded"));
  check("frecce: sinistra comprime l'argomento", topicCollapsed === "false", `expanded=${topicCollapsed}`);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(100);
  check("frecce: ritorno al modulo", (await page.evaluate(() => document.activeElement?.dataset?.kind)) === "module");
  await page.click('#mind-controls button[data-action="expand-all"]');
  await page.waitForTimeout(350);

  await page.focus("#mind-stage");
  await page.waitForTimeout(400);
  const zoomBefore = await page.locator("#mind-world").evaluate((el) => getComputedStyle(el).transform);
  await page.click('#mind-controls button[data-action="in"]');
  await page.waitForTimeout(100);
  const zoomAfter = await page.locator("#mind-world").evaluate((el) => getComputedStyle(el).transform);
  check("zoom con pulsante", zoomBefore !== zoomAfter);
  await page.click('#mind-controls button[data-action="reset"]');
  await page.waitForTimeout(500);

  await page.mouse.move(900, 500);
  const scrollBefore = await page.locator("#mind-stage").evaluate((el) => el.scrollTop);
  await page.mouse.wheel(0, 340);
  await page.waitForTimeout(200);
  const scrollAfter = await page.locator("#mind-stage").evaluate((el) => el.scrollTop);
  const zoomPlain = await page.locator("#mind-world").evaluate((el) => getComputedStyle(el).transform);
  check("rotella normale scorre senza zoom", scrollAfter > scrollBefore && zoomPlain === zoomBefore, `scroll=${scrollBefore}→${scrollAfter}`);

  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -260);
  await page.keyboard.up("Control");
  await page.waitForTimeout(150);
  const zoomCtrl = await page.locator("#mind-world").evaluate((el) => getComputedStyle(el).transform);
  check("Ctrl + rotella zooma", zoomCtrl !== zoomPlain);
  await page.click('#mind-controls button[data-action="reset"]');
  await page.waitForTimeout(500);

  const empty = await page.evaluate(() => {
    const stage = document.querySelector("#mind-stage");
    const r = stage.getBoundingClientRect();
    for (let y = r.top + 12; y < r.bottom - 12; y += 8) {
      for (let x = r.left + r.width - 12; x > r.left + 12; x -= 8) {
        const hit = document.elementFromPoint(x, y);
        if (hit && stage.contains(hit) && !hit.closest(".mind-node, button, a, input")) return { x, y };
      }
    }
    return null;
  });
  check("punto libero per il pan", Boolean(empty));
  if (empty) {
    const panBefore = await page.locator("#mind-stage").evaluate((el) => el.scrollLeft);
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.down();
    await page.mouse.move(empty.x - 140, empty.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    const panAfter = await page.locator("#mind-stage").evaluate((el) => el.scrollLeft);
    check("pan trascinando lo sfondo", panAfter > panBefore, `scrollLeft=${panBefore}→${panAfter}`);
    await page.click('#mind-controls button[data-action="reset"]');
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: `${OUT_DIR}/desktop-1440x900.png`, fullPage: false });
  check("screenshot desktop", true, `${OUT_DIR}/desktop-1440x900.png`);

  const firstSlide = page.locator('#mind-nodes .mind-node[data-kind="slide"]').first();
  const slideNumber = await firstSlide.locator(".mind-slide-n").innerText();
  await firstSlide.click();
  await page.waitForSelector("#viewer:not([hidden])", { timeout: 10000 });
  check("drill-down slide nel visore", (await page.locator("#vw-cur").innerText()).trim() === slideNumber.trim(), `slide=${slideNumber}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  check("visore chiuso con Esc", await page.locator("#viewer").isHidden());

  const firstWithSlides = manifest.modules.find((mod) => (mod.pdf?.pages || 0) > 0);
  await page.evaluate((id) => { location.hash = `#/m/${id}`; }, firstWithSlides.id);
  await page.waitForSelector("#view-module:not([hidden])", { timeout: 10000 });
  check("route modulo", (await page.locator("#mod-title").innerText()).length > 0);
  check("vista modulo con slide", await page.locator(".slide-card").count() > 0);

  await page.evaluate(() => { location.hash = "#/"; });
  await page.waitForSelector("#view-home:not([hidden])", { timeout: 10000 });
  await page.click("#btn-list");
  check("vista elenco", await page.locator("#module-list").isVisible() && await page.locator("#mind-layout").isHidden());
  await page.click("#btn-list");
  check("ritorno alla mappa", await page.locator("#mind-layout").isVisible() && await page.locator("#module-list").isHidden());

  const mobile = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mobilePage = await mobile.newPage();
  watch(mobilePage, "mobile");
  await mobilePage.goto(BASE_URL, { waitUntil: "networkidle", timeout: 60000 });
  await mobilePage.waitForSelector("#module-list", { state: "attached", timeout: 20000 });
  check("mobile: elenco predefinito", await mobilePage.locator("#module-list").isVisible() && await mobilePage.locator("#mind-layout").isHidden());
  check("mobile elenco: nessun overflow", await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await mobilePage.click("#btn-list");
  await mobilePage.waitForSelector('#mind-nodes .mind-node[data-kind="module"]', { state: "attached", timeout: 20000 });
  check("mobile: mappa come opzione", await mobilePage.locator("#mind-layout").isVisible() && await mobilePage.locator("#module-list").isHidden());
  check("mobile mappa: nessun overflow", await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await mobilePage.waitForTimeout(300);
  await mobilePage.screenshot({ path: `${OUT_DIR}/mobile-360x800.png`, fullPage: false });
  check("screenshot mobile", true, `${OUT_DIR}/mobile-360x800.png`);

  check("console pulita", results.console.length === 0, results.console.slice(0, 3).join(" | "));
  check("nessun pageerror", results.pageErrors.length === 0, results.pageErrors.slice(0, 3).join(" | "));
  check("nessuna richiesta fallita", results.failedRequests.length === 0, results.failedRequests.slice(0, 3).join(" | "));
  check("nessun HTTP 4xx/5xx", results.httpErrors.length === 0, results.httpErrors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
}

const failed = results.filter((r) => r.ok === false);
console.log(`SUMMARY ${JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length })}`);
if (failed.length) process.exitCode = 1;
