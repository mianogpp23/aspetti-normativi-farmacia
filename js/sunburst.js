/* sunburst.js — mappa sunburst SVG, geometria polare calcolata a mano.
   Nessuna libreria: dati dal manifest esistente, SVG + JavaScript vanilla. */

import { $, norm } from "./utils.js";
import { topicsOf, pagesOf, slideTitle } from "./data.js";

/* ---------------- costanti ---------------- */
const SIZE = 730;
const C = SIZE / 2;
const R0 = 110;          // bordo interno anello moduli
const R1 = 205;          // confine moduli / argomenti
const R2 = 325;          // bordo esterno argomenti
const INK = "#1F2933";
const TWO_PI = Math.PI * 2;

/* 8 colori distinti, uno per modulo. Tutti >= 6.3:1 contro il bianco. */
const PALETTE = [
  "#175A86", // blu
  "#8A4417", // rame
  "#2B6648", // verde
  "#6B3D86", // viola
  "#963A55", // bordò
  "#5D541D", // oliva
  "#0E6A6E", // teal
  "#59468F", // indaco
];

const KIND_LABEL = { module: "Modulo", topic: "Argomento", slide: "Slide" };
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- costruttori DOM (nessun innerHTML) ---------------- */
function h(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else n.setAttribute(k, v === true ? "" : String(v));
  }
  if (text !== undefined) n.textContent = String(text);
  return n;
}

function s(tag, attrs = {}, text) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    n.setAttribute(k, String(v));
  }
  if (text !== undefined) n.textContent = String(text);
  return n;
}

/* ---------------- utilità colore / testo ---------------- */
function rgb(hex) {
  const v = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

function mix(hex, target, ratio) {
  const a = rgb(hex);
  const b = rgb(target);
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * ratio).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex) {
  const c = rgb(hex).map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a, b) {
  const pair = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (pair[0] + 0.05) / (pair[1] + 0.05);
}

const textOn = (hex) => (contrast(hex, "#FFFFFF") >= 4.5 ? "#FFFFFF" : INK);

function truncate(value, max) {
  const v = String(value || "").replace(/\s+/g, " ").trim();
  return v.length <= max ? v : `${v.slice(0, Math.max(1, max - 1))}…`;
}

/* ---------------- geometria polare ----------------
   angolo 0 = ore 12, cresce in senso orario */
function polar(angle, radius) {
  return { x: C + radius * Math.sin(angle), y: C - radius * Math.cos(angle) };
}

function arcPath(a) {
  const p0 = polar(a.a0, a.r1);
  const p1 = polar(a.a1, a.r1);
  const p2 = polar(a.a1, a.r0);
  const p3 = polar(a.a0, a.r0);
  const large = a.a1 - a.a0 > Math.PI ? 1 : 0;
  return `M${p0.x.toFixed(2)} ${p0.y.toFixed(2)}`
    + ` A${a.r1} ${a.r1} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`
    + ` L${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
    + ` A${a.r0} ${a.r0} 0 ${large} 0 ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} Z`;
}

function labelPlacement(a) {
  const mid = (a.a0 + a.a1) / 2;
  const r = (a.r0 + a.r1) / 2;
  const p = polar(mid, r);
  const deg = mid * 180 / Math.PI - 90;
  const flip = mid > Math.PI / 2 && mid < Math.PI * 1.5 ? 180 : 0;
  const maxChars = Math.max(4, Math.floor((a.r1 - a.r0 - 16) / 6.4));
  const short = truncate(a.label, maxChars);
  const arcPx = r * (a.a1 - a.a0);
  return { x: p.x, y: p.y, rotation: deg + flip, short, show: arcPx >= 24 && short.length >= 3 };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function interpolateArc(from, to, t) {
  return {
    ...to,
    a0: lerp(from.a0 ?? to.a0, to.a0, t),
    a1: lerp(from.a1 ?? to.a1, to.a1, t),
    r0: lerp(from.r0 ?? to.r0, to.r0, t),
    r1: lerp(from.r1 ?? to.r1, to.r1, t),
    opacity: lerp(from.opacity ?? 1, to.opacity ?? 1, t),
  };
}

function parentKey(key) {
  const parts = key.split(":");
  if (parts[0] === "t") return `m:${parts[1]}`;
  if (parts[0] === "s") return `t:${parts[1]}:${parts[2]}`;
  return "center";
}

/* ---------------- costruzione archi ---------------- */
function effectiveTopics(mod) {
  const topics = topicsOf(mod);
  if (topics.length) return topics;
  const pages = pagesOf(mod);
  // Nessun topic dichiarato: un arco di cortesia mantiene il modulo visibile.
  return [{
    id: "all",
    title: pages ? "Tutte le slide del modulo" : "Nessuna slide",
    from: 1,
    to: pages || 1,
    count: pages || 0,
    synthesized: true,
  }];
}

function moduleMeta(mod, topics) {
  const pages = pagesOf(mod);
  const chunks = [`${topics.length} argoment${topics.length === 1 ? "o" : "i"}`];
  chunks.push(pages ? `${pages} slide` : "nessuna slide");
  if (mod.lecturers) chunks.push(Array.isArray(mod.lecturers) ? mod.lecturers.join(", ") : mod.lecturers);
  return chunks.join(" · ");
}

function topicMeta(topic) {
  const n = topic.count || (topic.to >= topic.from ? topic.to - topic.from + 1 : 0);
  const range = topic.to >= topic.from && topic.from ? ` · pp. ${topic.from}–${topic.to}` : "";
  return `${n} slide${range}`;
}

function makeArc(o) {
  return { opacity: 1, showLabel: false, shortLabel: "", textColor: INK, ...o };
}

function buildCourseArcs(model) {
  const weights = model.map((m) => m.topics.length || 1);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const arcs = [];
  let cursor = 0;
  model.forEach((m, i) => {
    const span = TWO_PI * weights[i] / total;
    const a0 = cursor;
    const a1 = cursor + span;
    cursor = a1;
    arcs.push(makeArc({
      key: `m:${m.mod.id}`,
      kind: "module",
      modId: m.mod.id,
      a0, a1, r0: R0, r1: R1,
      label: m.mod.title,
      meta: moduleMeta(m.mod, m.topics),
      color: PALETTE[i % PALETTE.length],
      search: `${m.mod.title} ${m.mod.label || ""} ${m.mod.lecturers || ""}`,
    }));
    const tCount = m.topics.length || 1;
    m.topics.forEach((topic, j) => {
      const t0 = a0 + span * j / tCount;
      const t1 = a0 + span * (j + 1) / tCount;
      arcs.push(makeArc({
        key: `t:${m.mod.id}:${topic.id}`,
        kind: "topic",
        modId: m.mod.id,
        topicId: topic.id,
        a0: t0, a1: t1, r0: R1, r1: R2,
        label: topic.title,
        meta: topicMeta(topic),
        color: mix(PALETTE[i % PALETTE.length], "#FFFFFF", j % 2 ? 0.74 : 0.62),
        search: `${topic.title} ${(topic.keywords || []).join(" ")}`,
      }));
    });
  });
  return arcs;
}

function buildModuleArcs(m, index) {
  const base = PALETTE[index % PALETTE.length];
  const topics = m.topics;
  const arcs = [];
  const tSpan = TWO_PI / topics.length;
  const pages = topics.map((t) => Math.max(1, t.count || (t.to >= t.from ? t.to - t.from + 1 : 1)));
  const totalPages = pages.reduce((a, b) => a + b, 0) || 1;
  let slideCursor = 0;

  topics.forEach((topic, i) => {
    const t0 = tSpan * i;
    const t1 = tSpan * (i + 1);
    arcs.push(makeArc({
      key: `t:${m.mod.id}:${topic.id}`,
      kind: "topic",
      modId: m.mod.id,
      topicId: topic.id,
      a0: t0, a1: t1, r0: R0, r1: R1,
      label: topic.title,
      meta: topicMeta(topic),
      color: mix(base, "#FFFFFF", i % 2 ? 0.28 : 0.16),
      search: `${topic.title} ${(topic.keywords || []).join(" ")}`,
    }));

    const count = pages[i];
    const sSpan = TWO_PI * count / totalPages;
    const s0 = slideCursor;
    slideCursor += sSpan;
    const per = sSpan / count;
    for (let n = topic.from; n <= topic.to && n <= pagesOf(m.mod); n++) {
      const k = n - topic.from;
      arcs.push(makeArc({
        key: `s:${m.mod.id}:${topic.id}:${n}`,
        kind: "slide",
        modId: m.mod.id,
        topicId: topic.id,
        n,
        a0: s0 + per * k,
        a1: s0 + per * (k + 1),
        r0: R1, r1: R2,
        label: slideTitle(m.mod, n) || `Slide ${n}`,
        meta: `Pagina ${n} · ${topic.title}`,
        color: mix(base, "#FFFFFF", k % 2 ? 0.82 : 0.70),
        search: `${slideTitle(m.mod, n)} ${topic.title} ${n}`,
      }));
    }
  });
  return arcs;
}

function buildTopicArcs(m, topic, index) {
  const base = PALETTE[index % PALETTE.length];
  const list = [];
  for (let n = topic.from; n <= topic.to && n <= pagesOf(m.mod); n++) list.push(n);
  if (!list.length) list.push(topic.from || 1);
  const span = TWO_PI / list.length;
  return list.map((n, i) => makeArc({
    key: `s:${m.mod.id}:${topic.id}:${n}`,
    kind: "slide",
    modId: m.mod.id,
    topicId: topic.id,
    n,
    a0: span * i,
    a1: span * (i + 1),
    r0: R0, r1: R1,
    label: slideTitle(m.mod, n) || `Slide ${n}`,
    meta: `Pagina ${n} · ${topic.title}`,
    color: mix(base, "#FFFFFF", i % 2 ? 0.58 : 0.44),
    search: `${slideTitle(m.mod, n)} ${topic.title} ${n}`,
  }));
}

function centerArc(level, m, topic) {
  let label = "Corso";
  let sub = "Moduli e argomenti";
  let meta = "Seleziona un modulo per ingrandire";
  if (level === "module" && m) {
    label = truncate(m.mod.title, 18);
    sub = `${m.topics.length} argomenti`;
    meta = moduleMeta(m.mod, m.topics);
  } else if (level === "topic" && m && topic) {
    label = truncate(topic.title, 18);
    sub = topicMeta(topic);
    meta = sub;
  }
  return makeArc({ key: "center", kind: "center", a0: 0, a1: TWO_PI, r0: 0, r1: 100, label, sub, meta, color: "#FFFFFF" });
}

/* ---------------- API pubblica ---------------- */
export function createSunburst({ stage, info, crumbs, controls, onSlide, onOpenModule }) {
  let model = [];
  let level = "course";
  let currentMod = null;
  let currentTopic = null;
  let arcs = [];
  let raf = 0;
  let zoom = 1;
  let query = "";
  let hoverKey = null;
  let selectedKey = null;
  let lastTap = { key: null, time: 0 };

  const svg = $("svg", stage);
  const tooltip = $(".sun-tooltip", stage);
  const legendHost = stage.parentElement;

  function findModel(modId) {
    return model.find((m) => m.mod.id === modId);
  }

  function findArc(key) {
    return arcs.find((a) => a.key === key);
  }

  function allMeta(key) {
    const arc = findArc(key);
    if (arc) return { label: arc.label, meta: arc.meta };
    const m = findModel(key.slice(2));
    return m ? { label: m.mod.title, meta: moduleMeta(m.mod, m.topics) } : { label: key, meta: "" };
  }

  function tokensOf(value) {
    return norm(value).split(" ").filter(Boolean);
  }

  function decorate(list) {
    return list.map((a) => {
      const place = labelPlacement(a);
      return {
        ...a,
        showLabel: place.show,
        shortLabel: place.short,
        place,
        textColor: a.kind === "module" ? textOn(a.color) : INK,
      };
    });
  }

  function targetArcs() {
    if (level === "module" && currentMod) {
      const m = findModel(currentMod.id);
      return [centerArc(level, m, null), ...decorate(buildModuleArcs(m, model.indexOf(m)))];
    }
    if (level === "topic" && currentMod && currentTopic) {
      const m = findModel(currentMod.id);
      return [centerArc(level, m, currentTopic), ...decorate(buildTopicArcs(m, currentTopic, model.indexOf(m)))];
    }
    return [centerArc("course", null, null), ...decorate(buildCourseArcs(model))];
  }

  function detailArcForCurrent() {
    const m = findModel(currentMod?.id);
    if (!m) return null;
    if (level === "module") {
      return makeArc({
        key: `m:${m.mod.id}`, kind: "module", modId: m.mod.id,
        label: m.mod.title, meta: moduleMeta(m.mod, m.topics),
      });
    }
    if (level === "topic" && currentTopic) {
      return makeArc({
        key: `t:${m.mod.id}:${currentTopic.id}`, kind: "topic",
        modId: m.mod.id, topicId: currentTopic.id,
        label: currentTopic.title, meta: topicMeta(currentTopic),
      });
    }
    return null;
  }

  function sectorNodes(a) {
    const cls = ["sun-sector"];
    if (hoverKey === a.key) cls.push("is-hover");
    if (selectedKey === a.key) cls.push("is-selected");
    const label = a.meta ? `${a.label} — ${a.meta}` : a.label;
    const path = s("path", {
      class: cls.join(" "),
      "data-testid": "sun-sector",
      "data-key": a.key,
      "data-kind": a.kind,
      "data-mod": a.modId || "",
      "data-topic": a.topicId || "",
      "data-n": a.n || "",
      role: "button",
      tabindex: "0",
      "aria-label": label,
      fill: a.color,
      opacity: (a.opacity ?? 1).toFixed(3),
      d: arcPath(a),
    });
    path.appendChild(s("title", {}, label));
    const out = [path];
    if (a.showLabel) {
      out.push(s("text", {
        class: "sun-label",
        transform: `translate(${a.place.x.toFixed(2)} ${a.place.y.toFixed(2)}) rotate(${a.place.rotation.toFixed(2)})`,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        fill: a.textColor,
      }, a.shortLabel));
    }
    return out;
  }

  function centerNode(a) {
    const g = s("g", {
      class: "sun-core",
      "data-testid": "sun-center",
      "data-key": "center",
      role: level === "course" ? "img" : "button",
      tabindex: level === "course" ? "-1" : "0",
      "aria-label": `${a.label} — ${a.meta}`,
    });
    g.appendChild(s("circle", { cx: C, cy: C, r: 100 }));
    g.appendChild(s("text", { class: "sun-core-label", x: C, y: C - 7 }, a.label));
    g.appendChild(s("text", { class: "sun-core-sub", x: C, y: C + 13 }, a.sub || ""));
    g.appendChild(s("title", {}, `${a.label} — ${a.meta}`));
    return g;
  }

  function applyStates() {
    const tokens = tokensOf(query);
    const haystack = (a) => norm(`${a.label || ""} ${a.meta || ""} ${a.search || ""}`);
    if (svg) {
      for (const node of svg.querySelectorAll(".sun-sector")) {
        const arc = findArc(node.dataset.key);
        const matched = Boolean(tokens.length && arc && tokens.every((t) => haystack(arc).includes(t)));
        node.classList.toggle("is-dim", Boolean(tokens.length) && !matched);
        node.classList.toggle("is-match", matched);
      }
    }
    if (crumbs) {
      for (const btn of crumbs.querySelectorAll(".sun-crumb")) {
        btn.setAttribute("aria-current", btn.dataset.goto === level ? "page" : "false");
      }
    }
  }

  function draw(list) {
    if (!svg) return;
    const zoomTransform = `translate(${C} ${C}) scale(${zoom.toFixed(3)}) translate(${-C} ${-C})`;
    const center = list.find((a) => a.kind === "center");
    const root = s("g", { transform: zoomTransform });
    for (const a of list) {
      if (a.kind === "center") continue;
      for (const node of sectorNodes(a)) root.appendChild(node);
    }
    if (center) root.appendChild(centerNode(center));
    svg.setAttribute("data-level", level);
    stage.setAttribute("aria-label", `Sunburst: ${center ? center.label : "Corso"}. ${list.length - 1} settori visibili.`);
    svg.replaceChildren(root);
    applyStates();
  }

  function cancel() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function transition(next, animate = true, done) {
    cancel();
    const previous = arcs.length ? arcs.map((a) => ({ ...a })) : [];
    const nextByKey = new Map(next.map((a) => [a.key, a]));
    const frames = next.map((to) => {
      const from = previous.find((a) => a.key === to.key);
      if (from) return { from, to };
      const parent = previous.find((a) => a.key === parentKey(to.key));
      if (parent) {
        return { from: { ...to, a0: parent.a0, a1: parent.a1, r0: parent.r0, r1: parent.r0 + 14, opacity: 0 }, to };
      }
      return { from: { ...to, r0: 44, r1: 62, opacity: 0 }, to };
    });
    const exiting = [];
    for (const a of previous) {
      if (!nextByKey.has(a.key)) exiting.push({ from: a, to: { ...a, r1: a.r0 + 12, opacity: 0 } });
    }

    if (!animate || reduced() || !previous.length) {
      arcs = next;
      draw(arcs);
      done?.();
      return;
    }
    const t0 = performance.now();
    const dur = 400;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - (1 - p) ** 3;
      const frame = [];
      for (const f of frames) frame.push(interpolateArc(f.from, f.to, e));
      for (const f of exiting) frame.push(interpolateArc(f.from, f.to, e));
      draw(frame);
      if (p < 1) raf = requestAnimationFrame(step);
      else { raf = 0; arcs = next; draw(arcs); done?.(); }
    };
    raf = requestAnimationFrame(step);
  }

  function renderCrumbs() {
    if (!crumbs) return;
    const modName = currentMod ? truncate(currentMod.title, 30) : "";
    const topicName = currentTopic ? truncate(currentTopic.title, 30) : "";
    const crumb = (goto, label) => h("button", { type: "button", class: "sun-crumb", "data-goto": goto, "data-testid": "sun-crumb" }, label);
    const parts = [crumb("course", "Corso")];
    if (level !== "course") {
      parts.push(h("span", { class: "sun-sep", "aria-hidden": "true" }, "›"));
      parts.push(crumb("module", modName));
    }
    if (level === "topic") {
      parts.push(h("span", { class: "sun-sep", "aria-hidden": "true" }, "›"));
      parts.push(crumb("topic", topicName));
    }
    crumbs.replaceChildren(...parts);
    applyStates();
  }

  function renderDetail(arc) {
    if (!info) return;
    const target = !arc || arc.key === "center" ? centerArc(level, findModel(currentMod?.id), currentTopic) : arc;
    const nodes = [h("h3", {}, target.label)];
    if (!arc || arc.key === "center") {
      nodes.push(h("p", { class: "sun-detail-hint" }, target.meta));
      info.replaceChildren(...nodes);
      return;
    }
    nodes.push(h("p", {}, target.meta));
    const dl = h("dl", {});
    const mod = findModel(target.modId)?.mod;
    const pairs = [["Livello", KIND_LABEL[target.kind] || "Elemento"]];
    if (mod) pairs.push(["Docente", [].concat(mod.lecturers || []).join(", ") || "—"]);
    for (const [key, value] of pairs) {
      dl.appendChild(h("dt", {}, key));
      dl.appendChild(h("dd", {}, value));
    }
    nodes.push(dl);
    if (target.kind === "module") {
      nodes.push(h("button", {
        type: "button", class: "linkish", "data-action": "open-flow", "data-mod": target.modId,
      }, "Apri il percorso completo"));
    } else if (target.kind === "slide") {
      nodes.push(h("button", {
        type: "button", class: "btn btn-primary", "data-action": "open-slide",
        "data-mod": target.modId, "data-n": target.n,
      }, `Apri slide ${target.n}`));
    }
    info.replaceChildren(...nodes);
  }

  function hideTooltip() {
    if (tooltip) tooltip.hidden = true;
    hoverKey = null;
    if (svg) {
      for (const n of svg.querySelectorAll(".is-hover")) n.classList.remove("is-hover");
    }
  }

  function showTooltip(arc, evt) {
    if (!tooltip || !arc) return;
    hoverKey = arc.key;
    tooltip.replaceChildren(h("b", {}, arc.label), h("span", {}, arc.meta));
    tooltip.hidden = false;
    const stageRect = stage.getBoundingClientRect();
    let x;
    let y;
    if (evt && Number.isFinite(evt.clientX)) {
      x = evt.clientX - stageRect.left + 14;
      y = evt.clientY - stageRect.top + 14;
    } else {
      let item = null;
      if (legend) {
        for (const btn of legend.querySelectorAll(".sun-lg")) {
          if (btn.dataset.key === arc.key) { item = btn; break; }
        }
      }
      const r = item?.getBoundingClientRect();
      x = r ? r.right - stageRect.left + 10 : stageRect.width / 2;
      y = r ? r.top - stageRect.top : 12;
    }
    const w = tooltip.offsetWidth;
    const ht = tooltip.offsetHeight;
    tooltip.style.left = `${Math.max(8, Math.min(x, stageRect.width - w - 8))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(y, stageRect.height - ht - 8))}px`;
    if (svg) {
      for (const n of svg.querySelectorAll(".sun-sector")) n.classList.toggle("is-hover", n.dataset.key === arc.key);
    }
  }

  function goCourse(done) {
    level = "course";
    currentMod = null;
    currentTopic = null;
    selectedKey = null;
    hideTooltip();
    transition(targetArcs(), true, done);
    renderCrumbs();
    renderDetail(null);
  }

  function goModule(mod, done) {
    const m = findModel(mod.id);
    if (!m) return;
    level = "module";
    currentMod = mod;
    currentTopic = null;
    selectedKey = `m:${mod.id}`;
    hideTooltip();
    transition(targetArcs(), true, done);
    renderCrumbs();
    renderDetail(detailArcForCurrent());
  }

  function goTopic(mod, topic, done) {
    const m = findModel(mod.id);
    if (!m) return;
    level = "topic";
    currentMod = mod;
    currentTopic = topic;
    selectedKey = `t:${mod.id}:${topic.id}`;
    hideTooltip();
    transition(targetArcs(), true, done);
    renderCrumbs();
    renderDetail(detailArcForCurrent());
  }

  function goUp(done) {
    if (level === "topic" && currentMod) goModule(currentMod, done);
    else if (level === "module") goCourse(done);
  }

  function selectArc(arc) {
    selectedKey = arc.key;
    if (svg) {
      for (const n of svg.querySelectorAll(".sun-sector")) n.classList.toggle("is-selected", n.dataset.key === arc.key);
    }
    renderDetail(arc);
  }

  function openArc(arc, done) {
    if (!arc) return;
    if (arc.kind === "center") { goUp(done); return; }
    const modelEntry = findModel(arc.modId);
    const mod = modelEntry?.mod;
    if (!mod) return;
    if (arc.kind === "module") goModule(mod, done);
    else if (arc.kind === "topic") {
      const full = modelEntry.topics.find((t) => t.id === arc.topicId);
      goTopic(mod, full || { id: arc.topicId, title: arc.label, from: 1, to: pagesOf(mod), count: pagesOf(mod) }, done);
    }
    else if (arc.kind === "slide" && arc.n) onSlide?.(mod, arc.n);
  }

  function activate(arc, evt) {
    if (!arc) return;
    const coarse = evt?.pointerType === "touch";
    if (coarse && arc.kind !== "center") {
      const now = Date.now();
      if (lastTap.key !== arc.key || now - lastTap.time > 700) {
        lastTap = { key: arc.key, time: now };
        selectArc(arc);
        showTooltip(arc, evt);
        return;
      }
      lastTap = { key: null, time: 0 };
    }
    openArc(arc);
  }

  function arcFromEvent(e) {
    const node = e.target.closest(".sun-sector, .sun-core");
    if (!node) return null;
    if (node.classList.contains("sun-core")) return centerArc(level, findModel(currentMod?.id), currentTopic);
    return findArc(node.dataset.key);
  }

  /* ---------------- eventi ---------------- */
  svg?.addEventListener("click", (e) => activate(arcFromEvent(e), e));
  svg?.addEventListener("pointerdown", (e) => {
    const arc = arcFromEvent(e);
    if (e.pointerType === "touch" && arc) showTooltip(arc, e);
  });
  svg?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Escape" && e.key !== "Backspace") return;
    e.preventDefault();
    e.stopPropagation();
    const refocus = () => {
      const target = level === "course"
        ? svg?.querySelector(".sun-sector")
        : svg?.querySelector(".sun-core[tabindex='0']");
      target?.focus?.();
    };
    if (e.key === "Escape" || e.key === "Backspace") { goUp(refocus); return; }
    openArc(arcFromEvent(e), refocus);
  });
  svg?.addEventListener("focusin", (e) => {
    const node = e.target.closest(".sun-sector");
    if (node) showTooltip(findArc(node.dataset.key));
  });
  svg?.addEventListener("focusout", hideTooltip);
  svg?.addEventListener("pointerleave", hideTooltip);

  crumbs?.addEventListener("click", (e) => {
    const btn = e.target.closest(".sun-crumb");
    if (!btn) return;
    if (btn.dataset.goto === "course") goCourse();
    else if (btn.dataset.goto === "module" && currentMod) goModule(currentMod);
  });

  controls?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "in") zoom = Math.min(2.5, zoom + 0.2);
    else if (action === "out") zoom = Math.max(0.7, zoom - 0.2);
    else zoom = 1;
    draw(arcs);
  });

  info?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const mod = findModel(btn.dataset.mod)?.mod;
    if (!mod) return;
    if (btn.dataset.action === "open-slide") onSlide?.(mod, Number(btn.dataset.n));
    else onOpenModule?.(mod);
  });

  const legend = $(".sun-legend", stage.closest(".sun-layout") || legendHost || document);
  legend?.addEventListener("pointerover", (e) => {
    const btn = e.target.closest(".sun-lg");
    if (btn) showTooltip(allMeta(btn.dataset.key), e);
  });
  legend?.addEventListener("pointerout", (e) => {
    if (e.target.closest(".sun-lg")) hideTooltip();
  });
  legend?.addEventListener("focusin", (e) => {
    const btn = e.target.closest(".sun-lg");
    if (btn) showTooltip(allMeta(btn.dataset.key));
  });
  legend?.addEventListener("focusout", (e) => {
    if (e.target.closest(".sun-lg")) hideTooltip();
  });
  legend?.addEventListener("click", (e) => {
    const btn = e.target.closest(".sun-lg");
    if (!btn) return;
    const mod = findModel(btn.dataset.mod)?.mod;
    if (!mod) return;
    goModule(mod);
  });

  return {
    build(mods, manifest) {
      cancel();
      model = (mods || []).map((mod) => ({ mod, topics: effectiveTopics(mod) }));
      if (legend) {
        legend.replaceChildren(...model.map((m, i) => {
          const li = document.createElement("li");
          const btn = h("button", {
            type: "button", class: "sun-lg", "data-testid": "sun-legend-item",
            "data-key": `m:${m.mod.id}`, "data-mod": m.mod.id,
          });
          btn.appendChild(h("span", { class: "sun-lg-dot", style: `--dot:${PALETTE[i % PALETTE.length]}` }));
          btn.appendChild(h("span", { class: "sun-lg-n" }, String(m.mod.n ?? i + 1).padStart(2, "0")));
          btn.appendChild(h("span", { class: "sun-lg-title" }, m.mod.title));
          li.appendChild(btn);
          return li;
        }));
      }
      if (manifest?.course?.title) svg?.setAttribute("aria-label", `Sunburst del corso ${manifest.course.title}`);
      zoom = 1;
      goCourse();
    },
    layout() { draw(arcs); },
    reset() { goCourse(); },
    setQuery(value) {
      query = value || "";
      applyStates();
      const tokens = tokensOf(query);
      if (!legend) return;
      for (const btn of legend.querySelectorAll(".sun-lg")) {
        const m = findModel(btn.dataset.mod);
        const hay = m ? norm(`${m.mod.title} ${m.mod.label || ""} ${m.mod.lecturers || ""} ${m.topics.map((t) => `${t.title} ${(t.keywords || []).join(" ")}`).join(" ")}`) : "";
        const hit = Boolean(m && tokens.length && tokens.every((t) => hay.includes(t)));
        btn.classList.toggle("is-match", hit);
        btn.classList.toggle("is-dim", Boolean(tokens.length) && !hit);
      }
    },
    goModule,
    goTopic,
    goCourse,
    get state() {
      return { level, modId: currentMod?.id || null, topicId: currentTopic?.id || null, zoom, sectors: arcs.length };
    },
  };
}
