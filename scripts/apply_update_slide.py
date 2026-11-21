#!/usr/bin/env python3
"""Applica la slide di aggiornamento 85 al contenuto generato dal sito orbitale."""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parents[1]
CONTENT = REPO_ROOT / "content"
MODULE_ID = "gestione-dei-medicinali-uso-umano-e-disciplina-di-dispensazione-al"
UPDATE_MD = CONTENT / "updates/2026-11-23-ricetta-stupefacenti-non-ssn.md"
FONT_PATH = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
SLIDE_NUMBER = 85
SLIDE_SIZE = (1600, 900)
THUMB_SIZE = (420, 236)
BG = "#0B1F33"
TITLE_COLOR = "#FFFFFF"
BODY_COLOR = "#D9E7F5"
ACCENT = "#4FC3F7"
Font = ImageFont.FreeTypeFont | ImageFont.ImageFont


def _font(size: int) -> Font:
    if FONT_PATH.exists():
        return ImageFont.truetype(str(FONT_PATH), size)
    for candidate in Path("/usr/share/fonts").rglob("DejaVuSans.ttf"):
        return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: Font, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        current = ""
        for word in paragraph.split():
            candidate = f"{current} {word}".strip()
            if draw.textlength(candidate, font=font) <= max_width:
                current = candidate
                continue
            if current:
                lines.append(current)
            if draw.textlength(word, font=font) > max_width:
                while draw.textlength(word, font=font) > max_width:
                    cut = len(word) - 1
                    while cut > 1 and draw.textlength(word[:cut], font=font) > max_width:
                        cut -= 1
                    lines.append(word[:cut])
                    word = word[cut:]
            current = word
        if current:
            lines.append(current)
    return lines


def load_update(path: Path) -> dict:
    """Legge il Markdown sorgente e restituisce i dati della slide."""
    text = path.read_text(encoding="utf-8")
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for line in text.splitlines():
        if line.startswith("## "):
            current = line[3:].strip()
            sections[current] = []
        elif current is not None and line.strip():
            sections[current].append(line.rstrip())

    for name in ("## Titolo", "## Testo", "## Fonti"):
        if not sections.get(name[3:]):
            raise ValueError(f"sezione mancante: {name}")

    return {
        "title": sections["Titolo"][0].strip(),
        "bullets": [
            line[2:].strip() for line in sections["Testo"] if line.startswith("- ")
        ],
        "sources": [
            line[2:].strip() for line in sections["Fonti"] if line.startswith("- ")
        ],
        "effective_date": "23/11/2026",
    }


def render_slide_images(update: dict, out_slide: Path, out_thumb: Path) -> None:
    """Crea la WebP full-size e la miniatura per la slide 85."""
    image = Image.new("RGB", SLIDE_SIZE, BG)
    draw = ImageDraw.Draw(image)
    margin = 56
    max_width = SLIDE_SIZE[0] - 2 * margin

    draw.rectangle((0, 0, SLIDE_SIZE[0], 12), fill=ACCENT)
    title_font = _font(52)
    body_font = _font(30)

    y = 54
    for line in _wrap(draw, update["title"], title_font, max_width):
        draw.text((margin, y), line, font=title_font, fill=TITLE_COLOR)
        y += 66

    y += 18
    draw.line((margin, y, SLIDE_SIZE[0] - margin, y), fill=ACCENT, width=3)
    y += 30

    for bullet in update["bullets"]:
        lines = _wrap(draw, f"• {bullet}", body_font, max_width)
        for line in lines:
            draw.text((margin, y), line, font=body_font, fill=BODY_COLOR)
            y += 46
        y += 16

    out_slide.parent.mkdir(parents=True, exist_ok=True)
    out_thumb.parent.mkdir(parents=True, exist_ok=True)
    image.save(out_slide, format="WEBP", quality=88)
    thumb = image.resize(THUMB_SIZE, Image.Resampling.LANCZOS)
    thumb.save(out_thumb, format="WEBP", quality=88)


def append_pdf_page(pdf_path: Path, update: dict) -> None:
    """Aggiunge la pagina 85 al PDF pubblicato, senza riscrivere le altre pagine."""
    doc = pymupdf.open(pdf_path)
    try:
        if doc.page_count >= SLIDE_NUMBER:
            return
        page = doc.new_page(width=720, height=405.36)
        page.insert_textbox(
            pymupdf.Rect(30, 20, 690, 70),
            update["title"],
            fontsize=16,
            fontname="helv",
            color=(1, 1, 1),
        )
        body = "\n\n".join(f"• {b}" for b in update["bullets"])
        page.insert_textbox(
            pymupdf.Rect(30, 80, 690, 390),
            body,
            fontsize=10,
            fontname="helv",
            color=(0.85, 0.91, 0.96),
        )
        doc.saveIncr()
    finally:
        doc.close()


def _load_json(path: Path):
    try:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Impossibile leggere {path}: {exc}") from exc


def _write_json(path: Path, data, *, indent: int | None = None) -> None:
    if indent is None:
        text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    else:
        text = json.dumps(data, ensure_ascii=False, indent=indent)
    path.write_text(text + "\n", encoding="utf-8")


def _dir_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(item.stat().st_size for item in path.iterdir() if item.is_file())


def _recalculate_totals(manifest: dict) -> dict:
    modules = manifest["modules"]
    return {
        "modules": len(modules),
        "modulesWithSlides": sum(1 for m in modules if m.get("has_slides")),
        "pdfs": sum(1 for m in modules if m.get("pdf") and m.get("has_slides")),
        "pages": sum(m["pdf"]["pages"] for m in modules if m.get("pdf")),
        "imageBytes": sum(m.get("render", {}).get("full_bytes", 0) for m in modules),
        "renderedImages": sum(m.get("render", {}).get("rendered", 0) for m in modules),
        "pdfBytes": sum(m["pdf"]["bytes"] for m in modules if m.get("pdf")),
        "topics": sum(len(m.get("topics", [])) for m in modules),
    }


def apply(root: Path) -> dict:
    """Inietta la slide 85 nei file generati, in modo idempotente."""
    update = load_update(UPDATE_MD)
    content = root / "content"
    manifest_path = content / "manifest.json"
    search_path = content / "search.json"
    report_path = content / "scan-report.json"

    manifest = _load_json(manifest_path)
    module = next(m for m in manifest["modules"] if m["id"] == MODULE_ID)
    pdf_path = root / module["pdf"]["path"]

    render_slide_images(
        update,
        content / "slides" / MODULE_ID / "0085.webp",
        content / "thumbs" / MODULE_ID / "0085.webp",
    )
    append_pdf_page(pdf_path, update)

    with pymupdf.open(pdf_path) as doc:
        pages = doc.page_count
    pdf_bytes = pdf_path.stat().st_size

    module["slides"] = [s for s in module["slides"] if s.get("n") != SLIDE_NUMBER]
    module["slides"].append({"n": SLIDE_NUMBER, "title": update["title"]})
    module["pdf"]["pages"] = pages
    module["pdf"]["bytes"] = pdf_bytes
    module["pdf"]["files"][0]["pages"] = pages
    module["pdf"]["files"][0]["bytes"] = pdf_bytes
    module["render"]["rendered"] = len(module["slides"])
    module["render"]["expected"] = len(module["slides"])
    module["render"]["full_bytes"] = _dir_bytes(content / "slides" / MODULE_ID)
    for topic in module["topics"]:
        if topic.get("id") == "t11":
            topic["to"] = SLIDE_NUMBER
            topic["count"] = topic["to"] - topic["from"] + 1

    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    manifest["generatedAt"] = generated_at
    manifest["totals"] = _recalculate_totals(manifest)

    search = _load_json(search_path)
    search = [x for x in search if not (x.get("m") == MODULE_ID and x.get("n") == SLIDE_NUMBER)]
    search.append(
        {
            "m": MODULE_ID,
            "n": SLIDE_NUMBER,
            "t": update["title"],
            "x": " ".join(update["bullets"]),
        }
    )

    report = _load_json(report_path)
    report_module = next(m for m in report["modules"] if m["id"] == MODULE_ID)
    report_module["pages"] = pages
    report_module["rendered"] = len(module["slides"])
    report["generatedAt"] = generated_at
    report["totals"] = dict(manifest["totals"])

    _write_json(manifest_path, manifest)
    _write_json(search_path, search)
    report["manifestBytes"] = manifest_path.stat().st_size
    report["searchBytes"] = search_path.stat().st_size
    _write_json(report_path, report, indent=1)
    return {"slide": SLIDE_NUMBER, "pages": pages}


def check(root: Path) -> list[str]:
    """Verifica la coerenza dell’iniezione senza modificare i file."""
    content = root / "content"
    manifest = _load_json(content / "manifest.json")
    search = _load_json(content / "search.json")
    report = _load_json(content / "scan-report.json")
    module = next((m for m in manifest["modules"] if m["id"] == MODULE_ID), None)
    if module is None:
        return [f"modulo mancante nel manifest: {MODULE_ID}"]

    problems: list[str] = []
    slide = content / "slides" / MODULE_ID / "0085.webp"
    thumb = content / "thumbs" / MODULE_ID / "0085.webp"
    if not slide.exists():
        problems.append(f"slide mancante: {slide}")
    if not thumb.exists():
        problems.append(f"miniatura mancante: {thumb}")
    if module["pdf"]["pages"] != SLIDE_NUMBER:
        problems.append(f"pdf.pages {module['pdf']['pages']} != {SLIDE_NUMBER}")
    if len([s for s in module["slides"] if s.get("n") == SLIDE_NUMBER]) != 1:
        problems.append("slides: voce n=85 mancante o duplicata")
    hits = [x for x in search if x.get("m") == MODULE_ID and x.get("n") == SLIDE_NUMBER]
    if len(hits) != 1:
        problems.append(f"search.json: {len(hits)} voci n=85 invece di 1")
    if report.get("totals") != manifest.get("totals"):
        problems.append("scan-report.json: totali diversi dal manifest")
    return problems


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verifica senza scrivere")
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help="root del repository")
    args = parser.parse_args(argv)
    if args.check:
        problems = check(args.root)
        if problems:
            for problem in problems:
                print(problem, file=sys.stderr)
            return 1
        print("check ok")
        return 0
    print(apply(args.root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
