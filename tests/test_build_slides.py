"""Tests for the slide catalog and PDF build pipeline."""

from __future__ import annotations

import importlib
import importlib.util
import json
import sys
import tempfile
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


class BuildPipelineTests(unittest.TestCase):
    """The PDF pipeline produces deterministic, portable slide artifacts."""

    def load_builder(self):
        spec = importlib.util.find_spec("scripts.build_slides")
        self.assertIsNotNone(spec, "scripts.build_slides must exist")
        return importlib.import_module("scripts.build_slides")

    def test_build_catalog_creates_84_valid_relative_artifacts(self) -> None:
        builder = self.load_builder()
        source = ROOT / "assets" / "source" / "slides.pdf"
        self.assertTrue(source.is_file(), "the project copy of the source PDF must exist")

        with tempfile.TemporaryDirectory() as temporary:
            project_root = Path(temporary)
            output_json = project_root / "assets" / "data" / "slides.json"
            images_dir = project_root / "assets" / "slides"

            records = builder.build_catalog(source, output_json, images_dir)

            self.assertEqual(len(records), 84)
            images = sorted(images_dir.glob("slide-*.jpg"))
            self.assertEqual(len(images), 84)
            self.assertEqual(images[0].name, "slide-01.jpg")
            self.assertEqual(images[-1].name, "slide-84.jpg")
            for image in images:
                with self.subTest(image=image.name):
                    data = image.read_bytes()
                    self.assertGreater(len(data), 1_000)
                    self.assertTrue(data.startswith(b"\xff\xd8"))
                    self.assertTrue(data.endswith(b"\xff\xd9"))

            payload = json.loads(output_json.read_text(encoding="utf-8"))
            self.assertEqual(payload, records)
            for record in records:
                with self.subTest(slide=record["number"]):
                    self.assertFalse(Path(record["image"]).is_absolute())
                    self.assertTrue(record["image"].startswith("assets/slides/"))
                    self.assertEqual(record["sourcePage"], record["number"])

            copied_source = project_root / "assets" / "source" / "slides.pdf"
            self.assertTrue(copied_source.is_file())
            self.assertEqual(copied_source.read_bytes(), source.read_bytes())


if __name__ == "__main__":
    unittest.main()
