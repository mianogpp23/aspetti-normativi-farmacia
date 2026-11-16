import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SLIDES = JSON.parse(
  readFileSync(new URL("../assets/data/slides.json", import.meta.url), "utf8"),
);

const CATEGORIES = {
  introduzione: "Introduzione",
  fondamenti: "Fondamenti e classificazione",
  prescrizione: "Prescrizione medica",
  "tipi-di-ricetta": "Tipi di ricetta",
  "ricetta-rossa": "Ricetta rossa SSN",
  dematerializzazione: "Dematerializzazione",
  stupefacenti: "Stupefacenti e dolore",
  registri: "Registri e adempimenti",
  adempimenti: "Responsabilità e sintesi",
};

async function loadModel() {
  try {
    return await import("../assets/js/map-model.js");
  } catch (error) {
    assert.fail(`assets/js/map-model.js must exist and export the graph API: ${error.message}`);
  }
}

test("buildGraph creates one center, nine hubs, and 84 slide nodes", async () => {
  const { buildGraph } = await loadModel();
  const graph = buildGraph(SLIDES, CATEGORIES);

  assert.equal(graph.nodes.length, 94);
  assert.equal(graph.nodes.filter((node) => node.kind === "center").length, 1);
  assert.equal(graph.nodes.filter((node) => node.kind === "hub").length, 9);
  assert.equal(graph.nodes.filter((node) => node.kind === "slide").length, 84);
});

test("buildGraph creates branch, membership, and sequence links without dangling endpoints", async () => {
  const { buildGraph } = await loadModel();
  const graph = buildGraph(SLIDES, CATEGORIES);
  const ids = new Set(graph.nodes.map((node) => node.id));

  assert.equal(ids.size, graph.nodes.length);
  assert.equal(graph.links.length, 176);
  assert.equal(graph.links.filter((link) => link.kind === "branch").length, 9);
  assert.equal(graph.links.filter((link) => link.kind === "member").length, 84);
  assert.equal(graph.links.filter((link) => link.kind === "sequence").length, 83);

  for (const link of graph.links) {
    assert.ok(ids.has(link.source), `missing source ${link.source}`);
    assert.ok(ids.has(link.target), `missing target ${link.target}`);
  }
});

test("filterGraph combines category and normalized text search", async () => {
  const { buildGraph, filterGraph } = await loadModel();
  const graph = buildGraph(SLIDES, CATEGORIES);

  const categoryOnly = filterGraph(graph, "", "dematerializzazione");
  const matchedSlides = categoryOnly.nodes.filter((node) => node.kind === "slide");
  assert.deepEqual(matchedSlides.map((node) => node.number), [43, 44, 45, 46, 47, 48]);
  assert.ok(categoryOnly.nodes.some((node) => node.id === "hub-dematerializzazione"));
  assert.ok(categoryOnly.nodes.some((node) => node.id === "center"));
  assert.equal(graph.nodes.length, 94, "filtering must not mutate the source graph");

  const combined = filterGraph(graph, "ricetta medica", "dematerializzazione");
  assert.deepEqual(
    combined.nodes.filter((node) => node.kind === "slide").map((node) => node.number),
    [44, 47],
  );

  const byNumber = filterGraph(graph, "43", "dematerializzazione");
  assert.deepEqual(
    byNumber.nodes.filter((node) => node.kind === "slide").map((node) => node.number),
    [43],
  );

  const noMatch = filterGraph(graph, "termine-inesistente", "fondamenti");
  assert.equal(noMatch.nodes.length, 0);
  assert.equal(noMatch.links.length, 0);
});

test("neighborIds returns direct graph relationships", async () => {
  const { buildGraph, neighborIds } = await loadModel();
  const graph = buildGraph(SLIDES, CATEGORIES);

  const neighbors = neighborIds(graph, "slide-43");
  assert.ok(neighbors.has("hub-dematerializzazione"));
  assert.ok(neighbors.has("slide-42"));
  assert.ok(neighbors.has("slide-44"));
  assert.ok(!neighbors.has("slide-20"));
});
