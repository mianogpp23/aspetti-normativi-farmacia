#!/usr/bin/env python3
"""Render the course PDF into portable slide images and a JSON catalog."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

try:
    from scripts.slide_catalog import SLIDES
except ModuleNotFoundError:
    from slide_catalog import SLIDES

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "assets" / "data" / "slides.json"
DEFAULT_IMAGES_DIR = ROOT / "assets" / "slides"


def _require_pdftoppm() -> str:
    executable = shutil.which("pdftoppm")
    if executable is None:
        raise RuntimeError("pdftoppm non è installato (Poppler mancante)")
    return executable


def _render_images(source_pdf: Path, images_dir: Path) -> None:
    executable = _require_pdftoppm()
    images_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="mappa-globo-slides-") as temporary:
        prefix = Path(temporary) / "page"
        subprocess.run(
            [
                executable,
                "-jpeg",
                "-r",
                "120",
                "-jpegopt",
                "quality=84,progressive=y,optimize=y",
                str(source_pdf),
                str(prefix),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        rendered = sorted(
            Path(temporary).glob("page-*.jpg"),
            key=lambda path: int(path.stem.rsplit("-", 1)[1]),
        )
        if len(rendered) != len(SLIDES):
            raise RuntimeError(
                f"il PDF contiene {len(rendered)} pagine, ma il catalogo ne richiede {len(SLIDES)}"
            )

        for slide, rendered_file in zip(SLIDES, rendered, strict=True):
            number = int(slide["number"])
            target = images_dir / f"slide-{number:02d}.jpg"
            shutil.move(str(rendered_file), target)


def build_catalog(
    source_pdf: Path,
    output_json: Path,
    images_dir: Path,
) -> list[dict[str, object]]:
    """Copy the source, render all slides, and write the relative JSON catalog."""
    source_pdf = source_pdf.expanduser().resolve()
    output_json = output_json.expanduser().resolve()
    images_dir = images_dir.expanduser().resolve()

    if not source_pdf.is_file():
        raise FileNotFoundError(f"PDF sorgente non trovato: {source_pdf}")

    project_root = output_json.parents[2]
    source_copy = project_root / "assets" / "source" / "slides.pdf"
    source_copy.parent.mkdir(parents=True, exist_ok=True)
    if source_pdf != source_copy:
        shutil.copy2(source_pdf, source_copy)

    _render_images(source_copy, images_dir)

    records: list[dict[str, object]] = []
    for slide in SLIDES:
        number = int(slide["number"])
        records.append(
            {
                **slide,
                "image": f"assets/slides/slide-{number:02d}.jpg",
                "sourcePage": number,
            }
        )

    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return records


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Genera JPEG e catalogo JSON dalle slide del PDF sorgente."
    )
    parser.add_argument(
        "--source",
        type=Path,
        required=True,
        help="percorso del PDF sorgente originale",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"percorso JSON (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--images-dir",
        type=Path,
        default=DEFAULT_IMAGES_DIR,
        help=f"directory JPEG (default: {DEFAULT_IMAGES_DIR})",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    records = build_catalog(args.source, args.output, args.images_dir)
    print(f"Generate {len(records)} slide e {args.output}")


if __name__ == "__main__":
    main()
