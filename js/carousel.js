/* carousel.js — vista principale: schede dei moduli con card centrale in primo piano. */

import { el, esc, clamp } from "./utils.js";
import { modules, pagesOf, topicsOf } from "./data.js";
import { colorFor, padded, plural } from "./views-common.js";

function reduced() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function metaOf(mod) {
  const topics = topicsOf(mod).length;
  const pages = pagesOf(mod);
  return `${topics} ${plural(topics, "argomento", "argomenti")} · ${pages} ${plural(pages, "pagina", "pagine")}`;
}

export function createCarousel({ mount, onOpenModule }) {
  let list = modules();
  let active = 0;

  const shell = el("div", { class: "car-shell" });
  const top = el("div", { class: "car-top" });
  const kicker = el("p", { class: "car-kicker", text: "Sfoglia i moduli" });
  const count = el("p", { class: "car-count", id: "car-count" });
  top.append(kicker, count);

  const stage = el("div", { class: "car-stage" });
  const prev = el("button", {
    class: "car-arrow", id: "car-prev", type: "button", "aria-label": "Modulo precedente",
  }, '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5 8 12l6.5 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  const viewport = el("div", { class: "car-viewport", id: "car-viewport", tabindex: "0", role: "group", "aria-label": "Carosello dei moduli" });
  const track = el("div", { class: "car-track", id: "car-track" });
  viewport.append(track);
  const next = el("button", {
    class: "car-arrow", id: "car-next", type: "button", "aria-label": "Modulo successivo",
  }, '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5 16 12l-6.5 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  stage.append(prev, viewport, next);

  const foot = el("div", { class: "car-foot" });
  const dots = el("div", { class: "car-dots", id: "car-dots", role: "tablist", "aria-label": "Seleziona modulo" });
  const open = el("button", { class: "car-open", id: "car-open", type: "button", text: "Apri modulo →" });
  foot.append(dots, open);

  shell.append(top, stage, foot);
  mount.append(shell);

  function cardOf(mod, index) {
    const topics = topicsOf(mod).slice(0, 3).map((t) => `<li>${esc(t.title)}</li>`).join("");
    const label = `${padded(mod.n)}. ${mod.title}. ${metaOf(mod)}`;
    return el("button", {
      class: "car-card",
      type: "button",
      tabindex: index === active ? "0" : "-1",
      "aria-label": label,
      dataset: { index: String(index), moduleId: mod.id },
      style: `--card-color:${colorFor(index)}`,
    }, `<span class="car-card-head"><span class="car-num">${padded(mod.n)}</span><span class="car-swatch" aria-hidden="true"></span></span>
      <span class="car-card-title">${esc(mod.title)}</span>
      <span class="car-card-meta">${esc(metaOf(mod))}</span>
      <ul class="car-card-topics">${topics}</ul>
      <span class="car-card-cta" aria-hidden="true">Apri modulo →</span>`);
  }

  function select(index, { focusCard = false } = {}) {
    active = clamp(index, 0, list.length - 1);
    const cards = Array.from(track.querySelectorAll(".car-card"));
    cards.forEach((node, i) => {
      const isActive = i === active;
      node.classList.toggle("is-active", isActive);
      node.setAttribute("aria-current", isActive ? "true" : "false");
      node.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    const dotsNodes = Array.from(dots.querySelectorAll(".car-dot"));
    dotsNodes.forEach((node, i) => {
      const isActive = i === active;
      node.classList.toggle("is-active", isActive);
      node.setAttribute("aria-selected", String(isActive));
      node.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    prev.disabled = active === 0;
    next.disabled = active === list.length - 1;
    count.textContent = `${list.length} moduli · modulo ${padded(active + 1)} di ${padded(list.length)}`;
    const card = cards[active];
    if (card) {
      const target = card.offsetLeft - (viewport.clientWidth - card.clientWidth) / 2;
      viewport.scrollTo({ left: Math.max(0, target), behavior: reduced() ? "auto" : "smooth" });
      if (focusCard) card.focus({ preventScroll: true });
    }
  }

  function render() {
    list = modules();
    active = clamp(active, 0, list.length - 1);
    track.replaceChildren(...list.map(cardOf));
    dots.replaceChildren(...list.map((mod, i) => el("button", {
      class: "car-dot",
      type: "button",
      role: "tab",
      "aria-label": `Vai al modulo ${padded(mod.n)}: ${mod.title}`,
      dataset: { index: String(i) },
    })));
    select(active);
  }

  track.addEventListener("click", (event) => {
    const card = event.target.closest(".car-card");
    if (card) {
      select(Number(card.dataset.index), { focusCard: true });
      onOpenModule?.(list[active]);
    }
  });

  dots.addEventListener("click", (event) => {
    const dot = event.target.closest(".car-dot");
    if (dot) select(Number(dot.dataset.index));
  });

  prev.addEventListener("click", () => select(active - 1));
  next.addEventListener("click", () => select(active + 1));
  open.addEventListener("click", () => onOpenModule?.(list[active]));

  viewport.addEventListener("keydown", (event) => {
    const card = event.target.closest(".car-card");
    if (!card) return;
    const cardIndex = Number(card.dataset.index);
    const map = { ArrowLeft: cardIndex - 1, ArrowRight: cardIndex + 1, Home: 0, End: list.length - 1 };
    if (event.key === "Enter") {
      event.preventDefault();
      onOpenModule?.(list[cardIndex]);
      return;
    }
    const target = map[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(target, { focusCard: true });
  });

  return {
    render,
    select,
    focus() { select(active, { focusCard: true }); },
    state() { return { index: active, moduleId: list[active]?.id || null, count: list.length }; },
  };
}
