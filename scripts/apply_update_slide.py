#!/usr/bin/env python3
"""Applica la slide di aggiornamento 85 al contenuto generato dal sito orbitale."""

from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont

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
