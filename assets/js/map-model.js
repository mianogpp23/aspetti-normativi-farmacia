export const CATEGORY_DEFINITIONS = Object.freeze({
  introduzione: "Introduzione",
  fondamenti: "Fondamenti e classificazione",
  prescrizione: "Prescrizione medica",
  "tipi-di-ricetta": "Tipi di ricetta",
  "ricetta-rossa": "Ricetta rossa SSN",
  dematerializzazione: "Dematerializzazione",
  stupefacenti: "Stupefacenti e dolore",
  registri: "Registri e adempimenti",
  adempimenti: "Responsabilità e sintesi",
});

export const CATEGORY_COLORS = Object.freeze({
  introduzione: "#f8fafc",
  fondamenti: "#38bdf8",
  prescrizione: "#a78bfa",
  "tipi-di-ricetta": "#fbbf24",
  "ricetta-rossa": "#fb7185",
  dematerializzazione: "#2dd4bf",
  stupefacenti: "#fb923c",
  registri: "#60a5fa",
  adempimenti: "#a3e635",
});

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it")
    .trim();
}

function categoryGroups(slides, categoryOrder) {
  const groups = new Map(categoryOrder.map((category) => [category, []]));
  for (const slide of [...slides].sort((left, right) => left.number - right.number)) {
    if (!groups.has(slide.category)) {
      throw new Error(`Categoria sconosciuta: ${slide.category}`);
    }
    groups.get(slide.category).push(slide);
  }
  return groups;
}

function slidePosition(hub, index, total) {
  const spread = Math.min(1.35, Math.max(0.38, total * 0.055));
  const angle = hub.angle + (index - (total - 1) / 2) * spread;
  const ring = Math.floor(index / 8);
  const localRadius = 118 + ring * 48;
  return {
    x: Math.round(hub.x + Math.cos(angle) * localRadius * 1.28),
    y: Math.round(hub.y + Math.sin(angle) * localRadius),
  };
}

export function buildGraph(slides, categories = CATEGORY_DEFINITIONS) {
  if (!Array.isArray(slides)) {
    throw new TypeError("slides must be an array");
  }
  const categoryOrder = Object.keys(categories);
  const groups = categoryGroups(slides, categoryOrder);
  const nodes = [
    {
      id: "center",
      name: "Gestione dei medicinali",
      kind: "center",
      category: null,
      number: null,
      value: slides.length,
      x: 0,
      y: 0,
    },
  ];
  const links = [];
  const hubs = new Map();

  categoryOrder.forEach((category, categoryIndex) => {
    const angle = -Math.PI / 2 + (categoryIndex * Math.PI * 2) / categoryOrder.length;
    const hub = {
      id: `hub-${category}`,
      name: categories[category],
      kind: "hub",
      category,
      number: null,
      value: groups.get(category).length,
      x: Math.round(Math.cos(angle) * 260),
      y: Math.round(Math.sin(angle) * 180),
      angle,
    };
    hubs.set(category, hub);
    nodes.push(hub);
    links.push({ source: "center", target: hub.id, kind: "branch" });
  });

  const orderedSlides = [...slides].sort((left, right) => left.number - right.number);
  for (const [category, categorySlides] of groups) {
    const hub = hubs.get(category);
    categorySlides.forEach((slide, index) => {
      const position = slidePosition(hub, index, categorySlides.length);
      nodes.push({
        id: `slide-${slide.number}`,
        name: slide.title,
        kind: "slide",
        category,
        number: slide.number,
        image: slide.image,
        sourcePage: slide.sourcePage,
        value: 1,
        ...position,
      });
      links.push({ source: hub.id, target: `slide-${slide.number}`, kind: "member" });
    });
  }

  orderedSlides.slice(0, -1).forEach((slide, index) => {
    links.push({
      source: `slide-${slide.number}`,
      target: `slide-${orderedSlides[index + 1].number}`,
      kind: "sequence",
    });
  });

  return { nodes, links };
}

export function filterGraph(graph, query = "", category = "") {
  const normalizedQuery = normalizeText(query);
  const selectedSlides = graph.nodes.filter((node) => {
    if (node.kind !== "slide") {
      return false;
    }
    if (category && node.category !== category) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const numberMatches = String(node.number) === normalizedQuery;
    const titleMatches = normalizeText(node.name).includes(normalizedQuery);
    return numberMatches || titleMatches;
  });

  if (selectedSlides.length === 0) {
    return { nodes: [], links: [] };
  }

  const selectedIds = new Set(selectedSlides.map((node) => node.id));
  const selectedCategories = new Set(selectedSlides.map((node) => node.category));
  const keptNodes = graph.nodes
    .filter(
      (node) =>
        selectedIds.has(node.id) ||
        (node.kind === "hub" && selectedCategories.has(node.category)) ||
        (node.kind === "center" && selectedIds.size > 0),
    )
    .map((node) => ({ ...node }));
  const keptIds = new Set(keptNodes.map((node) => node.id));
  const keptLinks = graph.links
    .filter((link) => keptIds.has(link.source) && keptIds.has(link.target))
    .map((link) => ({ ...link }));

  return { nodes: keptNodes, links: keptLinks };
}

export function neighborIds(graph, id) {
  const neighbors = new Set();
  for (const link of graph.links) {
    if (link.source === id) {
      neighbors.add(link.target);
    }
    if (link.target === id) {
      neighbors.add(link.source);
    }
  }
  neighbors.delete(id);
  return neighbors;
}
