/* main.js — bootstrap, router hash, viste */

import { $, toast } from "./utils.js";
import { loadManifest, loadSearch, modules, getModule, pagesOf, topicAt } from "./data.js";
import { createLibrary } from "./library.js";
import { createDashboard } from "./dashboard.js";
import { mountFlow, renderModule } from "./flow.js";
import * as viewer from "./viewer.js";
import { buildIndex, initSearch } from "./search.js";

const VIEW_HOME = "#view-home";
const VIEW_MOD = "#view-module";

let library = null;
let dashboard = null;
/** slide da aprire nel visore appena il modulo è montato (ricerca/dashboard → slide) */
let pendingSlide = null;
let viewMode = "map";
let trackedModuleId = null;
let lastTrackedSlide = null;

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
  return `${viewMode === "list" ? "Dashboard" : "Libreria"} · ${courseTitle()}`;
}

/* ---------------- viste ---------------- */
const VIEW_KEY = "farmacista:v1:view";

function loadViewMode() {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "map" || saved === "list") return saved;
  } catch { /* localStorage non disponibile: usa il predefinito. */ }
  return window.matchMedia("(max-width: 640px)").matches ? "list" : "map";
}

function saveViewMode(mode) {
  try { localStorage.setItem(VIEW_KEY, mode); } catch { /* stato solo in sessione. */ }
}

function setViewMode(mode) {
  viewMode = mode === "list" ? "list" : "map";
  saveViewMode(viewMode);
  const list = viewMode === "list";
  $("#module-list").hidden = !list;
  $("#lib-layout").hidden = list;
  $("#btn-map").setAttribute("aria-pressed", String(!list));
  $("#btn-list").setAttribute("aria-pressed", String(list));
  $("#home-title").textContent = list ? `Dashboard · ${courseTitle()}` : `Libreria · ${courseTitle()}`;
  $("#home-sub").textContent = list
    ? "Statistiche, ripresa dello studio e pagine per modulo in un’unica vista."
    : "Ogni modulo è un volume: scegli un libro dallo scaffale, consulta la scheda e apri il percorso di argomenti e slide.";
  if (list) dashboard?.render();
  else requestAnimationFrame(() => library?.layout());
  if (!$(VIEW_HOME).hidden) document.title = homeTitle();
}

function initDashboard() {
  if (dashboard) return;
  dashboard = createDashboard({
    mount: $("#module-list"),
    stats: $("#dash-stats"),
    greeting: $("#dash-greeting"),
    subtitle: $("#dash-subtitle"),
    overallPct: $("#dash-overall-pct"),
    overallBar: $("#dash-overall-bar"),
    resume: $("#dash-resume"),
    next: $("#dash-next"),
    filter: $("#dash-filter"),
    sort: $("#dash-sort-select"),
    count: $("#dash-count"),
    live: $("#dash-live"),
    reset: $("#dash-reset"),
    confirm: $("#dash-confirm"),
    confirmYes: $("#dash-confirm-yes"),
    confirmNo: $("#dash-confirm-no"),
    onSlide: (mod, n) => {
      const topic = topicAt(mod, n);
      pendingSlide = { id: mod.id, n, source: "dashboard" };
      openModule(mod, topic ? topic.id : null);
    },
    onOpenModule: (mod, topicId) => openModule(mod, topicId),
  });
}

function syncProgressFromViewer() {
  if (!dashboard || !trackedModuleId || !viewer.isOpen()) return;
  const mod = getModule(trackedModuleId);
  if (!mod) return;
  const current = Number(viewer.current()?.n);
  if (!Number.isInteger(current) || current < 1 || current === lastTrackedSlide) return;
  lastTrackedSlide = current;
  dashboard.recordSlide(mod, current);
}

function initViewerTracking() {
  $("#vw-stage")?.addEventListener("click", syncProgressFromViewer);
  // Il visore registra il proprio pointerup al primo open(): differire al frame successivo
  // evita di leggere la pagina vecchia prima dello swipe di viewer.js.
  $("#vw-stage")?.addEventListener("pointerup", () => requestAnimationFrame(syncProgressFromViewer));
  $("#vw-range")?.addEventListener("input", syncProgressFromViewer);
  $("#vw-range")?.addEventListener("change", syncProgressFromViewer);
  document.addEventListener("keydown", (e) => {
    if (["ArrowRight", "ArrowLeft", "PageDown", "PageUp", "Home", "End", " "].includes(e.key)) {
      requestAnimationFrame(syncProgressFromViewer);
    }
  });
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

function renderHome() {
  const totals = totalsOf();
  const stats = [["Moduli", totals.modules], ["Slide", totals.pages], ["Argomenti", totals.topics]];
  $("#stat-row").replaceChildren(...stats.map(([label, value]) => {
    const li = h("li", { class: "stat" });
    li.appendChild(h("b", {}, String(value)));
    li.appendChild(h("span", {}, label));
    return li;
  }));

  initDashboard();
  if (!library) {
    library = createLibrary({
      stage: $("#lib-stage"),
      shelves: $("#lib-shelves"),
      info: $("#lib-info"),
      crumbs: $("#lib-crumbs"),
      controls: $("#lib-controls"),
      legend: $("#lib-legend"),
      live: $("#lib-live"),
      onSlide: (mod, n) => {
        trackedModuleId = mod.id;
        lastTrackedSlide = n;
        viewer.open(mod, n);
        dashboard?.recordSlide(mod, n);
      },
      onOpenModule: (mod, topicId) => openModule(mod, topicId),
    });
  }
  library.render(window.__manifest);
  const state = library.state();
  $("#lib-count").textContent = `${state.modules} volumi · ${state.shelves} scaffali`;
  setViewMode(viewMode);
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
  trackedModuleId = mod.id;
  lastTrackedSlide = null;
  if (pendingSlide) {
    const p = pendingSlide;
    pendingSlide = null;
    if (p.id === mod.id) {
      requestAnimationFrame(() => {
        viewer.open(mod, p.n);
        lastTrackedSlide = p.n;
        if (p.source !== "dashboard") dashboard?.recordSlide(mod, p.n);
      });
    }
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
  if (library) setTimeout(() => library.layout(), 30);
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
    viewMode = loadViewMode();
    if (course.title) $("#brand-title").textContent = course.title;
    document.title = homeTitle();
    if (course.subtitle) $("#brand-sub").textContent = course.subtitle;

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
          pendingSlide = { id: mod.id, n: sel.n, source: "search" };
          openModule(mod, topic ? topic.id : null);
        } else if (sel.kind === "topic") {
          pendingSlide = null;
          openModule(mod, sel.topicId || null);
        } else {
          pendingSlide = null;
          openModule(mod, null);
        }
      },
      onQuery: (value) => {
        library?.setQuery(value || "");
        dashboard?.setQuery(value || "");
      },
    });
    mountFlow({
      onSlide: (mod, n) => {
        trackedModuleId = mod.id;
        lastTrackedSlide = n;
        viewer.open(mod, n);
        dashboard?.recordSlide(mod, n);
      },
      onTopic: (mod, topicId) => {
        history.replaceState(null, "", `#/m/${mod.id}/${topicId}`);
      },
    });
    initHelp();
    initViewerTracking();

    $("#btn-map").addEventListener("click", () => setViewMode("map"));
    $("#btn-list").addEventListener("click", () => setViewMode("list"));

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
