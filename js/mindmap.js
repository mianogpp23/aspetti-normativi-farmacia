/* mindmap.js — mappa mentale orizzontale generata dai dati del manifest.
   Radice → moduli → argomenti → slide. SVG + JS vanilla, nessuna libreria. */

import { $, norm, svgEl, clamp } from "./utils.js";
import { topicsOf, pagesOf, slideTitle } from "./data.js";

/* Colori pieni con contrasto AA per il testo bianco sulle pillole dei moduli. */
const PALETTE = [
  "#155E75", "#8A4B08", "#276749", "#5B3B8C",
  "#9B2C4F", "#6B5B12", "#0E6A6E", "#3D4A8A",
];

const LAYOUT = {
  width: 1400,
  x: { root: 34, module: 300, topic: 620, slide: 920 },
  w: { root: 198, module: 235, topic: 250, slide: 182 },
  h: { root: 78, module: 64, topic: 42, slide: 34 },
  gap: { module: 34, topic: 14, slide: 8, column: 18 },
  cols: { topic: 1, slide: 2 },
};

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const hexRgb = (hex) => {
  const v = String(hex).replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
};
function tint(hex, ratio = 0.9) {
  const [r, g, b] = hexRgb(hex);
  const mix = (c) => Math.round(c + (255 - c) * ratio);
  return `rgb(${mix(r)} ${mix(g)} ${mix(b)})`;
}
function shade(hex, ratio = 0.18) {
  const [r, g, b] = hexRgb(hex);
  const mix = (c) => Math.round(c * (1 - ratio));
  return `rgb(${mix(r)} ${mix(g)} ${mix(b)})`;
}

function h(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = String(v);
    else n.setAttribute(k, v === true ? "" : String(v));
  }
  if (text !== undefined) n.textContent = String(text);
  return n;
}

function cubic(x1, y1, x2, y2) {
  const dx = Math.max(48, (x2 - x1) * 0.48);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + dx).toFixed(1)} ${y1.toFixed(1)}, ${(x2 - dx).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function linkStroke(kind, color) {
  if (kind === "module") return color;
  if (kind === "topic") return color;
  return "#B9B5AA";
}
function linkWidth(kind) {
  if (kind === "module") return 3;
  if (kind === "topic") return 2.5;
  return 1.5;
}
function expandedLabel(n, expanded) {
  if (!n.expandable) return "";
  return expanded ? ". Espanso" : ". Compresso";
}
function expandedAttr(n, expanded) {
  if (!n.expandable) return null;
  return expanded ? "true" : "false";
}
function crumbLabel(n) {
  if (n.kind === "root") return "Mappa";
  if (n.kind === "slide") return `Slide ${n.data.n}`;
  return n.label;
}
function detailKicker(n) {
  if (n.kind === "root") return "Corso";
  if (n.kind === "module") return `Modulo M${String(n.data.mod.n).padStart(2, "0")}`;
  if (n.kind === "topic") return "Argomento";
  return "Slide";
}
function tooltipAction(n) {
  if (n.kind === "slide") return "Invio: apri la slide";
  if (n.expandable) return "Invio: apri/chiudi · Freccia destra: espandi";
  return "Invio: apri";
}
function primaryDistance(r, cr, dir) {
  if (dir === "right") return r.left - cr.right;
  if (dir === "left") return cr.left - r.right;
  if (dir === "down") return r.top - cr.bottom;
  return cr.top - r.bottom;
}

export function createMindMap({ stage, info, crumbs, controls, legend, onSlide, onOpenModule }) {
  const svg = $("#mind-links", stage);
  const world = $("#mind-world", stage);
  const nodesLayer = $("#mind-nodes", world);
  const sizer = $("#mind-sizer", stage);
  const tooltip = $("#mind-tooltip", stage);
  const live = $("#mind-live", stage);

  let mods = [];
  let manifest = null;
  let nodes = [];
  let links = [];
  let nodeByKey = new Map();
  let canvasHeight = 900;
  let renderToken = 0;
  let preSearchCollapsed = null;
  const pendingToggles = new Map();

  const state = {
    zoom: 1,
    query: "",
    focusKey: "root",
    selectedKey: "root",
    hoverKey: null,
    collapsed: new Set(),
    matches: new Set(),
  };

  const reducedMotion = () => reduced();
  const announce = (message) => { if (live) live.textContent = message; };

  /* ---------------- modello ---------------- */
  function makeNode(o) {
    const n = {
      ...o,
      search: norm([o.label, o.meta || "", o.keywords || ""].join(" ")),
      parent: o.parent || null,
      expandable: !!o.expandable,
      children: [],
    };
    if (n.parent) n.parent.children.push(n);
    return n;
  }

  function buildModel() {
    nodes = [];
    nodeByKey = new Map();
    links = [];

    let topicsTotal = 0;
    for (const m of mods) topicsTotal += topicsOf(m).length;
    const root = makeNode({
      key: "root", kind: "root", level: 1, parent: null,
      label: manifest?.course?.title || "Corso",
      meta: `${mods.length} moduli · ${manifest?.totals?.pages ?? 0} slide · ${topicsTotal} argomenti`,
      color: "#1F2933", expandable: true, data: {},
    });
    nodes.push(root);

    for (const [mi, mod] of mods.entries()) {
      const color = PALETTE[mi % PALETTE.length];
      const topics = topicsOf(mod) || [];
      const mNode = makeNode({
        key: `m:${mod.id}`, kind: "module", level: 2, parent: root,
        label: mod.label || mod.title,
        meta: `${topics.length} argomenti · ${pagesOf(mod)} slide`,
        color, expandable: true,
        data: { mod },
      });
      nodes.push(mNode);

      for (const [ti, topic] of topics.entries()) {
        const topicId = topic.id || `t${ti + 1}`;
        const pages = [];
        const seen = new Set();
        const from = Number(topic.from) || 1;
        const to = Math.max(from, Number(topic.to) || from);
        const declared = Number(topic.count) || (to - from + 1);
        const last = from + Math.max(declared, to - from + 1) - 1;
        for (let p = from; p <= last; p++) {
          if (p >= 1 && p <= pagesOf(mod) && !seen.has(p)) { seen.add(p); pages.push(p); }
        }
        const tNode = makeNode({
          key: `m:${mod.id}/t:${topicId}`,
          kind: "topic", level: 3, parent: mNode,
          label: topic.title || `Argomento ${ti + 1}`,
          meta: pages.length ? `p. ${from}–${to} · ${pages.length} slide` : "nessuna slide",
          keywords: [topic.keywords, ...(topic.subtopics || []).map((s) => s.title || s)].filter(Boolean).join(" "),
          color, expandable: pages.length > 0,
          data: { mod, topic, pages },
        });
        nodes.push(tNode);

        for (const n of pages) {
          nodes.push(makeNode({
            key: `m:${mod.id}/t:${topicId}/s:${n}`,
            kind: "slide", level: 4, parent: tNode,
            label: `Slide ${n} — ${slideTitle(mod, n)}`,
            meta: `pagina ${n} di ${pagesOf(mod)}`,
            color, expandable: false,
            data: { mod, topic, n },
          }));
        }
      }
    }

    for (const n of nodes) nodeByKey.set(n.key, n);
  }

  /* ---------------- visibilità e layout ---------------- */
  function isExpanded(n) { return n.expandable && !state.collapsed.has(n.key); }
  function visible(n) {
    let p = n.parent;
    while (p) { if (state.collapsed.has(p.key)) return false; p = p.parent; }
    return true;
  }

  function layout() {
    const vis = nodes.filter(visible);
    let moduleTop = 22;

    const modules = vis.filter((n) => n.kind === "module");
    for (const m of modules) {
      const topics = m.children.filter(visible);
      const colY = [0, 0];
      const groupTop = moduleTop;

      for (const [ti, t] of topics.entries()) {
        const slides = state.collapsed.has(t.key) ? [] : t.children.filter(visible);
        const slideRows = Math.max(1, Math.ceil(slides.length / LAYOUT.cols.slide));
        const slidesH = slides.length ? slideRows * LAYOUT.h.slide + (slideRows - 1) * LAYOUT.gap.slide : 0;
        const rowH = Math.max(LAYOUT.h.topic, slidesH);
        const col = ti % LAYOUT.cols.topic;

        t.x = LAYOUT.x.topic + col * (LAYOUT.w.topic + LAYOUT.gap.column);
        t.y = groupTop + colY[col];
        t.w = LAYOUT.w.topic;
        t.h = LAYOUT.h.topic;

        for (const [si, sl] of slides.entries()) {
          sl.x = LAYOUT.x.slide + (si % LAYOUT.cols.slide) * (LAYOUT.w.slide + LAYOUT.gap.slide);
          sl.y = t.y + Math.floor(si / LAYOUT.cols.slide) * (LAYOUT.h.slide + LAYOUT.gap.slide);
          sl.w = LAYOUT.w.slide;
          sl.h = LAYOUT.h.slide;
        }
        colY[col] += rowH + LAYOUT.gap.topic;
      }

      const groupH = Math.max(LAYOUT.h.module + 8, ...colY.map((v) => v - LAYOUT.gap.topic));
      m.x = LAYOUT.x.module;
      m.y = groupTop + Math.max(0, (groupH - LAYOUT.h.module) / 2);
      m.w = LAYOUT.w.module;
      m.h = LAYOUT.h.module;
      moduleTop += groupH + LAYOUT.gap.module;
    }

    const root = nodeByKey.get("root");
    const bottom = vis.reduce((a, n) => Math.max(a, (n.y || 0) + (n.h || 0)), 0);
    canvasHeight = Math.max(560, bottom + 34);
    root.x = LAYOUT.x.root;
    root.y = Math.max(22, (canvasHeight - LAYOUT.h.root) / 2);
    root.w = LAYOUT.w.root;
    root.h = LAYOUT.h.root;

    links = [];
    for (const n of vis) {
      if (!n.parent || !visible(n.parent)) continue;
      const p = n.parent;
      links.push({
        key: n.key,
        kind: n.kind,
        d: cubic(p.x + p.w, p.y + p.h / 2, n.x, n.y + n.h / 2),
        color: n.color,
      });
    }
  }

  /* ---------------- rendering ---------------- */
  function applyHighlight() {
    const active = state.hoverKey || (state.query ? state.selectedKey : null);
    const set = new Set();
    let cur = active ? nodeByKey.get(active) : null;
    while (cur) { set.add(cur.key); cur = cur.parent; }

    for (const el of nodesLayer.querySelectorAll(".mind-node")) {
      const inBranch = set.has(el.dataset.key);
      el.classList.toggle("is-lit", !!active && inBranch);
      el.classList.toggle("is-dim", !!active && !inBranch);
      el.classList.toggle("is-match", state.matches.has(el.dataset.key));
    }
    for (const path of svg.querySelectorAll(".mind-link")) {
      const inBranch = set.has(path.dataset.key);
      path.classList.toggle("is-lit", !!active && inBranch);
      path.classList.toggle("is-dim", !!active && !inBranch);
    }
  }

  function nodeContent(n) {
    const box = h("span", { class: "mind-node-inner" });
    if (n.expandable) box.appendChild(h("span", { class: "mind-caret", "aria-hidden": "true" }, isExpanded(n) ? "▾" : "▸"));

    if (n.kind === "root") {
      const t = h("span", { class: "mind-root-text" });
      t.appendChild(h("strong", {}, n.label));
      t.appendChild(h("small", {}, n.meta));
      box.appendChild(t);
    } else if (n.kind === "module") {
      const st = h("span", { class: "mind-mod-text" });
      st.appendChild(h("span", { class: "mind-mod-n" }, `M${String(n.data.mod.n).padStart(2, "0")}`));
      const tt = h("span", { class: "mind-mod-title" });
      tt.appendChild(h("strong", {}, n.label));
      tt.appendChild(h("small", {}, n.meta));
      st.appendChild(tt);
      box.appendChild(st);
    } else if (n.kind === "topic") {
      const st = h("span", { class: "mind-topic-text" });
      st.appendChild(h("strong", {}, n.label));
      st.appendChild(h("small", {}, n.meta));
      box.appendChild(st);
    } else {
      box.appendChild(h("span", { class: "mind-slide-n" }, String(n.data.n)));
      box.appendChild(h("span", { class: "mind-slide-title" }, n.label.replace(/^Slide \d+ — /, "")));
    }
    return box;
  }

  function render(opts = {}) {
    renderToken++;
    const token = renderToken;
    const prevFocus = state.focusKey;
    const entering = new Set(opts.entering || []);
    const expanded = isExpanded;

    world.style.width = `${LAYOUT.width}px`;
    world.style.height = `${canvasHeight}px`;
    sizer.style.width = `${LAYOUT.width * state.zoom}px`;
    sizer.style.height = `${canvasHeight * state.zoom}px`;
    world.style.transform = `scale(${state.zoom})`;
    svg.setAttribute("viewBox", `0 0 ${LAYOUT.width} ${canvasHeight}`);
    svg.setAttribute("width", LAYOUT.width);
    svg.setAttribute("height", canvasHeight);

    const paths = links.map((l) => svgEl("path", {
      d: l.d,
      class: `mind-link mind-link-${l.kind}`,
      "data-key": l.key,
      "data-kind": l.kind,
      fill: "none",
      stroke: linkStroke(l.kind, l.color),
      "stroke-width": linkWidth(l.kind),
      "stroke-linecap": "round",
    }));
    svg.replaceChildren(...paths);

    const els = nodes.filter(visible).map((n) => {
      const el = h("div", {
        class: `mind-node mind-node-${n.kind}${entering.has(n.key) && !reducedMotion() ? " is-entering" : ""}`,
        role: "treeitem",
        tabindex: n.key === prevFocus ? "0" : "-1",
        "aria-level": n.level,
        "aria-label": `${n.label}. ${n.meta}${expandedLabel(n, expanded(n))}`,
        "data-key": n.key,
        "data-kind": n.kind,
        "data-level": n.level,
        "data-expanded": expandedAttr(n, expanded(n)),
      });
      if (n.expandable) el.setAttribute("aria-expanded", expanded(n) ? "true" : "false");
      el.style.setProperty("--node-color", n.color);
      el.style.setProperty("--node-tint", tint(n.color, n.kind === "slide" ? 1 : 0.9));
      el.style.setProperty("--node-shade", shade(n.color));
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
      el.style.width = `${n.w}px`;
      el.style.height = `${n.h}px`;
      el.appendChild(nodeContent(n));
      return el;
    });
    nodesLayer.replaceChildren(...els);
    renderLegend();
    renderCrumbs();
    applyHighlight();

    if (!reducedMotion() && entering.size) {
      requestAnimationFrame(() => {
        if (token !== renderToken) return;
        for (const el of nodesLayer.querySelectorAll(".is-entering")) el.classList.remove("is-entering");
      });
    }
    const focusEl = nodesLayer.querySelector(`[data-key="${CSS.escape(prevFocus)}"]`);
    if (focusEl && document.activeElement?.closest?.(".mind-tree") === nodesLayer) {
      focusEl.focus({ preventScroll: true });
    }
  }

  function renderLegend() {
    if (!legend) return;
    const items = [];
    for (const [i, mod] of mods.entries()) {
      const b = h("button", {
        type: "button",
        class: "mind-lg",
        "data-key": `m:${mod.id}`,
        "aria-label": `Vai al modulo ${mod.title}`,
      });
      b.appendChild(h("span", { class: "mind-lg-dot" }));
      b.appendChild(h("span", { class: "mind-lg-n" }, `M${String(mod.n).padStart(2, "0")}`));
      b.appendChild(h("span", { class: "mind-lg-title" }, mod.label || mod.title));
      b.style.setProperty("--dot", PALETTE[i % PALETTE.length]);
      if (state.collapsed.has(`m:${mod.id}`)) b.classList.add("is-collapsed");
      items.push(b);
    }
    legend.replaceChildren(...items);
  }

  function renderCrumbs() {
    if (!crumbs) return;
    const chain = [];
    let cur = nodeByKey.get(state.selectedKey) || nodeByKey.get("root");
    while (cur) { chain.unshift(cur); cur = cur.parent; }
    const parts = [];
    for (const [i, n] of chain.entries()) {
      if (i) parts.push(h("span", { class: "mind-sep", "aria-hidden": "true" }, "/"));
      const b = h("button", {
        type: "button",
        class: "mind-crumb",
        "data-key": n.key,
        "aria-current": i === chain.length - 1 ? "page" : null,
      }, crumbLabel(n));
      parts.push(b);
    }
    crumbs.replaceChildren(...parts);
  }

  function showDetail(n) {
    if (!info) return;
    const card = h("div", { class: "mind-detail-card" });
    card.appendChild(h("p", { class: "mind-detail-kicker" }, detailKicker(n)));
    card.appendChild(h("h3", {}, n.label));
    card.appendChild(h("p", {}, n.meta));
    if (n.kind === "module" || n.kind === "topic" || n.kind === "slide") {
      const dl = h("dl");
      dl.appendChild(h("dt", {}, "Dispensa"));
      dl.appendChild(h("dd", {}, n.data.mod.title));
      if (n.kind !== "module") {
        dl.appendChild(h("dt", {}, "Argomento"));
        dl.appendChild(h("dd", {}, n.data.topic?.title || "Tutte le slide"));
      }
      if (n.kind === "slide") {
        dl.appendChild(h("dt", {}, "Pagina"));
        dl.appendChild(h("dd", {}, String(n.data.n)));
      }
      card.appendChild(dl);
      const action = h("button", {
        type: "button",
        class: "mind-detail-action",
        "data-action": n.kind === "slide" ? "open-slide" : "open-module",
      }, n.kind === "slide" ? "Apri la slide" : "Apri la vista modulo");
      card.appendChild(action);
    } else {
      card.appendChild(h("p", { class: "mind-detail-hint" }, "Seleziona un modulo per iniziare il percorso."));
    }
    info.replaceChildren(card);
  }

  /* ---------------- tooltip ---------------- */
  function showTooltip(n, target) {
    if (!tooltip || !n) return;
    tooltip.replaceChildren(
      h("b", {}, n.label),
      h("span", {}, n.meta),
      h("span", {}, tooltipAction(n))
    );
    tooltip.hidden = false;
    const sr = stage.getBoundingClientRect();
    const nr = target.getBoundingClientRect();
    const x = clamp(nr.left - sr.left + stage.scrollLeft + 12, 8, Math.max(8, LAYOUT.width * state.zoom - tooltip.offsetWidth - 8));
    const y = clamp(nr.top - sr.top + stage.scrollTop + nr.height + 8, 8, Math.max(8, canvasHeight * state.zoom - tooltip.offsetHeight - 8));
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }
  function hideTooltip() { if (tooltip) tooltip.hidden = true; }

  function setHover(key, target) {
    if (state.hoverKey === key) return;
    state.hoverKey = key;
    applyHighlight();
    const n = key ? nodeByKey.get(key) : null;
    if (n && target) showTooltip(n, target); else hideTooltip();
  }

  /* ---------------- espansione ---------------- */
  function descendants(n) {
    const out = [];
    const walk = (x) => {
      for (const c of x.children) { out.push(c); if (visible(c)) walk(c); }
    };
    walk(n);
    return out;
  }

  function commit(callback, entering = []) {
    const focusedKey = document.activeElement?.closest?.(".mind-node")?.dataset.key;
    callback();
    layout();
    render({ entering });
    if (focusedKey && !focusKey(focusedKey)) focusKey("root");
    showDetail(nodeByKey.get(state.selectedKey) || nodeByKey.get("root"));
  }

  function toggle(key, force) {
    const n = nodeByKey.get(key);
    if (!n?.expandable) return;
    const shouldExpand = typeof force === "boolean" ? force : !isExpanded(n);
    if (shouldExpand === isExpanded(n)) return;

    const leaving = shouldExpand ? [] : descendants(n).map((x) => x.key);
    const pending = pendingToggles.get(key);
    if (pending) clearTimeout(pending);
    pendingToggles.delete(key);
    if (shouldExpand) state.collapsed.delete(key); else state.collapsed.add(key);
    if (!reducedMotion() && leaving.length) {
      const token = renderToken;
      for (const el of nodesLayer.querySelectorAll(".mind-node")) {
        if (leaving.includes(el.dataset.key)) el.classList.add("is-leaving");
      }
      for (const p of svg.querySelectorAll(".mind-link")) {
        if (leaving.includes(p.dataset.key)) p.classList.add("is-leaving");
      }
      const timer = setTimeout(() => {
        if (token !== renderToken) return;
        pendingToggles.delete(key);
        commit(() => {}, []);
      }, 240);
      pendingToggles.set(key, timer);
    } else {
      commit(() => {}, shouldExpand ? descendants(n).map((x) => x.key) : []);
    }
    announce(`${n.label}: ${shouldExpand ? "espanso" : "compresso"}`);
  }

  function setAll(expanded) {
    const entering = [];
    if (expanded) {
      state.collapsed.clear();
      for (const n of nodes) if (n.kind !== "root") entering.push(n.key);
    } else {
      state.collapsed = new Set(nodes.filter((n) => n.expandable && n.kind !== "root").map((n) => n.key));
    }
    commit(() => {}, entering);
    announce(expanded ? "Tutti i nodi espansi" : "Tutti i nodi compressi");
  }

  function activate(n) {
    if (!n) return;
    state.selectedKey = n.key;
    state.focusKey = n.key;
    showDetail(n);
    renderCrumbs();
    if (n.kind === "slide") {
      onSlide?.(n.data.mod, n.data.n);
    } else {
      toggle(n.key);
    }
  }

  function focusKey(key) {
    const el = nodesLayer.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (!el) return false;
    state.focusKey = key;
    for (const x of nodesLayer.querySelectorAll(".mind-node")) x.setAttribute("tabindex", x === el ? "0" : "-1");
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }

  /* ---------------- navigazione geometrica ---------------- */
  function chooseSpatial(from, dir) {
    const current = nodesLayer.querySelector(`[data-key="${CSS.escape(from.key)}"]`);
    if (!current) return null;
    const cr = current.getBoundingClientRect();
    const tol = 2;
    const cands = Array.from(nodesLayer.querySelectorAll(".mind-node"))
      .filter((el) => el !== current && (el.checkVisibility ? el.checkVisibility() : true))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => {
        if (dir === "right") return r.left >= cr.right - tol;
        if (dir === "left") return r.right <= cr.left + tol;
        if (dir === "down") return r.top >= cr.bottom - tol;
        return r.bottom <= cr.top + tol;
      });

    if (!cands.length) return null;
    const perpStart = (r) => dir === "left" || dir === "right" ? r.top : r.left;
    const perpEnd = (r) => dir === "left" || dir === "right" ? r.bottom : r.right;
    const curStart = dir === "left" || dir === "right" ? cr.top : cr.left;
    const curEnd = dir === "left" || dir === "right" ? cr.bottom : cr.right;
    const center = (r) => dir === "left" || dir === "right" ? (r.top + r.bottom) / 2 : (r.left + r.right) / 2;
    const curCenter = dir === "left" || dir === "right" ? (cr.top + cr.bottom) / 2 : (cr.left + cr.right) / 2;
    const overlap = (r) => Math.min(perpEnd(r), curEnd) - Math.max(perpStart(r), curStart) > 0;
    const aligned = cands.filter((c) => overlap(c.r));
    const pool = aligned.length ? aligned : cands;
    pool.sort((a, b) => {
      const sa = primaryDistance(a.r, cr, dir), sb = primaryDistance(b.r, cr, dir);
      const oa = overlap(a.r) ? 0 : 1, ob = overlap(b.r) ? 0 : 1;
      if (aligned.length && oa !== ob) return oa - ob;
      const offA = Math.abs(center(a.r) - curCenter), offB = Math.abs(center(b.r) - curCenter);
      return (sa + 2 * offA) - (sb + 2 * offB);
    });
    return pool[0].el.dataset.key;
  }

  function onTreeKeydown(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target?.closest?.(".mind-node");
    if (!target) return;
    const n = nodeByKey.get(target.dataset.key);
    if (!n) return;
    state.focusKey = n.key;

    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(n); return; }
    if (e.key === "Escape") {
      e.preventDefault();
      if (state.query) { setQuery(""); return; }
      if (isExpanded(n)) { toggle(n.key, false); return; }
      if (n.parent && focusKey(n.parent.key)) return;
      stage.focus?.({ preventScroll: true });
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      if (n.expandable && e.key === "ArrowRight" && !isExpanded(n)) { e.preventDefault(); toggle(n.key, true); return; }
      if (n.expandable && e.key === "ArrowLeft" && isExpanded(n)) { e.preventDefault(); toggle(n.key, false); return; }
      const next = chooseSpatial(n, e.key === "ArrowRight" ? "right" : "left");
      if (next) { e.preventDefault(); focusKey(next); }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const next = chooseSpatial(n, e.key === "ArrowDown" ? "down" : "up");
      if (next) { e.preventDefault(); focusKey(next); }
    }
  }

  /* ---------------- zoom e pan ---------------- */
  function setZoom(next, anchorX, anchorY) {
    const z = clamp(next, 0.55, 1.7);
    if (Math.abs(z - state.zoom) < 0.001) return;
    const rect = stage.getBoundingClientRect();
    const ax = anchorX === undefined ? rect.left + rect.width / 2 : anchorX;
    const ay = anchorY === undefined ? rect.top + rect.height / 2 : anchorY;
    const localX = ax - rect.left + stage.scrollLeft;
    const localY = ay - rect.top + stage.scrollTop;
    const ratio = z / state.zoom;
    state.zoom = z;
    world.style.transform = `scale(${z})`;
    sizer.style.width = `${LAYOUT.width * z}px`;
    sizer.style.height = `${canvasHeight * z}px`;
    stage.scrollLeft = localX * ratio - (ax - rect.left);
    stage.scrollTop = localY * ratio - (ay - rect.top);
    hideTooltip();
    announce(`Zoom ${Math.round(z * 100)}%`);
  }

  function resetView() {
    state.zoom = 1;
    world.style.transform = "scale(1)";
    sizer.style.width = `${LAYOUT.width}px`;
    sizer.style.height = `${canvasHeight}px`;
    stage.scrollTo({ top: 0, left: 0, behavior: reducedMotion() ? "auto" : "smooth" });
    hideTooltip();
    announce("Vista ripristinata");
  }

  function initInteractions() {
    nodesLayer.addEventListener("pointerover", (e) => {
      const el = e.target.closest?.(".mind-node");
      if (el && el.contains(e.relatedTarget)) return;
      if (el) setHover(el.dataset.key, el);
    });
    nodesLayer.addEventListener("pointerout", (e) => {
      const el = e.target.closest?.(".mind-node");
      if (el && el.contains(e.relatedTarget)) return;
      setHover(null);
    });
    nodesLayer.addEventListener("focusin", (e) => {
      const el = e.target.closest?.(".mind-node");
      if (!el) return;
      state.focusKey = el.dataset.key;
      for (const x of nodesLayer.querySelectorAll(".mind-node")) x.setAttribute("tabindex", x === el ? "0" : "-1");
      state.selectedKey = el.dataset.key;
      showDetail(nodeByKey.get(el.dataset.key));
      renderCrumbs();
      setHover(el.dataset.key, el);
    });
    nodesLayer.addEventListener("focusout", () => setHover(null));
    nodesLayer.addEventListener("click", (e) => {
      const el = e.target.closest?.(".mind-node");
      if (!el) return;
      const n = nodeByKey.get(el.dataset.key);
      if (!n) return;
      if (n.kind === "slide") { state.selectedKey = n.key; showDetail(n); onSlide?.(n.data.mod, n.data.n); }
      else activate(n);
    });
    nodesLayer.addEventListener("keydown", onTreeKeydown);

    stage.addEventListener("wheel", (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(state.zoom * (e.deltaY < 0 ? 1.08 : 0.93), e.clientX, e.clientY);
    }, { passive: false });

    let pan = null;
    stage.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return;
      if (e.button !== 0 && e.button !== 1) return;
      if (e.target.closest?.(".mind-node, button, a, input")) return;
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add("is-panning");
    });
    stage.addEventListener("pointermove", (e) => {
      if (!pan || e.pointerId !== pan.id) return;
      stage.scrollLeft = pan.sl - (e.clientX - pan.x);
      stage.scrollTop = pan.st - (e.clientY - pan.y);
    });
    const endPan = (e) => {
      if (!pan || (e.pointerId !== undefined && e.pointerId !== pan.id)) return;
      pan = null;
      stage.classList.remove("is-panning");
    };
    stage.addEventListener("pointerup", endPan);
    stage.addEventListener("pointercancel", endPan);

    controls?.addEventListener("click", (e) => {
      const b = e.target.closest?.("button[data-action]");
      if (!b) return;
      const action = b.dataset.action;
      if (action === "expand-all") setAll(true);
      if (action === "collapse-all") setAll(false);
      if (action === "in") setZoom(state.zoom * 1.15);
      if (action === "out") setZoom(state.zoom * 0.87);
      if (action === "reset") resetView();
    });

    legend?.addEventListener("click", (e) => {
      const b = e.target.closest?.(".mind-lg");
      if (!b) return;
      const key = b.dataset.key;
      state.selectedKey = key;
      if (state.collapsed.has(key)) toggle(key, true);
      focusKey(key);
      showDetail(nodeByKey.get(key));
      renderCrumbs();
    });

    crumbs?.addEventListener("click", (e) => {
      const b = e.target.closest?.(".mind-crumb");
      if (!b) return;
      const n = nodeByKey.get(b.dataset.key);
      if (!n) return;
      state.selectedKey = n.key;
      showDetail(n);
      focusKey(n.key);
      renderCrumbs();
    });

    info?.addEventListener("click", (e) => {
      const b = e.target.closest?.("button[data-action]");
      if (!b) return;
      const n = nodeByKey.get(state.selectedKey);
      if (!n) return;
      if (b.dataset.action === "open-slide") onSlide?.(n.data.mod, n.data.n);
      if (b.dataset.action === "open-module") onOpenModule?.(n.data.mod, n.kind === "topic" ? n.data.topic?.id : null);
    });
  }

  /* ---------------- ricerca ---------------- */
  function setQuery(value) {
    const q = norm(value);
    if (q === state.query && !(q === "" && preSearchCollapsed)) return;
    if (!q && state.query && preSearchCollapsed) {
      state.collapsed = new Set(preSearchCollapsed);
      preSearchCollapsed = null;
    }
    if (q && !state.query) preSearchCollapsed = new Set(state.collapsed);
    state.query = q;
    state.matches = new Set();
    if (q) {
      for (const n of nodes) {
        if (!n.search.includes(q)) continue;
        state.matches.add(n.key);
        let p = n.parent;
        while (p) { state.collapsed.delete(p.key); p = p.parent; }
      }
    }
    layout();
    render();
    if (q) {
      const first = nodes.find((n) => state.matches.has(n.key));
      if (first) {
        state.selectedKey = first.key;
        focusKey(first.key);
        showDetail(first);
      }
      announce(`${state.matches.size} risultati per "${value}"`);
    }
  }

  initInteractions();

  return {
    build(list, data) {
      mods = list || [];
      manifest = data;
      state.collapsed = new Set();
      state.matches = new Set();
      state.query = "";
      state.zoom = 1;
      state.focusKey = "root";
      state.selectedKey = "root";
      preSearchCollapsed = null;
      buildModel();
      layout();
      render();
      showDetail(nodeByKey.get("root"));
    },
    layout() { layout(); render(); },
    reset() { state.collapsed = new Set(); state.query = ""; preSearchCollapsed = null; layout(); render(); resetView(); },
    setQuery,
    setAll,
    focusKey,
    get state() {
      return {
        zoom: state.zoom,
        query: state.query,
        collapsed: Array.from(state.collapsed),
        expandedCount: nodes.filter((n) => isExpanded(n)).length,
        nodeCount: nodes.length,
        visibleCount: nodes.filter(visible).length,
        matches: state.matches.size,
        selectedKey: state.selectedKey,
      };
    },
  };
}
