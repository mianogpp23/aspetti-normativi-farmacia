/* main.js — bootstrap, router hash, viste */

import { $, toast } from "./utils.js";
import { loadManifest, loadSearch, modules, getModule, pagesOf, moduleStats, topicAt } from "./data.js";
import { createSunburst } from "./sunburst.js";
import { mountFlow, renderModule } from "./flow.js";
import * as viewer from "./viewer.js";
import { buildIndex, initSearch } from "./search.js";

const VIEW_HOME = "#view-home";
const VIEW_MOD = "#view-module";

let sun = null;
/** slide da aprire nel visore appena il modulo è montato (ricerca → slide) */
let pendingSlide = null;
let listInitialized = false;

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

/* ---------------- titoli scheda ---------------- */
// Il titolo del browser segue sempre il manifest; il router non sovrascrive
// il titolo impostato al boot con una stringa fissa.
function courseTitle() {
  return window.__manifest?.course?.title || "Dispense";
}

function homeTitle() {
  return `Sunburst · ${courseTitle()}`;
}

/* ---------------- viste ---------------- */
function setListView(showList) {
  $("#module-list").hidden = !showList;
  $("#sun-layout").hidden = showList;
  $("#btn-list").textContent = showList ? "Vista mappa" : "Vista elenco";
  if (!showList) requestAnimationFrame(() => sun?.layout());
}

function totalsOf() {
  const m = window.__manifest;
  const t = m?.totals || {};
  return {
    modules: t.modules ?? modules().length,
    pages: t.pages ?? modules().reduce((a, x) => a + pagesOf(x), 0),
    topics: t.topics ?? modules().reduce((a, x) => a + (x.topics?.length || 0), 0),
  };
}

function buildModuleList() {
  const box = $("#module-list");
  const cards = modules().map((mod) => {
    const st = moduleStats(mod);
    const card = h("a", { class: "ml-card", href: `#/m/${mod.id}` });
    card.appendChild(h("span", { class: "ml-n" }, `M${String(mod.n).padStart(2, "0")}`));
    card.appendChild(h("span", { class: "ml-t" }, mod.title));
    const meta = st.pages ? `${st.pages} slide` : "nessuna dispensa";
    card.appendChild(h("span", { class: "ml-m" }, st.topics ? `${meta} · ${st.topics} argomenti` : meta));
    return card;
  });
  box.replaceChildren(...cards);
}

function renderHome() {
  const m = modules();
  const totals = totalsOf();
  const stats = [["Moduli", totals.modules], ["Slide", totals.pages], ["Argomenti", totals.topics]];
  $("#stat-row").replaceChildren(...stats.map(([label, value]) => {
    const li = h("li", { class: "stat" });
    li.appendChild(h("b", {}, String(value)));
    li.appendChild(h("span", {}, label));
    return li;
  }));
  $("#sun-legend-count").textContent = String(m.length);
  buildModuleList();

  if (!sun) {
    sun = createSunburst({
      stage: $("#sun-stage"),
      info: $("#sun-detail"),
      crumbs: $("#sun-crumbs"),
      controls: $("#sun-controls"),
      onSlide: (mod, n) => viewer.open(mod, n),
      onOpenModule: (mod) => openModule(mod),
    });
  }
  sun.build(m, window.__manifest);

  if (!listInitialized) {
    listInitialized = true;
    setListView(window.matchMedia("(max-width: 640px)").matches);
  }
}

/* ---------------- modulo ---------------- */
function openModule(mod, topicId) {
  if (!mod) return;
  const hash = topicId ? `#/m/${mod.id}/${topicId}` : `#/m/${mod.id}`;
  if (location.hash === hash) route();
  else location.hash = hash;
}

function renderModuleView(mod, topicId) {
  showView(VIEW_MOD);
  renderModule(mod, topicId);
  document.title = `${mod.title} · ${courseTitle()}`;
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  if (pendingSlide) {
    const p = pendingSlide;
    pendingSlide = null;
    if (p.id === mod.id) requestAnimationFrame(() => viewer.open(mod, p.n));
  }
}

/* ---------------- router ---------------- */
function showView(id) {
  $(VIEW_HOME).hidden = id !== VIEW_HOME;
  $(VIEW_MOD).hidden = id !== VIEW_MOD;
}

function parse() {
  const raw = location.hash.replace(/^#\/?/, "");
  if (!raw) return { view: "home" };
  const parts = raw.split("/");
  if (parts[0] === "m" && parts[1]) return { view: "module", id: decodeURIComponent(parts[1]), topicId: parts[2] || null };
  return { view: "home" };
}

function route() {
  const r = parse();
  if (r.view === "module") {
    const mod = getModule(r.id);
    if (mod) { renderModuleView(mod, r.topicId); return; }
    toast("Modulo non trovato");
  }
  pendingSlide = null;
  showView(VIEW_HOME);
  document.title = homeTitle();
  if (sun) setTimeout(() => sun.layout(), 30);
  else renderHome();
}

/* ---------------- help ---------------- */
function initHelp() {
  const modal = $("#help-modal");
  const open = () => { modal.hidden = false; $("#help-close").focus({ preventScroll: true }); };
  const close = () => { modal.hidden = true; };
  $("#btn-help").addEventListener("click", open);
  $("#help-close").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
    const tag = (e.target?.tagName || "").toLowerCase();
    if (e.key === "?" && tag !== "input" && tag !== "textarea") open();
  });
}

/* ---------------- boot ---------------- */
async function boot() {
  try {
    const manifest = await loadManifest();
    window.__manifest = manifest;
    await loadSearch();

    const course = manifest.course || {};
    if (course.title) $("#brand-title").textContent = course.title;
    document.title = homeTitle();
    if (course.subtitle) $("#brand-sub").textContent = course.subtitle;
    $("#home-title").textContent = course.title ? `Sunburst · ${course.title}` : "Sunburst dei moduli";
    if (course.subtitle) $("#home-sub").textContent = course.subtitle;

    const input = $("#search-input");
    input.placeholder = `Cerca in ${manifest.totals?.pages ?? 0} slide, argomenti, moduli…`;

    const t = totalsOf();
    $("#foot-meta").textContent = `${t.modules} moduli · ${t.pages} slide · ${t.topics} argomenti`;
    $("#help-foot").textContent = `${manifest.sourceName || "Archivio didattico"} — ${t.pages} pagine convertite, contenuti originali intatti.`;

    buildIndex();
    initSearch({
      onSelect: (mod, sel) => {
        if (!mod || !sel) return;
        if (sel.kind === "slide") {
          const topic = mod.topics?.length ? topicAt(mod, sel.n) : null;
          pendingSlide = { id: mod.id, n: sel.n };
          openModule(mod, topic ? topic.id : null);
        } else if (sel.kind === "topic") {
          pendingSlide = null;
          openModule(mod, sel.topicId || null);
        } else {
          pendingSlide = null;
          openModule(mod, null);
        }
      },
      onQuery: (value) => sun?.setQuery(value || ""),
    });
    mountFlow({
      onSlide: (mod, n) => viewer.open(mod, n),
      onTopic: (mod, topicId) => {
        history.replaceState(null, "", `#/m/${mod.id}/${topicId}`);
      },
    });
    initHelp();

    $("#btn-list").addEventListener("click", () => {
      setListView($("#module-list").hidden);
    });

    window.addEventListener("hashchange", route);
    renderHome();
    route();

    if (!modules().length) toast("Nessun modulo trovato nel manifest");
  } catch (err) {
    console.error(err);
    $("#home-sub").textContent = "Impossibile caricare content/manifest.json: esegui prima lo script di scansione (python3 scripts/scan.py).";
    toast("Manifest non disponibile");
  }
}

boot();
