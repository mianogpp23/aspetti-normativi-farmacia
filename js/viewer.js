/* viewer.js — lettura full-screen delle slide */

import { $, clamp, toast } from "./utils.js";
import { pagesOf, slideUrl, slideTitle, topicAt, pdfPageUrl } from "./data.js";

let opened = false;
let mod = null;
let n = 1;
let cache = new Map();
let lastFocus = null;
let zoom = false;

const els = {};
function init() {
  els.viewer = $("#viewer");
  els.img = $("#vw-img");
  els.stage = $("#vw-stage");
  els.mod = $("#vw-mod");
  els.topic = $("#vw-topic");
  els.cur = $("#vw-cur");
  els.total = $("#vw-total");
  els.title = $("#vw-title");
  els.range = $("#vw-range");
  els.prev = $("#vw-prev");
  els.next = $("#vw-next");
  els.zoom = $("#vw-zoom");
  els.pdf = $("#vw-pdf");
  els.fallback = $("#vw-fallback");
  els.fallbackText = $("#vw-fallback-text");
  els.fallbackPdf = $("#vw-fallback-pdf");
  els.close = $("#vw-close");
  bind();
}

function bind() {
  els.close.addEventListener("click", close);
  els.prev.addEventListener("click", () => goto(n - 1));
  els.next.addEventListener("click", () => goto(n + 1));
  els.zoom.addEventListener("click", toggleZoom);
  els.range.addEventListener("input", () => goto(Number(els.range.value)));
  els.viewer.addEventListener("click", (e) => {
    if (e.target === els.viewer || e.target === els.stage) close();
  });

  document.addEventListener("keydown", (e) => {
    if (!opened) return;
    switch (e.key) {
      case "Escape": e.preventDefault(); close(); break;
      case "ArrowRight": case "PageDown": case " ": e.preventDefault(); goto(n + 1); break;
      case "ArrowLeft": case "PageUp": e.preventDefault(); goto(n - 1); break;
      case "Home": e.preventDefault(); goto(1); break;
      case "End": e.preventDefault(); goto(pagesOf(mod)); break;
      case "+": case "=": e.preventDefault(); setZoom(true); break;
      case "-": e.preventDefault(); setZoom(false); break;
      default: break;
    }
  });

  // swipe / tap laterali
  let sx = 0, sy = 0, swiping = false;
  els.stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && zoom) return;
    swiping = true; sx = e.clientX; sy = e.clientY;
  });
  els.stage.addEventListener("pointerup", (e) => {
    if (!swiping) return;
    swiping = false;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      if (dx < 0) goto(n + 1); else goto(n - 1);
    }
  });
}

export function open(m, page = 1) {
  if (!els.viewer) init();
  if (!pagesOf(m)) { toast("Questo modulo non contiene slide"); return; }
  if (!opened) lastFocus = document.activeElement;
  mod = m;
  opened = true;
  els.viewer.hidden = false;
  document.body.style.overflow = "hidden";
  els.mod.textContent = `${String(m.n).padStart(2, "0")} · ${m.label || m.title}`;
  els.total.textContent = String(pagesOf(m));
  els.range.max = String(pagesOf(m));
  goto(clamp(page, 1, pagesOf(m)), true);
  els.close.focus({ preventScroll: true });
}

export function close() {
  if (!opened) return;
  opened = false;
  els.viewer.hidden = true;
  document.body.style.overflow = "";
  setZoom(false);
  if (lastFocus?.focus) lastFocus.focus({ preventScroll: true });
  // Navigate back to home view
  if (location.hash.startsWith("#/m/")) {
    location.hash = "#/";
  }
}

export function goto(page, force = false) {
  if (!mod) return;
  const total = pagesOf(mod);
  const p = clamp(Math.round(page), 1, total);
  if (!force && p === n && els.img.src) return;
  n = p;

  const t = topicAt(mod, n);
  els.topic.textContent = t ? t.title : "";
  els.cur.textContent = String(n);
  els.title.textContent = slideTitle(mod, n) || `Slide ${n}`;
  els.range.value = String(n);
  els.range.style.setProperty("--fill", `${((n - 1) / Math.max(1, total - 1)) * 100}%`);
  els.prev.disabled = n <= 1;
  els.next.disabled = n >= total;
  els.pdf.href = pdfPageUrl(mod, n);
  els.pdf.title = `Apri pagina ${n} nel PDF originale`;

  const src = slideUrl(mod.id, n);
  setZoom(false);

  if (cache.has(src)) {
    if (cache.get(src)) showImage(src);
    else showFallback();
  } else {
    els.img.classList.add("is-loading");
    els.img.hidden = false;
    els.fallback.hidden = true;
    const probe = new Image();
    probe.onload = () => { cache.set(src, true); if (opened) showImage(src); };
    probe.onerror = () => { cache.set(src, false); if (opened && slideUrl(mod.id, n) === src) showFallback(); };
    probe.src = src;
    if (els.img.getAttribute("src") !== src) els.img.removeAttribute("src");
  }

  // prefetch adiacenti
  [n + 1, n + 2, n - 1].forEach((k) => {
    if (k >= 1 && k <= total) {
      const s = slideUrl(mod.id, k);
      if (!cache.has(s)) {
        const im = new Image();
        im.onload = () => cache.set(s, true);
        im.onerror = () => cache.set(s, false);
        im.src = s;
      }
    }
  });
}

function showImage(src) {
  els.fallback.hidden = true;
  els.img.hidden = false;
  els.img.onload = () => els.img.classList.remove("is-loading");
  els.img.onerror = () => showFallback();
  els.img.src = src;
  if (els.img.complete) els.img.classList.remove("is-loading");
}

function showFallback() {
  els.img.hidden = true;
  els.img.classList.remove("is-loading");
  els.fallback.hidden = false;
  els.fallbackText.textContent = `L'anteprima della slide ${n} non è disponibile: la pagina resta leggibile dal PDF originale.`;
  els.fallbackPdf.href = pdfPageUrl(mod, n);
}

function setZoom(on) {
  zoom = on;
  els.viewer.classList.toggle("is-zoom", on);
  els.zoom.setAttribute("aria-pressed", String(on));
}

function toggleZoom() { setZoom(!zoom); }

export const isOpen = () => opened;
export const current = () => ({ mod, n });
