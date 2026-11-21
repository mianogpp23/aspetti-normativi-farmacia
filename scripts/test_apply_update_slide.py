import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply_update_slide import load_update

FIXTURES = Path(tempfile.mkdtemp(prefix="globo-update-fixtures-"))


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


if __name__ == "__main__":
    unittest.main()
