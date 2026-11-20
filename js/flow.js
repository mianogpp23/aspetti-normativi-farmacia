/* flow.js — vista modulo: percorso argomenti → subtopic → slide */

import { $, el, esc, toast } from "./utils.js";
import { pagesOf, topicsOf, slideTitle, thumbUrl, pdfUrl, pdfPageUrl } from "./data.js";

const ICON_PDF = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.8h5l3 3V14a.4.4 0 0 1-.4.4H4.4A.4.4 0 0 1 4 14V2.2a.4.4 0 0 1 .4-.4Z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M9 1.9v3h3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`;
const ICON_LAYERS = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.9 1.9 5 8 8.1 14.1 5 8 1.9Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M2 8.4 8 11.5l6-3.1M2 11.4 8 14.5l6-3.1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
const ICON_PEOPLE = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.4" r="2.7" fill="none" stroke="currentColor" stroke-width="1.35"/><path d="M2.6 13.2c.6-2.5 2.8-3.9 5.4-3.9s4.8 1.4 5.4 3.9" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>`;
const ICON_ZOOM = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2h8v8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M14 2 8.4 7.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M11.6 10.4V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5.6a1 1 0 0 1 1-1h2.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
const ICON_EYE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.8-6.2 10-6.2S22 12 22 12s-3.8 6.2-10 6.2S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;

let ctx = null;

export function mountFlow({ onSlide, onTopic }) {
  ctx = { mod: null, topicId: null, onSlide, onTopic };
}

export function renderModule(mod, topicId) {
  if (!ctx) return;
  ctx.mod = mod;
  const topics = topicsOf(mod);
  const pages = pagesOf(mod);

  $("#crumb-cur").textContent = mod.title;
  $("#mod-eyebrow").textContent = `Modulo ${String(mod.n).padStart(2, "0")}`;
  $("#mod-title").textContent = mod.title;

  const chips = [];
  if (mod.lecturers?.length) chips.push(`<span class="mchip">${ICON_PEOPLE}${esc(mod.lecturers.join(" · "))}</span>`);
  chips.push(`<span class="mchip">${ICON_PDF}${pages ? `${pages} pagine` : "nessuna dispense"}</span>`);
  if (topics.length && pages) chips.push(`<span class="mchip">${ICON_LAYERS}${topics.length} argomenti</span>`);
  if (pages && mod.has_topics === false)
    chips.push(`<span class="mchip is-empty" title="Il PDF contiene prevalentemente immagini: gli argomenti non sono ricavabili dal testo">deck prevalentemente visivo</span>`);
  $("#mod-meta").innerHTML = chips.join("");

  const pdfLink = $("#mod-pdf");
  if (pages) {
    pdfLink.href = pdfUrl(mod);
    pdfLink.hidden = false;
    pdfLink.textContent = "PDF originale";
    pdfLink.setAttribute("target", "_blank");
  } else {
    pdfLink.hidden = true;
  }

  const startBtn = $("#mod-start");
  startBtn.hidden = !pages;
  startBtn.onclick = () => {
    const t = topics.find((x) => x.id === topicId) || topics[0];
    if (t) ctx.onSlide(mod, t.from);
  };

  // rail
  const rail = $("#flow-rail");
  rail.innerHTML = "";
  const scrollerEl = $(".flow-rail-scroll");
  if (scrollerEl) scrollerEl.hidden = false;
  $("#rail-sub").textContent = pages
    ? `${topics.length ? `${topics.length} argomenti in sequenza · ` : ""}${pages} slide totali`
    : "Modulo senza PDF delle dispense";

  if (!pages) {
    const scroller = $(".flow-rail-scroll");
    if (scroller) scroller.hidden = true;
    $("#flow-detail").innerHTML = emptyState(
      "Nessuna slide da mostrare",
      "Questo modulo dell'archivio non contiene un PDF delle dispense: non ci sono pagine da mostrare."
    );
    return;
  }

  if (topics.length <= 1 && !topics[0]?.subtopics?.length) {
    // nessun topic utile: mostra direttamente la griglia completa
    const scroller = $(".flow-rail-scroll");
    if (scroller) scroller.hidden = true;
    $("#flow-detail").innerHTML = "";
    const wrap = el("div", { class: "flow-detail-inner" });
    wrap.appendChild(slideGrid(mod, 1, pages, ""));
    $("#flow-detail").appendChild(wrap);
    return;
  }

  topics.forEach((t) => {
    const btn = el("button", {
      class: "tnode" + (t.id === topicId || (!topicId && t.id === topics[0].id) ? " is-active" : ""),
      type: "button",
      role: "listitem",
      dataset: { topic: t.id },
    }, `
      <span class="tnode-dot">${t.from}</span>
      <span class="tnode-label">${esc(t.title)}</span>
      <span class="tnode-range">${t.from}–${t.to} · ${t.count}</span>`);
    btn.addEventListener("click", () => selectTopic(t.id));
    const li = el("li", { class: "tnode-wrap", style: "display:contents" });
    li.appendChild(btn);
    rail.appendChild(li);
  });

  selectTopic(topicId || topics[0].id, false);
}

function selectTopic(id, notify = true) {
  const { mod } = ctx;
  const topics = topicsOf(mod);
  const topic = topics.find((t) => t.id === id) || topics[0];
  if (!topic) return;
  ctx.topicId = topic.id;

  document.querySelectorAll("#flow-rail .tnode").forEach((n) => {
    const on = n.dataset.topic === topic.id;
    n.classList.toggle("is-active", on);
    if (on) {
      n.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      // centra orizzontalmente la barra
      const scroller = n.closest(".flow-rail-scroll");
      if (scroller) {
        const target = n.offsetLeft - scroller.clientWidth / 2 + n.offsetWidth / 2;
        scroller.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
      }
    }
  });

  const detail = $("#flow-detail");
  detail.innerHTML = "";

  const head = el("div", { class: "topic-head" }, `
    <div class="topic-kicker">
      <span class="topic-badge">Argomento ${topics.indexOf(topic) + 1}</span>
      <span class="topic-range">slide ${topic.from}–${topic.to} · ${topic.count}</span>
    </div>
    <h2 class="topic-title">${esc(topic.title)}</h2>
    ${topic.keywords?.length ? `<div class="topic-kw">${topic.keywords.slice(0, 7).map((k) => `<span class="kw">${esc(k)}</span>`).join("")}</div>` : ""}`);
  detail.appendChild(head);

  if (topic.subtopics?.length) {
    topic.subtopics.forEach((s) => {
      const box = el("div", { class: "subtopic" });
      box.appendChild(el("div", { class: "subtopic-head" }, `
        <span class="subtopic-mark"></span>
        <span class="subtopic-title">${esc(s.title)}</span>
        <span class="subtopic-range">${s.from}–${s.to} · ${s.count}</span>`));
      box.appendChild(slideGrid(mod, s.from, s.to, s.title));
      detail.appendChild(box);
    });
  } else {
    detail.appendChild(slideGrid(mod, topic.from, topic.to, ""));
  }

  if (notify && ctx.onTopic) ctx.onTopic(mod, topic.id);
}

function slideGrid(mod, from, to, groupTitle) {
  const grid = el("div", { class: "slide-grid", role: "list" });
  const label = groupTitle ? `${groupTitle} — ` : "";
  for (let n = from; n <= to; n++) {
    const title = slideTitle(mod, n);
    const card = el("button", {
      class: "slide-card",
      type: "button",
      role: "listitem",
      dataset: { n: String(n) },
      "aria-label": `${label}Slide ${n}${title ? `: ${title}` : ""}`,
    }, `
      <span class="slide-thumb">
        <img src="${thumbUrl(mod.id, n)}" alt="" loading="lazy" decoding="async">
        <span class="slide-num">${n}</span>
        <span class="slide-open">${ICON_EYE}</span>
      </span>
      <span class="slide-cap">
        <span class="slide-title">${esc(title || `Slide ${n}`)}</span>
        <span class="slide-sub">${String(n).padStart(3, "0")} / ${String(pagesOf(mod)).padStart(3, "0")}</span>
      </span>`);

    const img = card.querySelector("img");
    img.addEventListener("error", () => {
      img.remove();
      card.querySelector(".slide-thumb")?.classList.add("is-missing");
    });
    img.addEventListener("load", () => card.querySelector(".slide-thumb")?.classList.remove("is-missing"));
    card.addEventListener("click", () => ctx.onSlide(mod, n));
    grid.appendChild(card);
  }
  return grid;
}

function emptyState(title, text) {
  return `<div class="empty-state">
    <span class="es-icon">${ICON_LAYERS}</span>
    <p class="es-title">${esc(title)}</p>
    <p class="es-text">${esc(text)}</p>
  </div>`;
}

export function showRenderNotice() {
  toast("Anteprime in preparazione: usa il PDF per la pagina completa", 3000);
}
