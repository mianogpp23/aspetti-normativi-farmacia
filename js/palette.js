/* palette.js — ricerca in primo piano stile palette comandi. */

import { el, esc, norm } from "./utils.js";
import { modules, pagesOf, topicsOf, slideTitle, state } from "./data.js";
import { colorFor, padded, plural } from "./views-common.js";

const LIMITS = { module: 4, topic: 6, slide: 8 };
const LABELS = { module: "MODULI", topic: "ARGOMENTI", slide: "SLIDE" };

function tokensOf(query) {
  return norm(query).split(" ").filter(Boolean);
}

function matches(tokens, text) {
  return tokens.every((token) => text.includes(token));
}

function entryMeta(entry) {
  if (entry.kind === "module") {
    const topics = topicsOf(entry.mod).length;
    const pages = pagesOf(entry.mod);
    return `${topics} ${plural(topics, "argomento", "argomenti")} · ${pages} ${plural(pages, "pagina", "pagine")}`;
  }
  if (entry.kind === "topic") {
    return `Modulo ${padded(entry.mod.n)} · pagine ${entry.topic.from ?? "—"}–${entry.topic.to ?? "—"}`;
  }
  return `Modulo ${padded(entry.mod.n)} · slide ${entry.n}`;
}

export function createPalette({ mount, onOpenModule, onOpenTopic, onOpenSlide, onEscape }) {
  const shell = el("div", { class: "pal-shell" });
  const panel = el("div", { class: "pal-panel" });
  const bar = el("div", { class: "pal-bar" });
  const icon = el("span", {
    class: "pal-icon",
    "aria-hidden": "true",
  }, '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m15.5 15.5 4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>');
  const input = el("input", {
    id: "pal-input",
    class: "pal-input",
    type: "search",
    autocomplete: "off",
    spellcheck: "false",
    placeholder: "Cerca moduli, argomenti e slide…",
    "aria-label": "Cerca in tutto il corso",
    role: "combobox",
    "aria-expanded": "true",
    "aria-controls": "pal-results",
    "aria-autocomplete": "list",
  });
  const escBtn = el("button", { id: "pal-esc", class: "pal-esc", type: "button", text: "Esc" });
  bar.append(icon, input, escBtn);

  const count = el("p", { class: "pal-count", id: "pal-count" });
  const results = el("div", { class: "pal-results", id: "pal-results", role: "listbox", "aria-label": "Risultati di ricerca" });
  const groups = new Map();
  for (const kind of ["module", "topic", "slide"]) {
    const section = el("section", { class: "pal-group", dataset: { kind } });
    const heading = el("h3", { class: "pal-group-title" });
    const badge = el("span", { class: "pal-group-count" });
    heading.append(el("span", { text: LABELS[kind] }), badge);
    const items = el("div", { class: "pal-items", role: "group", "aria-label": LABELS[kind] });
    section.append(heading, items);
    results.append(section);
    groups.set(kind, { section, badge, items });
  }
  const empty = el("p", { class: "pal-empty", id: "pal-empty", hidden: true });
  panel.append(bar, count, results, empty);
  shell.append(panel);
  mount.append(shell);

  let entries = [];
  let visible = [];
  let active = -1;

  function collect() {
    const list = modules();
    const searchBySlide = new Map((state.search || []).map((item) => [`${item.m}:${item.n}`, item]));
    const moduleEntries = list.map((mod) => ({
      kind: "module",
      mod,
      title: mod.title,
      hay: norm([`M${padded(mod.n)}`, mod.title, mod.label, (mod.lecturers || []).join(" "), (mod.topics || []).map((t) => t.title).join(" ")].join(" ")),
    }));
    const topicEntries = list.flatMap((mod) => topicsOf(mod).map((topic) => ({
      kind: "topic",
      mod,
      topic,
      title: topic.title,
      hay: norm([mod.title, topic.title, (topic.keywords || []).join(" ")].join(" ")),
    })));
    const slideEntries = list.flatMap((mod) => (mod.slides || []).map((slide) => {
      const item = searchBySlide.get(`${mod.id}:${slide.n}`);
      const title = slideTitle(mod, slide.n);
      return {
        kind: "slide",
        mod,
        n: slide.n,
        title,
        hay: norm([mod.title, title, item?.t || "", item?.x || ""].join(" ")),
      };
    }));
    return [...moduleEntries, ...topicEntries, ...slideEntries];
  }

  function open(entry) {
    if (entry.kind === "module") return onOpenModule?.(entry.mod);
    if (entry.kind === "topic") return onOpenTopic?.(entry.mod, entry.topic);
    return onOpenSlide?.(entry.mod, entry.n);
  }

  function itemOf(entry, index) {
    const swatch = colorFor((entry.mod.n ?? 1) - 1);
    const button = el("button", {
      class: "pal-item",
      type: "button",
      role: "option",
      "aria-selected": "false",
      dataset: { index: String(index), kind: entry.kind, moduleId: entry.mod.id, n: entry.n ?? "" },
    }, `<span class="pal-badge">${esc(entry.kind === "slide" ? padded(entry.n) : LABELS[entry.kind].slice(0, 1))}</span>
      <span class="pal-item-text"><span class="pal-item-title">${esc(entry.title)}</span><span class="pal-item-meta">${esc(entryMeta(entry))}</span></span>
      <span class="pal-item-arrow" aria-hidden="true">→</span>`);
    button.style.setProperty("--pal-color", swatch);
    button.addEventListener("click", () => open(entry));
    return button;
  }

  function setActive(next) {
    const items = Array.from(results.querySelectorAll(".pal-item"));
    active = next;
    items.forEach((node, i) => { node.setAttribute("aria-selected", String(i === active)); });
    if (active >= 0 && items[active]) items[active].scrollIntoView({ block: "nearest" });
  }

  function render() {
    entries = collect();
    const tokens = tokensOf(input.value);
    const filtered = entries.filter((entry) => matches(tokens, entry.hay));
    const groupCounts = { module: 0, topic: 0, slide: 0 };
    for (const entry of filtered) groupCounts[entry.kind] += 1;
    visible = [];
    for (const kind of ["module", "topic", "slide"]) {
      const group = groups.get(kind);
      const subset = filtered.filter((entry) => entry.kind === kind).slice(0, LIMITS[kind]);
      const nodes = subset.map((entry) => {
        const index = visible.push(entry) - 1;
        return itemOf(entry, index);
      });
      group.items.replaceChildren(...nodes);
      group.badge.textContent = `${groupCounts[kind]}`;
      group.section.hidden = groupCounts[kind] === 0;
    }
    const noResults = filtered.length === 0;
    results.hidden = noResults;
    empty.hidden = !noResults;
    empty.textContent = noResults ? `Nessun risultato per “${input.value.trim()}”. Prova con ricetta, stupefacenti o galeniche.` : "";
    const list = modules();
    const pages = list.reduce((acc, mod) => acc + pagesOf(mod), 0);
    count.textContent = `${groupCounts.module} moduli · ${groupCounts.topic} argomenti · ${groupCounts.slide} slide · ${pages} pagine totali`;
    active = -1;
    input.setAttribute("aria-expanded", "true");
  }

  function move(delta) {
    if (visible.length === 0) return;
    setActive((active + delta + visible.length) % visible.length);
  }

  input.addEventListener("input", render);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const entry = visible[active >= 0 ? active : 0];
      if (entry) open(entry);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (input.value) {
        input.value = "";
        render();
      } else {
        onEscape?.();
      }
    }
  });

  results.addEventListener("keydown", (event) => {
    if (!event.target.closest(".pal-item")) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
      const item = results.querySelectorAll(".pal-item")[active];
      if (item) item.focus();
    }
  });

  escBtn.addEventListener("click", () => {
    if (input.value) {
      input.value = "";
      render();
    }
    input.focus();
  });

  return {
    render,
    setQuery(value) { input.value = value ?? ""; render(); },
    focus() { input.focus(); input.select(); },
    state() {
      return {
        query: input.value,
        visible: visible.length,
        modules: Number(groups.get("module").badge.textContent || 0),
        topics: Number(groups.get("topic").badge.textContent || 0),
        slides: Number(groups.get("slide").badge.textContent || 0),
      };
    },
  };
}
