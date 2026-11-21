import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply_update_slide import append_pdf_page, load_update, render_slide_images

FIXTURES = Path(tempfile.mkdtemp(prefix="globo-update-fixtures-"))
TMP = Path(tempfile.mkdtemp(prefix="globo-update-render-"))


def _write_fixtures() -> None:
    (FIXTURES / "update.md").write_text(
        "# Aggiornamento 23 novembre 2026 — Ricetta elettronica stupefacenti non SSN\n\n"
        "## Titolo\n"
        "AGGIORNAMENTO 23 NOVEMBRE 2026 — Ricetta elettronica stupefacenti non SSN\n\n"
        "## Testo\n"
        '- Dal 23/11/2026 sono operative le procedure di dematerializzazione (art. 1, comma 317, legge 30/12/2024 n. 207) per le ricette "bianche" non a carico del SSN, ripetibili e non ripetibili, relative alle sezioni B, C, D, E della tabella del DPR 309/1990.\n'
        "- Modalità di dispensazione: il farmacista accetta la ricetta elettronica resa operativa dal SAC del Sistema Tessera sanitaria e trasmette al Sistema TS i dati della ricetta bianca elettronica stupefacenti erogata in farmacia, secondo le specifiche tecniche aggiornate. Nelle Regioni con SAR l'avvio dipende dall'implementazione del sistema.\n"
        "- Restano escluse la sezione A (ricetta ministeriale a ricalco, art. 3 DM 2/11/2011) e le preparazioni magistrali; con la piena attuazione scatta l'obbligo di accettare le ricette elettroniche.\n"
        "- Riferimenti: circolare Fofi; comunicazioni n. 13592/2022, 15175/2024, 15190/2025.\n\n"
        "## Fonti\n"
        "- https://www.ilfarmacistaonline.it/lavoro-e-professioni/articolo.php?articolo_id=135253\n"
        "- https://www.rifday.it/2026/11/19/ricette-stupefacenti-non-a-carico-del-ssn-la-dematerializzazione-parte-il-23-novembre\n",
        encoding="utf-8",
    )
    (FIXTURES / "update-missing.md").write_text(
        "# Aggiornamento\n\n## Titolo\nTitolo di prova\n\n## Fonti\n- https://example.test\n",
        encoding="utf-8",
    )


UPDATE = {
    "title": "AGGIORNAMENTO 23 NOVEMBRE 2026 — Ricetta elettronica stupefacenti non SSN",
    "bullets": [
        'Dal 23/11/2026 sono operative le procedure di dematerializzazione (art. 1, comma 317, legge 30/12/2024 n. 207) per le ricette "bianche" non a carico del SSN, ripetibili e non ripetibili, relative alle sezioni B, C, D, E della tabella del DPR 309/1990.',
        "Modalità di dispensazione: il farmacista accetta la ricetta elettronica resa operativa dal SAC del Sistema Tessera sanitaria e trasmette al Sistema TS i dati della ricetta bianca elettronica stupefacenti erogata in farmacia, secondo le specifiche tecniche aggiornate. Nelle Regioni con SAR l'avvio dipende dall'implementazione del sistema.",
        "Restano escluse la sezione A (ricetta ministeriale a ricalco, art. 3 DM 2/11/2011) e le preparazioni magistrali; con la piena attuazione scatta l'obbligo di accettare le ricette elettroniche.",
        "Riferimenti: circolare Fofi; comunicazioni n. 13592/2022, 15175/2024, 15190/2025.",
    ],
    "sources": [
        "https://www.ilfarmacistaonline.it/lavoro-e-professioni/articolo.php?articolo_id=135253",
        "https://www.rifday.it/2026/11/19/ricette-stupefacenti-non-a-carico-del-ssn-la-dematerializzazione-parte-il-23-novembre",
    ],
    "effective_date": "23/11/2026",
}


def make_fixture_pdf(pages: int) -> Path:
    import pymupdf

    path = TMP / f"fixture-{pages}.pdf"
    doc = pymupdf.open()
    for _ in range(pages):
        doc.new_page(width=720, height=405.36)
    doc.save(path)
    doc.close()
    return path


class LoadUpdateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _write_fixtures()

    def test_load_update_parses_title_bullets_sources(self):
        path = FIXTURES / "update.md"
        u = load_update(path)
        self.assertEqual(
            u["title"],
            "AGGIORNAMENTO 23 NOVEMBRE 2026 — Ricetta elettronica stupefacenti non SSN",
        )
        self.assertEqual(len(u["bullets"]), 4)
        self.assertIn("23/11/2026", u["bullets"][0])
        self.assertIn("SAC del Sistema Tessera sanitaria", u["bullets"][1])
        self.assertEqual(len(u["sources"]), 2)

    def test_load_update_rejects_missing_sections(self):
        path = FIXTURES / "update-missing.md"
        with self.assertRaises(ValueError) as ctx:
            load_update(path)
        self.assertIn("## Testo", str(ctx.exception))


class RenderTest(unittest.TestCase):
    def test_render_slide_images_dimensions(self):
        render_slide_images(UPDATE, TMP / "0085.webp", TMP / "thumb.webp")
        from PIL import Image

        with Image.open(TMP / "0085.webp") as slide:
            self.assertEqual(slide.size, (1600, 900))
        with Image.open(TMP / "thumb.webp") as thumb:
            self.assertEqual(thumb.size, (420, 236))

    def test_append_pdf_page_skips_existing_page(self):
        import pymupdf

        pdf = make_fixture_pdf(pages=85)
        before = pymupdf.open(pdf).page_count
        append_pdf_page(pdf, UPDATE)
        self.assertEqual(pymupdf.open(pdf).page_count, before)


if __name__ == "__main__":
    unittest.main()
