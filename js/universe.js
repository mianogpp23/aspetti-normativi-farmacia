/* universe.js — mappa come sistema solare navigabile.
   Moduli = pianeti, argomenti = lune, slide = satelliti. SVG + JS vanilla. */

import { $, norm } from "./utils.js";
import { topicsOf, pagesOf, slideTitle } from "./data.js";

const SIZE = 730;
const C = SIZE / 2;
const PALETTE = [
  "#4C9BE8", // blu
  "#E08A4B", // rame
  "#57B58A", // verde
  "#A986D8", // viola
  "#D97090", // bordò
  "#B6AB58", // oliva
  "#45B8BD", // teal
  "#8E8CE0", // indaco
];
const KIND_LABEL = { module: "Pianeta · modulo", topic: "Luna · argomento", slide: "Satellite · slide" };
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- DOM helpers (nessun innerHTML) ---------------- */
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

/* ---------------- colore e testo ---------------- */
function rgb(hex) {
  const v = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

function mix(hex, target, ratio) {
  const a = rgb(hex);
  const b = rgb(target);
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * ratio).toString(16).padStart(2, "0")).join("")}`;
}

function truncate(value, max) {
  const v = String(value || "").replace(/\s+/g, " ").trim();
  return v.length <= max ? v : `${v.slice(0, Math.max(1, max - 1))}…`;
}

/* ---------------- dati ---------------- */
function effectiveTopics(mod) {
  const topics = topicsOf(mod);
  if (topics.length) return topics;
  const pages = pagesOf(mod);
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

function makeNode(o) {
  return { opacity: 1, ...o };
}

function bodyFor(levelName, m, topic, worldCount = 0) {
  if (levelName === "module" && m) {
    return {
      label: truncate(m.mod.title, 20),
      sub: `${m.topics.length} lune`,
      meta: moduleMeta(m.mod, m.topics),
    };
  }
  if (levelName === "topic" && m && topic) {
    return { label: truncate(topic.title, 20), sub: topicMeta(topic), meta: topicMeta(topic) };
  }
  return { label: "Corso", sub: `${worldCount} mondi da esplorare`, meta: "Seleziona un pianeta per avvicinarti" };
}

function buildCourseNodes(model) {
  const radii = [118, 198, 274];
  const perRing = [[], [], []];
  model.forEach((_, i) => { perRing[i % 3].push(i); });
  const nodes = [];
  perRing.forEach((indices, ring) => {
    indices.forEach((idx, pos) => {
      const m = model[idx];
      const base = PALETTE[idx % PALETTE.length];
      nodes.push(makeNode({
        key: `m:${m.mod.id}`, kind: "module", modId: m.mod.id,
        label: truncate(m.mod.title, 15), fullLabel: m.mod.title,
        meta: moduleMeta(m.mod, m.topics),
        color: base, search: `${m.mod.title} ${m.mod.label || ""} ${m.mod.lecturers || ""}`,
        radius: 13 + Math.min(7, Math.round(Math.sqrt(m.topics.length) * 1.7)),
        orbit: radii[ring], phase: (pos * 360 / indices.length + ring * 20) % 360,
        period: [92000, 124000, 156000][ring] * (idx % 2 ? -1 : 1),
        ring,
      }));
    });
  });
  return nodes;
}

function buildModuleNodes(m, index) {
  const base = PALETTE[index % PALETTE.length];
  const count = m.topics.length || 1;
  return m.topics.map((topic, i) => makeNode({
    key: `t:${m.mod.id}:${topic.id}`, kind: "topic", modId: m.mod.id, topicId: topic.id,
    label: truncate(topic.title, 13), fullLabel: topic.title,
    meta: topicMeta(topic),
    color: mix(base, "#FFFFFF", i % 2 ? 0.24 : 0.1),
    search: `${topic.title} ${(topic.keywords || []).join(" ")}`,
    radius: 10 + Math.min(4, Math.round(Math.sqrt(topic.count || 1) * 1.1)),
    orbit: 158,
    phase: (i * 360 / count + 12) % 360,
    period: 52000 * (i % 2 ? -1 : 1),
    ring: 0,
  }));
}

function buildTopicNodes(m, topic, index) {
  const base = PALETTE[index % PALETTE.length];
  const list = [];
  for (let n = topic.from; n <= topic.to && n <= pagesOf(m.mod); n++) list.push(n);
  if (!list.length) list.push(topic.from || 1);
  return list.map((n, i) => makeNode({
    key: `s:${m.mod.id}:${topic.id}:${n}`, kind: "slide", modId: m.mod.id, topicId: topic.id, n,
    label: String(n), fullLabel: slideTitle(m.mod, n) || `Slide ${n}`,
    meta: `Pagina ${n} · ${topic.title}`,
    color: mix(base, "#FFFFFF", i % 2 ? 0.5 : 0.34),
    search: `${slideTitle(m.mod, n)} ${topic.title} ${n}`,
    radius: 9,
    orbit: 168,
    phase: (i * 360 / list.length) % 360,
    period: 42000 * (i % 2 ? -1 : 1),
    ring: 0,
  }));
}

/* ---------------- API pubblica ---------------- */
export function createUniverse({ stage, info, crumbs, controls, onSlide, onOpenModule }) {
  let model = [];
  let level = "course";
  let currentMod = null;
  let currentTopic = null;
  let nodes = [];
  let zoom = 1;
  let rotation = 0;
  let drag = null;
  let suppressClickUntil = 0;
  let query = "";
  let hoverKey = null;
  let selectedKey = null;
  let lastTap = { key: null, time: 0 };
  let motionTime = 0;
  let lastFrame = 0;
  let paused = false;
  let raf = 0;
  const anchors = new Map();

  const svg = $("svg", stage);
  const tooltip = $(".sun-tooltip", stage);
  const rotationStatus = $("#sun-rotation-status", stage);
  const motionBtn = controls?.querySelector('[data-action="toggle-motion"]');
  const legend = $(".sun-legend", stage.closest(".sun-layout") || stage.parentElement || document);

  function findModel(modId) { return model.find((m) => m.mod.id === modId); }
  function findNode(key) { return nodes.find((n) => n.key === key); }

  function allMeta(key) {
    const node = findNode(key);
    if (node) return { label: node.fullLabel || node.label, meta: node.meta };
    const m = findModel(key.slice(2));
    return m ? { label: m.mod.title, meta: moduleMeta(m.mod, m.topics) } : { label: key, meta: "" };
  }

  function tokensOf(value) { return norm(value).split(" ").filter(Boolean); }

  function targetNodes() {
    if (level === "module" && currentMod) {
      const m = findModel(currentMod.id);
      return m ? buildModuleNodes(m, model.indexOf(m)) : [];
    }
    if (level === "topic" && currentMod && currentTopic) {
      const m = findModel(currentMod.id);
      return m ? buildTopicNodes(m, currentTopic, model.indexOf(m)) : [];
    }
    return buildCourseNodes(model);
  }

  function detailNode() {
    const m = findModel(currentMod?.id);
    if (!m) return null;
    if (level === "module") {
      return makeNode({
        key: `m:${m.mod.id}`, kind: "module", modId: m.mod.id,
        label: m.mod.title, meta: moduleMeta(m.mod, m.topics),
      });
    }
    if (level === "topic" && currentTopic) {
      return makeNode({
        key: `t:${m.mod.id}:${currentTopic.id}`, kind: "topic",
        modId: m.mod.id, topicId: currentTopic.id,
        label: currentTopic.title, meta: topicMeta(currentTopic),
      });
    }
    return null;
  }

  function defsFor(list) {
    const defs = s("defs", {});
    const seen = new Set();
    for (const node of list) {
      if (seen.has(node.color)) continue;
      seen.add(node.color);
      const id = `orb-${node.color.slice(1)}`;
      const grad = s("radialGradient", { id, cx: "34%", cy: "28%", r: "78%" });
      grad.appendChild(s("stop", { offset: "0%", "stop-color": mix(node.color, "#FFFFFF", 0.6) }));
      grad.appendChild(s("stop", { offset: "58%", "stop-color": node.color }));
      grad.appendChild(s("stop", { offset: "100%", "stop-color": mix(node.color, "#000814", 0.42) }));
      defs.appendChild(grad);
    }
    return defs;
  }

  function tracksFor(list) {
    const g = s("g", { class: "orbit-tracks", "aria-hidden": "true" });
    const radii = [...new Set(list.map((n) => n.orbit))].sort((a, b) => a - b);
    for (const r of radii) g.appendChild(s("circle", { cx: C, cy: C, r, class: "orbit-track" }));
    g.appendChild(s("circle", { cx: C, cy: C, r: 74, class: "orbit-track orbit-track-core" }));
    return g;
  }

  function bodyNode(node) {
    const cls = ["universe-body"];
    if (hoverKey === node.key) cls.push("is-hover");
    if (selectedKey === node.key) cls.push("is-selected");
    const label = node.fullLabel || node.label;
    const aria = `${label} — ${node.meta}`;
    const g = s("g", {
      class: cls.join(" "),
      "data-testid": "universe-body",
      "data-key": node.key,
      "data-kind": node.kind,
      "data-mod": node.modId || "",
      "data-topic": node.topicId || "",
      "data-n": node.n || "",
      role: "button",
      tabindex: "0",
      "aria-label": aria,
    });
    g.appendChild(s("circle", { class: "body-halo", r: node.radius + 5 }));
    g.appendChild(s("circle", { class: "body-disc", r: node.radius, fill: `url(#orb-${node.color.slice(1)})` }));
    g.appendChild(s("circle", { class: "body-shine", cx: -node.radius * 0.3, cy: -node.radius * 0.36, r: Math.max(1.5, node.radius * 0.18) }));
    if (node.kind !== "slide") {
      const text = s("text", {
        class: "body-name", x: 0, y: node.radius + 17,
        "text-anchor": "middle", "dominant-baseline": "middle",
        fill: "#E8F1FA",
      }, node.label);
      g.appendChild(text);
    }
    g.appendChild(s("title", {}, aria));
    return g;
  }

  function moonCluster(modId, color) {
    const m = findModel(modId);
    if (!m || !m.topics.length) return null;
    const g = s("g", { class: "moon-cluster", "aria-hidden": "true" });
    const count = Math.min(6, m.topics.length);
    for (let i = 0; i < count; i++) {
      const a = (i * 360 / count) * Math.PI / 180;
      g.appendChild(s("circle", {
        class: "moon-dot",
        cx: (26 * Math.sin(a)).toFixed(2),
        cy: (-26 * Math.cos(a)).toFixed(2),
        r: 3.4,
        fill: mix(color, "#FFFFFF", 0.55 + (i % 2) * 0.2),
      }));
    }
    return g;
  }

  function coreNode() {
    const target = bodyFor(level, findModel(currentMod?.id), currentTopic, model.length);
    const g = s("g", {
      class: "sun-core",
      "data-testid": "universe-center",
      "data-key": "center",
      role: level === "course" ? "img" : "button",
      tabindex: level === "course" ? "-1" : "0",
      "aria-label": `${target.label} — ${target.meta}`,
    });
    g.appendChild(s("circle", { class: "core-corona", r: 76 }));
    g.appendChild(s("circle", { class: "core-disc", r: 58 }));
    g.appendChild(s("text", { class: "core-label", x: 0, y: -7, "text-anchor": "middle" }, target.label));
    g.appendChild(s("text", { class: "core-sub", x: 0, y: 15, "text-anchor": "middle" }, target.sub));
    g.appendChild(s("title", {}, `${target.label} — ${target.meta}`));
    return g;
  }

  function positionAll() {
    for (const [key, anchor] of anchors) {
      const node = findNode(key);
      if (!node) continue;
      const deg = node.phase + (motionTime / Math.abs(node.period)) * 360 * Math.sign(node.period);
      const rad = deg * Math.PI / 180;
      const x = C + node.orbit * Math.sin(rad);
      const y = C - node.orbit * Math.cos(rad);
      anchor.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    }
  }

  function draw() {
    if (!svg) return;
    const zoomLayer = s("g", {
      class: "zoom-layer",
      transform: `translate(${C} ${C}) scale(${zoom.toFixed(3)}) translate(${-C} ${-C})`,
    });
    const rotor = s("g", {
      class: "sun-rotor",
      transform: `rotate(${rotation.toFixed(2)} ${C} ${C})`,
    });
    rotor.appendChild(tracksFor(nodes));
    anchors.clear();
    for (const node of nodes) {
      const anchor = s("g", { class: "orbit-anchor", "data-key": node.key });
      anchor.appendChild(bodyNode(node));
      if (level === "course" && node.kind === "module" && (hoverKey === node.key || selectedKey === node.key)) {
        const moons = moonCluster(node.modId, node.color);
        if (moons) anchor.insertBefore(moons, anchor.firstChild);
      }
      anchors.set(node.key, anchor);
      rotor.appendChild(anchor);
    }
    zoomLayer.appendChild(rotor);
    const core = coreNode();
    core.setAttribute("transform", `translate(${C} ${C})`);
    zoomLayer.appendChild(core);
    svg.setAttribute("data-level", level);
    svg.setAttribute("data-rotation", String(Math.round(rotation)));
    stage.setAttribute("aria-label", `Universo del corso: ${bodyFor(level, findModel(currentMod?.id), currentTopic, model.length).label}. ${nodes.length} corpi visibili.`);
    svg.replaceChildren(defsFor(nodes), zoomLayer);
    positionAll();
    applyStates();
  }

  function applyStates() {
    const tokens = tokensOf(query);
    const haystack = (n) => norm(`${n.fullLabel || n.label} ${n.meta} ${n.search || ""}`);
    if (svg) {
      for (const node of svg.querySelectorAll(".universe-body")) {
        const n = findNode(node.dataset.key);
        const matched = Boolean(tokens.length && n && tokens.every((t) => haystack(n).includes(t)));
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

  function tick(now) {
    const dt = Math.min(80, now - (lastFrame || now));
    lastFrame = now;
    if (!paused && !reduced()) motionTime += dt;
    positionAll();
    raf = requestAnimationFrame(tick);
  }

  function startClock() {
    if (!raf) { lastFrame = performance.now(); raf = requestAnimationFrame(tick); }
  }

  function changeLevel(nextLevel, done) {
    level = nextLevel;
    nodes = targetNodes();
    hoverKey = null;
    hideTooltip();
    draw();
    renderCrumbs();
    renderDetail(level === "course" ? null : detailNode());
    done?.();
  }

  function animateIn(done) {
    if (!svg || reduced()) { done?.(); return; }
    svg.classList.remove("is-arriving");
    void svg.getBoundingClientRect();
    svg.classList.add("is-arriving");
    window.setTimeout(() => { svg.classList.remove("is-arriving"); done?.(); }, 380);
  }

  function goCourse(done) {
    currentMod = null;
    currentTopic = null;
    selectedKey = null;
    changeLevel("course", () => animateIn(done));
  }

  function goModule(mod, done) {
    const m = findModel(mod.id);
    if (!m) return;
    currentMod = mod;
    currentTopic = null;
    selectedKey = `m:${mod.id}`;
    changeLevel("module", () => animateIn(done));
  }

  function goTopic(mod, topic, done) {
    const m = findModel(mod.id);
    if (!m) return;
    currentMod = mod;
    currentTopic = topic;
    selectedKey = `t:${mod.id}:${topic.id}`;
    changeLevel("topic", () => animateIn(done));
  }

  function goUp(done) {
    if (level === "topic" && currentMod) goModule(currentMod, done);
    else if (level === "module") goCourse(done);
  }

  function renderCrumbs() {
    if (!crumbs) return;
    const modName = currentMod ? truncate(currentMod.title, 30) : "";
    const topicName = currentTopic ? truncate(currentTopic.title, 30) : "";
    const crumb = (goto, label) => h("button", {
      type: "button", class: "sun-crumb", "data-goto": goto, "data-testid": "sun-crumb",
    }, label);
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

  function renderDetail(node) {
    if (!info) return;
    const m = findModel(currentMod?.id);
    const target = !node || node.key === "center" ? detailNode() || bodyFor(level, m, currentTopic, model.length) : node;
    const out = [h("h3", {}, target.fullLabel || target.label)];
    if (!node || node.key === "center") {
      out.push(h("p", { class: "sun-detail-hint" }, target.meta));
      info.replaceChildren(...out);
      return;
    }
    out.push(h("p", {}, target.meta));
    const dl = h("dl", {});
    const pairs = [["Livello", KIND_LABEL[target.kind] || "Elemento"]];
    const mod = findModel(target.modId)?.mod;
    if (mod) pairs.push(["Docente", [].concat(mod.lecturers || []).join(", ") || "—"]);
    for (const [key, value] of pairs) {
      dl.appendChild(h("dt", {}, key));
      dl.appendChild(h("dd", {}, value));
    }
    out.push(dl);
    if (target.kind === "module") {
      out.push(h("button", {
        type: "button", class: "linkish", "data-action": "open-flow", "data-mod": target.modId,
      }, "Apri il percorso completo"));
    } else if (target.kind === "slide") {
      out.push(h("button", {
        type: "button", class: "btn btn-primary", "data-action": "open-slide",
        "data-mod": target.modId, "data-n": target.n,
      }, `Apri slide ${target.n}`));
    }
    info.replaceChildren(...out);
  }

  function hideTooltip() {
    if (tooltip) tooltip.hidden = true;
    hoverKey = null;
    if (svg) for (const n of svg.querySelectorAll(".is-hover")) n.classList.remove("is-hover");
  }

  function showTooltip(node, evt) {
    if (!tooltip || !node) return;
    hoverKey = node.key;
    tooltip.replaceChildren(h("b", {}, node.fullLabel || node.label), h("span", {}, node.meta));
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
          if (btn.dataset.key === node.key) { item = btn; break; }
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
    if (svg) for (const n of svg.querySelectorAll(".universe-body")) n.classList.toggle("is-hover", n.dataset.key === node.key);
  }

  function setRotation(value, announce = true) {
    rotation = ((value % 360) + 360) % 360;
    if (svg) svg.setAttribute("data-rotation", String(Math.round(rotation)));
    positionAll();
    if (announce && rotationStatus) rotationStatus.textContent = `Rotazione ${Math.round(rotation)} gradi.`;
  }

  function announceRotation() {
    if (rotationStatus) rotationStatus.textContent = `Rotazione ${Math.round(rotation)} gradi.`;
  }

  function selectNode(node) {
    selectedKey = node.key;
    if (svg) for (const n of svg.querySelectorAll(".universe-body")) n.classList.toggle("is-selected", n.dataset.key === node.key);
    renderDetail(node);
    if (level === "course") draw();
  }

  function openNode(node, done) {
    if (!node) return;
    if (node.kind === "center") { goUp(done); return; }
    const m = findModel(node.modId);
    if (!m) return;
    if (node.kind === "module") goModule(m.mod, done);
    else if (node.kind === "topic") {
      const full = m.topics.find((t) => t.id === node.topicId);
      goTopic(m.mod, full || { id: node.topicId, title: node.fullLabel || node.label, from: 1, to: pagesOf(m.mod), count: pagesOf(m.mod) }, done);
    } else if (node.kind === "slide" && node.n) onSlide?.(m.mod, node.n);
  }

  function activate(node, evt) {
    if (!node) return;
    if (evt?.pointerType === "touch" && node.kind !== "center") {
      const now = Date.now();
      if (lastTap.key !== node.key || now - lastTap.time > 700) {
        lastTap = { key: node.key, time: now };
        selectNode(node);
        showTooltip(node, evt);
        return;
      }
      lastTap = { key: null, time: 0 };
    }
    openNode(node);
  }

  function nodeFromEvent(e) {
    const el = e.target.closest?.(".universe-body, .sun-core");
    if (!el) return null;
    if (el.classList.contains("sun-core")) {
      const m = findModel(currentMod?.id);
      const target = bodyFor(level, m, currentTopic, model.length);
      return makeNode({
        key: "center", kind: "center", modId: currentMod?.id, topicId: currentTopic?.id,
        label: target.label, fullLabel: target.label, meta: target.meta,
      });
    }
    return findNode(el.dataset.key);
  }

  function syncMotionControl() {
    if (!motionBtn) return;
    const off = paused || reduced();
    let label = paused ? "Riprendi il movimento dei pianeti" : "Metti in pausa il movimento dei pianeti";
    if (reduced()) label = "Movimento disattivato dalle preferenze di sistema";
    motionBtn.textContent = off ? "▶" : "⏸";
    motionBtn.setAttribute("aria-pressed", String(off));
    motionBtn.setAttribute("aria-label", label);
    motionBtn.setAttribute("title", reduced() ? "Movimento disattivato dalle preferenze di sistema" : "Pausa / riprendi il movimento");
    motionBtn.disabled = reduced();
  }

  function toggleMotion() {
    if (reduced()) {
      syncMotionControl();
      if (rotationStatus) rotationStatus.textContent = "Movimento disattivato dalle preferenze di sistema.";
      return;
    }
    paused = !paused;
    syncMotionControl();
    if (rotationStatus) rotationStatus.textContent = paused ? "Movimento dei pianeti in pausa." : "Movimento dei pianeti ripreso.";
  }

  /* ---------------- eventi ---------------- */
  svg?.addEventListener("click", (e) => {
    if (Date.now() < suppressClickUntil) {
      suppressClickUntil = 0;
      e.preventDefault();
      return;
    }
    activate(nodeFromEvent(e), e);
  });

  svg?.addEventListener("pointerdown", (e) => {
    if (e.button === 0 && e.shiftKey) {
      const rect = svg.getBoundingClientRect();
      drag = {
        id: e.pointerId,
        angle: Math.atan2(e.clientY - (rect.top + rect.height / 2), e.clientX - (rect.left + rect.width / 2)) * 180 / Math.PI,
        start: rotation,
        moved: false,
      };
      svg.setPointerCapture(e.pointerId);
      svg.classList.add("is-rotating");
      e.preventDefault();
      return;
    }
    const node = nodeFromEvent(e);
    if (e.pointerType === "touch" && node && node.kind !== "center") showTooltip(node, e);
  });

  svg?.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const rect = svg.getBoundingClientRect();
    const angle = Math.atan2(e.clientY - (rect.top + rect.height / 2), e.clientX - (rect.left + rect.width / 2)) * 180 / Math.PI;
    const delta = angle - drag.angle;
    if (Math.abs(delta) > 2) drag.moved = true;
    setRotation(drag.start + delta, false);
  });

  function endRotation(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) suppressClickUntil = Date.now() + 300;
    drag = null;
    svg?.classList.remove("is-rotating");
    if (svg?.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    announceRotation();
  }
  svg?.addEventListener("pointerup", endRotation);
  svg?.addEventListener("pointercancel", endRotation);
  svg?.addEventListener("lostpointercapture", endRotation);

  svg?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Escape" && e.key !== "Backspace") return;
    e.preventDefault();
    e.stopPropagation();
    const refocus = () => {
      const target = level === "course"
        ? svg?.querySelector(".universe-body")
        : svg?.querySelector(".sun-core[tabindex='0']");
      target?.focus?.();
    };
    if (e.key === "Escape" || e.key === "Backspace") { goUp(refocus); return; }
    openNode(nodeFromEvent(e), refocus);
  });

  svg?.addEventListener("focusin", (e) => {
    const node = nodeFromEvent(e);
    if (node && node.kind !== "center") showTooltip(node);
  });
  svg?.addEventListener("focusout", () => hideTooltip());
  svg?.addEventListener("pointerover", (e) => {
    const node = nodeFromEvent(e);
    if (node && node.kind !== "center") showTooltip(node, e);
  });
  svg?.addEventListener("pointerout", (e) => {
    if (e.target.closest?.(".universe-body")) hideTooltip();
  });
  svg?.addEventListener("pointerleave", () => hideTooltip());

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
    if (action === "rotate-left") setRotation(rotation - 30);
    else if (action === "rotate-right") setRotation(rotation + 30);
    else if (action === "in") zoom = Math.min(2.5, zoom + 0.2);
    else if (action === "out") zoom = Math.max(0.7, zoom - 0.2);
    else if (action === "toggle-motion") toggleMotion();
    else { zoom = 1; setRotation(0); }
    draw();
  });

  info?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const mod = findModel(btn.dataset.mod)?.mod;
    if (!mod) return;
    if (btn.dataset.action === "open-slide") onSlide?.(mod, Number(btn.dataset.n));
    else onOpenModule?.(mod);
  });

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
    if (mod) goModule(mod);
  });

  return {
    build(mods, manifest) {
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
      zoom = 1;
      rotation = 0;
      motionTime = 0;
      syncMotionControl();
      goCourse();
      startClock();
      if (manifest?.course?.title) stage.setAttribute("aria-label", `Universo del corso ${manifest.course.title}`);
    },
    layout() { draw(); },
    reset() { goCourse(); },
    setQuery(value) {
      query = value || "";
      applyStates();
      if (!legend) return;
      const tokens = tokensOf(query);
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
      return {
        level, modId: currentMod?.id || null, topicId: currentTopic?.id || null,
        zoom, rotation, bodies: nodes.length, paused, motionTime: Math.round(motionTime),
      };
    },
  };
}
