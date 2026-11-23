/* kanban.js — vista elenco come board Kanban: progressi, filtri, ordinamento e navigazione. */

import { clamp, norm } from "./utils.js";
import { modules, pagesOf, topicsOf, slideTitle } from "./data.js";

const STORAGE_KEY = "farmacista:v1:kanban";

/* Stessa palette dei volumi della libreria/mappa: un colore per modulo. */
const PALETTE = ["#155E75", "#8A4B08", "#276749", "#5B3B8C", "#9B2C4F", "#6B5B12", "#0E6A6E", "#3D4A8A"];

const COLUMNS = [
  { id: "todo", label: "Da iniziare", color: "#9CA3AF" },
  { id: "doing", label: "In corso", color: "#C2571A" },
  { id: "done", label: "Completati", color: "#2F6F6B" },
];

const emptyStore = () => ({ modules: {} });

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.modules || typeof parsed.modules !== "object") return emptyStore();
    return { modules: parsed.modules };
  } catch {
    return emptyStore();
  }
}

function node(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = String(text);
  return n;
}

function colorOf(mod) {
  const n = Number(mod?.n);
  return PALETTE[((Number.isFinite(n) ? n : 1) - 1 + PALETTE.length) % PALETTE.length];
}

function moduleKey(mod) {
  return `M${String(mod?.n ?? 0).padStart(2, "0")}`;
}

export function createKanban({
  board,
  filter,
  sort,
  count,
  summary,
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
  let lastFocusedId = null;
  let announceTimer = 0;

  const cards = () => Array.from(board.querySelectorAll(".kb-card-main"));

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      /* localStorage non disponibile: lo stato resta in memoria per la sessione. */
    }
  }

  function recordOf(id) {
    if (!store.modules[id] || typeof store.modules[id] !== "object") {
      store.modules[id] = { seen: [], last: null, override: null };
    }
    const rec = store.modules[id];
    if (!Array.isArray(rec.seen)) rec.seen = [];
    if (!Number.isInteger(rec.last)) rec.last = null;
    if (rec.override !== "done" && rec.override !== null) rec.override = null;
    return rec;
  }

  function seenSet(mod) {
    const pages = pagesOf(mod);
    const rec = store.modules[mod.id] || {};
    const raw = Array.isArray(rec.seen) ? rec.seen : [];
    return new Set(raw.filter((n) => Number.isInteger(n) && n >= 1 && n <= pages));
  }

  function progressOf(mod) {
    const pages = pagesOf(mod);
    const rec = store.modules[mod.id] || {};
    if (rec.override === "done") return 100;
    if (!pages) return 0;
    return clamp(Math.round((seenSet(mod).size * 100) / pages), 0, 100);
  }

  function statusOf(mod) {
    const p = progressOf(mod);
    if (p >= 100) return "done";
    if (p > 0) return "doing";
    return "todo";
  }

  function announce(text) {
    if (!live) return;
    clearTimeout(announceTimer);
    live.textContent = "";
    announceTimer = setTimeout(() => { live.textContent = text; }, 30);
  }

  function haystack(mod) {
    const parts = [mod.title, mod.label || ""];
    for (const t of topicsOf(mod)) {
      parts.push(t.title || "", (t.keywords || []).join(" "));
    }
    return norm(parts.join(" "));
  }

  function tokensOf(query) {
    return norm(query).split(" ").filter(Boolean);
  }

  function filtered() {
    const tokens = tokensOf([localQuery, globalQuery].filter(Boolean).join(" "));
    const list = modules().filter((mod) => {
      if (!tokens.length) return true;
      const hay = haystack(mod);
      return tokens.every((t) => hay.includes(t));
    });
    if (sortBy === "progress") {
      list.sort((a, b) => progressOf(b) - progressOf(a) || Number(a.n) - Number(b.n));
    } else {
      list.sort((a, b) => Number(a.n) - Number(b.n));
    }
    return list;
  }

  function describeFocus() {
    const active = document.activeElement;
    if (!active || !board.contains(active)) return null;
    const owner = active.closest(".kb-card");
    if (!owner) return null;
    let kind = "main";
    if (active.dataset.action) kind = "action";
    else if (active.classList.contains("kb-slide")) kind = "slide";
    else if (active.classList.contains("kb-topic-btn")) kind = "topic";
    return {
      id: owner.dataset.moduleId,
      kind,
      action: active.dataset.action || "",
      n: active.dataset.n || "",
      topic: active.dataset.topicId || "",
    };
  }

  function refocus(focused, rovingId) {
    if (!focused || board.offsetParent === null) {
      const first = board.querySelector(`.kb-card[data-module-id="${CSS.escape(rovingId || "")}"] .kb-card-main`);
      if (first && board.offsetParent !== null) first.tabIndex = 0;
      return;
    }
    const base = `.kb-card[data-module-id="${CSS.escape(focused.id)}"] `;
    let selector = `${base}.kb-card-main`;
    if (focused.kind === "slide") selector = `${base}.kb-slide[data-n="${focused.n}"]`;
    else if (focused.kind === "topic") selector = `${base}.kb-topic-btn[data-topic-id="${CSS.escape(focused.topic)}"]`;
    else if (focused.kind === "action") selector = `${base}[data-action="${focused.action}"]`;
    const target = board.querySelector(selector);
    if (!target) return;
    for (const n of board.querySelectorAll(".kb-card-main")) n.tabIndex = -1;
    const main = target.closest(".kb-card")?.querySelector(".kb-card-main");
    if (main) main.tabIndex = -1;
    target.focus({ preventScroll: true });
  }

  function makeSlide(mod, n, seen) {
    const li = node("li", "kb-slide-item");
    const btn = node("button", "kb-slide");
    btn.type = "button";
    btn.dataset.n = String(n);
    btn.setAttribute("aria-label", `Slide ${n}${seen.has(n) ? ", già aperta" : ""}: ${slideTitle(mod, n) || `Slide ${n}`}`);
    btn.append(node("span", "kb-slide-n", String(n)), node("span", "kb-slide-title", slideTitle(mod, n) || `Slide ${n}`));
    if (seen.has(n)) btn.append(node("span", "kb-check", "✓"));
    li.appendChild(btn);
    return li;
  }

  function makeDetail(mod, isOpen) {
    const detail = node("div", "kb-detail");
    detail.id = `kb-detail-${mod.id}`;
    detail.hidden = !isOpen;
    const topics = topicsOf(mod);
    if (!topics.length) {
      detail.appendChild(node("p", "kb-empty-topic", "Nessuna slide disponibile per questo modulo."));
      return detail;
    }
    const seen = seenSet(mod);
    for (const topic of topics) {
      const box = node("section", "kb-topic");
      const btn = node("button", "kb-topic-btn");
      btn.type = "button";
      btn.dataset.topicId = topic.id;
      const complete = topic.to <= pagesOf(mod) && Array.from({ length: Math.max(0, topic.to - topic.from + 1) }, (_, i) => topic.from + i).every((n) => seen.has(n));
      btn.append(
        node("span", "kb-topic-name", topic.title || "Argomento"),
        node("span", "kb-topic-range", `${topic.from}–${topic.to}`),
      );
      if (complete) btn.append(node("span", "kb-check", "✓"));
      btn.setAttribute("aria-label", `${topic.title || "Argomento"}, slide ${topic.from} al ${topic.to}${complete ? ", completato" : ""}`);
      box.appendChild(btn);
      const list = node("ul", "kb-slides");
      list.setAttribute("role", "list");
      for (let n = topic.from; n <= topic.to; n++) list.appendChild(makeSlide(mod, n, seen));
      box.appendChild(list);
      detail.appendChild(box);
    }
    return detail;
  }

  function makeCard(mod, rovingId) {
    const pages = pagesOf(mod);
    const topics = topicsOf(mod).length;
    const p = progressOf(mod);
    const status = statusOf(mod);
    const rec = store.modules[mod.id] || {};
    const isOpen = expanded.has(mod.id);

    const li = node("li", "kb-card-item");
    const card = node("article", "kb-card");
    card.dataset.moduleId = mod.id;
    card.dataset.moduleN = String(mod.n);
    card.dataset.status = status;
    card.style.setProperty("--module", colorOf(mod));

    const main = node("button", "kb-card-main");
    main.type = "button";
    main.dataset.testid = "kanban-card";
    main.setAttribute("aria-expanded", String(isOpen));
    main.setAttribute("aria-controls", `kb-detail-${mod.id}`);
    main.tabIndex = mod.id === rovingId ? 0 : -1;
    main.setAttribute("aria-label", `${moduleKey(mod)}, ${mod.title}. ${topics} argomenti, ${pages} pagine. Avanzamento ${p} per cento.`);

    const top = node("span", "kb-card-top");
    top.append(node("span", "kb-module", moduleKey(mod)), node("span", "kb-state", COLUMNS.find((c) => c.id === status).label));
    const barRow = node("span", "kb-bar-row");
    const bar = node("progress", "kb-bar");
    bar.max = "100";
    bar.value = String(p);
    bar.setAttribute("aria-label", `Avanzamento di ${mod.title}: ${p}%`);
    barRow.append(bar, node("span", "kb-bar-pct", `${p}%`));
    main.append(top, node("span", "kb-title", mod.title || "Senza titolo"), node("span", "kb-meta", `${topics} argomenti · ${pages} pagine`), barRow);

    const actions = node("div", "kb-actions");
    if (status === "doing" && Number.isInteger(rec.last)) {
      const cont = node("button", "kb-action kb-continue");
      cont.type = "button";
      cont.dataset.action = "continue";
      cont.textContent = "Continua";
      actions.appendChild(cont);
    }
    const override = node("button", "kb-action kb-override");
    override.type = "button";
    override.dataset.action = "override";
    override.setAttribute("aria-pressed", String(rec.override === "done"));
    override.textContent = rec.override === "done" ? "Riapri" : "Segna come completato";
    const open = node("button", "kb-action kb-open");
    open.type = "button";
    open.dataset.action = "open";
    open.textContent = "Apri modulo";
    actions.append(override, open);

    card.append(main, makeDetail(mod, isOpen), actions);
    li.appendChild(card);
    return li;
  }

  function makeColumn(col, mods, rovingId) {
    const section = node("section", "kb-column");
    section.dataset.status = col.id;
    section.style.setProperty("--col", col.color);
    section.setAttribute("aria-label", `${col.label}, ${mods.length} moduli`);
    const head = node("div", "kb-column-head");
    const title = node("h3", "kb-column-title");
    title.append(node("span", "kb-dot"), node("span", "kb-column-name", col.label));
    head.append(title, node("span", "kb-column-count", String(mods.length)));
    const list = node("ul", "kb-cards");
    list.setAttribute("role", "list");
    list.setAttribute("aria-label", col.label);
    for (const mod of mods) list.appendChild(makeCard(mod, rovingId));
    section.append(head, list);
    return section;
  }

  function render() {
    const focused = describeFocus();
    visible = filtered();
    const buckets = { todo: [], doing: [], done: [] };
    for (const mod of visible) buckets[statusOf(mod)].push(mod);

    const rovingId = (focused && visible.some((m) => m.id === focused.id) && focused.id)
      || (lastFocusedId && visible.some((m) => m.id === lastFocusedId) && lastFocusedId)
      || visible[0]?.id
      || null;

    if (visible.length) {
      const filtering = tokensOf([localQuery, globalQuery].filter(Boolean).join(" ")).length > 0;
      const shown = filtering ? COLUMNS.filter((c) => buckets[c.id].length) : COLUMNS;
      board.replaceChildren(...shown.map((c) => makeColumn(c, buckets[c.id], rovingId)));
    } else {
      board.replaceChildren(node("p", "kb-empty", "Nessun modulo corrisponde alla ricerca."));
    }

    count.textContent = `${visible.length} moduli mostrati · ${modules().length} totali`;
    summary.textContent = COLUMNS.map((c) => `${buckets[c.id].length} ${c.label.toLowerCase()}`).join(" · ");
    refocus(focused, rovingId);
  }

  function toggle(id, announceChange = true) {
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    lastFocusedId = id;
    render();
    if (announceChange) announce(expanded.has(id) ? "Dettagli aperti" : "Dettagli chiusi");
  }

  function recordSlide(mod, n) {
    if (!mod || !pagesOf(mod)) return;
    const rec = recordOf(mod.id);
    const page = clamp(Math.round(Number(n)), 1, pagesOf(mod));
    if (!rec.seen.includes(page)) rec.seen.push(page);
    rec.seen.sort((a, b) => a - b);
    rec.last = page;
    save();
    render();
    announce(`Slide ${page} registrata: avanzamento ${progressOf(mod)} per cento`);
  }

  function setOverride(mod, done) {
    const rec = recordOf(mod.id);
    rec.override = done ? "done" : null;
    save();
    lastFocusedId = mod.id;
    render();
    announce(done ? `${mod.title} segnato come completato` : `${mod.title} riaperto`);
  }

  function clearAll() {
    store = emptyStore();
    save();
    render();
    announce("Progressi azzerati");
  }

  function handleClick(e) {
    const cardEl = e.target.closest(".kb-card");
    if (!cardEl) return;
    const mod = modules().find((m) => m.id === cardEl.dataset.moduleId);
    if (!mod) return;

    const action = e.target.closest("[data-action]");
    if (action) {
      if (action.dataset.action === "continue") {
        const rec = store.modules[mod.id] || {};
        if (Number.isInteger(rec.last)) onSlide?.(mod, rec.last);
      } else if (action.dataset.action === "override") {
        setOverride(mod, (store.modules[mod.id] || {}).override !== "done");
      } else if (action.dataset.action === "open") {
        onOpenModule?.(mod, null);
      }
      return;
    }

    const slide = e.target.closest(".kb-slide");
    if (slide) {
      const n = Number(slide.dataset.n);
      recordSlide(mod, n);
      onSlide?.(mod, n);
      return;
    }

    const topic = e.target.closest(".kb-topic-btn");
    if (topic) {
      onOpenModule?.(mod, topic.dataset.topicId || null);
      return;
    }

    if (e.target.closest(".kb-card-main")) toggle(mod.id);
  }

  function handleKeydown(e) {
    const cardEl = e.target.closest(".kb-card");
    if (!cardEl) return;
    const id = cardEl.dataset.moduleId;

    if (e.key === "Escape") {
      e.preventDefault();
      expanded.delete(id);
      lastFocusedId = id;
      render();
      const main = board.querySelector(`.kb-card[data-module-id="${CSS.escape(id)}"] .kb-card-main`);
      main?.focus({ preventScroll: true });
      return;
    }

    if (!e.target.classList.contains("kb-card-main")) return;
    const mains = cards();
    const at = mains.indexOf(e.target);
    if (at < 0) return;

    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const next = mains[at + (e.key === "ArrowRight" ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      lastFocusedId = next.closest(".kb-card").dataset.moduleId;
      for (const n of board.querySelectorAll(".kb-card-main")) n.tabIndex = -1;
      next.tabIndex = 0;
      next.focus({ preventScroll: true });
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const col = e.target.closest(".kb-column");
      const inCol = Array.from(col.querySelectorAll(".kb-card-main"));
      const idx = inCol.indexOf(e.target);
      const next = inCol[idx + (e.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      lastFocusedId = next.closest(".kb-card").dataset.moduleId;
      for (const n of board.querySelectorAll(".kb-card-main")) n.tabIndex = -1;
      next.tabIndex = 0;
      next.focus({ preventScroll: true });
    }
  }

  board.addEventListener("click", handleClick);
  board.addEventListener("keydown", handleKeydown);
  filter?.addEventListener("input", () => { localQuery = filter.value; render(); });
  sort?.addEventListener("change", () => { sortBy = sort.value; render(); });

  reset?.addEventListener("click", () => {
    confirm.hidden = false;
    confirmYes?.focus({ preventScroll: true });
  });
  const closeConfirm = () => { confirm.hidden = true; reset?.focus({ preventScroll: true }); };
  confirmNo?.addEventListener("click", closeConfirm);
  confirmYes?.addEventListener("click", () => {
    confirm.hidden = true;
    clearAll();
    reset?.focus({ preventScroll: true });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && confirm && !confirm.hidden) {
      e.preventDefault();
      closeConfirm();
    }
  });

  render();

  return {
    render,
    recordSlide,
    setQuery(q) { globalQuery = q || ""; render(); },
    state() {
      const buckets = { todo: 0, doing: 0, done: 0 };
      for (const mod of visible) buckets[statusOf(mod)]++;
      return {
        modules: modules().length,
        visible: visible.length,
        ...buckets,
        progressed: modules().filter((m) => progressOf(m) > 0).length,
      };
    },
    destroy() {
      board.removeEventListener("click", handleClick);
      board.removeEventListener("keydown", handleKeydown);
    },
  };
}
