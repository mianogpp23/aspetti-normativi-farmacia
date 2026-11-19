/* orbit.js — mappa orbitale: core, anelli, nodi, raggi, rotazione */

import { $, el, esc, svgEl, clamp, fmtDuration } from "./utils.js";
import { pagesOf, topicsOf } from "./data.js";

const RING_FRACTIONS = [0.46, 0.73, 1.0];
const COMPACT_FRACTIONS = [0.58, 1.0];
const SPEEDS = [2.4, -1.8, 1.25]; // gradi / secondo
const LABEL_W = 116;

export function createOrbit({ stage, info, onOpen }) {
  let nodes = [];
  let rings = [];
  let svg = null;
  let lineGroup = null;
  let ringGroup = null;
  let geom = { cx: 0, cy: 0, maxR: 200, radii: [] };
  let coreHalf = 90;
  let angles = [0, 0, 0];
  let raf = 0;
  let last = 0;
  let paused = false;
  let dragging = false;
  let lastX = 0;
  let hoverId = null;
  let bound = false;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- costruzione ---------------- */
  function build(modules, manifest) {
    stage.querySelectorAll(".mnode, .orbit-svg, .orbit-core").forEach((n) => n.remove());

    svg = svgEl("svg", { class: "orbit-svg", "aria-hidden": "true" });
    const defs = svgEl("defs");
    defs.innerHTML = `
      <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#2f6bff" stop-opacity=".22"/>
        <stop offset="55%" stop-color="#22c7e6" stop-opacity=".10"/>
        <stop offset="100%" stop-color="#22c7e6" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="spokeGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0">
        <stop offset="0%" stop-color="#2f6bff" stop-opacity=".55"/>
        <stop offset="100%" stop-color="#22c7e6" stop-opacity=".8"/>
      </linearGradient>`;
    svg.appendChild(defs);
    ringGroup = svgEl("g", { class: "orbit-rings" });
    lineGroup = svgEl("g", { class: "orbit-spokes" });
    const glow = svgEl("circle", { class: "orbit-core-glow", cx: 0, cy: 0, r: 0 });
    svg.append(glow, ringGroup, lineGroup);
    stage.appendChild(svg);

    // core
    const core = el("div", { class: "orbit-core" }, `
      <div class="core-inner">
        <span class="core-kicker">Corso</span>
        <strong class="core-title">${esc(manifest?.course?.title || "Dispense")}</strong>
        <span class="core-sub">${manifest?.totals?.pages ?? 0} slide · ${modules.length} moduli</span>
      </div>`);
    stage.appendChild(core);

    // anelli
    const compact = stage.clientWidth < 640;
    const ringCount = compact ? 2 : modules.length <= 6 ? 1 : modules.length <= 12 ? 2 : 3;
    rings = [];
    ringGroup.innerHTML = "";
    for (let i = 0; i < ringCount; i++) {
      const c = svgEl("circle", { class: "orbit-ring", r: 0, cx: 0, cy: 0 });
      c.dataset.ring = String(i);
      ringGroup.appendChild(c);
      rings.push(c);
    }

    // distribuzione proporzionale al raggio
    const fracs = (compact ? COMPACT_FRACTIONS : RING_FRACTIONS).slice(0, ringCount);
    const wsum = fracs.reduce((a, b) => a + b, 0);
    const counts = fracs.map((f) => Math.max(1, Math.round((modules.length * f) / wsum)));
    let diff = modules.length - counts.reduce((a, b) => a + b, 0);
    let guard = 0;
    while (diff !== 0 && guard++ < 50) {
      const i = diff > 0 ? counts.indexOf(Math.min(...counts)) : counts.indexOf(Math.max(...counts));
      counts[i] += diff > 0 ? 1 : -1;
      diff = modules.length - counts.reduce((a, b) => a + b, 0);
    }

    // nodi
    nodes = [];
    let cursor = 0;
    stage.querySelectorAll(".mnode").forEach((n) => n.remove());
    const frag = document.createDocumentFragment();
    counts.forEach((cnt, ringIdx) => {
      for (let k = 0; k < cnt && cursor < modules.length; k++, cursor++) {
        const mod = modules[cursor];
        const p = pagesOf(mod);
        const d = Math.round(compact
          ? clamp(27 + 13 * Math.sqrt(p / 100), 27, 40)
          : clamp(34 + 20 * Math.sqrt(p / 100), 34, 56));
        const stagger = ringIdx * (Math.PI / cnt) * 0.62;
        const node = { mod, ring: ringIdx, angle: (k / cnt) * Math.PI * 2 - Math.PI / 2 + stagger, d };

        const wrap = el("div", { class: "mnode" + (p ? "" : " has-video-only") });
        const dot = el("button", {
          class: "mnode-dot",
          type: "button",
          "aria-label": `${mod.n}. ${mod.title}${p ? ` — ${p} slide` : " — solo video"}`,
          title: mod.title,
          style: `width:${d}px;height:${d}px`,
        }, String(mod.n).padStart(2, "0"));
        // l'etichetta e' volutamente compatta (2 righe): il titolo completo
        // resta disponibile nel tooltip, nell'aria-label del nodo e nel pannello.
        const label = el("span", { class: "mnode-label", title: mod.title },
          `<span class="lbl-n">${String(mod.n).padStart(2, "0")}</span>${esc(shortLabel(mod))}`);

        wrap.append(dot, label);
        node.el = wrap;
        node.dot = dot;
        node.label = label;
        node.spoke = svgEl("line", { class: "orbit-spoke", "stroke-linecap": "round" });
        lineGroup.appendChild(node.spoke);

        dot.addEventListener("mouseenter", () => setHover(mod.id));
        dot.addEventListener("focus", () => { setHover(mod.id); nudgePause(3200); });
        dot.addEventListener("mouseleave", () => setHover(null));
        dot.addEventListener("blur", () => setHover(null));
        dot.addEventListener("click", (e) => {
          e.preventDefault();
          // su schermo piccolo il primo tocco evidenzia il nodo e mostra i dettagli
          if (stage.clientWidth < 640) { setHover(mod.id); return; }
          onOpen(mod);
        });

        nodes.push(node);
        frag.appendChild(wrap);
      }
    });
    stage.appendChild(frag);

    // interazioni di trascinamento
    if (!bound) {
      bound = true;
      stage.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".mnode-dot")) return;
        dragging = true;
        lastX = e.clientX;
        stage.style.cursor = "grabbing";
      });
      window.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        const delta = (dx / Math.max(140, geom.maxR)) * 26;
        angles = angles.map((a) => a + delta);
        draw();
      });
      window.addEventListener("pointerup", () => { dragging = false; stage.style.cursor = ""; });
    }

    layout();
    info.reset();
    start();
  }

  function shortLabel(mod) {
    const t = mod.label || mod.title || "";
    return t.length > 46 ? t.slice(0, 44).replace(/[\s,;:.-]+$/, "") + "…" : t;
  }

  /* ---------------- geometria ---------------- */
  function layout() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    const cx = w / 2;
    const cy = h / 2;
    const compact = w < 640;
    // spazio per nodo + etichetta su tutti i lati
    const padX = compact ? 52 : 86;
    const padY = compact ? 56 : 78;
    const maxR = Math.max(72, Math.min(w / 2 - padX, h / 2 - padY));
    const fracs = (compact ? COMPACT_FRACTIONS : RING_FRACTIONS).slice(0, Math.max(1, rings.length));
    const radii = fracs.map((f) => Math.max(compact ? 58 : 72, maxR * f));
    geom = { cx, cy, maxR, radii };

    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const glow = svg.querySelector(".orbit-core-glow");
    glow.setAttribute("cx", cx);
    glow.setAttribute("cy", cy);
    glow.setAttribute("r", maxR * 1.5);

    rings.forEach((c, i) => {
      const r = radii[Math.min(i, radii.length - 1)];
      c.setAttribute("cx", cx);
      c.setAttribute("cy", cy);
      c.setAttribute("r", r);
    });
    stage.classList.toggle("is-compact", compact);
    stage.querySelectorAll(".mnode-label").forEach((l) => {
      l.style.width = `${compact ? 96 : LABEL_W}px`;
    });
    // dimensioni etichette memorizzate: evitano reflow durante l'animazione
    nodes.forEach((n) => {
      n.lw = n.label.offsetWidth || (compact ? 96 : LABEL_W);
      n.lh = n.label.offsetHeight || 28;
      n.cand = 0;
    });
    // ingombro reale del core (per non farci cadere sopra le etichette)
    const coreEl = stage.querySelector(".orbit-core");
    if (coreEl) {
      coreHalf = Math.max(60, coreEl.offsetWidth / 2 + 10);
    } else {
      coreHalf = 90;
    }
    draw();
  }

  /* ---------------- disegno ---------------- */
  function draw() {
    const { cx, cy, radii } = geom;
    nodes.forEach((n) => {
      const r = radii[Math.min(n.ring, radii.length - 1)] || 200;
      const a = n.angle + ((angles[n.ring] || 0) * Math.PI) / 180;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      n.el.style.transform = `translate(${x}px, ${y}px)`;
      n.spoke.setAttribute("x1", cx);
      n.spoke.setAttribute("y1", cy);
      n.spoke.setAttribute("x2", x);
      n.spoke.setAttribute("y2", y);
      n.x = x;
      n.y = y;
      n.a = a;
    });
    placeLabels();
  }

  /* Risoluzione collisioni etichette: ogni etichetta prova più posizioni
     candidate e sceglie la prima libera da nodi, etichette e core. */
  function placeLabels() {
    const dots = nodes.map((n) => ({
      x1: n.x - n.d / 2, x2: n.x + n.d / 2,
      y1: n.y - n.d / 2, y2: n.y + n.d / 2,
      n,
    }));
    const core = {
      x1: geom.cx - coreHalf, x2: geom.cx + coreHalf,
      y1: geom.cy - coreHalf, y2: geom.cy + coreHalf,
    };
    const placed = [];

    for (const n of nodes) {
      const ux = Math.cos(n.a);
      const uy = Math.sin(n.a);
      const tx = -uy;
      const ty = ux;
      const base = n.d / 2 + 11;
      const cands = [
        { x: ux * base, y: uy * base },
        { x: ux * (base + 30), y: uy * (base + 30) },
        { x: tx * (base + 14), y: ty * (base + 14) },
        { x: -tx * (base + 14), y: -ty * (base + 14) },
        { x: ux * (base + 58), y: uy * (base + 58) },
        { x: tx * (base + 46), y: ty * (base + 46) },
        { x: -tx * (base + 46), y: -ty * (base + 46) },
      ];
      const w = n.lw || LABEL_W;
      const h = n.lh || 28;

      let chosen = null;
      // prima prova la posizione corrente (stabilità durante l'animazione)
      const order = [n.cand || 0, ...cands.map((_, i) => i).filter((i) => i !== (n.cand || 0))];
      for (const i of order) {
        const c = cands[i];
        if (!c) continue;
        const rect = {
          x1: n.x + c.x - w / 2, x2: n.x + c.x + w / 2,
          y1: n.y + c.y - h / 2, y2: n.y + c.y + h / 2,
        };
        if (rect.x1 < 2 || rect.y1 < 2 ||
            rect.x2 > stage.clientWidth - 2 || rect.y2 > stage.clientHeight - 2) continue;
        if (overlaps(rect, dots, n) || overlaps(rect, [core], null) || overlaps(rect, placed, null)) continue;
        chosen = { i, rect, c };
        break;
      }
      if (!chosen) {
        const c = cands[0];
        chosen = { i: 0, c, rect: {
          x1: n.x + c.x - w / 2, x2: n.x + c.x + w / 2,
          y1: n.y + c.y - h / 2, y2: n.y + c.y + h / 2,
        } };
      }
      n.cand = chosen.i;
      placed.push(chosen.rect);
      n.label.style.transform =
        `translate(-50%, -50%) translate(${chosen.c.x.toFixed(1)}px, ${chosen.c.y.toFixed(1)}px)`;
      n.lx = n.x + chosen.c.x;
      n.ly = n.y + chosen.c.y;
    }
  }

  function overlaps(rect, others, except) {
    for (const o of others) {
      if (except && o.n === except) continue;
      if (rect.x1 < o.x2 && rect.x2 > o.x1 && rect.y1 < o.y2 && rect.y2 > o.y1) return true;
    }
    return false;
  }

  /* ---------------- animazione ---------------- */
  function start() {
    if (reduced) return;
    cancelAnimationFrame(raf);
    last = performance.now();
    const tick = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (!paused && !dragging && !document.hidden) {
        let changed = false;
        angles = angles.map((a, i) => {
          const sp = SPEEDS[i % SPEEDS.length];
          if (!sp) return a;
          changed = true;
          return a + sp * dt;
        });
        if (changed) draw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function nudgePause(ms) {
    paused = true;
    clearTimeout(nudgePause._t);
    nudgePause._t = setTimeout(() => { paused = false; }, ms);
  }

  /* ---------------- hover ---------------- */
  function setHover(id) {
    if (hoverId === id) return;
    hoverId = id;
    nodes.forEach((n) => {
      const on = n.mod.id === id;
      n.el.classList.toggle("is-active", on);
      n.spoke.classList.toggle("is-on", on);
      n.spoke.classList.toggle("is-dim", Boolean(id) && !on);
    });
    const hovered = nodes.find((n) => n.mod.id === id);
    rings.forEach((c, i) => c.classList.toggle("is-hover", Boolean(hovered) && hovered.ring === i));
    if (id) { paused = true; info.show(hovered.mod); } else { info.reset(); }
  }

  /* ---------------- resize ---------------- */
  let ro = null;
  if ("ResizeObserver" in window) {
    ro = new ResizeObserver(() => layout());
    ro.observe(stage);
  } else {
    window.addEventListener("resize", layout);
  }

  return {
    build,
    layout,
    highlight(id) { setHover(id); },
    get nodes() { return nodes; },
  };
}

/* pannello informativo laterale */
export function createInfoPanel(box, onOpen) {
  const hint = $("#oi-hint", box);
  const body = $("#oi-body", box);

  function reset() {
    if (hint) hint.hidden = false;
    if (body) { body.hidden = true; body.innerHTML = ""; }
    box.classList.remove("is-open");
  }

  function show(mod) {
    if (!body) return;
    const p = pagesOf(mod);
    const topics = topicsOf(mod);
    const dur = fmtDuration(mod?.video?.duration);
    const tags = [];
    tags.push(p ? `${p} slide` : "solo video");
    if (topics.length) tags.push(`${topics.length} argomenti`);
    if (dur) tags.push(`video ${dur}`);

    body.innerHTML = `
      <p class="oi-eyebrow">Modulo ${String(mod.n).padStart(2, "0")}</p>
      <h3 class="oi-title">${esc(mod.title)}</h3>
      ${mod.lecturers?.length ? `<p class="oi-people">
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.4" r="2.7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.6 13.2c.6-2.5 2.8-3.9 5.4-3.9s4.8 1.4 5.4 3.9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        ${esc(mod.lecturers.join(" · "))}</p>` : ""}
      <div class="oi-tags">${tags.map((t) => `<span class="oi-tag">${esc(t)}</span>`).join("")}</div>
      ${topics.length ? `<div class="oi-topics" role="list">${topics.slice(0, 6).map((t) => `
        <button class="oi-topic" type="button" data-topic="${esc(t.id)}" role="listitem">
          <b>${t.from}</b><span>${esc(t.title)}</span>
        </button>`).join("")}</div>` : ""}
      <button class="btn btn-primary oi-cta" type="button" id="oi-open">Apri il modulo</button>`;

    body.querySelector("#oi-open")?.addEventListener("click", () => onOpen(mod));
    body.querySelectorAll(".oi-topic").forEach((b) => {
      b.addEventListener("click", () => onOpen(mod, b.dataset.topic));
    });
    body.hidden = false;
    if (hint) hint.hidden = true;
    box.classList.add("is-open");
  }

  return { show, reset };
}
