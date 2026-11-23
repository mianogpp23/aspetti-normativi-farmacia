/* library.js — libreria interattiva: un volume per modulo, scaffali calcolati dalla larghezza disponibile. */

import { el, clamp, norm } from "./utils.js";
import { modules, pagesOf, topicsOf } from "./data.js";

const PALETTE = ["#155E75", "#8A4B08", "#276749", "#5B3B8C", "#9B2C4F", "#6B5B12", "#0E6A6E", "#3D4A8A"];
const GAP = 14;
const MIN_BOOK_WIDTH = 108;
const MAX_BOOK_WIDTH = 168;
const MIN_BOOK_HEIGHT = 184;
const MAX_BOOK_HEIGHT = 238;
const STAGE_PADDING = 28;

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (shift) => clamp((n >> shift) & 255, 0, 255);
  const r = clamp(mix(16) + amount, 0, 255);
  const g = clamp(mix(8) + amount, 0, 255);
  const b = clamp(mix(0) + amount, 0, 255);
  return `rgb(${r} ${g} ${b})`;
}

function bookWidth(mod) {
  const length = String(mod?.title || "").length;
  return Math.round(clamp(104 + length * 1.15, MIN_BOOK_WIDTH, MAX_BOOK_WIDTH));
}

function bookHeight(mod) {
  return Math.round(clamp(178 + pagesOf(mod) * 0.68, MIN_BOOK_HEIGHT, MAX_BOOK_HEIGHT));
}

function volumeKey(mod) {
  return `M${String(mod.n ?? 0).padStart(2, "0")}`;
}

export function createLibrary({ stage, shelves, info, crumbs, controls, legend, live, onSlide, onOpenModule }) {
  let list = [];
  let selectedId = null;
  let query = "";
  let shelfCount = 0;
  let renderedWidth = 0;
  let resizeObserver = null;
  let announceTimer = 0;

  const bookNodes = () => Array.from(shelves.querySelectorAll(".lib-book"));
  const current = () => list.find((mod) => mod.id === selectedId) || null;
  const shelfOf = (id) => Number(shelves.querySelector(`.lib-book[data-module-id="${CSS.escape(id)}"]`)?.closest(".lib-shelf")?.dataset.shelf || 0);

  function announce(text) {
    if (!live) return;
    clearTimeout(announceTimer);
    live.textContent = "";
    announceTimer = setTimeout(() => { live.textContent = text; }, 30);
  }

  function createBook(mod, width, shelfIndex) {
    const pages = pagesOf(mod);
    const topics = topicsOf(mod).length;
    const color = PALETTE[(mod.n - 1) % PALETTE.length];
    const key = volumeKey(mod);
    const button = el("button", {
      type: "button",
      class: "lib-book",
      "data-testid": "library-book",
      "data-module-id": mod.id,
      "data-shelf": shelfIndex,
      "data-volume": key,
      tabindex: "-1",
      "aria-pressed": "false",
      "aria-label": `Volume ${key}, modulo ${mod.n}: ${mod.title}. ${pages} slide, ${topics} argomenti.`,
      title: `${key} — ${mod.title}`,
    });
    button.style.setProperty("--book-w", `${width}px`);
    button.style.setProperty("--book-h", `${bookHeight(mod)}px`);
    button.style.setProperty("--book-color", color);
    button.style.setProperty("--book-shade", shade(color, -26));

    const cap = el("span", { class: "lib-book-cap", "aria-hidden": "true" }, key);
    const spine = el("span", { class: "lib-book-spine", "aria-hidden": "true" });
    spine.appendChild(el("span", { class: "lib-book-title" }, mod.title || "Senza titolo"));
    const foot = el("span", { class: "lib-book-foot", "aria-hidden": "true" }, pages ? `${pages} pp.` : "—");
    button.append(cap, spine, foot);
    return button;
  }

  function shelvesFor(width) {
    const available = Math.max(MIN_BOOK_WIDTH, width - STAGE_PADDING);
    const rows = [];
    let row = [];
    let used = 0;
    for (const mod of list) {
      const widthForBook = bookWidth(mod);
      const needed = widthForBook + (row.length ? GAP : 0);
      if (row.length && used + needed > available) {
        rows.push(row);
        row = [];
        used = 0;
      }
      row.push({ mod, width: widthForBook });
      used += widthForBook + (row.length > 1 ? GAP : 0);
    }
    if (row.length) rows.push(row);
    return rows;
  }

  function renderShelves(rows) {
    const fragment = document.createDocumentFragment();
    rows.forEach((items, index) => {
      const shelf = el("section", {
        class: "lib-shelf",
        "data-shelf": index + 1,
        "aria-label": `Scaffale ${index + 1}`,
      });
      const row = el("div", {
        class: "lib-books",
        role: "group",
        "aria-label": `Scaffale ${index + 1}: ${items.length} volumi`,
      });
      for (const item of items) row.appendChild(createBook(item.mod, item.width, index + 1));
      shelf.append(row, el("div", { class: "lib-plank", "aria-hidden": "true" }));
      fragment.appendChild(shelf);
    });
    const focusedId = shelves.contains(document.activeElement)
      ? document.activeElement?.dataset?.moduleId
      : null;
    shelves.replaceChildren(fragment);
    shelfCount = rows.length;
    const first = shelves.querySelector(".lib-book");
    if (first) first.tabIndex = 0;
    applyState();
    if (focusedId) {
      shelves.querySelector(`.lib-book[data-module-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true });
    }
  }

  function renderLegend() {
    if (!legend) return;
    const fragment = document.createDocumentFragment();
    fragment.appendChild(el("p", { class: "lib-side-kicker" }, "Indice dei volumi"));
    const ordered = el("ol", { class: "lib-legend-list" });
    for (const mod of list) {
      const item = el("li", {});
      const button = el("button", {
        type: "button",
        class: "lib-legend-item",
        "data-module-id": mod.id,
        "aria-label": `Seleziona il volume ${volumeKey(mod)}: ${mod.title}`,
      });
      const dot = el("span", { class: "lib-dot", "aria-hidden": "true" });
      dot.style.background = PALETTE[(mod.n - 1) % PALETTE.length];
      button.append(dot, el("span", { class: "lib-legend-key" }, volumeKey(mod)), el("span", { class: "lib-legend-title" }, mod.title || "Senza titolo"));
      item.appendChild(button);
      ordered.appendChild(item);
    }
    fragment.appendChild(ordered);
    legend.replaceChildren(fragment);
  }

  function openModule(mod, topicId = null) {
    if (!mod) return;
    if (typeof onOpenModule === "function") onOpenModule(mod, topicId);
    else location.hash = `#/m/${mod.id}${topicId ? `/${topicId}` : ""}`;
  }

  function openFirstSlide(mod) {
    if (!mod || pagesOf(mod) < 1) return;
    if (typeof onSlide === "function") onSlide(mod, 1);
    else location.hash = `#/m/${mod.id}`;
  }

  function createAction(label, action, extraClass = "") {
    return el("button", {
      type: "button",
      class: `lib-action ${extraClass}`.trim(),
      "data-action": action,
    }, label);
  }

  function renderDetail() {
    if (!info) return;
    const mod = current();
    if (!mod) {
      info.replaceChildren(
        el("p", { class: "lib-side-kicker" }, "Scheda volume"),
        el("h3", { class: "lib-detail-empty-title" }, "Nessun volume selezionato"),
        el("p", { class: "lib-detail-empty-text" }, `Scegli un libro dallo scaffale: ${list.length} volumi su ${shelfCount} scaffali. Le copertine riportano il numero del modulo e le pagine disponibili.`),
      );
      return;
    }

    const pages = pagesOf(mod);
    const topicList = topicsOf(mod);
    const shelf = shelfOf(mod.id);
    const fragment = document.createDocumentFragment();
    fragment.append(
      el("p", { class: "lib-side-kicker" }, `Volume ${volumeKey(mod)} · Scaffale ${shelf || "—"}`),
      el("h3", { class: "lib-detail-title" }, mod.title || "Senza titolo"),
      el("p", { class: "lib-detail-sub" }, `${pages} slide · ${topicList.length} argomenti`),
    );

    const facts = el("dl", { class: "lib-facts" });
    facts.append(
      el("dt", {}, "Modulo"), el("dd", {}, String(mod.n ?? "—")),
      el("dt", {}, "Dispensa"), el("dd", {}, mod.pdf ? "PDF disponibile" : "Solo slide"),
      el("dt", {}, "Scaffale"), el("dd", {}, String(shelf || "—")),
    );
    fragment.appendChild(facts);

    if (topicList.length) {
      fragment.appendChild(el("p", { class: "lib-side-kicker lib-topics-kicker" }, "Argomenti in evidenza"));
      const topics = el("div", { class: "lib-topics" });
      for (const topic of topicList.slice(0, 5)) {
        topics.appendChild(el("button", {
          type: "button",
          class: "lib-topic",
          "data-action": "open-topic",
          "data-topic-id": topic.id,
          title: topic.title,
        }, topic.title));
      }
      fragment.appendChild(topics);
    }

    const actions = el("div", { class: "lib-detail-actions" });
    actions.appendChild(createAction("Apri il modulo", "open-module", "lib-action-primary"));
    if (pages) actions.appendChild(createAction("Prima slide", "open-slide"));
    fragment.appendChild(actions);
    info.replaceChildren(fragment);
  }

  function renderCrumbs() {
    if (!crumbs) return;
    const mod = current();
    const fragment = document.createDocumentFragment();
    fragment.appendChild(el("button", { type: "button", class: "lib-crumb", "data-action": "clear" }, "Libreria"));
    if (mod) {
      const shelf = shelfOf(mod.id);
      fragment.appendChild(el("span", { class: "lib-crumb-sep", "aria-hidden": "true" }, "›"));
      fragment.appendChild(el("span", { class: "lib-crumb" }, `Scaffale ${shelf || "—"}`));
      fragment.appendChild(el("span", { class: "lib-crumb-sep", "aria-hidden": "true" }, "›"));
      fragment.appendChild(el("span", { class: "lib-crumb is-current" }, `${volumeKey(mod)} · ${mod.title}`));
    }
    crumbs.replaceChildren(fragment);
  }

  function applyState() {
    const selected = current();
    for (const node of bookNodes()) {
      const isSelected = selected?.id === node.dataset.moduleId;
      node.classList.toggle("is-selected", isSelected);
      node.setAttribute("aria-pressed", String(isSelected));
      node.tabIndex = isSelected || (!selected && node === bookNodes()[0]) ? 0 : -1;
    }
    for (const node of legend?.querySelectorAll(".lib-legend-item") || []) {
      node.classList.toggle("is-selected", selected?.id === node.dataset.moduleId);
    }
    renderDetail();
    renderCrumbs();
  }

  function select(id, options = {}) {
    const mod = list.find((item) => item.id === id);
    if (!mod) return;
    selectedId = id;
    applyState();
    if (options.scroll !== false) {
      const node = shelves.querySelector(`.lib-book[data-module-id="${CSS.escape(id)}"]`);
      node?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced() ? "auto" : "smooth" });
    }
    if (options.announce !== false) {
      announce(`${volumeKey(mod)} selezionato. ${mod.title}. ${topicsOf(mod).length} argomenti.`);
    }
    if (options.focus) {
      shelves.querySelector(`.lib-book[data-module-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    }
  }

  function clear() {
    selectedId = null;
    applyState();
    announce("Nessun volume selezionato.");
  }

  function layout(force = false) {
    const width = stage?.clientWidth || 0;
    if (!width) return;
    if (!force && Math.abs(width - renderedWidth) < 8) return;
    renderedWidth = width;
    renderShelves(shelvesFor(width));
  }

  function moveFocus(from, direction) {
    const nodes = bookNodes();
    if (!nodes.length) return;
    const index = nodes.indexOf(from);
    if (index < 0) return;
    if (direction === "ArrowRight" || direction === "ArrowLeft") {
      const next = clamp(index + (direction === "ArrowRight" ? 1 : -1), 0, nodes.length - 1);
      nodes[next].focus();
      return;
    }
    const rect = from.getBoundingClientRect();
    const vertical = direction === "ArrowDown" ? 1 : -1;
    let best = null;
    let bestScore = Infinity;
    for (const node of nodes) {
      const box = node.getBoundingClientRect();
      const dy = (box.top - rect.top) * vertical;
      if (dy <= 4) continue;
      const score = dy + Math.abs(box.left - rect.left) * 0.35;
      if (score < bestScore) { bestScore = score; best = node; }
    }
    best?.focus();
  }

  shelves?.addEventListener("click", (event) => {
    const book = event.target.closest(".lib-book");
    if (book) select(book.dataset.moduleId);
  });
  shelves?.addEventListener("dblclick", (event) => {
    const book = event.target.closest(".lib-book");
    if (book) openModule(list.find((mod) => mod.id === book.dataset.moduleId));
  });
  shelves?.addEventListener("keydown", (event) => {
    const book = event.target.closest(".lib-book");
    if (!book) return;
    if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      moveFocus(book, event.key);
    } else if (event.key === "Escape") {
      event.preventDefault();
      clear();
      book.focus();
    }
  });
  legend?.addEventListener("click", (event) => {
    const item = event.target.closest(".lib-legend-item");
    if (item) select(item.dataset.moduleId, { focus: true });
  });
  info?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const mod = current();
    if (button.dataset.action === "open-module") openModule(mod);
    if (button.dataset.action === "open-slide") openFirstSlide(mod);
    if (button.dataset.action === "open-topic") {
      const topic = topicsOf(mod).find((item) => item.id === button.dataset.topicId);
      openModule(mod, topic?.id || null);
    }
  });
  crumbs?.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="clear"]')) clear();
  });
  controls?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "relayout") {
      layout(true);
      announce("Scaffali ricomposti.");
    }
    if (button.dataset.action === "clear") clear();
    if (button.dataset.action === "open-selected") openModule(current());
  });

  resizeObserver = new ResizeObserver(() => layout());
  if (stage) resizeObserver.observe(stage);

  return {
    render(manifest) {
      list = Array.isArray(manifest?.modules) ? manifest.modules.slice() : modules();
      renderLegend();
      layout(true);
    },
    layout,
    select,
    clear,
    focus(id) {
      select(id, { focus: true });
    },
    setQuery(value) {
      const next = norm(value || "");
      if (next === query) return;
      query = next;
      const nodes = bookNodes();
      let matches = 0;
      for (const node of nodes) {
        const mod = list.find((item) => item.id === node.dataset.moduleId);
        const haystack = norm(`${mod?.title || ""} ${volumeKey(mod)} ${mod?.topics?.map((t) => t.title).join(" ") || ""}`);
        const match = Boolean(query && haystack.includes(query));
        node.classList.toggle("is-match", match);
        if (match) matches++;
      }
      if (query) announce(`${matches} volumi corrispondono alla ricerca.`);
    },
    state() {
      return {
        modules: list.length,
        shelves: shelfCount,
        selectedId,
        query,
        matches: shelves.querySelectorAll(".lib-book.is-match").length,
      };
    },
    destroy() {
      resizeObserver?.disconnect();
      clearTimeout(announceTimer);
    },
  };
}
