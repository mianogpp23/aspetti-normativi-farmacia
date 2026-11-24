#!/usr/bin/env node
/* check-links.js — verifica che route, asset e PDF citati dal sito siano raggiungibili. */

const BASE = (process.env.BASE_URL || "http://127.0.0.1:8093/").replace(/\/?$/, "/");
const pad4 = (n) => String(n).padStart(4, "0");

async function head(url) {
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { headers: { Range: "bytes=0-0" }, redirect: "follow" });
    }
    await res.arrayBuffer();
    return res.status;
  } catch (err) {
    return `ERRORE: ${String(err)}`;
  }
}

function extractPaths(html) {
  const out = new Set();
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(re)) {
    const value = match[1].trim();
    if (!value || value.startsWith("#") || /^(https?:|data:|mailto:|tel:|javascript:)/i.test(value)) continue;
    out.add(value.split(/[?#]/)[0]);
  }
  return [...out];
}

async function main() {
  const failures = [];
  const page = await fetch(BASE);
  const html = await page.text();
  if (!page.ok) failures.push(`${page.status} ${BASE}`);
  console.log(`HTML ${page.status} ${BASE}`);

  const manifestRes = await fetch(new URL("content/manifest.json", BASE));
  const manifest = await manifestRes.json();
  console.log(`MANIFEST ${manifestRes.status} moduli=${manifest.modules?.length || 0}`);

  const urls = new Set(["content/manifest.json", "content/search.json", ...extractPaths(html)]);
  for (const mod of manifest.modules || []) {
    if (mod.pdf?.path) urls.add(mod.pdf.path);
    const pages = mod.pdf?.pages || 0;
    if (pages > 0) {
      urls.add(`content/thumbs/${mod.id}/${pad4(1)}.webp`);
      urls.add(`content/slides/${mod.id}/${pad4(1)}.webp`);
      urls.add(`content/slides/${mod.id}/${pad4(pages)}.webp`);
    }
  }

  let checked = 0;
  for (const path of urls) {
    const url = new URL(path, BASE).href;
    const status = await head(url);
    checked++;
    if (typeof status !== "number" || status >= 400) failures.push(`${status} ${url}`);
  }

  const routes = ["", "#/", `#/m/${manifest.modules?.[0]?.id || ""}`];
  for (const view of ["carosello", "sommario", "esagoni", "cerca", "libreria", "dashboard"]) {
    routes.push(`#/?vista=${view}`);
  }
  for (const hash of routes) {
    const url = new URL(hash, BASE).href;
    const res = await fetch(url);
    if (!res.ok) failures.push(`${res.status} ${url}`);
    await res.arrayBuffer();
  }

  console.log(`CHECKED ${checked} risorse · ${failures.length} errori`);
  for (const f of failures) console.log(`FAIL ${f}`);
  if (failures.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
