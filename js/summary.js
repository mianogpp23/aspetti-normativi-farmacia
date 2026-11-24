/* summary.js — indice del corso in stile libro, con numeri di pagina cumulativi. */

import { el, esc } from "./utils.js";
import { modules, pagesOf, topicsOf } from "./data.js";
import { buildPageIndex, colorFor, padded, plural } from "./views-common.js";

function pageOfTopic(topic, info) {
  if (info.start === null || info.pages === 0) return "—";
  const from = Number(topic.from || 1);
  if (from < 1 || from > info.pages) return "—";
  return String(info.start + from - 1);
}

export function createSummary({ mount, onOpenModule, onOpenTopic }) {
  const shell = el("div", { class: "sum-shell" });
  const head = el("div", { class: "sum-head" });
  const note = el("p", { class: "sum-note", text: "Indice del corso" });
  const total = el("p", { class: "sum-total", id: "sum-total" });
  head.append(note, total);
  const book = el("div", { class: "sum-book" });
  const colA = el("ol", { class: "sum-col", id: "sum-col-a" });
  const colB = el("ol", { class: "sum-col", id: "sum-col-b" });
  book.append(colA, colB);
  shell.append(head, book);
  mount.append(shell);

  function row(buttonClass, number, title, page, dataset) {
    const attrs = {
      class: buttonClass,
      type: "button",
      dataset,
    };
    return el("button", attrs, `<span class="sum-number">${esc(number)}</span><span class="sum-title">${esc(title)}</span><span class="sum-leader" aria-hidden="true"></span><span class="sum-page">${esc(page)}</span>`);
  }

  function moduleNode(mod, info) {
    const topics = topicsOf(mod);
    const page = info.start === null ? "—" : String(info.start);
    const item = el("li", { class: "sum-module", dataset: { moduleId: mod.id, pageStart: page } });
    const button = row(
      "sum-module-btn",
      padded(mod.n),
      mod.title,
      page,
      { moduleId: mod.id },
    );
    button.style.setProperty("--sum-color", colorFor(mod.n - 1));
    button.setAttribute("aria-label", `Apri modulo ${padded(mod.n)}: ${mod.title}`);
    button.addEventListener("click", () => onOpenModule?.(mod));

    const list = el("ol", { class: "sum-topics" });
    for (const topic of topics) {
      const topicItem = el("li", { class: "sum-topic-row", dataset: { topicId: topic.id, page: pageOfTopic(topic, info) } });
      const topicButton = row(
        "sum-topic-btn",
        "",
        topic.title,
        pageOfTopic(topic, info),
        { moduleId: mod.id, topicId: topic.id },
      );
      topicButton.setAttribute("aria-label", `Apri argomento ${topic.title} del modulo ${padded(mod.n)}`);
      topicButton.addEventListener("click", () => onOpenTopic?.(mod, topic));
      topicItem.append(topicButton);
      list.append(topicItem);
    }
    item.append(button, list);
    return item;
  }

  function render() {
    const list = modules();
    const built = buildPageIndex(list, pagesOf);
    const middle = Math.ceil(list.length / 2);
    colA.replaceChildren(...list.slice(0, middle).map((mod) => moduleNode(mod, built.index.get(mod.id))));
    colB.replaceChildren(...list.slice(middle).map((mod) => moduleNode(mod, built.index.get(mod.id))));
    const topics = list.reduce((acc, mod) => acc + topicsOf(mod).length, 0);
    total.textContent = `${list.length} moduli · ${topics} ${plural(topics, "argomento", "argomenti")} · pagine ${built.total}`;
  }

  return {
    render,
    focus() { colA.querySelector(".sum-module-btn")?.focus(); },
    state() { return { modules: colA.children.length + colB.children.length, topics: colA.querySelectorAll(".sum-topic-btn").length + colB.querySelectorAll(".sum-topic-btn").length }; },
  };
}
