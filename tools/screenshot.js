/* screenshot.js — catture viewport della dashboard: desktop, tablet e mobile. */

import { mkdir } from "node:fs/promises";
import { BASE_URL, OUT_DIR, CHROMIUM } from "./verify-env.js";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "/tmp/verify-tools/node_modules/playwright-core/index.mjs");

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] });
const shots = [
  { name: "desktop-1440x900.png", width: 1440, height: 900, mobile: false },
  { name: "tablet-820x1100.png", width: 820, height: 1100, mobile: false },
  { name: "mobile-360x800.png", width: 360, height: 800, mobile: true },
];

for (const shot of shots) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    isMobile: shot.mobile,
    hasTouch: shot.mobile,
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}#/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#dash-modules .dash-module", { state: "attached", timeout: 15000 });
  await page.evaluate(() => {
    localStorage.setItem("farmacista:v1:view", "list");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#dash-modules .dash-module", { timeout: 15000 });
  await page.screenshot({ path: `${OUT_DIR}/${shot.name}` });
  console.log(`SHOT ${OUT_DIR}/${shot.name} ${shot.width}x${shot.height}`);
  await context.close();
}

await browser.close();
