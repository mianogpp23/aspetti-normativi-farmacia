#!/usr/bin/env python3
"""Applica la slide di aggiornamento 85 al contenuto generato dal sito orbitale."""

from pathlib import Path


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
