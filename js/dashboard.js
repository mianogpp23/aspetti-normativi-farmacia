/* dashboard.js — vista elenco come dashboard: metriche, ripresa dello studio,
   prossimi argomenti e pagine per modulo, con avanzamento persistente. */

import { clamp, norm } from "./utils.js";
import { modules, pagesOf, topicsOf, slideTitle } from "./data.js";

const STORAGE_KEY = "farmacista:v1:dashboard";
const LEGACY_KEY = "farmacista:v1:kanban";

const PALETTE = [
  "#155E75", "#8A4B08", "#276749", "#5B3B8C",
  "#9B2C4F", "#6B5B12", "#0E6A6E", "#3D4A8A",
];

const STATUS = [
  { id: "todo", label: "Da iniziare" },
  { id: "doing", label: "In corso" },
  { id: "done", label: "Completato" },
];

function emptyStore() {
  return { modules: {} };
}

function normaliseRec(rec) {
  const source = rec && typeof rec === "object" ? rec : {};
  const seen = Array.isArray(source.seen) ? source.seen.map(Number).filter(Number.isInteger) : [];
  return {
    seen: [...new Set(seen)].sort((a, b) => a - b),
    last: Number.isInteger(source.last) ? source.last : null,
    override: source.override === "done" ? "done" : null,
  };
}

function parseStore(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.modules || typeof parsed.modules !== "object") return null;
    const out = emptyStore();
    for (const [id, rec] of Object.entries(parsed.modules)) out.modules[id] = normaliseRec(rec);
    return out;
  } catch {
    return null;
  }
}

function loadStore() {
  let current = null;
  try { current = parseStore(localStorage.getItem(STORAGE_KEY)); } catch { /* memoria locale non disponibile */ }
  if (current) return current;
  let legacy = null;
  try { legacy = parseStore(localStorage.getItem(LEGACY_KEY)); } catch { /* memoria locale non disponibile */ }
  if (!legacy) return emptyStore();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* solo in sessione */ }
  return legacy;
}

function node(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}

function colorOf(mod) {
  const n = Number(mod?.n);
  const i = Number.isFinite(n) ? n : 1;
  return PALETTE[((i - 1) % PALETTE.length + PALETTE.length) % PALETTE.length];
}

function moduleKey(mod) {
  return `M${String(mod?.n ?? 0).padStart(2, "0")}`;
}

function shortText(text, max = 54) {
  const value = String(text ?? "").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function tokensOf(query) {
  return norm(query).split(" ").filter(Boolean);
}

function appendMarked(parent, text, tokens) {
  const value = String(text ?? "");
  if (!tokens.length) {
    parent.append(document.createTextNode(value));
    return;
  }
  for (const part of value.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      parent.append(document.createTextNode(part));
      continue;
    }
    const hit = tokens.some((token) => norm(part).includes(token));
    if (hit) {
      const mark = node("mark", "dash-mark", part);
      parent.append(mark);
    } else {
      parent.append(document.createTextNode(part));
    }
  }
}

function progressBar(value, label, cls = "") {
  const bar = node("progress", `dash-progress ${cls}`.trim());
  bar.max = 100;
  bar.value = value;
  bar.setAttribute("aria-label", label);
  return bar;
}

export function createDashboard({
  mount,
  stats,
  greeting,
  subtitle,
  overallPct,
  overallBar,
  resume,
  next,
  filter,
  sort,
  count,
  live,
  reset,
  confirm,
  confirmYes,
  confirmNo,
  onSlide,
  onOpenModule,
}) {
  let store = loadStore();
  const expanded = new Set();
  let localQuery = "";
  let globalQuery = "";
  let sortBy = "course";
  let visible = [];
  let announceTimer = 0;

  function markSlide(mod, n) {
    if (!pagesOf(mod)) return;
    const rec = recordOf(mod.id);
    if (!rec.seen.includes(n)) rec.seen.push(n);
    rec.seen.sort((a, b) => a - b);
    rec.last = n;
    save();
    render();
    announce(`Slide ${n} registrata: avanzamento ${progressOf(mod)} per cento`);
  }

  const allModules = () => modules();
  const query = () => tokensOf(`${localQuery} ${globalQuery}`);

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* stato solo in sessione */ }
  }

  function announce(message) {
    if (!live) return;
    live.textContent = message;
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { live.textContent = ""; }, 2400);
  }

  function recordOf(id) {
    if (!store.modules[id]) store.modules[id] = normaliseRec(null);
    const rec = store.modules[id];
    const pages = pagesOf(allModules().find((m) => m.id === id));
    rec.seen = rec.seen.filter((n) => n >= 1 && (!pages || n <= pages));
    return rec;
  }

  function progressOf(mod) {
    const pages = pagesOf(mod);
    if (!pages) return 0;
    const rec = store.modules[mod.id];
    if (rec?.override === "done") return 100;
    return Math.min(100, Math.round(((rec?.seen?.length || 0) / pages) * 100));
  }

  function statusOf(mod) {
    const pct = progressOf(mod);
    if (pct >= 100) return STATUS[2];
    if (pct > 0) return STATUS[1];
    return STATUS[0];
  }

  function completion() {
    let done = 0;
    let total = 0;
    let started = 0;
    let completed = 0;
    for (const mod of allModules()) {
      const pages = pagesOf(mod);
      if (!pages) continue;
      total += pages;
      const rec = store.modules[mod.id];
      if (rec?.override === "done") {
        done += pages;
        completed++;
      } else {
        done += rec?.seen?.length || 0;
        if (rec?.seen?.length) started++;
      }
    }
    return { done, total, pct: total ? Math.min(100, Math.round((done / total) * 100)) : 0, started, completed };
  }

  function resumeModule() {
    const list = allModules();
    let best = null;
    let bestScore = -1;
    for (const mod of list) {
      if (!pagesOf(mod)) continue;
      const rec = store.modules[mod.id];
      let score = 0;
      if (rec?.override === "done") score = 1;
      else if (rec?.last) score = 3;
      else if (rec?.seen?.length) score = 2;
      if (score > bestScore) {
        bestScore = score;
        best = mod;
      }
    }
    return best || null;
  }

  function resumePage(mod) {
    const rec = store.modules[mod.id];
    const pages = pagesOf(mod);
    const candidate = Number(rec?.last);
    if (Number.isInteger(candidate) && candidate >= 1 && candidate <= pages) return candidate;
    return rec?.seen?.length ? rec.seen[rec.seen.length - 1] : 1;
  }

  function nextTopics() {
    const result = [];
    const list = [...allModules()].sort((a, b) => progressOf(a) - progressOf(b) || a.n - b.n);
    for (const mod of list) {
      const topics = topicsOf(mod);
      if (!topics.length) continue;
      const rec = store.modules[mod.id];
      const page = rec?.last ? Number(rec.last) + 1 : 1;
      const topic = topics.find((t) => page >= t.from && page <= t.to) || topics[0];
      if (!result.some((x) => x.mod.id === mod.id && x.topic.id === topic.id)) {
        result.push({ mod, topic });
      }
      if (result.length >= 3) break;
    }
    return result;
  }

  function matches(mod) {
    const tokens = query();
    if (!tokens.length) return true;
    const haystack = norm([
      moduleKey(mod),
      mod.title,
      (mod.topics || []).map((t) => t.title).join(" "),
      (mod.slides || []).map((s) => s.title).join(" "),
    ].join(" "));
    return tokens.every((token) => haystack.includes(token));
  }

  function focusKind(active) {
    if (active.classList.contains("dash-slide")) return "dash-slide";
    if (active.classList.contains("dash-topic-btn")) return "dash-topic-btn";
    return "";
  }

  function focusSnapshot() {
    const active = document.activeElement;
    if (!active || !mount.contains(active)) return null;
    const holder = active.closest("[data-module-id]");
    if (!holder) return null;
    return {
      moduleId: holder.dataset.moduleId,
      action: active.dataset.action || "",
      n: active.dataset.n || "",
      topicId: active.dataset.topicId || "",
      cls: focusKind(active),
    };
  }

  function restoreFocus(snap) {
    if (!snap) return;
    const scope = mount.querySelector(`.dash-module[data-module-id="${CSS.escape(snap.moduleId)}"]`);
    if (!scope) return;
    let target = null;
    if (snap.cls === "dash-slide") target = scope.querySelector(`.dash-slide[data-n="${CSS.escape(snap.n)}"]`);
    else if (snap.cls === "dash-topic-btn") target = scope.querySelector(`.dash-topic-btn[data-topic-id="${CSS.escape(snap.topicId)}"]`);
    else target = scope.querySelector(`[data-action="${CSS.escape(snap.action)}"]`) || scope.querySelector(".dash-module-main");
    target?.focus({ preventScroll: true });
  }

  function renderStats(info) {
    if (!stats) return;
    const values = [
      ["Moduli", allModules().length],
      ["Argomenti", allModules().reduce((a, m) => a + (m.topics?.length || 0), 0)],
      ["Pagine", allModules().reduce((a, m) => a + pagesOf(m), 0)],
      ["Completato", `${info.pct}%`],
    ];
    stats.replaceChildren(...values.map(([label, value]) => {
      const li = node("li", "dash-stat");
      li.append(node("b", "dash-stat-value", value), node("span", "dash-stat-label", label));
      return li;
    }));
  }

  function renderResume() {
    if (!resume) return;
    resume.replaceChildren();
    const mod = resumeModule();
    const eyebrow = node("p", "dash-resume-eyebrow", "Il tuo percorso");
    resume.append(eyebrow);

    if (!mod) {
      resume.append(node("h4", "dash-resume-title", "Nessun modulo disponibile"));
      return;
    }

    const seen = store.modules[mod.id]?.seen?.length || 0;
    if (!seen && store.modules[mod.id]?.override !== "done") {
      resume.append(node("h4", "dash-resume-title", shortText(mod.title, 60)));
      resume.append(node("p", "dash-resume-meta", `Modulo ${moduleKey(mod)} · ${pagesOf(mod)} pagine · non ancora iniziato`));
      const start = node("button", "dash-cta", "Inizia →");
      start.type = "button";
      start.dataset.action = "resume-start";
      start.dataset.moduleId = mod.id;
      resume.append(start);
      return;
    }

    const page = resumePage(mod);
    const topic = topicsOf(mod).find((t) => page >= t.from && page <= t.to);
    resume.append(node("h4", "dash-resume-title", shortText(mod.title, 60)));
    resume.append(node("p", "dash-resume-meta", `${moduleKey(mod)} · ${slideTitle(mod, page) || topic?.title || "Slide"} · slide ${page} di ${pagesOf(mod)}`));
    const row = node("div", "dash-resume-row");
    const continueBtn = node("button", "dash-cta", "Continua →");
    continueBtn.type = "button";
    continueBtn.dataset.action = "resume-continue";
    continueBtn.dataset.moduleId = mod.id;
    continueBtn.dataset.n = String(page);
    row.append(continueBtn, node("span", "dash-resume-pct", `${progressOf(mod)}% completato`));
    resume.append(row);
  }

  function renderNext() {
    if (!next) return;
    const items = nextTopics().map(({ mod, topic }) => {
      const li = node("li", "dash-next-item");
      const btn = node("button", "dash-next-btn");
      btn.type = "button";
      btn.dataset.moduleId = mod.id;
      btn.dataset.topicId = topic.id;
      btn.append(node("strong", "", shortText(topic.title, 46)), node("small", "", `${moduleKey(mod)} · slide ${topic.from}–${topic.to}`));
      li.append(btn);
      return li;
    });
    next.replaceChildren(...(items.length ? items : [node("li", "dash-next-empty", "Nessun argomento disponibile")]));
  }

  function makeSlide(mod, n) {
    const btn = node("button", "dash-slide", `Slide ${n}`);
    btn.type = "button";
    btn.dataset.n = String(n);
    btn.dataset.moduleId = mod.id;
    const title = slideTitle(mod, n);
    if (title) btn.title = title;
    const rec = store.modules[mod.id];
    btn.classList.toggle("is-seen", Boolean(rec?.seen?.includes(n) || rec?.override === "done"));
    btn.setAttribute("aria-pressed", String(rec?.seen?.includes(n) || rec?.override === "done"));
    return btn;
  }

  function makeTopic(mod, topic, tokens) {
    const row = node("div", "dash-topic-row");
    row.dataset.topicId = topic.id;
    const btn = node("button", "dash-topic-btn");
    btn.type = "button";
    btn.dataset.moduleId = mod.id;
    btn.dataset.topicId = topic.id;
    const label = node("span", "dash-topic-label");
    appendMarked(label, topic.title, tokens);
    btn.append(label, node("small", "", `slide ${topic.from}–${topic.to}`));
    row.append(btn);
    const slides = node("div", "dash-slides");
    const from = Math.max(1, Number(topic.from) || 1);
    const to = Math.min(pagesOf(mod), Number(topic.to) || from);
    for (let n = from; n <= to; n++) slides.append(makeSlide(mod, n));
    row.append(slides);
    return row;
  }

  function makeModule(mod, tokens, index) {
    const rec = store.modules[mod.id];
    const pct = progressOf(mod);
    const status = statusOf(mod);
    const isOpen = expanded.has(mod.id);
    const li = node("li", "dash-module");
    li.dataset.moduleId = mod.id;
    li.style.setProperty("--module-color", colorOf(mod));

    const main = node("button", "dash-module-main");
    main.type = "button";
    main.dataset.action = "toggle";
    main.dataset.moduleId = mod.id;
    main.setAttribute("aria-expanded", String(isOpen));
    main.setAttribute("aria-controls", `dash-detail-${mod.id}`);
    main.tabIndex = index === 0 ? 0 : -1;
    const label = node("span", "dash-module-label");
    label.append(node("span", "dash-module-key", moduleKey(mod)));
    const title = node("span", "dash-module-title");
    appendMarked(title, mod.title, tokens);
    label.append(title);
    main.append(label);
    main.append(node("span", "dash-module-meta", `${topicsOf(mod).length} argomenti · ${pagesOf(mod)} pagine`));
    const meter = node("span", "dash-module-meter");
    meter.append(progressBar(pct, `Avanzamento di ${shortText(mod.title, 36)}`));
    meter.append(node("span", `dash-status dash-status-${status.id}`, status.label), node("b", "", `${pct}%`));
    main.append(meter);
    li.append(main);

    const detail = node("div", "dash-module-detail");
    detail.id = `dash-detail-${mod.id}`;
    detail.hidden = !isOpen;
    const actions = node("div", "dash-module-actions");
    const openBtn = node("button", "dash-action", "Apri modulo");
    openBtn.type = "button";
    openBtn.dataset.action = "open";
    openBtn.dataset.moduleId = mod.id;
    const continueBtn = node("button", "dash-action", "Continua");
    continueBtn.type = "button";
    continueBtn.dataset.action = "continue";
    continueBtn.dataset.moduleId = mod.id;
    continueBtn.dataset.n = String(rec?.last || 1);
    continueBtn.disabled = !pagesOf(mod);
    const overrideBtn = node("button", "dash-action", rec?.override === "done" ? "Riapri" : "Segna completato");
    overrideBtn.type = "button";
    overrideBtn.dataset.action = "override";
    overrideBtn.dataset.moduleId = mod.id;
    overrideBtn.disabled = !pagesOf(mod);
    actions.append(openBtn, continueBtn, overrideBtn);
    detail.append(actions);

    const topics = topicsOf(mod);
    if (topics.length) {
      const list = node("div", "dash-topics");
      for (const topic of topics) list.append(makeTopic(mod, topic, tokens));
      detail.append(list);
    } else {
      detail.append(node("p", "dash-module-empty", "Nessun argomento strutturato: le pagine restano navigabili dal visore."));
    }
    li.append(detail);
    return li;
  }

  function renderModules() {
    if (!mount) return;
    const tokens = query();
    let list = allModules().filter(matches);
    if (sortBy === "progress") list = list.sort((a, b) => progressOf(b) - progressOf(a) || a.n - b.n);
    else if (sortBy === "pages") list = list.sort((a, b) => pagesOf(b) - pagesOf(a) || a.n - b.n);
    else list = list.sort((a, b) => a.n - b.n);
    visible = list;
    const rows = list.map((mod, i) => makeModule(mod, tokens, i));
    const container = mount.querySelector("#dash-modules");
    container.replaceChildren(...(rows.length ? rows : [node("li", "dash-empty", "Nessun modulo corrisponde alla ricerca.")]));
    if (count) count.textContent = `${list.length} moduli · ${completion().pct}% completato`;
  }

  function render() {
    const snap = focusSnapshot();
    const info = completion();
    if (greeting) greeting.textContent = info.started ? "Bentornato" : "Buongiorno";
    if (subtitle) subtitle.textContent = info.started
      ? "Riprendi dall'ultima slide aperta oppure esplora i prossimi argomenti."
      : "Una vista d'insieme del corso: statistiche, ripresa dello studio e pagine per modulo.";
    if (overallPct) overallPct.textContent = `${info.pct}%`;
    if (overallBar) {
      overallBar.max = 100;
      overallBar.value = info.pct;
    }
    renderStats(info);
    renderResume();
    renderNext();
    renderModules();
    restoreFocus(snap);
  }

  function openSlide(mod, n) {
    const page = clamp(Math.round(Number(n) || 1), 1, Math.max(1, pagesOf(mod)));
    markSlide(mod, page);
    onSlide?.(mod, page);
  }

  function toggle(mod) {
    if (expanded.has(mod.id)) expanded.delete(mod.id);
    else expanded.add(mod.id);
    render();
    announce(expanded.has(mod.id) ? "Dettagli aperti" : "Dettagli chiusi");
  }

  function setOverride(mod, done) {
    if (!pagesOf(mod)) return;
    const rec = recordOf(mod.id);
    rec.override = done ? "done" : null;
    save();
    render();
    announce(done ? `${mod.title} segnato come completato` : `${mod.title} riaperto`);
  }

  function clearAll() {
    store = emptyStore();
    expanded.clear();
    save();
    if (confirm) confirm.hidden = true;
    render();
    announce("Avanzamento azzerato");
  }

  function findModule(id) {
    return allModules().find((m) => m.id === id) || null;
  }

  function handleClick(event) {
    const action = event.target.closest("[data-action]");
    if (action && mount.contains(action)) {
      const mod = findModule(action.dataset.moduleId);
      if (!mod) return;
      if (action.dataset.action === "toggle") toggle(mod);
      else if (action.dataset.action === "open") onOpenModule?.(mod, null);
      else if (action.dataset.action === "continue") openSlide(mod, action.dataset.n || resumePage(mod));
      else if (action.dataset.action === "resume-continue") openSlide(mod, action.dataset.n || resumePage(mod));
      else if (action.dataset.action === "resume-start") onOpenModule?.(mod, topicsOf(mod)[0]?.id || null);
      else if (action.dataset.action === "override") setOverride(mod, recordOf(mod.id).override !== "done");
      return;
    }

    const slide = event.target.closest(".dash-slide");
    if (slide && mount.contains(slide)) {
      const mod = findModule(slide.dataset.moduleId);
      if (mod) openSlide(mod, slide.dataset.n);
      return;
    }

    const topic = event.target.closest(".dash-topic-btn");
    if (topic && mount.contains(topic)) {
      const mod = findModule(topic.dataset.moduleId);
      if (mod) onOpenModule?.(mod, topic.dataset.topicId || null);
    }
  }

  function handleKey(event) {
    if (event.key === "Escape") {
      const holder = event.target.closest(".dash-module");
      if (!holder || !mount.contains(holder)) return;
      const mod = findModule(holder.dataset.moduleId);
      if (!mod || !expanded.has(mod.id)) return;
      event.preventDefault();
      expanded.delete(mod.id);
      render();
      holder.querySelector(".dash-module-main")?.focus({ preventScroll: true });
      announce("Dettagli chiusi");
      return;
    }
    const main = event.target.closest(".dash-module-main");
    if (!main || !["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(event.key)) return;
    event.preventDefault();
    const mains = Array.from(mount.querySelectorAll(".dash-module-main"));
    const i = mains.indexOf(main);
    if (i < 0) return;
    const delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    const target = mains[(i + delta + mains.length) % mains.length];
    for (const item of mains) item.tabIndex = item === target ? 0 : -1;
    target.focus({ preventScroll: true });
  }

  mount?.addEventListener("click", handleClick);
  mount?.addEventListener("keydown", handleKey);
  filter?.addEventListener("input", () => { localQuery = filter.value.trim(); render(); });
  sort?.addEventListener("change", () => { sortBy = sort.value; render(); });
  reset?.addEventListener("click", () => {
    if (confirm) confirm.hidden = false;
    confirmYes?.focus({ preventScroll: true });
  });
  confirmNo?.addEventListener("click", () => { if (confirm) confirm.hidden = true; reset?.focus({ preventScroll: true }); });
  confirmYes?.addEventListener("click", clearAll);

  render();

  return {
    render,
    recordSlide(mod, n) {
      if (!mod || !pagesOf(mod)) return;
      const page = clamp(Math.round(Number(n)), 1, pagesOf(mod));
      markSlide(mod, page);
    },
    setQuery(value) {
      const next = value || "";
      if (next === globalQuery) return;
      globalQuery = next;
      render();
    },
    state() {
      const info = completion();
      return {
        modules: allModules().length,
        visible: visible.length,
        ...info,
      };
    },
    destroy() {
      mount?.removeEventListener("click", handleClick);
      mount?.removeEventListener("keydown", handleKey);
    },
  };
}
