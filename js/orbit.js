/* orbit.js — mappa radiale interattiva (sostituisce la vecchia mappa orbitale) */

import { svgEl, clamp } from "./utils.js";
import { moduleStats, pagesOf } from "./data.js";

const TAU = Math.PI * 2;
const PALETTE = [
  { a: "#ff6b4a", b: "#ff9a3c", glow: "rgba(255,107,74,.34)" },
  { a: "#ff4fa3", b: "#ff7ad9", glow: "rgba(255,79,163,.32)" },
  { a: "#7c5cff", b: "#b07cff", glow: "rgba(124,92,255,.32)" },
  { a: "#2f8cff", b: "#46d3ff", glow: "rgba(47,140,255,.32)" },
  { a: "#00bfa6", b: "#4be3c2", glow: "rgba(0,191,166,.30)" },
  { a: "#35c759", b: "#a3e635", glow: "rgba(53,199,89,.28)" },
  { a: "#f59e0b", b: "#ffd166", glow: "rgba(245,158,11,.30)" },
  { a: "#ef476f", b: "#ff7b54", glow: "rgba(239,71,111,.30)" },
  { a: "#06b6d4", b: "#67e8f9", glow: "rgba(6,182,212,.30)" },
  { a: "#8b5cf6", b: "#22d3ee", glow: "rgba(139,92,246,.28)" },
];

function colorFor(i) {
  return PALETTE[i % PALETTE.length];
}

function shortLabel(title, max = 44) {
  const t = String(title || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function nodeRadius(pages, minP, maxP, compact) {
  const minR = compact ? 30 : 36;
  const maxR = compact ? 44 : 54;
  if (maxP <= minP) return (minR + maxR) / 2;
  const t = (pages - minP) / (maxP - minP);
  return minR + t * (maxR - minR);
}

function clearEl(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeSvgIconPeople() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const c = document.createElementNS(svg.namespaceURI, "circle");
  c.setAttribute("cx", "8");
  c.setAttribute("cy", "5.4");
  c.setAttribute("r", "2.7");
  c.setAttribute("fill", "none");
  c.setAttribute("stroke", "currentColor");
  c.setAttribute("stroke-width", "1.35");
  const p = document.createElementNS(svg.namespaceURI, "path");
  p.setAttribute("d", "M2.6 13.2c.6-2.5 2.8-3.9 5.4-3.9s4.8 1.4 5.4 3.9");
  p.setAttribute("fill", "none");
  p.setAttribute("stroke", "currentColor");
  p.setAttribute("stroke-width", "1.35");
  p.setAttribute("stroke-linecap", "round");
  svg.append(c, p);
  return svg;
}

function estimateLabelLines(text, labelW, fontSize) {
  const avgChar = fontSize * 0.58;
  const maxChars = Math.max(6, Math.floor((labelW - 20) / avgChar));
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  let lines = 1;
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) {
      line = next;
    } else if (line) {
      lines += 1;
      line = word;
    } else {
      line = word;
    }
  }
  return Math.min(3, Math.max(1, lines));
}

function footRadiusForNode(nodeR, labelW, labelH, gap) {
  const halfW = labelW / 2;
  const down = nodeR + gap + labelH;
  return Math.sqrt(halfW * halfW + down * down);
}

function ringCountFor(n) {
  if (n <= 8) return 1;
  if (n <= 14) return 2;
  if (n <= 22) return 3;
  return 4;
}

function distributeToRings(items, coreR) {
  const n = items.length;
  if (n === 0) return { rings: [], maxFoot: coreR };
  const maxFoot = Math.max(...items.map((it) => it.footR));
  const minRingR = coreR + maxFoot + 18;
  const ringGap = Math.max(86, maxFoot * 1.25);
  const ringCount = ringCountFor(n);
  const caps = [];
  let capSum = 0;
  for (let i = 0; i < ringCount; i += 1) {
    const r = minRingR + i * ringGap;
    const cap = Math.max(4, Math.floor((TAU * r) / (maxFoot * 2 + 14)));
    caps.push(cap);
    capSum += cap;
  }
  // Scale caps down to n while keeping at least 3 on non-empty rings
  while (capSum > n && capSum > ringCount * 3) {
    let maxIdx = 0;
    for (let i = 1; i < caps.length; i += 1) if (caps[i] > caps[maxIdx]) maxIdx = i;
    if (caps[maxIdx] <= 3) break;
    caps[maxIdx] -= 1;
    capSum -= 1;
  }
  // If not enough capacity, extend outer ring
  while (capSum < n) {
    caps[caps.length - 1] += 1;
    capSum += 1;
  }

  const rings = [];
  let cursor = 0;
  for (let i = 0; i < ringCount; i += 1) {
    const count = Math.min(caps[i], n - cursor);
    if (count <= 0) continue;
    rings.push({ radius: minRingR + i * ringGap, count, offset: i * 0.37 });
    cursor += count;
  }
  if (cursor < n && rings.length) rings[rings.length - 1].count += n - cursor;
  return { rings, maxFoot };
}

function assignRingPositions(items, rings) {
  let idx = 0;
  for (const ring of rings) {
    const step = TAU / ring.count;
    for (let j = 0; j < ring.count && idx < items.length; j += 1) {
      const angle = -Math.PI / 2 + ring.offset + j * step;
      const it = items[idx];
      it.ringR = ring.radius;
      it.homeAngle = angle;
      it.x = Math.cos(angle) * ring.radius;
      it.y = Math.sin(angle) * ring.radius;
      idx += 1;
    }
  }
}

function resolveCollisions(items, coreR, worldHalfW, worldHalfH) {
  const pad = 10;
  const corePad = coreR + 26;
  const iterations = 120;
  for (let iter = 0; iter < iterations; iter += 1) {
    let moved = false;
    for (let i = 0; i < items.length; i += 1) {
      const a = items[i];
      // Keep away from core
      let da = Math.hypot(a.x, a.y) || 0.001;
      const minA = corePad + a.footR;
      if (da < minA) {
        const push = (minA - da) / da;
        a.x += a.x * push;
        a.y += a.y * push;
        da = minA;
        moved = true;
      }
      // Soft pull to ring radius
      const ringTarget = a.ringR || da;
      const dr = da - ringTarget;
      if (Math.abs(dr) > 2) {
        const pull = dr * 0.018 / da;
        a.x -= a.x * pull;
        a.y -= a.y * pull;
      }
    }
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const minDist = a.footR + b.footR + pad;
        if (dist < minDist) {
          if (dist < 0.001) {
            const ang = (i * 2.399963 + j * 0.7);
            dx = Math.cos(ang);
            dy = Math.sin(ang);
            dist = 1;
          }
          const overlap = (minDist - dist) / 2;
          const ux = dx / dist;
          const uy = dy / dist;
          a.x -= ux * overlap;
          a.y -= uy * overlap;
          b.x += ux * overlap;
          b.y += uy * overlap;
          moved = true;
        }
      }
    }
    // Bounds: keep label/node within stage at scale 1
    for (const a of items) {
      const margin = 10;
      const minX = -worldHalfW + a.footR + margin;
      const maxX = worldHalfW - a.footR - margin;
      const minY = -worldHalfH + a.footR + margin;
      const maxY = worldHalfH - a.footR - margin;
      if (a.x < minX) { a.x = minX; moved = true; }
      if (a.x > maxX) { a.x = maxX; moved = true; }
      if (a.y < minY) { a.y = minY; moved = true; }
      if (a.y > maxY) { a.y = maxY; moved = true; }
    }
    if (!moved && iter > 20) break;
  }
}

export function createInfoPanel(box, onOpen) {
  const hint = box.querySelector(".oi-hint");
  const body = box.querySelector(".oi-body");
  function show(mod) {
    const stats = moduleStats(mod);
    const topics = (mod.topics || []).slice(0, 4);
    const c = colorFor((mod.n || 1) - 1);
    hint.hidden = true;
    body.hidden = false;
    box.classList.add("is-open");
    clearEl(body);

    const eyebrow = make("p", "oi-eyebrow");
    const dot = make("span", "oi-dot");
    dot.style.setProperty("--dot-a", c.a);
    dot.style.setProperty("--dot-b", c.b);
    eyebrow.append(dot, document.createTextNode(`Modulo ${String(mod.n).padStart(2, "0")}`));

    const title = make("h3", "oi-title", mod.title);
    body.append(eyebrow, title);

    if (mod.lecturers?.length) {
      const people = make("p", "oi-people");
      people.append(makeSvgIconPeople());
      const span = make("span", "", mod.lecturers.join(" · "));
      people.appendChild(span);
      body.appendChild(people);
    }

    const tags = make("div", "oi-tags");
    tags.appendChild(make("span", "oi-tag", stats.pages ? `${stats.pages} pagine` : "senza PDF"));
    if (stats.topics) tags.appendChild(make("span", "oi-tag", `${stats.topics} argomenti`));
    tags.appendChild(make("span", "oi-tag", mod.has_slides ? "slide disponibili" : "contenuto non slide"));
    body.appendChild(tags);

    if (topics.length) {
      const topicsWrap = make("div", "oi-topics");
      for (const t of topics) {
        const btn = make("button", "oi-topic");
        btn.type = "button";
        btn.dataset.topic = t.id;
        const b = make("b", "", String(t.from).padStart(2, "0"));
        const span = make("span", "", t.title);
        btn.append(b, span);
        btn.addEventListener("click", () => onOpen(mod, btn.dataset.topic));
        topicsWrap.appendChild(btn);
      }
      body.appendChild(topicsWrap);
    }

    const cta = make("button", "btn btn-primary oi-cta", "Apri modulo");
    cta.type = "button";
    cta.addEventListener("click", () => onOpen(mod));
    body.appendChild(cta);
  }
  function reset() {
    hint.hidden = false;
    body.hidden = true;
    clearEl(body);
    box.classList.remove("is-open");
  }
  return { show, reset };
}

export function createOrbit({ stage, info, onOpen, infoPanel }) {
  stage.classList.add("rm-stage");
  clearEl(stage);

  const bg = make("div", "rm-bg");
  bg.setAttribute("aria-hidden", "true");
  bg.append(make("div", "rm-bg-grid"), make("div", "rm-bg-glow rm-bg-glow-a"), make("div", "rm-bg-glow rm-bg-glow-b"));

  const viewport = make("div", "rm-viewport");
  viewport.setAttribute("aria-label", "Mappa interattiva dei moduli");
  const world = make("div", "rm-world");
  const svg = svgEl("svg", { class: "rm-svg", "aria-hidden": "true" });
  const nodesLayer = make("div", "rm-nodes");
  const core = make("button", "rm-core");
  core.type = "button";
  core.setAttribute("aria-label", "Apri panoramica corso");
  core.append(make("span", "rm-core-ring"), make("span", "rm-core-ring rm-core-ring-2"));
  const coreInner = make("span", "rm-core-inner");
  coreInner.append(
    make("span", "rm-core-kicker", "Percorso formativo"),
    make("span", "rm-core-title", "Farmacista"),
    make("span", "rm-core-sub", "aspetti normativi"),
    make("span", "rm-core-meta", ""),
  );
  core.appendChild(coreInner);
  world.append(svg, nodesLayer, core);
  viewport.appendChild(world);

  const hud = make("div", "rm-hud");
  hud.setAttribute("aria-hidden", "true");
  const hudA = make("div", "rm-hud-chip");
  hudA.append(make("span", "rm-hud-dot"), document.createTextNode("Trascina per ruotare"));
  const hudB = make("div", "rm-hud-chip");
  hudB.append(make("span", "rm-hud-dot rm-hud-dot-b"), document.createTextNode("Rotella per zoom"));
  hud.append(hudA, hudB);

  const zoomWrap = make("div", "rm-zoom");
  zoomWrap.setAttribute("aria-label", "Controlli zoom mappa");
  const zoomIn = make("button", "rm-zoom-btn", "+");
  zoomIn.type = "button";
  zoomIn.dataset.zoom = "in";
  zoomIn.setAttribute("aria-label", "Zoom avanti");
  const zoomOut = make("button", "rm-zoom-btn", "−");
  zoomOut.type = "button";
  zoomOut.dataset.zoom = "out";
  zoomOut.setAttribute("aria-label", "Zoom indietro");
  const zoomReset = make("button", "rm-zoom-btn rm-zoom-reset", "↺");
  zoomReset.type = "button";
  zoomReset.dataset.zoom = "reset";
  zoomReset.setAttribute("aria-label", "Reimposta vista");
  zoomWrap.append(zoomIn, zoomOut, zoomReset);

  stage.append(bg, viewport, hud, zoomWrap);

  const coreMeta = core.querySelector(".rm-core-meta");
  const zoomBtns = [zoomIn, zoomOut, zoomReset];

  let modules = [];
  let nodes = [];
  let activeId = null;
  let W = 0;
  let H = 0;
  let cx = 0;
  let cy = 0;
  let rotation = -Math.PI / 2;
  let scale = 1;
  let targetRotation = rotation;
  let targetScale = scale;
  let raf = 0;
  let dragging = false;
  let dragPointer = null;
  let dragStart = null;
  let moved = 0;
  let pinch = null;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MIN_SCALE = 0.45;
  const MAX_SCALE = 2.4;

  let panel = null;
  if (infoPanel && typeof infoPanel.show === "function") panel = infoPanel;
  else if (info && typeof info.show === "function") panel = info;
  const infoBox = info && typeof info.querySelector === "function" ? info : null;

  function infoShow(mod) {
    if (panel) {
      panel.show(mod);
      return;
    }
    if (!infoBox) return;
    const hint = infoBox.querySelector(".oi-hint");
    const body = infoBox.querySelector(".oi-body");
    if (hint) hint.hidden = false;
    if (body) body.hidden = true;
  }
  function infoReset() {
    if (panel) {
      panel.reset();
      return;
    }
    if (!infoBox) return;
    const hint = infoBox.querySelector(".oi-hint");
    const body = infoBox.querySelector(".oi-body");
    if (hint) hint.hidden = false;
    if (body) {
      body.hidden = true;
      clearEl(body);
    }
    infoBox.classList.remove("is-open");
  }

  function setWorldTransform(immediate = false) {
    if (immediate) {
      rotation = targetRotation;
      scale = targetScale;
    }
    world.style.transform = `translate(${cx}px, ${cy}px) rotate(${rotation}rad) scale(${scale})`;
    world.style.setProperty("--inv-scale", String(1 / scale));
    world.style.setProperty("--inv-rot", `${-rotation}rad`);
  }

  function animate() {
    raf = 0;
    const ds = targetScale - scale;
    const dr = targetRotation - rotation;
    if (Math.abs(ds) < 0.0005 && Math.abs(dr) < 0.0005) {
      setWorldTransform(true);
      return;
    }
    const k = reduceMotion ? 1 : 0.18;
    scale += ds * k;
    rotation += dr * k;
    setWorldTransform(true);
    raf = requestAnimationFrame(animate);
  }

  function requestRender(immediate = false) {
    if (immediate || reduceMotion) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      setWorldTransform(true);
      return;
    }
    if (!raf) raf = requestAnimationFrame(animate);
  }

  function updateHud() {
    stage.classList.toggle("is-compact", W < 720);
  }

  function drawRings(coreR, ringRadii) {
    clearEl(svg);
    const defs = svgEl("defs");
    const grad = svgEl("radialGradient", { id: "rm-core-glow", cx: "50%", cy: "50%", r: "50%" });
    grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "rgba(255,255,255,.95)" }));
    grad.appendChild(svgEl("stop", { offset: "55%", "stop-color": "rgba(99,179,255,.20)" }));
    grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "rgba(99,179,255,0)" }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    for (let i = ringRadii.length - 1; i >= 0; i -= 1) {
      const rr = ringRadii[i];
      svg.appendChild(svgEl("circle", {
        cx: 0, cy: 0, r: rr,
        class: i === ringRadii.length - 1 ? "rm-orbit-ring rm-orbit-ring-outer" : "rm-orbit-ring",
      }));
    }
    svg.appendChild(svgEl("circle", {
      cx: 0, cy: 0, r: coreR + 30, class: "rm-orbit-ring rm-orbit-ring-inner",
    }));
    svg.appendChild(svgEl("circle", {
      cx: 0, cy: 0, r: coreR + 56, fill: "url(#rm-core-glow)", class: "rm-core-glow",
    }));

    for (const node of nodes) {
      const c = colorFor((node.mod.n || 1) - 1);
      node.path = svgEl("path", { class: "rm-link", stroke: c.a, "data-id": node.mod.id });
      node.path.style.setProperty("--link-color", c.a);
      svg.appendChild(node.path);
    }
  }

  function layout() {
    const rect = stage.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    if (W === 0 || H === 0) return;
    const compact = W < 720;
    const narrow = W < 520;
    updateHud();

    // Generous world so multi-ring layout has room; viewport crops/zooms.
    const worldW = Math.max(W, compact ? 980 : 1280);
    const worldH = Math.max(H, compact ? 980 : 1180);
    cx = W / 2;
    cy = H / 2;
    world.style.width = `${worldW}px`;
    world.style.height = `${worldH}px`;
    svg.setAttribute("viewBox", `${-worldW / 2} ${-worldH / 2} ${worldW} ${worldH}`);
    svg.setAttribute("width", String(worldW));
    svg.setAttribute("height", String(worldH));

    let coreR = 92;
    if (compact) coreR = 72;
    if (narrow) coreR = 60;
    core.style.setProperty("--core-size", `${coreR * 2}px`);

    const pages = modules.map((m) => pagesOf(m) || 0);
    const minP = Math.min(...pages, 0);
    const maxP = Math.max(...pages, 1);

    let labelW = 140;
    if (compact) labelW = 122;
    if (narrow) labelW = 110;
    const fontSize = narrow ? 10 : 11;
    const lineH = fontSize * 1.25 + 2;
    const labelGap = 10;
    const nodePad = 8;

    const items = nodes.map((node) => {
      const p = pagesOf(node.mod) || 0;
      const r = nodeRadius(p, minP, maxP, compact);
      const label = shortLabel(node.mod.title, 52);
      const lines = estimateLabelLines(label, labelW, fontSize, lineH);
      const labelH = Math.max(30, lines * lineH + 12);
      const footR = footRadiusForNode(r, labelW, labelH, labelGap) + nodePad;
      return { node, r, labelW, labelH, footR, p };
    });

    const { rings } = distributeToRings(items, coreR);
    assignRingPositions(items, rings);

    // Expand rings if needed to fit inside world bounds
    const worldHalfW = worldW / 2;
    const worldHalfH = worldH / 2;
    const maxFoot = Math.max(...items.map((it) => it.footR), 60);
    const boundR = Math.min(worldHalfW, worldHalfH) - maxFoot - 16;
    const outerNeeded = rings.length ? rings[rings.length - 1].radius : coreR + maxFoot + 40;
    if (outerNeeded > boundR && rings.length) {
      const inner = coreR + maxFoot + 24;
      const span = Math.max(1, rings.length - 1);
      for (let i = 0; i < rings.length; i += 1) {
        rings[i].radius = inner + (i / span) * Math.max(0, boundR - inner);
      }
      assignRingPositions(items, rings);
    }

    resolveCollisions(items, coreR, worldHalfW, worldHalfH);

    const ringRadii = rings.map((r) => r.radius);
    drawRings(coreR, ringRadii);

    for (const it of items) {
      const node = it.node;
      const c = colorFor((node.mod.n || 1) - 1);
      node.x = it.x;
      node.y = it.y;
      node.r = it.r;
      node.footR = it.footR;
      node.angle = Math.atan2(it.y, it.x);
      node.el.style.setProperty("--x", `${it.x}px`);
      node.el.style.setProperty("--y", `${it.y}px`);
      node.el.style.setProperty("--nr", `${it.r * 2}px`);
      node.el.style.setProperty("--label-w", `${labelW}px`);
      node.el.style.setProperty("--c-a", c.a);
      node.el.style.setProperty("--c-b", c.b);
      node.el.style.setProperty("--c-glow", c.glow);
      node.path.setAttribute("d", `M 0 0 Q ${it.x * 0.45} ${it.y * 0.45} ${it.x} ${it.y}`);
    }

    // Fit initial view so the whole layout is visible
    const extent = Math.max(
      coreR + 30,
      ...items.map((it) => Math.max(Math.abs(it.x) + it.footR, Math.abs(it.y) + it.footR)),
    );
    const fitPad = compact ? 24 : 36;
    const rawFit = Math.min((W - fitPad * 2) / (extent * 2), (H - fitPad * 2) / (extent * 2));
    const fitScale = clamp(rawFit, 0.2, 1);
    if (!dragging && !pinch) {
      targetScale = fitScale;
      scale = fitScale;
      targetRotation = -Math.PI / 2;
      rotation = -Math.PI / 2;
      cx = W / 2;
      cy = H / 2;
    }
    requestRender(true);
  }

  function setActive(id) {
    activeId = id;
    for (const node of nodes) {
      const on = node.mod.id === id;
      node.el.classList.toggle("is-active", on);
      node.el.setAttribute("aria-pressed", on ? "true" : "false");
      node.path.classList.toggle("is-active", on);
      node.path.classList.toggle("is-dim", Boolean(id) && !on);
    }
  }

  function clearHover() {
    for (const node of nodes) {
      node.el.classList.remove("is-hover");
      node.path.classList.remove("is-hover");
      if (!activeId) node.path.classList.remove("is-dim");
    }
  }

  function hoverNode(mod) {
    for (const node of nodes) {
      const on = node.mod.id === mod.id;
      node.el.classList.toggle("is-hover", on);
      node.path.classList.toggle("is-hover", on);
      if (!activeId) node.path.classList.toggle("is-dim", !on);
    }
    infoShow(mod);
  }

  function highlight(id) {
    const node = nodes.find((n) => n.mod.id === id);
    if (!node) return;
    setActive(id);
    if (W < 720) {
      const desired = -Math.PI / 2 - node.angle;
      let delta = desired - targetRotation;
      delta = ((delta + Math.PI) % TAU + TAU) % TAU - Math.PI;
      targetRotation += delta;
      requestRender();
    }
  }

  function build(mods, manifest) {
    modules = mods || [];
    clearEl(nodesLayer);
    nodes = [];
    activeId = null;
    coreMeta.textContent = `${manifest?.totals?.modules || modules.length} moduli · ${manifest?.totals?.pages || 0} pagine`;

    core.onclick = () => {
      setActive(null);
      infoReset();
    };

    const count = modules.length || 1;
    for (let i = 0; i < modules.length; i += 1) {
      const mod = modules[i];
      const c = colorFor((mod.n || 1) - 1);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rm-node";
      btn.dataset.id = mod.id;
      btn.style.setProperty("--c-a", c.a);
      btn.style.setProperty("--c-b", c.b);
      btn.style.setProperty("--c-glow", c.glow);
      btn.setAttribute("aria-label", `Apri modulo ${mod.n}: ${mod.title}`);
      btn.setAttribute("aria-pressed", "false");

      const glow = make("span", "rm-node-glow");
      glow.setAttribute("aria-hidden", "true");
      const circle = make("span", "rm-node-circle");
      circle.append(
        make("span", "rm-node-num", String(mod.n).padStart(2, "0")),
        make("span", "rm-node-pages", pagesOf(mod) ? `${pagesOf(mod)}p` : "—"),
      );
      const label = make("span", "rm-node-label");
      const labelText = make("span", "rm-node-label-text", shortLabel(mod.title, 44));
      label.appendChild(labelText);
      btn.append(glow, circle, label);

      btn.addEventListener("click", (e) => {
        if (moved > 8) return;
        e.stopPropagation();
        setActive(mod.id);
        onOpen(mod);
      });
      btn.addEventListener("mouseenter", () => {
        if (!dragging) hoverNode(mod);
      });
      btn.addEventListener("focus", () => hoverNode(mod));
      btn.addEventListener("mouseleave", () => {
        if (activeId) {
          const activeNode = nodes.find((n2) => n2.mod.id === activeId);
          if (activeNode) infoShow(activeNode.mod);
          return;
        }
        clearHover();
      });
      btn.addEventListener("blur", () => {
        if (!activeId) clearHover();
      });

      nodesLayer.appendChild(btn);
      nodes.push({ mod, el: btn, x: 0, y: 0, r: 40, angle: -Math.PI / 2 + i * (TAU / count), path: svgEl("path") });
    }

    layout();
  }

  function onPointerDown(e) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (e.target.closest(".rm-zoom")) return;
    dragging = true;
    moved = 0;
    dragPointer = e.pointerId;
    dragStart = { x: e.clientX, y: e.clientY, rotation: targetRotation };
    stage.classList.add("is-dragging");
    try {
      viewport.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  function applyPinch() {
    const pts = Array.from(pinch.positions.values());
    if (pts.length < 2) return;
    const [a, b] = pts;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (!pinch.startDist) {
      pinch.startDist = dist;
      pinch.startScale = targetScale;
      pinch.startRotation = targetRotation;
      pinch.startAngle = Math.atan2(b.y - a.y, b.x - a.x);
      return;
    }
    const ratio = dist / pinch.startDist;
    const nextScale = clamp(pinch.startScale * ratio, MIN_SCALE, MAX_SCALE);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    targetRotation = pinch.startRotation + (angle - pinch.startAngle);
    zoomAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, nextScale);
  }

  function onPointerMove(e) {
    if (pinch && pinch.ids.size >= 2 && pinch.ids.has(e.pointerId)) {
      pinch.positions.set(e.pointerId, { x: e.clientX, y: e.clientY });
      applyPinch();
      return;
    }
    if (pinch && pinch.ids.has(e.pointerId)) {
      pinch.positions.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (!dragging || e.pointerId !== dragPointer) return;
    const dx = e.clientX - dragStart.x;
    moved = Math.max(moved, Math.abs(dx), Math.abs(e.clientY - dragStart.y));
    const delta = (dx / Math.max(W, 320)) * Math.PI * 1.25;
    targetRotation = dragStart.rotation + delta;
    requestRender();
  }

  function onPointerUp(e) {
    if (pinch && pinch.ids.has(e.pointerId)) {
      pinch.positions.delete(e.pointerId);
      pinch.ids.delete(e.pointerId);
      if (pinch.ids.size < 2) pinch = null;
    }
    if (e.pointerId !== dragPointer) return;
    dragging = false;
    dragPointer = null;
    stage.classList.remove("is-dragging");
  }

  function zoomAt(point, nextScale) {
    const rect = stage.getBoundingClientRect();
    const px = point.x - rect.left;
    const py = point.y - rect.top;
    const prev = targetScale;
    const clamped = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    if (Math.abs(clamped - prev) < 0.0001) return;
    const dx = px - cx;
    const dy = py - cy;
    const ratio = clamped / prev;
    cx = px - dx * ratio;
    cy = py - dy * ratio;
    const maxDrift = Math.min(W, H) * 0.45;
    cx = clamp(cx, W / 2 - maxDrift, W / 2 + maxDrift);
    cy = clamp(cy, H / 2 - maxDrift, H / 2 + maxDrift);
    targetScale = clamped;
    requestRender();
  }

  viewport.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".rm-zoom")) return;
    if (pinch) {
      pinch.ids.add(e.pointerId);
      pinch.positions.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.ids.size >= 2) pinch.startDist = 0;
    } else {
      pinch = { ids: new Set([e.pointerId]), positions: new Map([[e.pointerId, { x: e.clientX, y: e.clientY }]]), startDist: 0 };
    }
    onPointerDown(e);
  });
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", onPointerUp);
  viewport.addEventListener("pointercancel", onPointerUp);
  viewport.addEventListener("lostpointercapture", () => {
    dragging = false;
    stage.classList.remove("is-dragging");
  });

  viewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    zoomAt({ x: e.clientX, y: e.clientY }, targetScale * factor);
  }, { passive: false });

  viewport.addEventListener("dblclick", (e) => {
    if (e.target.closest(".rm-node, .rm-core, .rm-zoom")) return;
    const next = targetScale > 1.2 ? 1 : clamp(targetScale * 1.5, MIN_SCALE, MAX_SCALE);
    zoomAt({ x: e.clientX, y: e.clientY }, next);
  });

  for (const btn of zoomBtns) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const act = btn.dataset.zoom;
      const center = {
        x: stage.getBoundingClientRect().left + W / 2,
        y: stage.getBoundingClientRect().top + H / 2,
      };
      if (act === "in") zoomAt(center, targetScale * 1.2);
      if (act === "out") zoomAt(center, targetScale / 1.2);
      if (act === "reset") {
        cx = W / 2;
        cy = H / 2;
        targetScale = 1;
        targetRotation = -Math.PI / 2;
        requestRender();
      }
    });
  }

  stage.tabIndex = 0;
  stage.setAttribute("role", "region");
  stage.setAttribute("aria-label", "Mappa radiale dei moduli. Trascina per ruotare, usa rotella o tasti più/meno per zoom.");
  stage.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      targetRotation -= 0.12;
      requestRender();
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      targetRotation += 0.12;
      requestRender();
    }
    const center = {
      x: stage.getBoundingClientRect().left + W / 2,
      y: stage.getBoundingClientRect().top + H / 2,
    };
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomAt(center, targetScale * 1.15);
    }
    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomAt(center, targetScale / 1.15);
    }
    if (e.key === "0") {
      e.preventDefault();
      cx = W / 2;
      cy = H / 2;
      targetScale = 1;
      targetRotation = -Math.PI / 2;
      requestRender();
    }
  });

  const ro = new ResizeObserver(() => layout());
  ro.observe(stage);
  requestAnimationFrame(layout);

  return { build, layout, highlight, nodes };
}
