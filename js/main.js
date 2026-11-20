/* main.js — bootstrap, router hash, viste */

import { $, $$, el, esc, toast } from "./utils.js";
import { loadManifest, loadSearch, modules, getModule, pagesOf, moduleStats, topicsOf, topicAt } from "./data.js";
import { createOrbit, createInfoPanel } from "./orbit.js";
import { mountFlow, renderModule } from "./flow.js";
import * as viewer from "./viewer.js";
import { buildIndex, initSearch } from "./search.js";

const VIEW_HOME = "#view-home";
const VIEW_MOD = "#view-module";

let orbit = null;
let info = null;
/** slide da aprire nel visore appena il modulo è montato (ricerca → slide) */
let pendingSlide = null;

/* ---------------- titoli scheda ---------------- */
// Il titolo del browser segue sempre il manifest: la home usa "Mappa orbitale · <corso>",
// il modulo usa "<modulo> · <corso>". Un unico punto di verita' evita che il router
// sovrascriva il titolo impostato al boot con una stringa fissa.
function courseTitle() {
  return window.__manifest?.course?.title || "Dispense";
}

function homeTitle() {
  return `Mappa orbitale · ${courseTitle()}`;
}

/* ---------------- home ---------------- */
function renderHome() {
  const m = modules();
  const totals = totalsOf();

  $("#stat-row").innerHTML = [
    ["Moduli", totals.modules],
    ["Slide", totals.pages],
    ["Argomenti", totals.topics],
  ].map(([k, v]) => `<li class="stat"><b>${v}</b><span>${k}</span></li>`).join("");

  buildModuleList();
  if (!orbit) {
    info = createInfoPanel($("#orbit-info"), openModule);
    orbit = createOrbit({ stage: $("#orbit-stage"), info, onOpen: openModule });
  }
  orbit.build(m, window.__manifest);
}

function totalsOf() {
  const m = window.__manifest;
  const t = m?.totals || {};
  return {
    modules: t.modules ?? modules().length,
    pages: t.pages ?? modules().reduce((a, x) => a + pagesOf(x), 0),
    topics: t.topics ?? modules().reduce((a, x) => a + (x.topics?.length || 0), 0),
    pdfBytes: t.pdfBytes || 0,
  };
}

function buildModuleList() {
  const box = $("#module-list");
  box.innerHTML = "";
  modules().forEach((mod) => {
    const st = moduleStats(mod);
    const card = el("a", { class: "ml-card", href: `#/m/${mod.id}` }, `
      <span class="ml-n">M${String(mod.n).padStart(2, "0")}</span>
      <span class="ml-t">${esc(mod.title)}</span>
      <span class="ml-m">${st.pages ? `${st.pages} slide` : "nessuna dispense"}${st.topics ? ` · ${st.topics} argomenti` : ""}</span>`);
    box.appendChild(card);
  });
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
  if (!orbit) renderHome();
  else setTimeout(() => orbit.layout(), 30);
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
    if (course.title) {
      $("#brand-title").textContent = course.title;
    }
    document.title = homeTitle();
    if (course.subtitle) $("#brand-sub").textContent = course.subtitle;
    $("#home-title").textContent = course.title ? `Mappa orbitale · ${course.title}` : "Mappa orbitale dei moduli";
    if (course.subtitle) {
      $("#home-sub").textContent = course.subtitle;
    }
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
          // slide: si posiziona nel flusso sull'argomento che la contiene, poi apre il visore
          const t = mod.topics?.length ? topicAt(mod, sel.n) : null;
          pendingSlide = { id: mod.id, n: sel.n };
          openModule(mod, t ? t.id : null);
        } else if (sel.kind === "topic") {
          // argomento: resta nel flusso gerarchico, senza aprire il visore
          pendingSlide = null;
          openModule(mod, sel.topicId || null);
        } else {
          pendingSlide = null;
          openModule(mod, null);
        }
      },
    });
    mountFlow({
      onSlide: (mod, n) => viewer.open(mod, n),
      // l'argomento attivo resta condivisibile via URL (senza re-render)
      onTopic: (mod, topicId) => {
        history.replaceState(null, "", `#/m/${mod.id}/${topicId}`);
      },
    });
    initHelp();

    // toggle vista elenco / orbitale
    const list = $("#module-list");
    $("#btn-list").addEventListener("click", () => {
      const show = list.hidden;
      list.hidden = !show;
      $("#orbit-stage").parentElement.hidden = show;
      $("#btn-list").textContent = show ? "Vista orbitale" : "Vista elenco";
      if (!show) setTimeout(() => orbit?.layout(), 40);
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
