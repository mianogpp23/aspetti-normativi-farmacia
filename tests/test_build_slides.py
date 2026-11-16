"""Tests for the slide catalog and PDF build pipeline."""

from __future__ import annotations

import importlib
import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

EXPECTED_CATEGORIES = {
    "introduzione",
    "fondamenti",
    "prescrizione",
    "tipi-di-ricetta",
    "ricetta-rossa",
    "dematerializzazione",
    "stupefacenti",
    "registri",
    "adempimenti",
}


class SlideCatalogTests(unittest.TestCase):
    """The catalog is the single source of truth for slide metadata."""

    def load_catalog(self):
        spec = importlib.util.find_spec("scripts.slide_catalog")
        self.assertIsNotNone(spec, "scripts.slide_catalog must exist")
        return importlib.import_module("scripts.slide_catalog")

    def test_catalog_contains_exactly_84_slides(self) -> None:
        catalog = self.load_catalog()
        self.assertEqual(len(catalog.SLIDES), 84)

    def test_slide_numbers_are_complete_and_unique(self) -> None:
        catalog = self.load_catalog()
        numbers = [slide["number"] for slide in catalog.SLIDES]
        self.assertEqual(numbers, list(range(1, 85)))

    def test_every_slide_has_a_normalized_title(self) -> None:
        catalog = self.load_catalog()
        for slide in catalog.SLIDES:
            with self.subTest(slide=slide.get("number")):
                title = slide["title"]
                self.assertIsInstance(title, str)
                self.assertTrue(title.strip())
                self.assertEqual(title, title.strip())
                self.assertNotIn("\n", title)

    def test_every_slide_uses_a_known_category(self) -> None:
        catalog = self.load_catalog()
        self.assertEqual(set(catalog.CATEGORIES), EXPECTED_CATEGORIES)
        for slide in catalog.SLIDES:
            with self.subTest(slide=slide.get("number")):
                self.assertIn(slide["category"], catalog.CATEGORIES)

    def test_every_category_contains_at_least_one_slide(self) -> None:
        catalog = self.load_catalog()
        used = {slide["category"] for slide in catalog.SLIDES}
        self.assertEqual(used, EXPECTED_CATEGORIES)

    def test_catalog_covers_first_and_last_slide(self) -> None:
        catalog = self.load_catalog()
        self.assertEqual(catalog.SLIDES[0]["number"], 1)
        self.assertEqual(catalog.SLIDES[-1]["number"], 84)
        self.assertIn("GESTIONE", catalog.SLIDES[0]["title"].upper())
        self.assertIn("GRAZIE", catalog.SLIDES[-1]["title"].upper())


if __name__ == "__main__":
    unittest.main()
