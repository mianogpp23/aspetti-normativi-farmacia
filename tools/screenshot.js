#!/usr/bin/env node
/* screenshot.js — catture viewport 1440x900 e 360x800 della mappa mentale. */

import { mkdir } from "node:fs/promises";
import { BASE_URL, OUT_DIR, CHROMIUM, results } from "./verify-env.js";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "/tmp/verify-tools/node_modules/playwright-core/index.mjs");

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  desktop.on("pageerror", (err) => results.pageErrors.push(`desktop: ${String(err)}`));
  await desktop.goto(BASE_URL, { waitUntil: "networkidle", timeout: 60000 });
  await desktop.waitForSelector('#mind-nodes .mind-node[data-kind="module"]', { timeout: 20000 });
  await desktop.screenshot({ path: `${OUT_DIR}/desktop-1440x900.png`, fullPage: false });
  console.log(`SCREENSHOT ${OUT_DIR}/desktop-1440x900.png`);

  const mobile = await browser.newPage({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  mobile.on("pageerror", (err) => results.pageErrors.push(`mobile: ${String(err)}`));
  await mobile.goto(BASE_URL, { waitUntil: "networkidle", timeout: 60000 });
  await mobile.waitForSelector("#module-list", { state: "attached", timeout: 20000 });
  await mobile.click("#btn-list");
  await mobile.waitForSelector('#mind-nodes .mind-node[data-kind="module"]', { state: "attached", timeout: 20000 });
  await mobile.waitForTimeout(300);
  await mobile.screenshot({ path: `${OUT_DIR}/mobile-360x800.png`, fullPage: false });
  console.log(`SCREENSHOT ${OUT_DIR}/mobile-360x800.png`);
} finally {
  await browser.close();
}

if (results.pageErrors.length) {
  console.error(results.pageErrors.join("\n"));
  process.exitCode = 1;
}
