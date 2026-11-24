/* views-common.js — palette e conteggi condivisi dalle quattro viste modulo. */

export const MODULE_PALETTE = [
  "#155E75",
  "#8A4B08",
  "#276749",
  "#5B3B8C",
  "#9B2C4F",
  "#6B5B12",
  "#0E6A6E",
  "#3D4A8A",
];

export function colorFor(index) {
  return MODULE_PALETTE[index % MODULE_PALETTE.length];
}

export function padded(n) {
  return String(n ?? 0).padStart(2, "0");
}

export function plural(n, singular, many) {
  return n === 1 ? singular : many;
}

export function buildPageIndex(mods, pagesOf) {
  let cursor = 1;
  const index = new Map();
  for (const mod of mods) {
    const pages = pagesOf(mod);
    const start = pages > 0 ? cursor : null;
    index.set(mod.id, { start, pages });
    if (pages > 0) cursor += pages;
  }
  return { index, total: cursor - 1 };
}
