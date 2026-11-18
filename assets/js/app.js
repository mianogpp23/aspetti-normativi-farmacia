import {
  CATEGORY_COLORS,
  CATEGORY_DEFINITIONS,
  buildGraph,
  filterGraph,
} from "./map-model.js";

const $ = (selector) => document.querySelector(selector);

const state = {
  slides: [],
  byNumber: new Map(),
  graph: null,
  filtered: null,
  category: "",
  query: "",
  currentNumber: null,
  lastTrigger: null,
  chart: null,
  zoom: 1,
};

const dom = {
  globe: $("#globe"),
  filters: $("#category-filters"),
  legend: $("#legend"),
  list: $("#slide-list"),
  listCount: $("#list-count"),
  search: $("#slide-search"),
  status: $("#result-status"),
  viewer: $("#slide-viewer"),
  viewerImage: $("#viewer-image"),
  viewerTitle: $("#viewer-title"),
  viewerCategory: $("#viewer-category"),
  viewerCounter: $("#viewer-counter"),
  viewerClose: $("#viewer-close"),
  viewerPrev: $("#viewer-prev"),
  viewerNext: $("#viewer-next"),
};

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

function setStatus(message, tone = "info") {
  dom.status.textContent = message;
  dom.status.dataset.tone = tone;
}

function categoryLabel(category) {
  return CATEGORY_DEFINITIONS[category] ?? category;
}

function renderFilters() {
  const entries = [["", "Tutte"], ...Object.entries(CATEGORY_DEFINITIONS)];
  dom.filters.replaceChildren();
  for (const [category, label] of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-button";
    button.dataset.category = category;
    button.textContent = label;
    button.setAttribute("aria-pressed", String(state.category === category));
    button.addEventListener("click", () => {
      state.category = category;
      state.zoom = 1;
      applyFilters();
    });
    dom.filters.append(button);
  }
}

function renderLegend() {
  dom.legend.replaceChildren();
  for (const [category, label] of Object.entries(CATEGORY_DEFINITIONS)) {
    const item = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.setProperty("--dot-color", CATEGORY_COLORS[category]);
    dot.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = label;
    item.append(dot, text);
    dom.legend.append(item);
  }
}

function slideButton(slide) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "slide-item";
  button.dataset.slideNumber = String(slide.number);
  button.setAttribute("aria-label", `Apri la slide ${slide.number}: ${slide.title}`);

  const index = document.createElement("span");
  index.className = "slide-item-index";
  index.textContent = String(slide.number).padStart(2, "0");

  const title = document.createElement("span");
  title.className = "slide-item-title";
  title.textContent = slide.title;

  button.append(index, title);
  return button;
}

function renderList(slides) {
  dom.list.replaceChildren();
  if (slides.length === 0) {
    const empty = document.createElement("p");
    empty.className = "result-status";
    empty.textContent = "Nessuna slide corrisponde ai filtri attivi.";
    dom.list.append(empty);
    dom.listCount.textContent = "0";
    return;
  }

  const grouped = new Map(
    Object.keys(CATEGORY_DEFINITIONS).map((category) => [category, []]),
  );
  for (const slide of slides) {
    grouped.get(slide.category)?.push(slide);
  }

  for (const [category, categorySlides] of grouped) {
    if (categorySlides.length === 0) {
      continue;
    }
    const group = document.createElement("section");
    group.className = "slide-group";
    const heading = document.createElement("h4");
    heading.textContent = categoryLabel(category);
    const list = document.createElement("ul");
    list.style.listStyle = "none";
    list.style.margin = "0";
    list.style.padding = "0";
    for (const slide of categorySlides) {
      const item = document.createElement("li");
      item.append(slideButton(slide));
      list.append(item);
    }
    group.append(heading, list);
    dom.list.append(group);
  }
  dom.listCount.textContent = String(slides.length);
}

function nodeSymbolSize(node) {
  if (node.kind === "center") {
    return 92;
  }
  if (node.kind === "hub") {
    return Math.min(62, 30 + node.value * 1.15);
  }
  return 11;
}

function nodeColor(node) {
  if (node.kind === "center") {
    return "#22d3ee";
  }
  if (node.kind === "hub") {
    return CATEGORY_COLORS[node.category] ?? "#7dd3fc";
  }
  return CATEGORY_COLORS[node.category] ?? "#94a3b8";
}

function toChartNode(node) {
  const isHub = node.kind === "hub";
  const isCenter = node.kind === "center";
  return {
    id: node.id,
    name: node.name,
    value: node.value,
    x: node.x,
    y: node.y,
    category: node.category,
    kind: node.kind,
    number: node.number,
    image: node.image,
    symbolSize: nodeSymbolSize(node),
    itemStyle: {
      color: nodeColor(node),
      borderColor: (isCenter && "#a5f3fc") || (isHub && "#e0f2fe") || "#04101c",
      borderWidth: isCenter || isHub ? 2 : 1,
      shadowBlur: (isCenter && 28) || (isHub && 14) || 0,
      shadowColor: isCenter ? "rgba(34,211,238,0.65)" : "rgba(0,0,0,0.35)",
    },
    label: {
      show: isHub || isCenter,
      position: isCenter ? "inside" : "right",
      formatter: isCenter ? "GESTIONE\nDEI MEDICINALI" : node.name,
      color: isCenter ? "#04101c" : "#c3dae6",
      fontSize: isCenter ? 12 : 11,
      fontWeight: isCenter ? 800 : 600,
      lineHeight: 14,
      align: isCenter ? "center" : "left",
      verticalAlign: "middle",
      backgroundColor: isCenter ? "transparent" : "rgba(4,16,28,0.72)",
      padding: isCenter ? 0 : [3, 5],
      borderRadius: 4,
    },
    emphasis: {
      label: {
        show: true,
        formatter: `${node.number}. ${node.name}`,
        color: "#e9f6fb",
        fontSize: 11,
        backgroundColor: "rgba(4,16,28,0.92)",
        padding: [4, 6],
        borderRadius: 4,
      },
    },
  };
}

function toChartLink(link, nodeById) {
  const source = nodeById.get(link.source);
  let color = "#8fabb9";
  if (link.kind === "branch") {
    color = "#7dd3fc";
  } else if (link.kind === "member") {
    color = CATEGORY_COLORS[source?.category] ?? "#7dd3fc";
  }
  return {
    source: link.source,
    target: link.target,
    kind: link.kind,
    lineStyle: {
      color,
      width: link.kind === "branch" ? 1.6 : 1,
      opacity: link.kind === "sequence" ? 0.16 : 0.34,
      type: link.kind === "sequence" ? "dashed" : "solid",
      curveness: 0.08,
    },
  };
}

function graphOption(graph) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const ordered = [...graph.nodes].sort((left, right) => {
    const rank = { slide: 0, hub: 1, center: 2 };
    return rank[left.kind] - rank[right.kind];
  });
  return {
    animation: !prefersReducedMotion,
    animationDuration: prefersReducedMotion ? 0 : 420,
    aria: { enabled: true },
    tooltip: {
      trigger: "item",
      renderMode: "richText",
      backgroundColor: "rgba(4,16,28,0.94)",
      borderColor: "#24536b",
      textStyle: { color: "#e9f6fb", fontSize: 12 },
      formatter: (params) => {
        if (params.dataType === "edge") {
          return "";
        }
        const node = params.data;
        return node.kind === "slide" ? `${node.number}. ${node.name}` : node.name;
      },
    },
    series: [
      {
        id: "slide-graph",
        type: "graph",
        layout: "none",
        roam: true,
        zoom: state.zoom,
        center: [0, 0],
        scaleLimit: { min: 0.6, max: 3.2 },
        data: ordered.map(toChartNode),
        links: graph.links.map((link) => toChartLink(link, nodeById)),
        lineStyle: { curveness: 0.08 },
        emphasis: {
          focus: "adjacency",
          scale: 1.25,
          lineStyle: { opacity: 0.85, width: 2 },
        },
        blur: {
          itemStyle: { opacity: 0.22 },
          lineStyle: { opacity: 0.06 },
        },
        label: { show: false },
        animationDurationUpdate: prefersReducedMotion ? 0 : 320,
      },
    ],
  };
}



function initChart() {
  if (!window.echarts) {
    setStatus("Grafo non disponibile: usa l’elenco accessibile delle slide.", "error");
    return;
  }
  state.chart = window.echarts.init(dom.globe, null, { renderer: "canvas" });
  state.chart.setOption(graphOption(state.graph));
  state.chart.on("click", (params) => {
    if (params.dataType === "node") {
      handleNodeClick(params.data);
    }
  });

  const observer = new ResizeObserver(() => {
    state.chart?.resize();
  });
  observer.observe(dom.globe);
}

function handleNodeClick(node) {
  if (node.kind === "slide") {
    openSlide(node.number);
    return;
  }
  if (node.kind === "hub") {
    state.category = state.category === node.category ? "" : node.category;
    state.zoom = 1;
    renderFilters();
    applyFilters();
    return;
  }
  state.category = "";
  state.query = "";
  dom.search.value = "";
  state.zoom = 1;
  renderFilters();
  applyFilters();
}

function applyFilters() {
  const filtered = filterGraph(state.graph, state.query, state.category);
  state.filtered = filtered;
  const visibleIds = new Set(
    filtered.nodes.filter((node) => node.kind === "slide").map((node) => node.id),
  );
  const visibleSlides = state.slides.filter((slide) => visibleIds.has(`slide-${slide.number}`));
  renderList(visibleSlides);

  if (state.chart) {
    state.chart.setOption(graphOption(filtered));
    state.chart.setOption({ series: [{ zoom: state.zoom, center: [0, 0] }] });
  }

  for (const button of dom.filters.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.category === state.category));
  }

  if (visibleSlides.length === state.slides.length) {
    setStatus("84 slide visualizzate · seleziona un nodo o apri l’elenco");
  } else {
    setStatus(`${visibleSlides.length} slide su 84 · filtri attivi`);
  }
}

function openSlide(number, trigger = null) {
  const slide = state.byNumber.get(Number(number));
  if (!slide) {
    return;
  }
  state.currentNumber = slide.number;
  if (trigger) {
    state.lastTrigger = trigger;
  }
  dom.viewerImage.src = slide.image;
  dom.viewerImage.alt = `Slide ${slide.number}: ${slide.title}`;
  dom.viewerTitle.textContent = slide.title;
  dom.viewerCategory.textContent = categoryLabel(slide.category);
  dom.viewerCounter.textContent = `Slide ${slide.number} di ${state.slides.length}`;
  if (!dom.viewer.open) {
    dom.viewer.showModal();
  }
  dom.viewerClose.focus();
}

function stepSlide(delta) {
  if (state.currentNumber === null) {
    return;
  }
  const total = state.slides.length;
  const next = ((state.currentNumber - 1 + delta + total) % total) + 1;
  openSlide(next);
}

function closeViewer() {
  if (dom.viewer.open) {
    dom.viewer.close();
  }
}

function bindInteractions() {
  dom.search.addEventListener("input", () => {
    state.query = dom.search.value;
    applyFilters();
  });

  dom.search.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dom.search.value) {
      dom.search.value = "";
      state.query = "";
      applyFilters();
    }
  });

  dom.list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-slide-number]");
    if (button) {
      openSlide(Number(button.dataset.slideNumber), button);
    }
  });

  for (const button of document.querySelectorAll("[data-zoom]")) {
    button.addEventListener("click", () => {
      const action = button.dataset.zoom;
      if (action === "in") {
        state.zoom = Math.min(2.4, state.zoom + 0.2);
      } else if (action === "out") {
        state.zoom = Math.max(0.7, state.zoom - 0.2);
      } else {
        state.zoom = 1;
      }
      if (state.chart) {
        state.chart.setOption({ series: [{ zoom: state.zoom, center: [0, 0] }] });
      }
    });
  }

  dom.viewerClose.addEventListener("click", closeViewer);
  dom.viewerPrev.addEventListener("click", () => stepSlide(-1));
  dom.viewerNext.addEventListener("click", () => stepSlide(1));
  dom.viewer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepSlide(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      stepSlide(1);
    }
  });
  dom.viewer.addEventListener("click", (event) => {
    if (event.target === dom.viewer) {
      closeViewer();
    }
  });
  dom.viewer.addEventListener("close", () => {
    state.lastTrigger?.focus?.();
  });
}

async function init() {
  try {
    const response = await fetch("assets/data/slides.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const slides = await response.json();
    if (!Array.isArray(slides) || slides.length === 0) {
      throw new Error("catalogo vuoto o non valido");
    }

    state.slides = slides;
    state.byNumber = new Map(slides.map((slide) => [slide.number, slide]));
    state.graph = buildGraph(slides, CATEGORY_DEFINITIONS);

    renderFilters();
    renderLegend();
    bindInteractions();
    initChart();
    applyFilters();

    document.documentElement.dataset.appReady = "true";
    window.__MAP_APP__ = {
      openSlide: (number) => openSlide(number),
      closeViewer,
      applyFilters,
      getState: () => ({
        slides: state.slides.length,
        nodes: state.graph.nodes.length,
        links: state.graph.links.length,
        category: state.category,
        query: state.query,
        currentNumber: state.currentNumber,
      }),
    };
  } catch (error) {
    setStatus(`Impossibile caricare il catalogo delle slide: ${error.message}`, "error");
    document.documentElement.dataset.appReady = "error";
  }
}

window.__MAP_APP_READY__ = init();
