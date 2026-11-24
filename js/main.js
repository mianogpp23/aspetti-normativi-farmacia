/* main.js — bootstrap, router hash, viste */

import { $, toast } from "./utils.js";
import { loadManifest, loadSearch, modules, getModule, pagesOf, topicAt } from "./data.js";
import { createLibrary } from "./library.js";
import { createDashboard } from "./dashboard.js";
import { mountFlow, renderModule } from "./flow.js";
import * as viewer from "./viewer.js";
import { buildIndex, initSearch } from "./search.js";
import { createCarousel } from "./carousel.js";
import { createSummary } from "./summary.js";
import { createHoneycomb } from "./honeycomb.js";
import { createPalette } from "./palette.js";

const VIEW_HOME = "#view-home";
const VIEW_MOD = "#view-module";
const VIEWS = {
  carosello: "#view-carosello",
  sommario: "#view-sommario",
  esagoni: "#view-esagoni",
  cerca: "#view-cerca",
  libreria: VIEW_HOME,
  dashboard: VIEW_HOME,
};
const VIEW_LABELS = {
  carosello: "Carosello",
  sommario: "Sommario",
  esagoni: "Esagoni",
  cerca: "Cerca",
  libreria: "Libreria",
  dashboard: "Dashboard",
};
const DEFAULT_VIEW = "carosello";

let library = null;
let dashboard = null;
let carousel = null;
let summary = null;
let honeycomb = null;
let palette = null;
let activeView = DEFAULT_VIEW;
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
const GLOBAL_VIEW_KEY = "farmacista:v1:global-view";
const NEW_VIEWS = ["carosello", "sommario", "esagoni", "cerca"];

function loadGlobalView() {
  try {
    const saved = localStorage.getItem(GLOBAL_VIEW_KEY);
    if (Object.hasOwn(VIEWS, saved)) return saved;
    const legacy = localStorage.getItem(VIEW_KEY);
    if (legacy === "map") return "libreria";
    if (legacy === "list") return "dashboard";
  } catch { /* localStorage non disponibile: usa il predefinito. */ }
  return DEFAULT_VIEW;
}

function saveGlobalView(view) {
  try { localStorage.setItem(GLOBAL_VIEW_KEY, view); } catch { /* stato solo in sessione. */ }
}

function loadViewMode() {
  const view = loadGlobalView();
  if (view === "dashboard") return "list";
  if (view === "libreria") return "map";
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

function openFromView(mod, n, source) {
  if (!mod) return;
  if (!pagesOf(mod)) return openModule(mod, null);
  pendingSlide = { id: mod.id, n, source };
  openModule(mod, null);
}

function initViews() {
  if (!carousel) {
    carousel = createCarousel({
      mount: $("#car-mount"),
      onOpenModule: (mod) => openFromView(mod, 1, "carosello"),
    });
  }
  if (!summary) {
    summary = createSummary({
      mount: $("#sum-mount"),
      onOpenModule: (mod) => openFromView(mod, 1, "sommario"),
      onOpenTopic: (mod, topic) => openModule(mod, topic.id),
    });
  }
  if (!honeycomb) {
    honeycomb = createHoneycomb({
      mount: $("#hex-mount"),
      onOpenModule: (mod) => openFromView(mod, 1, "esagoni"),
      onOpenTopic: (mod, topic) => openModule(mod, topic.id),
    });
  }
  if (!palette) {
    palette = createPalette({
      mount: $("#pal-mount"),
      onOpenModule: (mod) => openFromView(mod, 1, "palette"),
      onOpenTopic: (mod, topic) => openModule(mod, topic.id),
      onOpenSlide: (mod, n) => {
        const topic = topicAt(mod, n);
        pendingSlide = { id: mod.id, n, source: "palette" };
        openModule(mod, topic ? topic.id : null);
      },
      onEscape: () => goToView(DEFAULT_VIEW, { focus: false }),
    });
  }
  carousel.render();
  summary.render();
  honeycomb.render();
  palette.render();
}

/* ---------------- modulo ---------------- */
function openModule(mod, topicId) {
  if (!mod) return;
  const hash = topicId ? `#/m/${mod.id}/${topicId}` : `#/m/${mod.id}`;
  if (location.hash === hash) route();
  else location.hash = hash;
}

function renderModuleView(mod, topicId) {
  showModuleView();
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
function hideAllViews() {
  const selectors = new Set([VIEW_MOD, ...Object.values(VIEWS)]);
  for (const selector of selectors) {
    const node = $(selector);
    if (node) node.hidden = true;
  }
}

function showModuleView() {
  hideAllViews();
  $(VIEW_MOD).hidden = false;
}

function showHomeView(view) {
  hideAllViews();
  $(VIEWS[view] || VIEWS[DEFAULT_VIEW]).hidden = false;
}

function renderCurrentView(view, { focus = false } = {}) {
  showHomeView(view);
  activeView = view;
  saveGlobalView(view);
  const select = $("#view-select");
  if (select) select.value = view;
  if (view === "libreria") {
    setViewMode("map");
    requestAnimationFrame(() => library?.layout());
    document.title = homeTitle();
    return;
  }
  if (view === "dashboard") {
    setViewMode("list");
    dashboard?.render();
    document.title = homeTitle();
    return;
  }
  if (!NEW_VIEWS.includes(view)) return;
  if (view === "carosello") carousel?.render();
  if (view === "sommario") summary?.render();
  if (view === "esagoni") honeycomb?.render();
  if (view === "cerca") palette?.render();
  document.title = `${VIEW_LABELS[view]} · ${courseTitle()}`;
  if (!focus) return;
  if (view === "carosello") carousel?.focus();
  if (view === "sommario") summary?.focus();
  if (view === "esagoni") honeycomb?.focus();
  if (view === "cerca") palette?.focus();
}

function goToView(view, { focus = false } = {}) {
  const canonical = Object.hasOwn(VIEWS, view) ? view : DEFAULT_VIEW;
  const hash = `#/?vista=${canonical}`;
  if (location.hash !== hash) {
    location.hash = hash;
    renderCurrentView(canonical, { focus });
    return;
  }
  renderCurrentView(canonical, { focus });
}

function parse() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/");
  if (parts[0] === "m" && parts[1]) return { kind: "module", id: decodeURIComponent(parts[1]), topicId: parts[2] || null };
  const requested = new URLSearchParams(query).get("vista");
  return { kind: "home", view: Object.hasOwn(VIEWS, requested) ? requested : null };
}

function route() {
  const r = parse();
  if (r.kind === "module") {
    const mod = getModule(r.id);
    if (mod) { renderModuleView(mod, r.topicId); return; }
    toast("Modulo non trovato");
  }
  pendingSlide = null;
  const view = r.view || loadGlobalView();
  const hash = `#/?vista=${view}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
  renderCurrentView(view);
}

/* ---------------- scorciatoie globali ---------------- */
function initShortcuts() {
  $("#view-select")?.addEventListener("change", (event) => {
    goToView(event.target.value, { focus: true });
  });
  document.addEventListener("keydown", (event) => {
    const tag = (event.target?.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || event.target?.isContentEditable;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      goToView("cerca", { focus: true });
      return;
    }
    if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      goToView("cerca", { focus: true });
      return;
    }
    if (event.key === "Escape" && activeView === "cerca" && document.activeElement === document.body) {
      goToView(DEFAULT_VIEW, { focus: false });
    }
  });
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
        palette?.setQuery(value || "");
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
    initViews();
    initShortcuts();

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
