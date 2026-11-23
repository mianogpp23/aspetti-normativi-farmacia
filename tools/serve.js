#!/usr/bin/env node
/* serve.js — server statico minimale per la verifica locale della board Kanban. */

import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(process.argv[2] || fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT || 8093);
const HOST = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
  ".ico": "image/x-icon",
};

function safePath(raw) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(raw, `http://${HOST}:${PORT}`).pathname);
  } catch {
    return null;
  }
  const full = resolve(join(ROOT, normalize(pathname).replace(/^[/\\]+/, "")));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  return full;
}

const server = http.createServer(async (req, res) => {
  let file = safePath(req.url || "/");
  if (!file) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    let info = await stat(file);
    if (info.isDirectory()) {
      file = join(file, "index.html");
      info = await stat(file);
    }
    if (!info.isFile()) throw new Error("not a file");
    res.writeHead(200, {
      "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": "no-store",
      "Accept-Ranges": "none",
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`board: http://${HOST}:${PORT}/ (root: ${ROOT})`);
});
