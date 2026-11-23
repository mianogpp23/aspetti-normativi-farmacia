#!/usr/bin/env node
/* screenshot.js — catture viewport 1440x900, 768x1024 e 360x800 della libreria. */

import { mkdir } from "node:fs/promises";
import { BASE_URL, OUT_DIR, CHROMIUM, results } from "./verify-env.js";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "/tmp/verify-tools/node_modules/playwright-core/index.mjs");

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const shots = [
  { name: "desktop-1440x900.png", width: 1440, height: 900, mobile: false },
  { name: "tablet-768x1024.png", width: 768, height: 1024, mobile: false },
  { name: "mobile-360x800.png", width: 360, height: 800, mobile: true },
];

try {
  for (const shot of shots) {
    const page = await browser.newPage({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: 1,
      isMobile: shot.mobile,
      hasTouch: shot.mobile,
    });
    page.on("pageerror", (err) => results.pageErrors.push(`${shot.name}: ${String(err)}`));
    await page.goto(`${BASE_URL}#/`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector("#lib-shelves .lib-book", { state: "attached", timeout: 20000 });
    if (shot.mobile) {
      await page.click("#btn-list");
      await page.waitForSelector("#lib-layout:not([hidden])", { state: "attached", timeout: 20000 });
    }
    await page.waitForSelector("#lib-shelves .lib-book", { state: "visible", timeout: 20000 });
    if (shot.name.startsWith("desktop")) {
      await page.locator("#lib-shelves .lib-book").first().click();
    }
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT_DIR}/${shot.name}`, fullPage: false });
    console.log(`SCREENSHOT ${OUT_DIR}/${shot.name}`);
    await page.close();
  }
} finally {
  await browser.close();
}

if (results.pageErrors.length) {
  console.error(results.pageErrors.join("\n"));
  process.exitCode = 1;
}
