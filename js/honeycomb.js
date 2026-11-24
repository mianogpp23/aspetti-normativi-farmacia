/* honeycomb.js — vista alveare: un esagono per modulo e pannello di dettaglio. */

import { el, svgEl } from "./utils.js";
import { modules, pagesOf, topicsOf } from "./data.js";
import { colorFor, padded, plural } from "./views-common.js";

const RADIUS = 56;
const STEP_X = 97;
const STEP_Y = 84;
const ROW_SIZES = [3, 4, 5, 4, 3];

function hexPoints(x, y, r) {
  const points = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    points.push(`${(x + r * Math.cos(angle)).toFixed(1)},${(y + r * Math.sin(angle)).toFixed(1)}`);
  }
  return points.join(" ");
}

function centers() {
  const out = [];
  for (let row = 0; row < ROW_SIZES.length; row += 1) {
    const size = ROW_SIZES[row];
    const startX = 320 - ((size - 1) * STEP_X) / 2;
    for (let col = 0; col < size; col += 1) {
      out.push({ x: startX + col * STEP_X, y: 70 + row * STEP_Y });
    }
  }
  return out;
}

function shortTitle(title) {
  const text = String(title || "");
  if (text.length <= 17) return text;
  return `${text.slice(0, 16)}…`;
}

function metaOf(mod) {
  const topics = topicsOf(mod).length;
  const pages = pagesOf(mod);
  return `${topics} ${plural(topics, "argomento", "argomenti")} · ${pages} ${plural(pages, "pagina", "pagine")}`;
}

export function createHoneycomb({ mount, onOpenModule, onOpenTopic }) {
  let list = modules();
  let active = 0;
  const coords = centers();

  const shell = el("div", { class: "hex-shell" });
  const intro = el("div", { class: "hex-intro" });
  const guide = el("div", { class: "hex-guide" });
  guide.innerHTML = '<p class="hex-eyebrow">Come leggere</p><p>Ogni esagono è un modulo. Il colore identifica il modulo in tutto il sito. Clicca per vedere gli argomenti nel pannello a destra.</p>';
  const legend = el("p", { class: "hex-count", id: "hex-count" });
  intro.append(guide, legend);

  const svg = svgEl("svg", {
    id: "hex-svg",
    class: "hex-svg",
    viewBox: "0 0 640 480",
    role: "img",
    "aria-labelledby": "hex-svg-title hex-svg-desc",
  });
  const title = svgEl("title", { id: "hex-svg-title" });
  title.textContent = "Alveare dei moduli";
  const desc = svgEl("desc", { id: "hex-svg-desc" });
  desc.textContent = "Griglia a nido d'ape con un esagono colorato per ciascun modulo del corso.";
  svg.append(title, desc);
  const cellsGroup = svgEl("g", { class: "hex-cells", id: "hex-cells" });
  svg.append(cellsGroup);

  const detail = el("aside", { class: "hex-detail", id: "hex-detail", "aria-live": "polite" });
  const board = el("div", { class: "hex-board" });
  board.append(svg, detail);
  shell.append(intro, board);
  mount.append(shell);

  function cellOf(mod, index) {
    const point = coords[index];
    const cell = svgEl("g", {
      class: "hex-cell",
      role: "button",
      tabindex: index === active ? "0" : "-1",
      "aria-pressed": String(index === active),
      "aria-label": `Modulo ${padded(mod.n)}: ${mod.title}, ${metaOf(mod)}`,
      dataset: { index: String(index), moduleId: mod.id },
    });
    cell.style.setProperty("--hex-color", colorFor(index));
    const polygon = svgEl("polygon", { points: hexPoints(point.x, point.y, RADIUS), class: "hex-shape" });
    const number = svgEl("text", { x: point.x, y: point.y - 16, class: "hex-number" });
    number.textContent = padded(mod.n);
    const label = svgEl("text", { x: point.x, y: point.y + 7, class: "hex-label" });
    label.textContent = shortTitle(mod.label || mod.title);
    const pages = svgEl("text", { x: point.x, y: point.y + 28, class: "hex-pages" });
    pages.textContent = `${pagesOf(mod)} pag.`;
    cell.append(polygon, number, label, pages);
    return cell;
  }

  function renderDetail() {
    const mod = list[active];
    if (!mod) return;
    const topics = topicsOf(mod).slice(0, 5);
    const eyebrow = el("p", { class: "hex-eyebrow", text: "Modulo selezionato" });
    const heading = el("h3", { class: "hex-detail-title", text: mod.title });
    const meta = el("p", { class: "hex-detail-meta", text: metaOf(mod) });
    const topicList = el("ul", { class: "hex-detail-topics" });
    for (const topic of topics) topicList.append(el("li", { text: topic.title }));
    const open = el("button", { class: "hex-open", type: "button", id: "hex-open", text: "Apri modulo →" });
    open.addEventListener("click", () => onOpenModule?.(mod));
    detail.replaceChildren(eyebrow, heading, meta, topicList, open);
    if (topics[0]) {
      const firstTopic = el("button", {
        class: "hex-open hex-open-secondary",
        type: "button",
        text: `Vai a: ${topics[0].title}`,
      });
      firstTopic.addEventListener("click", () => onOpenTopic?.(mod, topics[0]));
      detail.append(firstTopic);
    }
  }

  function select(index, { focusCell = false } = {}) {
    active = Math.max(0, Math.min(index, list.length - 1));
    const cells = Array.from(cellsGroup.querySelectorAll(".hex-cell"));
    cells.forEach((cell, i) => {
      const isActive = i === active;
      cell.classList.toggle("is-active", isActive);
      cell.setAttribute("aria-pressed", String(isActive));
      cell.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    renderDetail();
    if (focusCell && cells[active]) cells[active].focus();
  }

  function nextInDirection(direction) {
    const origin = coords[active];
    const options = coords.map((point, index) => ({ index, dx: point.x - origin.x, dy: point.y - origin.y }));
    const valid = options.filter((item) => {
      if (direction === "ArrowRight") return item.dx > 4 && Math.abs(item.dy) < STEP_Y * 0.7;
      if (direction === "ArrowLeft") return item.dx < -4 && Math.abs(item.dy) < STEP_Y * 0.7;
      if (direction === "ArrowDown") return item.dy > 4 && Math.abs(item.dx) < STEP_X * 0.7;
      return item.dy < -4 && Math.abs(item.dx) < STEP_X * 0.7;
    });
    valid.sort((a, b) => {
      const scoreA = direction === "ArrowRight" || direction === "ArrowLeft"
        ? Math.abs(a.dx) + Math.abs(a.dy) * 2
        : Math.abs(a.dy) + Math.abs(a.dx) * 2;
      const scoreB = direction === "ArrowRight" || direction === "ArrowLeft"
        ? Math.abs(b.dx) + Math.abs(b.dy) * 2
        : Math.abs(b.dy) + Math.abs(b.dx) * 2;
      return scoreA - scoreB;
    });
    return valid.length > 0 ? valid[0].index : active;
  }

  function render() {
    list = modules();
    active = Math.min(active, list.length - 1);
    cellsGroup.replaceChildren(...list.map(cellOf));
    const pages = list.reduce((acc, mod) => acc + pagesOf(mod), 0);
    legend.textContent = `${list.length} moduli · ${pages} pagine · usa le frecce per navigare l'alveare`;
    select(active);
  }

  cellsGroup.addEventListener("click", (event) => {
    const cell = event.target.closest(".hex-cell");
    if (cell) select(Number(cell.dataset.index));
  });

  cellsGroup.addEventListener("keydown", (event) => {
    const cell = event.target.closest(".hex-cell");
    if (!cell) return;
    if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      select(nextInDirection(event.key), { focusCell: true });
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(Number(cell.dataset.index));
    }
  });

  return {
    render,
    select,
    focus() { select(active, { focusCell: true }); },
    state() { return { index: active, moduleId: list[active]?.id || null, cells: list.length }; },
  };
}
