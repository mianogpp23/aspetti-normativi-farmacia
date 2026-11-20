/* data.js — caricamento manifest, indici e helper di percorso (tutti relativi) */

import { pad4 } from "./utils.js";

const CONTENT = "content/";

export const state = {
  manifest: null,
  byId: new Map(),
  search: [],
  searchIndex: [],
};

export async function loadManifest() {
  const res = await fetch(`${CONTENT}manifest.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`manifest.json non leggibile (${res.status})`);
  const m = await res.json();
  state.manifest = m;
  state.byId = new Map((m.modules || []).map((mod) => [mod.id, mod]));
  return m;
}

export async function loadSearch() {
  try {
    const res = await fetch(`${CONTENT}search.json`, { cache: "no-cache" });
    if (!res.ok) return [];
    state.search = await res.json();
  } catch {
    state.search = [];
  }
  return state.search;
}

export const getModule = (id) => state.byId.get(id) || null;
export const modules = () => state.manifest?.modules || [];

export const slideUrl = (id, n) => `${CONTENT}slides/${id}/${pad4(n)}.webp`;
export const thumbUrl = (id, n) => `${CONTENT}thumbs/${id}/${pad4(n)}.webp`;
export const pdfUrl = (mod) => mod?.pdf?.path || `${CONTENT}pdf/${mod?.id}.pdf`;
export const pdfPageUrl = (mod, n) => `${pdfUrl(mod)}#page=${n}&zoom=page-fit`;

export const pagesOf = (mod) => mod?.pdf?.pages || 0;
export const hasSlides = (mod) => Boolean(mod?.has_slides && pagesOf(mod) > 0);

/** restituisce (o sintetizza) la lista di argomenti navigabili di un modulo */
export function topicsOf(mod) {
  if (!mod) return [];
  if (Array.isArray(mod.topics) && mod.topics.length) return mod.topics;
  const p = pagesOf(mod);
  if (!p) return [];
  return [{ id: "all", title: "Tutte le slide del modulo", from: 1, to: p, count: p, keywords: [], subtopics: [] }];
}

export function slideTitle(mod, n) {
  const s = mod?.slides?.find((x) => x.n === n);
  return s?.title || "";
}

/** argomento che contiene la slide n */
export function topicAt(mod, n) {
  return topicsOf(mod).find((t) => n >= t.from && n <= t.to) || null;
}

export function moduleStats(mod) {
  const pages = pagesOf(mod);
  return {
    pages,
    topics: (mod?.topics || []).length,
    bytes: mod?.pdf?.bytes || null,
  };
}
