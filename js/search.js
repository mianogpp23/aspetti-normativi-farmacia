/* search.js — ricerca globale su moduli, argomenti e testo delle slide */

import { $, el, esc, norm, debounce } from "./utils.js";
import { state, getModule, modules } from "./data.js";

let index = [];
let active = -1;
let currentResults = [];
let matched = 0;
let onPick = null;

export function buildIndex() {
  index = [];
  const q = new Map();

  modules().forEach((m) => {
    const topicTitles = (m.topics || []).map((t) => t.title).join(" · ");
    index.push({
      kind: "module",
      modId: m.id,
      n: null,
      title: m.title,
      meta: `${String(m.n).padStart(2, "0")} · ${m.pdf?.pages || 0} slide${m.topics?.length ? ` · ${m.topics.length} argomenti` : ""}`,
      text: `${m.lecturers?.join(" ") || ""} ${topicTitles}`,
      hayTitle: norm(`${m.title} ${m.label || ""}`),
      hayText: norm(`${m.lecturers?.join(" ") || ""} ${topicTitles}`),
    });
    (m.topics || []).forEach((t) => {
      index.push({
        kind: "topic",
        modId: m.id,
        topicId: t.id,
        n: t.from,
        title: t.title,
        meta: `${m.label || m.title} · slide ${t.from}–${t.to}`,
        text: (t.keywords || []).join(" · "),
        hayTitle: norm(t.title),
        hayText: norm((t.keywords || []).join(" ")),
      });
    });
  });

  (state.search || []).forEach((s) => {
    const mod = getModule(s.m);
    if (!mod) return;
    const key = `${s.m}:${s.n}`;
    if (q.has(key)) return;
    q.set(key, true);
    const shortLabel = mod.label || mod.title;
    index.push({
      kind: "slide",
      modId: s.m,
      n: s.n,
      title: s.t || `Slide ${s.n}`,
      meta: `${shortLabel} · slide ${s.n}`,
      text: s.x || "",
      hayTitle: norm(s.t || ""),
      hayText: norm(s.x || ""),
    });
  });
}

function score(item, tokens, phrase) {
  let sc = 0;
  let inText = 0;
  for (const tk of tokens) {
    const inT = item.hayTitle.includes(tk);
    const inX = item.hayText.includes(tk);
    if (!inT && !inX) return 0;
    if (inT) sc += 6;
    if (inX) { sc += 1.2; inText++; }
  }
  if (phrase && item.hayTitle.includes(phrase)) sc += 10;
  if (phrase && item.hayText.includes(phrase)) sc += 4;
  sc += item.kind === "topic" ? 1.6 : item.kind === "module" ? 1.2 : 0;
  if (item.hayTitle.startsWith(tokens[0])) sc += 3;
  // predilige titoli che coprono molti termini
  sc += (inText / tokens.length) * 1.5;
  return sc;
}

function snippet(item, tokens) {
  const raw = item.text || "";
  if (!raw) return "";
  const low = norm(raw);
  let at = -1;
  for (const tk of tokens) {
    const i = low.indexOf(tk);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  let out;
  if (at < 0) out = raw.slice(0, 150);
  else {
    const start = Math.max(0, at - 55);
    out = (start > 0 ? "…" : "") + raw.slice(start, start + 170).trim() + "…";
  }
  let html = esc(out);
  tokens.forEach((tk) => {
    if (tk.length < 3) return;
    const re = new RegExp(`(${tk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    html = html.replace(re, "<mark>$1</mark>");
  });
  return html;
}

let onQuery = null;

export function initSearch({ onSelect, onQuery: onQueryChange }) {
  onPick = onSelect;
  onQuery = onQueryChange || null;
  const input = $("#search-input");
  const panel = $("#search-results");
  if (!input || !panel) return;

  const close = () => {
    panel.hidden = true;
    active = -1;
    input.setAttribute("aria-expanded", "false");
    onQuery?.("");
  };

  const run = debounce(() => {
    const raw = input.value.trim();
    onQuery?.(raw.length >= 2 ? raw : "");
    if (raw.length < 2) { close(); return; }
    const tokens = norm(raw).split(" ").filter((t) => t.length > 0);
    if (!tokens.length) { close(); return; }
    const phrase = norm(raw);

    const scored = index
      .map((it) => ({ it, sc: score(it, tokens, phrase) }))
      .filter((r) => r.sc > 0)
      .sort((a, b) => b.sc - a.sc || (a.it.kind === "module" ? -1 : 1));

    matched = scored.length;
    currentResults = scored.slice(0, 28);

    render(panel, tokens, raw);
  }, 110);

  input.addEventListener("input", run);
  input.addEventListener("focus", () => { if (input.value.trim().length >= 2) run(); });

  input.addEventListener("keydown", (e) => {
    const items = Array.from(panel.querySelectorAll(".sp-item"));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length) return;
      e.preventDefault();
      active = e.key === "ArrowDown"
        ? (active + 1) % items.length
        : (active - 1 + items.length) % items.length;
      items.forEach((n, i) => n.setAttribute("aria-selected", String(i === active)));
      items[active].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && items[active]) items[active].click();
      else if (items[0]) items[0].click();
    } else if (e.key === "Escape") {
      close();
      input.blur();
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search")) close();
  });
}

function render(panel, tokens, raw) {
  active = -1;
  panel.hidden = false;
  $("#search-input").setAttribute("aria-expanded", "true");

  const head = (left, right) => el("div", { class: "sp-head" }, `<span>${esc(left)}</span><span>${esc(right)}</span>`);

  if (!currentResults.length) {
    panel.replaceChildren(
      head("Nessun risultato", raw),
      el("div", { class: "sp-empty" }, 'Prova con un termine più breve, ad esempio <b>ricetta</b>, <b>stupefacenti</b> o <b>galeniche</b>.'),
    );
    return;
  }

  const groups = { module: [], topic: [], slide: [] };
  currentResults.forEach(({ it }) => groups[it.kind].push(it));

  const groupNode = (label, items) => {
    if (!items.length) return null;
    const wrap = el("div", { class: "sp-group" });
    wrap.append(el("p", { class: "sp-label", text: label }));
    for (const it of items) {
      const snippetHtml = it.kind === "slide" ? `<span class="sp-snip">${snippet(it, tokens)}</span>` : "";
      wrap.append(el("button", {
        class: "sp-item",
        type: "button",
        role: "option",
        "aria-selected": "false",
        dataset: { kind: it.kind, mod: it.modId, n: it.n ?? "", topic: it.topicId || "" },
      }, `<span class="sp-badge">${it.kind === "module" ? "M" : it.n ?? "·"}</span>
        <span class="sp-main"><span class="sp-title">${esc(it.title)}</span>
        <span class="sp-meta">${esc(it.meta)}</span>${snippetHtml}</span>`));
    }
    return wrap;
  };

  const shown =
    groups.module.slice(0, 3).length +
    groups.topic.slice(0, 5).length +
    groups.slide.slice(0, 14).length;
  const tail = matched > shown ? `${shown} mostrati · Invio per aprire` : "Invio per aprire";
  const nodes = [
    head(`${matched} risultat${matched === 1 ? "o" : "i"}`, tail),
    groupNode("Moduli", groups.module.slice(0, 3)),
    groupNode("Argomenti", groups.topic.slice(0, 5)),
    groupNode("Slide", groups.slide.slice(0, 14)),
  ].filter(Boolean);
  panel.replaceChildren(...nodes);

  panel.querySelectorAll(".sp-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mod = getModule(btn.dataset.mod);
      if (!mod || !onPick) return;
      const kind = btn.dataset.kind;
      const page = btn.dataset.n ? Number(btn.dataset.n) : null;
      panel.hidden = true;
      active = -1;
      const input = $("#search-input");
      input.setAttribute("aria-expanded", "false");
      input.blur();
      onQuery?.("");
      // il tipo guida l'apertura: modulo → vista, argomento → flusso, slide → visore
      if (kind === "slide") onPick(mod, { kind, n: page });
      else if (kind === "topic") onPick(mod, { kind, topicId: btn.dataset.topic || null, n: page });
      else onPick(mod, { kind });
    });
  });
}
