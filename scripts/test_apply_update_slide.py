import json
import shutil
import tempfile
import unittest
from pathlib import Path

import pymupdf

from scripts.apply_update_slide import (
    append_pdf_page,
    apply,
    check,
    load_update,
    render_slide_images,
)

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


REPO_ROOT = Path(__file__).resolve().parents[1]
MODULE_ID = "gestione-dei-medicinali-uso-umano-e-disciplina-di-dispensazione-al"


def make_content_fixture(pages: int, with_search_entry: bool = False) -> Path:
    root = Path(tempfile.mkdtemp(prefix="globo-update-apply-"))
    content = root / "content"
    content.mkdir()
    for name in ("manifest.json", "search.json", "scan-report.json"):
        shutil.copy(REPO_ROOT / "content" / name, content / name)

    manifest_path = content / "manifest.json"
    report_path = content / "scan-report.json"
    search_path = content / "search.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    report = json.loads(report_path.read_text(encoding="utf-8"))
    search = json.loads(search_path.read_text(encoding="utf-8"))
    module = next(m for m in manifest["modules"] if m["id"] == MODULE_ID)
    report_module = next(m for m in report["modules"] if m["id"] == MODULE_ID)

    pdf_path = root / module["pdf"]["path"]
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open()
    for _ in range(pages):
        doc.new_page(width=720, height=405.36)
    doc.save(pdf_path)
    doc.close()

    pdf_bytes = pdf_path.stat().st_size
    module["pdf"]["pages"] = pages
    module["pdf"]["bytes"] = pdf_bytes
    module["pdf"]["files"][0]["pages"] = pages
    module["pdf"]["files"][0]["bytes"] = pdf_bytes
    module["render"]["rendered"] = pages
    module["render"]["expected"] = pages
    module["slides"] = module["slides"][:pages]
    manifest["totals"]["pages"] += pages - 84
    manifest["totals"]["renderedImages"] += pages - 84
    manifest["totals"]["pdfBytes"] += pdf_bytes - 3992511
    report_module["pages"] = pages
    report_module["rendered"] = pages
    report["totals"]["pages"] = manifest["totals"]["pages"]
    report["totals"]["renderedImages"] = manifest["totals"]["renderedImages"]
    report["totals"]["pdfBytes"] = manifest["totals"]["pdfBytes"]

    if with_search_entry:
        for text in ("vecchia voce", "voce esistente"):
            search.append(
                {"m": MODULE_ID, "n": 85, "t": "Vecchia voce", "x": text}
            )

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    report_path.write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")
    search_path.write_text(json.dumps(search, ensure_ascii=False), encoding="utf-8")
    (content / "slides" / MODULE_ID).mkdir(parents=True, exist_ok=True)
    (content / "thumbs" / MODULE_ID).mkdir(parents=True, exist_ok=True)
    return root


def _load_json(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


class ApplyTest(unittest.TestCase):
    def test_apply_is_idempotent_and_updates_manifest_search_report(self):
        root = make_content_fixture(pages=84)
        stats = apply(root)
        self.assertEqual(stats, {"slide": 85, "pages": 85})

        manifest = _load_json(root / "content/manifest.json")
        module = next(m for m in manifest["modules"] if m["id"] == MODULE_ID)
        self.assertEqual(module["pdf"]["pages"], 85)
        self.assertEqual(module["slides"][-1]["n"], 85)
        topic = next(t for t in module["topics"] if t["id"] == "t11")
        self.assertEqual(topic["to"], 85)
        self.assertEqual(topic["count"], 6)

        search = _load_json(root / "content/search.json")
        hits = [x for x in search if x["m"] == MODULE_ID and x["n"] == 85]
        self.assertEqual(len(hits), 1)
        self.assertIn("stupefacenti non ssn", hits[0]["t"].lower())

        report = _load_json(root / "content/scan-report.json")
        self.assertEqual(report["totals"]["pages"], 726)

        apply(root)
        manifest2 = _load_json(root / "content/manifest.json")
        module2 = next(m for m in manifest2["modules"] if m["id"] == MODULE_ID)
        search2 = _load_json(root / "content/search.json")
        self.assertEqual(module2["pdf"]["pages"], 85)
        self.assertEqual(
            len([x for x in search2 if x["m"] == MODULE_ID and x["n"] == 85]), 1
        )

    def test_apply_replaces_existing_search_entry(self):
        root = make_content_fixture(pages=85, with_search_entry=True)
        apply(root)
        search = _load_json(root / "content/search.json")
        self.assertEqual(
            len([x for x in search if x["m"] == MODULE_ID and x["n"] == 85]), 1
        )

    def test_check_reports_missing_slide(self):
        root = make_content_fixture(pages=84)
        problems = check(root)
        self.assertTrue(any("0085.webp" in problem for problem in problems))


if __name__ == "__main__":
    unittest.main()
