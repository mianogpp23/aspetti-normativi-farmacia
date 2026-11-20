#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scanner dell'archivio dispense.

Legge ricorsivamente la cartella sorgente (senza mai modificarla), individua
tutti i PDF, ne estrae metadati e testo, genera le anteprime WebP di ogni
pagina e costruisce l'indice strutturato usato dalla piattaforma.

Uso:
    python3 scripts/scan.py                 # scansione completa + rendering
    python3 scripts/scan.py --no-render     # solo indice (veloce)
    python3 scripts/scan.py --only <slug>   # un solo modulo
    python3 scripts/scan.py --jobs 3

Output (dentro content/):
    manifest.json      indice completo (moduli, argomenti, slide)
    search.json        indice testuale per la ricerca globale
    scan-report.json   report tecnico della scansione
    slides/<id>/NNNN.webp    pagina intera (1600px)
    thumbs/<id>/NNNN.webp    miniatura (420px)
    pdf/<id>.pdf             copia del PDF originale per la pubblicazione
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import os
import re
import shutil
import sys
import time
import unicodedata
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1]
CONTENT_DIR = APP_DIR / "content"
CONFIG_PATH = APP_DIR / "config.json"

FULL_W = 1600
THUMB_W = 420
FULL_Q = 80
THUMB_Q = 72
MAX_ZOOM = 2.5

SKIP_DIRS = {".git", ".github", "node_modules", "__pycache__", ".cache", "piattaforma-didattica"}

# ---------------------------------------------------------------- stopwords
STOPWORDS = set(
    """
    a ad al alla alle allo agli ai all anche ancora andate avendo avere avete avuto
    alcuni alcuni altre altri altro altre alla alle ambo anzi aprire avanti
    b ben buono buona
    c che chi ci cio cioe come con contro cosa cui cun cui
    d da dal dalla dalle dallo dagli dai dentro dopo durante degli della delle dello
    dalla degl dei del dell della delle dello devo deve devono di dice detto dire
    dove due dunque
    e ed egli ella entrambi era erano essere essendo esso essa essi esse esempio
    f fa fare fatto fatto fra frazione
    g gia giorno gli grande gruppi gruppo
    h ha hai hanno ho
    i il in invece io istituto
    l la le li lo loro lui luogo
    m ma me mediante meglio meno mentre mi mia mie mio miei modo molto
    n ne nei nel nella nelle nello negli neppure nessuno neanche niente no noi non
    nonche nosco nostro nostra nostri nostre nullo num
    o oggi ogni oltre oppure ora osi ossia
    p per perche pero piu poco poi prima presso proprio può puo possono
    q qua qual quale quali qualsiasi quanto quasi quello quella quelli quelle qui
    quindi quinto
    r quale raro relativamente rispetto
    s sa sempre senza si sia siamo siete solo sono sopra sotto spesso stato stati
    stata state stesso stessa su sua sue sui sul sulla sulle sullo suo suoi
    t tal tale tali tanto tempo te ti tra troppo tu tua tuo tuoi
    u uguale ultimo un una uno una uno ufficio
    v va vai vale vari vario verso vi via voi vostro vostra vostri vostre
    ivi cioe neanche quindi perche affinche poiche
    slide slide 1 2 3 4 5 6 7 8 9 10
    """.split()
)


# ------------------------------------------------------------------ utility
def slugify(text: str, maxlen: int = 64) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    if len(text) > maxlen:
        cut = text[:maxlen]
        if "-" in cut:
            cut = cut.rsplit("-", 1)[0]
        text = cut.strip("-")
    return text or "modulo"


def md5_file(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def human_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024.0
    return f"{n:.1f} GB"


LECTURER_RE = re.compile(
    r"^(?:e\s+)?((?:dott\.ssa|dott\.|prof\.ssa|prof\.|dott|prof)\s*.*)$", re.IGNORECASE
)


def parse_folder_name(name: str) -> dict:
    """'Titolo - 1 - Dott. Mario Rossi - Dott.ssa Anna Bianchi' -> titolo/docenti/parte."""
    parts = [p.strip() for p in name.split(" - ") if p.strip()]
    lecturers: list[str] = []
    chunks: list[str] = []
    part = None
    for chunk in parts:
        bare = chunk[2:].strip() if chunk.lower().startswith("e ") else chunk
        if LECTURER_RE.match(bare) and len(chunks) >= 1:
            lecturers.append(bare)
        elif re.fullmatch(r"(?:parte\s*)?\d{1,2}", chunk, re.IGNORECASE):
            part = re.sub(r"[^\d]", "", chunk)
        else:
            chunks.append(chunk)
    title = " - ".join(chunks) if chunks else name
    if not lecturers:
        # nessun docente riconosciuto: prova con un trattino "Nome Cognome" finale
        if len(chunks) > 1:
            title = " - ".join(chunks[:-1])
            lecturers = [chunks[-1]]
    role = ""
    if lecturers:
        m = re.match(r"(dott\.ssa|dott\.|prof\.ssa|prof\.|dott|prof)", lecturers[0], re.IGNORECASE)
        if m:
            role = m.group(1).lower().replace("dott", "Dott").replace("prof", "Prof")
    return {"title": title.strip(), "lecturers": lecturers, "part": part, "role": role}


def short_label(title: str, maxlen: int = 42) -> str:
    cleaned = re.sub(r"\s+", " ", title).strip()
    if len(cleaned) <= maxlen:
        return cleaned
    cut = cleaned[:maxlen]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:") + "…"


def normalize_text(text: str) -> str:
    text = text.replace("\u00ad", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def content_words(text: str) -> list[str]:
    words = re.findall(r"[A-Za-zÀ-ÿ]{4,}", text.lower())
    return [w for w in words if w not in STOPWORDS]


def jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def titlecase_it(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip(" -–—:;,.«»\"'")
    if not text:
        return text
    if text.isupper() or text.islower():
        small = {"di", "del", "della", "dei", "delle", "dello", "degli", "e", "ed", "a", "ad",
                 "al", "alla", "alle", "ai", "agli", "da", "dal", "dalla", "in", "nel", "nella",
                 "con", "su", "sul", "per", "tra", "fra", "il", "lo", "la", "i", "gli", "le",
                 "un", "una", "uno", "l", "d"}
        out = []
        for i, w in enumerate(text.lower().split(" ")):
            if i > 0 and w in small:
                out.append(w)
            else:
                out.append(w[:1].upper() + w[1:])
        return " ".join(out)
    return text[:1].upper() + text[1:]


def clip(text: str, n: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= n:
        return text
    cut = text[:n]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:.-") + "…"


# --------------------------------------------------------------- discovery
def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception as exc:  # pragma: no cover
            print(f"! config.json illeggibile ({exc}), uso i valori predefiniti", file=sys.stderr)
    return {}


def resolve_source(cfg: dict) -> Path:
    if cfg.get("source"):
        return Path(os.path.expanduser(cfg["source"])).resolve()
    return APP_DIR.parent.resolve()


def discover(source: Path) -> list[dict]:
    found: list[dict] = []
    used_ids: set[str] = set()

    for dirpath, dirnames, filenames in os.walk(source):
        current = Path(dirpath)
        if current == source:
            dirnames[:] = [d for d in dirnames if not d.startswith(".") and d not in SKIP_DIRS]
            continue
        dirnames.sort()
        rel = current.relative_to(source)
        if any(part.startswith(".") for part in rel.parts):
            continue
        pdfs = sorted(f for f in filenames if f.lower().endswith(".pdf") and not f.startswith("."))
        videos = sorted(f for f in filenames if f.lower().endswith((".mp4", ".m4v", ".webm")) and not f.startswith("."))
        notes = sorted(f for f in filenames if f.lower().endswith((".md", ".txt")) and not f.startswith("."))
        if not pdfs and not videos:
            continue
        parsed = parse_folder_name(current.name)
        base = slugify(parsed["title"] if parsed["lecturers"] else current.name, 72)
        if parsed.get("part"):
            base = f"{base}-{parsed['part']}"
        mid = base
        n = 2
        while mid in used_ids:
            mid = f"{base}-{n}"
            n += 1
        used_ids.add(mid)
        found.append(
            {
                "id": mid,
                "title": parsed["title"],
                "label": short_label(parsed["title"]),
                "lecturers": parsed["lecturers"],
                "role": parsed["role"],
                "part": parsed["part"],
                "dir": current.name,
                "rel": str(rel),
                "pdfs": [str(current / p) for p in pdfs],
                "videos": [str(current / v) for v in videos],
                "notes": [str(current / m) for m in notes],
            }
        )

    found.sort(key=lambda m: (normalize_for_sort(m["title"]), m["dir"]))
    for i, mod in enumerate(found, start=1):
        mod["n"] = i
    return found


def normalize_for_sort(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(ch for ch in text if not unicodedata.combining(ch))


# --------------------------------------------------------------------- PDF
def read_pdf_meta(path: Path) -> dict:
    """Metadati + testo per pagina. Richiede PyMuPDF (fallback: pdfinfo/pdftotext)."""
    try:
        import fitz  # type: ignore

        doc = fitz.open(str(path))
        titles: dict[int, str | None] = {}
        for _lvl, title, page_no in doc.get_toc(simple=True):
            m = re.match(r"^\s*slide\s+(\d+)\s*[:\-–]\s*(.+)$", title, re.IGNORECASE)
            if m:
                titles.setdefault(int(m.group(1)), m.group(2).strip() or None)
            elif re.match(r"^\s*slide\s+\d+\s*$", title, re.IGNORECASE):
                pass
            else:
                titles.setdefault(int(page_no), title.strip() or None)
        pages = []
        for idx, page in enumerate(doc, start=1):
            raw = normalize_text(page.get_text("text"))
            rect = page.rect
            pages.append(
                {
                    "n": idx,
                    "text": raw,
                    "w": round(rect.width, 2),
                    "h": round(rect.height, 2),
                    "toc": titles.get(idx),
                }
            )
        info = {
            "pages": doc.page_count,
            "w": pages[0]["w"] if pages else 0,
            "h": pages[0]["h"] if pages else 0,
            "has_toc": bool(titles),
            "pages_data": pages,
            "engine": "pymupdf",
        }
        doc.close()
        return info
    except ImportError:
        pass
    # fallback poppler
    import subprocess

    info_txt = subprocess.run(["pdfinfo", str(path)], capture_output=True, text=True).stdout
    pages_n = int(re.search(r"^Pages:\s+(\d+)", info_txt, re.M).group(1))
    size = re.search(r"^Page size:\s+([\d.]+) x ([\d.]+)", info_txt, re.M)
    pages = []
    for i in range(1, pages_n + 1):
        out = subprocess.run(
            ["pdftotext", "-f", str(i), "-l", str(i), "-enc", "UTF-8", str(path), "-"],
            capture_output=True,
            text=True,
        ).stdout
        pages.append({"n": i, "text": normalize_text(out), "w": float(size.group(1)) if size else 0,
                      "h": float(size.group(2)) if size else 0, "toc": None})
    return {
        "pages": pages_n,
        "w": pages[0]["w"] if pages else 0,
        "h": pages[0]["h"] if pages else 0,
        "has_toc": False,
        "pages_data": pages,
        "engine": "poppler",
    }


def render_pages(pdf_path: Path, slides_dir: Path, thumbs_dir: Path, expected: int) -> dict:
    """Rasterizza ogni pagina in WebP (full + thumb). Restituisce statistiche."""
    import fitz  # type: ignore
    from PIL import Image

    slides_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(str(pdf_path))
    total = 0
    written = 0
    for idx, page in enumerate(doc, start=1):
        width = page.rect.width or 960.0
        zoom = min(MAX_ZOOM, max(1.0, FULL_W / width))
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False, colorspace=fitz.csRGB)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        if img.mode != "RGB":
            img = img.convert("RGB")
        if img.width > FULL_W:
            img = img.resize((FULL_W, max(1, round(img.height * FULL_W / img.width))), Image.LANCZOS)
        name = f"{idx:04d}.webp"
        full_path = slides_dir / name
        img.save(full_path, "WEBP", quality=FULL_Q, method=4)
        thumb = img.copy()
        thumb.thumbnail((THUMB_W, 10000), Image.LANCZOS)
        thumb.save(thumbs_dir / name, "WEBP", quality=THUMB_Q, method=4)
        total += full_path.stat().st_size
        written += 1
    doc.close()
    return {"rendered": written, "expected": expected, "full_bytes": total}


# ------------------------------------------------------------------ topics
DIVIDER_HINT = re.compile(r"^(programma|indice|obiettivi|contenuti|sommario|agenda|introduzione|parte)\b", re.I)
GENERIC_TITLE = re.compile(
    r"^(sezione|parte|slide|capitolo|argomento|punto|domanda|esempio|caso|tabella|figura|schema)"
    r"\s*[a-z]?\d*\s*[:.\-–]?\s*$",
    re.I,
)
TRAIL_STOP = {
    "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "di", "del", "della", "dei", "delle",
    "dello", "degli", "a", "al", "alla", "ai", "agli", "alle", "da", "dal", "dalla", "in", "nel",
    "nella", "con", "su", "per", "tra", "fra", "e", "ed", "o", "od", "che", "come", "ha", "hanno",
    "è", "sono", "non", "più", "the", "of", "and", "to", "si", "se", "ma", "anche", "quale",
}


def reconnect_spaced(text: str) -> str:
    """'U s o  V e t e r i n a r i o' -> 'Uso Veterinario' (titoli con lettere spaziate)."""
    tokens = text.split(" ")
    if len(tokens) < 6:
        return text
    single = sum(1 for t in tokens if len(t) == 1)
    if single / len(tokens) < 0.55:
        return text
    joined = "".join(tokens)
    return re.sub(r"(?<=[a-zà-ÿ])(?=[A-ZÀ-Ý])", " ", joined)


def clean_title(raw: str | None) -> str | None:
    if not raw:
        return None
    text = reconnect_spaced(re.sub(r"\s+", " ", raw)).strip()
    text = text.strip(" …·•▸►●○■□▪‣⁃-–—:;,.«»\"'’“”‘|/\\")
    text = re.sub(r"^\(?\d{1,2}\)?[.)]\s+", "", text)
    text = re.sub(r"^(?:titolo|title|argomento)\s*[:\-]\s*", "", text, flags=re.I)
    text = re.sub(r"\s*\((?:rev|def|ok|new)\)\s*$", "", text, flags=re.I)
    if re.match(r"^(dott\.?ssa|dott\.?|prof\.?ssa|prof\.?|ing\.|rag\.|avv\.|dr\.)\s", text, re.I):
        return None  # riga con il nome del relatore, non un argomento
    if len(text) < 4:
        return None
    if len(text) > 74:
        cut = text[:74]
        for sep in (", ", "; ", " - ", ": "):
            if sep in cut[26:]:
                cut = cut[: cut.rindex(sep, 26)]
                break
        if len(cut) >= 74 and " " in cut:
            cut = cut.rsplit(" ", 1)[0]
        text = cut
    words = text.split(" ")
    if len(words) > 13:
        words = words[:13]
    while len(words) > 2 and words[-1].lower().strip(".,;:") in TRAIL_STOP:
        words.pop()
    text = " ".join(words).rstrip(" ,;:.-–—”\"'’“”‘")
    if len(text) < 4:
        return None
    return titlecase_it(text)


def page_title(page: dict) -> str | None:
    return page.get("title")


def precompute_titles(pages: list[dict]) -> list[dict]:
    """Titolo per pagina dal TOC o dalla prima riga utile, scartando i boilerplate."""
    n = len(pages)
    if not n:
        return pages
    candidates: list[list[str]] = []
    for p in pages:
        cands = []
        if p.get("toc"):
            cands.append(p["toc"])
        lines = [l.strip() for l in p.get("text", "").split("\n") if l.strip()]
        cands.extend(lines[:4])
        candidates.append(cands)

    counts: dict[str, int] = {}
    for cands in candidates:
        if cands:
            key = re.sub(r"\d+", "", cands[0].lower()).strip()
            if key:
                counts[key] = counts.get(key, 0) + 1
    limit = max(3, int(0.15 * n))
    ignore = {k for k, c in counts.items() if c >= limit and len(k) < 70}

    for p, cands in zip(pages, candidates):
        chosen = None
        for raw in cands:
            if not raw:
                continue
            key = re.sub(r"\d+", "", raw.lower()).strip()
            if key in ignore:
                continue
            title = clean_title(raw)
            if not title or GENERIC_TITLE.match(title):
                continue
            chosen = title
            break
        p["title"] = chosen
    return pages


def text_share(pages: list[dict]) -> float:
    if not pages:
        return 0.0
    good = sum(1 for p in pages if len(p.get("text", "")) >= 60)
    return good / len(pages)


def cluster_pages(pages: list[dict], module_title: str | None = None) -> list[dict]:
    """Segmentazione deterministica in argomenti (nessuna lista manuale)."""
    n = len(pages)
    if n == 0 or text_share(pages) < 0.45:
        return []

    words = [set(content_words(p["text"])[:60]) for p in pages]
    sims = [0.0] + [jaccard(words[i - 1], words[i]) for i in range(1, n)]
    divider = []
    for i, p in enumerate(pages):
        text = p.get("text", "")
        title = page_title(p) or ""
        is_div = i > 0 and (
            len(text) < 170
            or (DIVIDER_HINT.match(title) and len(text) < 700)
            or (len(text) < 450 and title.isupper() and len(title.split()) <= 7)
        )
        divider.append(bool(is_div))

    base_sims = sorted(sims) or [0.0]
    base = base_sims[int(len(base_sims) * 0.55)]
    threshold = max(0.035, min(0.12, base * 0.6))

    cuts = [0]
    for i in range(1, n):
        size = i - cuts[-1]
        if size < 3:
            continue
        window = sims[max(1, i - 3):i]
        avg_prev = (sum(window) / len(window)) if window else 0.0
        if divider[i] or (sims[i] < threshold and sims[i] <= 0.5 * avg_prev):
            cuts.append(i)
    cuts.append(n)

    def sizes(cs: list[int]) -> list[int]:
        return [cs[i + 1] - cs[i] for i in range(len(cs) - 1)]

    changed = True
    while changed and len(cuts) > 2:
        changed = False
        for i, s in enumerate(sizes(cuts)):
            if s < 3:
                if i == 0:
                    cuts.pop(1)
                elif i == len(sizes(cuts)) - 1:
                    cuts.pop(-2)
                else:
                    left = sims[cuts[i]] if cuts[i] < n else 0.0
                    right = sims[cuts[i + 1]] if cuts[i + 1] < n else 0.0
                    cuts.pop(i + 1 if left >= right else i)
                changed = True
                break

    cuts = split_large(cuts, sims, n, max_size=15)

    while len(cuts) - 1 > 12:  # tetto massimo di argomenti per modulo
        best, best_i = 9e9, 1
        for i in range(1, len(cuts) - 1):
            cost = sims[cuts[i]] if cuts[i] < n else 0.0
            if cost < best:
                best, best_i = cost, i
        cuts.pop(best_i)

    topics = []
    for k in range(len(cuts) - 1):
        start, end = cuts[k], cuts[k + 1]
        topics.append(build_topic(pages[start:end], words, start, k + 1))
    if topics and module_title and len((topics[0]["title"] or "").split()) < 3:
        topics[0]["title"] = clip(module_title, 82)
    return refine_titles(topics)


def split_large(cuts: list[int], sims: list[float], n: int, max_size: int = 15) -> list[int]:
    """Spezza i gruppi troppo grandi ai minimi di similarità interni."""
    out = [cuts[0]]
    for a, b in zip(cuts, cuts[1:]):
        size = b - a
        if size <= max_size:
            out.append(b)
            continue
        parts = max(2, math.ceil(size / max_size))
        step = size / parts
        pos = a
        for k in range(1, parts):
            approx = int(round(a + k * step))
            lo, hi = max(pos + 5, approx - 3), min(b - 5, approx + 3)
            if hi <= lo:
                continue
            cut = min(range(lo, hi + 1), key=lambda i: sims[i])
            if cut <= pos + 3:
                continue
            out.append(cut)
            pos = cut
        out.append(b)
    return out


def best_title(chunk: list[dict], all_words: list[set], start: int, keywords: list[str]) -> str | None:
    """Sceglie il titolo più rappresentativo e informativo del gruppo."""
    n = len(chunk)
    seen: dict[str, int] = {}
    for p in chunk:
        t = page_title(p)
        if t:
            seen[t.lower()] = seen.get(t.lower(), 0) + 1
    best, best_score = None, -1e9
    for i, p in enumerate(chunk):
        title = page_title(p)
        if not title:
            continue
        low = title.lower()
        centrality = 0.0
        if all_words[start + i]:
            centrality = sum(jaccard(all_words[start + i], all_words[start + j]) for j in range(n)) / n
        hits = sum(1 for k in keywords[:4] if k in low) / max(1, len(keywords[:4]))
        nwords = len(title.split())
        if nwords <= 2:
            length_fit = 0.55
        elif nwords <= 10:
            length_fit = 1.0
        elif nwords <= 13:
            length_fit = 0.72
        else:
            length_fit = 0.3
        repeat_penalty = 0.4 * (seen.get(low, 1) - 1)
        score = centrality * 1.6 + hits * 1.1 + length_fit * 0.8 - repeat_penalty
        if score > best_score:
            best, best_score = title, score
    return best


def topic_keywords(all_words: list[set], start: int, n: int, limit: int = 4) -> list[str]:
    freq: dict[str, int] = {}
    for i in range(n):
        for w in all_words[start + i]:
            freq[w] = freq.get(w, 0) + 1
    ranked = sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))
    strong = [w for w, c in ranked if c >= max(2, n * 0.3)]
    return [titlecase_it(w) for w in (strong or [w for w, _c in ranked])[:limit]]


def build_topic(chunk: list[dict], all_words: list[set], start: int, idx: int) -> dict:
    n = len(chunk)
    keywords = topic_keywords(all_words, start, n)
    title = best_title(chunk, all_words, start, keywords)
    if not title or len(title) < 6:
        title = " · ".join(keywords[:3]) or f"Sezione {idx}"
    topic = {
        "id": f"t{idx}",
        "title": title,
        "from": chunk[0]["n"],
        "to": chunk[-1]["n"],
        "count": n,
        "keywords": keywords,
        "slides": [{"n": p["n"], "title": page_title(p), "chars": len(p.get("text", ""))} for p in chunk],
        "subtopics": [],
    }
    if n > 16:
        topic["subtopics"] = split_subtopics(chunk, all_words, start)
    return topic


def split_subtopics(chunk: list[dict], all_words: list[set], start: int) -> list[dict]:
    n = len(chunk)
    if n <= 12:
        return []
    words = all_words[start:start + n]
    sims = [jaccard(words[i - 1], words[i]) for i in range(1, n)]
    lo, hi = max(4, int(n * 0.3)), min(n - 4, int(n * 0.7))
    mid = n // 2 if hi <= lo else lo + min(range(hi - lo), key=lambda i: sims[i])
    out = []
    for k, part in enumerate([chunk[:mid], chunk[mid:]], start=1):
        sub_start = start if k == 1 else start + mid
        out.append(build_subtopic(part, all_words, sub_start, k))
    return out


def build_subtopic(chunk: list[dict], all_words: list[set], start: int, idx: int) -> dict:
    keywords = topic_keywords(all_words, start, len(chunk), limit=3)
    title = best_title(chunk, all_words, start, keywords) or " · ".join(keywords) or f"Parte {idx}"
    return {
        "id": f"s{idx}",
        "title": title,
        "from": chunk[0]["n"],
        "to": chunk[-1]["n"],
        "count": len(chunk),
    }


def refine_titles(topics: list[dict]) -> list[dict]:
    """Titoli generici o duplicati -> aggiunge il termine caratterizzante."""
    used: dict[str, int] = {}
    for t in topics:
        base = t["title"]
        generic = len(base.split()) <= 2 and len(base) < 26
        if generic and t["keywords"]:
            extra = [k for k in t["keywords"] if k.lower() not in base.lower()][:2]
            if extra:
                base = base + (" · " if len(base) <= 18 else " — ") + " · ".join(extra)
        key = base.lower()
        if key in used:
            used[key] += 1
            extra = [k for k in t["keywords"] if k.lower() not in base.lower()][:1]
            base = base + (" · " + extra[0] if extra else f" ({used[key]})")
        used[base.lower()] = 1
        t["title"] = clip(base, 82)
    return topics


# ------------------------------------------------------------------ worker
def process_module(mod: dict, opts: dict) -> dict:
    t0 = time.time()
    pdf_meta_list = []
    all_pages: list[dict] = []
    for pdf in mod["pdfs"]:
        meta = read_pdf_meta(Path(pdf))
        info = {
            "file": Path(pdf).name,
            "pages": meta["pages"],
            "w": meta["w"],
            "h": meta["h"],
            "bytes": Path(pdf).stat().st_size,
            "has_toc": meta["has_toc"],
            "engine": meta["engine"],
        }
        pdf_meta_list.append(info)
        all_pages.extend(meta["pages_data"])

    # rinumera globalmente (una cartella = un modulo, normalmente un PDF)
    for i, p in enumerate(all_pages, start=1):
        p["gn"] = i
    precompute_titles(all_pages)

    share = text_share(all_pages)
    topics = cluster_pages(all_pages, mod["title"])

    slide_entries = []
    for p in all_pages:
        slide_entries.append(
            {
                "n": p["gn"],
                "title": page_title(p),
            }
        )

    render_stats = {"rendered": 0, "expected": 0, "full_bytes": 0}
    slides_dir = CONTENT_DIR / "slides" / mod["id"]
    thumbs_dir = CONTENT_DIR / "thumbs" / mod["id"]

    # copia PDF originale (per la consultazione online)
    pdf_out = None
    Content_pdf = CONTENT_DIR / "pdf"
    Content_pdf.mkdir(parents=True, exist_ok=True)
    if len(mod["pdfs"]) == 1:
        src = Path(mod["pdfs"][0])
        dest = Content_pdf / f"{mod['id']}.pdf"
        if not dest.exists() or dest.stat().st_size != src.stat().st_size:
            shutil.copy2(src, dest)
        pdf_out = f"content/pdf/{mod['id']}.pdf"

    # I video NON fanno parte del sito pubblicato: i 19 MP4 originali (4.35 GB,
    # 10 file oltre il limite di 100 MB di GitHub) restano nell'archivio e non
    # vengono copiati ne' referenziati. Il manifest pubblicato non contiene
    # quindi alcun metadato video: nessun link morto verso file non pubblicati.

    notes = []
    for npath in mod["notes"]:
        try:
            txt = Path(npath).read_text(encoding="utf-8", errors="replace")
            notes.append({"file": Path(npath).name, "text": clip(txt, 4000)})
        except Exception:
            pass

    total_pages = len(all_pages)

    # rendering delle pagine (skippato con --no-render)
    if not opts["no_render"]:
        for d in (slides_dir, thumbs_dir):
            if d.exists():
                shutil.rmtree(d)
        for pdf, info in zip(mod["pdfs"], pdf_meta_list):
            stats = render_pages(Path(pdf), slides_dir, thumbs_dir, info["pages"])
            render_stats["rendered"] += stats["rendered"]
            render_stats["expected"] += stats["expected"]
            render_stats["full_bytes"] += stats["full_bytes"]
    else:
        # --no-render non rigenera le immagini: riporta lo stato REALE di
        # quelle gia' presenti su disco, non zero fittizi.
        existing = sorted(slides_dir.glob("*.webp")) if slides_dir.exists() else []
        render_stats["rendered"] = len(existing)
        render_stats["expected"] = total_pages
        render_stats["full_bytes"] = sum(p.stat().st_size for p in existing)

    topic_children = []
    for t in topics:
        topic_children.append(
            {
                "id": t["id"],
                "title": t["title"],
                "from": t["from"],
                "to": t["to"],
                "count": t["count"],
                "keywords": t["keywords"],
                "subtopics": t["subtopics"],
            }
        )

    result = {
        "id": mod["id"],
        "n": mod["n"],
        "title": mod["title"],
        "label": mod["label"] + (f" · {mod['part']}" if mod.get("part") else ""),
        "lecturers": mod["lecturers"],
        "role": mod["role"],
        "part": mod["part"],
        "dir": mod["dir"],
        "pdf": {
            "path": pdf_out,
            "pages": total_pages,
            "bytes": sum(p["bytes"] for p in pdf_meta_list),
            "w": pdf_meta_list[0]["w"] if pdf_meta_list else 0,
            "h": pdf_meta_list[0]["h"] if pdf_meta_list else 0,
            "files": pdf_meta_list,
        },
        "notes": notes,
        "topics": topic_children,
        "has_topics": bool(topic_children),
        "textShare": round(share, 3),
        "slides": slide_entries,
        "has_slides": total_pages > 0,
        "render": render_stats,
        "elapsed": round(time.time() - t0, 2),
    }
    return result, all_pages


def prune_stale_outputs(module_ids: set[str], pdf_names: set[str]) -> list[str]:
    """Rimuove gli artefatti generati che non corrispondono piu ai moduli correnti.

    Serve a mantenere content/ coerente con manifest.json: se un modulo viene
    rinominato o rimosso dall'archivio, le copie di PDF e le cartelle di
    immagini precedenti rimarrebbero come fossili. Non tocca mai l'archivio
    originale: opera esclusivamente dentro content/.
    """
    removed: list[str] = []

    pdf_dir = CONTENT_DIR / "pdf"
    if pdf_dir.exists():
        for p in sorted(pdf_dir.glob("*.pdf")):
            if p.name not in pdf_names:
                p.unlink()
                removed.append(f"pdf/{p.name}")

    for kind in ("slides", "thumbs"):
        d = CONTENT_DIR / kind
        if d.exists():
            for sub in sorted(d.iterdir()):
                if sub.is_dir() and sub.name not in module_ids:
                    shutil.rmtree(sub)
                    removed.append(f"{kind}/{sub.name}")

    return removed


def main() -> int:
    ap = argparse.ArgumentParser(description="Scansiona l'archivio dispense e genera l'indice.")
    ap.add_argument("--source", help="cartella radice delle dispense")
    ap.add_argument("--no-render", action="store_true", help="salta il rendering delle immagini")
    ap.add_argument("--only", help="elabora solo il modulo con questo slug")
    ap.add_argument("--jobs", type=int, default=min(3, (os.cpu_count() or 2)))
    args = ap.parse_args()

    cfg = load_config()
    source = Path(args.source).resolve() if args.source else resolve_source(cfg)
    if not source.is_dir():
        print(f"ERRORE: cartella sorgente non trovata: {source}", file=sys.stderr)
        return 2

    CONTENT_DIR.mkdir(parents=True, exist_ok=True)
    (CONTENT_DIR / ".generated-marker").write_text(
        "Contenuto generato automaticamente da scripts/scan.py. Non modificare a mano.\n",
        encoding="utf-8",
    )

    t_start = time.time()
    print(f"→ sorgente: {source}")
    modules = discover(source)
    if not modules:
        print("ERRORE: nessun PDF trovato.", file=sys.stderr)
        return 3
    total_pdfs = sum(len(m["pdfs"]) for m in modules)
    print(f"→ trovati {len(modules)} moduli, {total_pdfs} PDF")

    if args.only:
        modules = [m for m in modules if m["id"] == args.only]
        if not modules:
            print(f"ERRORE: modulo '{args.only}' inesistente", file=sys.stderr)
            return 4

    opts = {"no_render": args.no_render}
    results = []
    pages_map: dict[str, list[dict]] = {}
    if args.jobs <= 1 or len(modules) == 1:
        for i, mod in enumerate(modules, start=1):
            print(f"  [{i}/{len(modules)}] {mod['id']}")
            mod_res, pages = process_module(mod, opts)
            results.append(mod_res)
            pages_map[mod_res["id"]] = pages
    else:
        with ProcessPoolExecutor(max_workers=args.jobs) as ex:
            futs = {ex.submit(process_module, m, opts): m for m in modules}
            done = 0
            for fut in as_completed(futs):
                mod = futs[fut]
                done += 1
                try:
                    mod_res, pages = fut.result()
                except Exception as exc:
                    print(f"  ! errore su {mod['id']}: {exc}", file=sys.stderr)
                    raise
                results.append(mod_res)
                pages_map[mod_res["id"]] = pages
                print(f"  [{done}/{len(modules)}] {mod['id']} ({mod_res['pdf']['pages']} pag, "
                      f"{mod_res['render']['rendered']} img, {mod_res['elapsed']}s)")

    results.sort(key=lambda m: m["n"])

    # --- pruning degli output obsoleti (content/ sempre allineato al manifest)
    if args.only:
        print("→ modalita --only: pruning degli artefatti obsoleti saltato")
    else:
        expected_pdfs = {f"{m['id']}.pdf" for m in results if len(m["pdf"]["files"]) == 1}
        stale = prune_stale_outputs({m["id"] for m in results}, expected_pdfs)
        if stale:
            print(f"→ rimossi {len(stale)} artefatti obsoleti: " + ", ".join(stale))
        else:
            print("→ nessun artefatto obsoleto da rimuovere")

    # --- indice di ricerca testuale
    search_entries = []
    for mod_res in results:
        for i, p in enumerate(pages_map.get(mod_res["id"], []), start=1):
            text = p.get("text", "")
            if not text and not p.get("toc"):
                continue
            search_entries.append(
                {
                    "m": mod_res["id"],
                    "n": p.get("gn", i),
                    "t": page_title(p) or "",
                    "x": clip(text, 700),
                }
            )

    totals = {
        "modules": len(results),
        "modulesWithSlides": sum(1 for m in results if m["has_slides"]),
        "pdfs": sum(len(m["pdf"]["files"]) for m in results),
        "pages": sum(m["pdf"]["pages"] for m in results),
        "imageBytes": sum(m["render"]["full_bytes"] for m in results),
        "renderedImages": sum(m["render"]["rendered"] for m in results),
        "pdfBytes": sum(m["pdf"]["bytes"] for m in results),
        "topics": sum(len(m["topics"]) for m in results),
    }

    course_name = cfg.get("courseName") or source.name
    if ":" in course_name:
        head, tail = course_name.split(":", 1)
        course = {"title": head.strip(), "subtitle": tail.strip()}
    else:
        course = {"title": course_name, "subtitle": ""}
    course["title"] = cfg.get("courseTitle") or course["title"]
    course["subtitle"] = cfg.get("courseSubtitle") or course["subtitle"]

    manifest = {
        "version": 1,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        # percorso relativo: il manifest e' un file pubblicato, non deve
        # contenere path assoluti della macchina che ha generato il sito
        "source": source.name,
        "sourceName": source.name,
        "course": course,
        "totals": totals,
        "modules": results,
    }

    manifest_path = CONTENT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (CONTENT_DIR / "search.json").write_text(
        json.dumps(search_entries, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    report = {
        "generatedAt": manifest["generatedAt"],
        "source": source.name,
        "elapsedSeconds": round(time.time() - t_start, 1),
        "totals": totals,
        "manifestBytes": manifest_path.stat().st_size,
        "searchBytes": (CONTENT_DIR / "search.json").stat().st_size,
        "modules": [
            {
                "id": m["id"],
                "title": m["title"],
                "pages": m["pdf"]["pages"],
                "topics": len(m["topics"]),
                "rendered": m["render"]["rendered"],
                "elapsed": m["elapsed"],
            }
            for m in results
        ],
    }
    (CONTENT_DIR / "scan-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    print(
        f"✓ {totals['modules']} moduli · {totals['pdfs']} PDF · {totals['pages']} pagine · "
        f"{totals['topics']} argomenti · {totals['renderedImages']} immagini "
        f"({human_bytes(totals['imageBytes'])} webp + {human_bytes(totals['pdfBytes'])} pdf)"
    )
    print(f"✓ manifest: {manifest_path} ({human_bytes(manifest_path.stat().st_size)})")
    print(f"✓ tempo: {report['elapsedSeconds']}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
