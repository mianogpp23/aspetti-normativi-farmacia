# Aggiornamento slide ricetta stupefacenti non SSN — Implementation Plan

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** Aggiungere come slide n. 85 del modulo “Gestione dei medicinali uso umano e disciplina di dispensazione al pubblico” l’aggiornamento sulla dematerializzazione delle ricette stupefacenti non SSN dal 23/11/2026, con metadati, ricerca, thumbnail e PDF aggiornati e riapplicabili.

**架构：** Si versiona un file Markdown con il testo della slide e uno script `scripts/apply_update_slide.py` che lo renderizza in WebP, aggiunge una pagina al PDF pubblicato con save incrementale e reinietta le voci in `manifest.json`, `search.json` e `scan-report.json`. Lo script è idempotente (ricomputa i totali, non incrementa due volte) e ha una modalità `--check`. L’archivio PDF sorgente esterno non viene toccato.

**技术栈：** Python 3.12, Pillow (WebP), PyMuPDF (`pymupdf`), `unittest` della stdlib; repository statico senza build step.

**规格：** `docs/superpowers/specs/2026-11-21-aggiornamento-slide-ricetta-stupefacenti-non-ssn-design.md`

## 全局约束

- Branch: `aggiornamento-slide-ricetta-stupefacenti-2026`, creata da `origin/main = 10a960e`. Non fare commit su `main`.
- Modulo target: `gestione-dei-medicinali-uso-umano-e-disciplina-di-dispensazione-al`.
- Slide: `n = 85`; il modulo passa da 84 a 85 pagine.
- Titolo esatto della slide: `AGGIORNAMENTO 23 NOVEMBRE 2026 — Ricetta elettronica stupefacenti non SSN`.
- Testo esatto: 4 bullet come nel design, con decorrenza `23/11/2026`, sezioni `B, C, D, E`, esclusioni sezione A e preparazioni magistrali, SAC del Sistema Tessera sanitaria, modalità di dispensazione e obbligo di accettazione.
- Nessuna modifica alle 84 slide esistenti né all’archivio sorgente esterno.
- Nessuna dipendenza nuova: Pillow e PyMuPDF sono già installati.
- Tutti i test usano `unittest`; nessun framework aggiuntivo.

## 审查重点（Review Focus）

1. **Seconda esecuzione dello script:** ci si aspetta ancora una sola slide 85, 85 pagine e un solo risultato di ricerca — il test di idempotenza in Task 3 lo verifica.
2. **Markdown sorgente con intestazioni mancanti o diverse:** ci si aspetta un errore esplicito, non una slide vuota — il test `test_load_update_rejects_missing_sections` in Task 1 lo verifica.
3. **PDF con pagina 85 già presente:** ci si aspetta che lo script non aggiunga una pagina doppia — il test `test_append_pdf_page_skips_existing_page` in Task 2 lo verifica.
4. **Immagine full e thumb con dimensioni sbagliate:** ci si aspetta 1600×900 e 420×236 — il test `test_render_slide_images_dimensions` in Task 2 lo verifica.
5. **Voce di ricerca duplicata per `n=85`:** ci si aspetta una sola voce con titolo e testo corretti — il test `test_apply_replaces_existing_search_entry` in Task 3 lo verifica.

---

## File structure

| File | Responsabilità |
|---|---|
| `content/updates/2026-11-23-ricetta-stupefacenti-non-ssn.md` | Fonte testuale versionata della slide 85 |
| `content/updates/README.md` | Avviso: dopo `scripts/scan.py` rieseguire `apply_update_slide.py` |
| `scripts/apply_update_slide.py` | Parser, renderer WebP/PDF, iniezione metadati, `--check` |
| `scripts/test_apply_update_slide.py` | Test unitari con fixture temporanee |
| `content/slides/<id>/0085.webp` | Slide generata (1600×900) |
| `content/thumbs/<id>/0085.webp` | Miniatura generata (420×236) |
| `content/pdf/<id>.pdf` | PDF pubblicato con pagina 85 aggiunta |
| `content/manifest.json`, `content/search.json`, `content/scan-report.json` | Metadati aggiornati |
| `docs/superpowers/plans/...md` | Questo piano |

---

### Task 1: Fonte testuale e parser

**File:**
- Crea: `content/updates/2026-11-23-ricetta-stupefacenti-non-ssn.md`
- Crea: `content/updates/README.md`
- Crea: `scripts/apply_update_slide.py` (solo `load_update`)
- Test: `scripts/test_apply_update_slide.py`

- [ ] **Step 1: scrivi il test che fallisce**

In `scripts/test_apply_update_slide.py` crea:

```python
class LoadUpdateTest(unittest.TestCase):
    def test_load_update_parses_title_bullets_sources(self):
        path = FIXTURES / "update.md"
        u = load_update(path)
        self.assertEqual(u["title"], "AGGIORNAMENTO 23 NOVEMBRE 2026 — Ricetta elettronica stupefacenti non SSN")
        self.assertEqual(len(u["bullets"]), 4)
        self.assertIn("23/11/2026", u["bullets"][0])
        self.assertIn("SAC del Sistema Tessera sanitaria", u["bullets"][1])
        self.assertEqual(len(u["sources"]), 2)

    def test_load_update_rejects_missing_sections(self):
        path = FIXTURES / "update-missing.md"
        with self.assertRaises(ValueError) as ctx:
            load_update(path)
        self.assertIn("## Testo", str(ctx.exception))
```

`FIXTURES / "update.md"` deve avere esattamente le sezioni `## Titolo`, `## Testo` (4 righe che iniziano con `- `), `## Fonti` (2 URL che iniziano con `- `). `update-missing.md` omette `## Testo`.

- [ ] **Step 2: esegui il test e verifica che fallisca**

Run: `python3 -m unittest scripts.test_apply_update_slide.LoadUpdateTest -v`
Expected: FAIL con `ImportError`/`NameError` perché `load_update` non esiste ancora.

- [ ] **Step 3: implementa il Markdown sorgente**

`content/updates/2026-11-23-ricetta-stupefacenti-non-ssn.md` deve contenere i 4 bullet esatti del design e le due URL delle fonti. `content/updates/README.md` deve dire: “Questo file è la fonte della slide 85. Dopo una rigenerazione con `python3 scripts/scan.py`, rieseguire `python3 scripts/apply_update_slide.py`.”

- [ ] **Step 4: implementa `load_update(path: Path) -> dict`**

In `scripts/apply_update_slide.py`: firma esatta; analizza le tre sezioni; solleva `ValueError(f"sezione mancante: {name}")` se `## Titolo`, `## Testo` o `## Fonti` non sono presenti; restituisce `{"title": str, "bullets": list[str], "sources": list[str], "effective_date": "23/11/2026"}`.

- [ ] **Step 5: esegui il test e verifica che passi**

Run: `python3 -m unittest scripts.test_apply_update_slide.LoadUpdateTest -v`
Expected: PASS (2 test).

- [ ] **Step 6: commit**

```bash
git add content/updates scripts/apply_update_slide.py scripts/test_apply_update_slide.py
git commit -m "feat: aggiunge fonte testuale e parser per slide 85"
```

---

### Task 2: Rendering slide, thumbnail e pagina PDF

**File:**
- Modifica: `scripts/apply_update_slide.py` (`render_slide_images`, `append_pdf_page`)
- Test: `scripts/test_apply_update_slide.py`

- [ ] **Step 1: scrivi i test che falliscono**

```python
class RenderTest(unittest.TestCase):
    def test_render_slide_images_dimensions(self):
        render_slide_images(UPDATE, TMP / "0085.webp", TMP / "thumb.webp")
        from PIL import Image
        self.assertEqual(Image.open(TMP / "0085.webp").size, (1600, 900))
        self.assertEqual(Image.open(TMP / "thumb.webp").size, (420, 236))

    def test_append_pdf_page_skips_existing_page(self):
        pdf = make_fixture_pdf(pages=85)   # helper nel test
        before = fitz.open(pdf).page_count
        append_pdf_page(pdf, UPDATE)
        self.assertEqual(fitz.open(pdf).page_count, before)
```

`make_fixture_pdf(pages)` crea un PDF temporaneo con `pages` pagine vuote 720×405.36 via PyMuPDF.

- [ ] **Step 2: esegui i test e verifica che falliscano**

Run: `python3 -m unittest scripts.test_apply_update_slide.RenderTest -v`
Expected: FAIL perché le funzioni non esistono.

- [ ] **Step 3: implementa `render_slide_images(update: dict, out_slide: Path, out_thumb: Path) -> None`**

Full image 1600×900, sfondo `#0B1F33`, titolo bianco 52 px, bullet `#D9E7F5` 30 px con interlinea 46, accento `#4FC3F7`; font `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf` con fallback a `DejaVuSans` ricercato in `/usr/share/fonts`; wrap del testo a 1500 px. Salva WebP quality=88. Thumb: stessa immagine ridimensionata a larghezza 420, altezza 236 con LANCZOS.

- [ ] **Step 4: implementa `append_pdf_page(pdf_path: Path, update: dict) -> None`**

Apri con `fitz.open(pdf_path)`; se `page_count >= 85` ritorna subito; altrimenti `new_page(width=720, height=405.36)`, inserisci titolo e bullet con `insert_textbox` (font `helv`, colori equivalenti), poi `doc.saveIncr()`. Non riscrivere le pagine esistenti.

- [ ] **Step 5: esegui i test e verifica che passino**

Run: `python3 -m unittest scripts.test_apply_update_slide.RenderTest -v`
Expected: PASS (2 test).

- [ ] **Step 6: commit**

```bash
git add scripts/apply_update_slide.py scripts/test_apply_update_slide.py
git commit -m "feat: genera slide 85 e pagina PDF"
```

---

### Task 3: Iniezione metadati, idempotenza e check

**File:**
- Modifica: `scripts/apply_update_slide.py` (`apply`, `check`, `main`)
- Test: `scripts/test_apply_update_slide.py`

- [ ] **Step 1: scrivi i test che falliscono**

```python
class ApplyTest(unittest.TestCase):
    def test_apply_is_idempotent_and_updates_manifest_search_report(self):
        root = make_content_fixture(pages=84)  # helper copia i 3 JSON + PDF + cartelle vuote
        stats1 = apply(root)
        self.assertEqual(stats1["slide"], 85)
        m = json.load(open(root / "content/manifest.json"))
        mod = next(x for x in m["modules"] if x["id"] == MODULE_ID)
        self.assertEqual(mod["pdf"]["pages"], 85)
        self.assertEqual(mod["slides"][-1]["n"], 85)
        self.assertEqual(next(t for t in mod["topics"] if t["id"] == "t11")["to"], 85)
        s = json.load(open(root / "content/search.json"))
        hits = [x for x in s if x["m"] == MODULE_ID and x["n"] == 85]
        self.assertEqual(len(hits), 1)
        r = json.load(open(root / "content/scan-report.json"))
        self.assertEqual(r["totals"]["pages"], 726)
        apply(root)
        m2 = json.load(open(root / "content/manifest.json"))
        s2 = json.load(open(root / "content/search.json"))
        mod2 = next(x for x in m2["modules"] if x["id"] == MODULE_ID)
        self.assertEqual(mod2["pdf"]["pages"], 85)
        self.assertEqual(len([x for x in s2 if x["m"] == MODULE_ID and x["n"] == 85]), 1)

    def test_apply_replaces_existing_search_entry(self):
        root = make_content_fixture(pages=85, with_search_entry=True)
        apply(root)
        s = json.load(open(root / "content/search.json"))
        self.assertEqual(len([x for x in s if x["m"] == MODULE_ID and x["n"] == 85]), 1)

    def test_check_reports_missing_slide(self):
        root = make_content_fixture(pages=84)
        problems = check(root)
        self.assertTrue(any("0085.webp" in p for p in problems))
```

`make_content_fixture` copia i veri `manifest.json`, `search.json`, `scan-report.json` dal repo in una temp dir, crea un PDF con `pages` pagine 720×405.36 e cartelle `slides/<id>`, `thumbs/<id>` vuote.

- [ ] **Step 2: esegui i test e verifica che falliscano**

Run: `python3 -m unittest scripts.test_apply_update_slide.ApplyTest -v`
Expected: FAIL perché `apply` e `check` non esistono.

- [ ] **Step 3: implementa `apply(root: Path) -> dict`**

Firma esatta. Passi: `load_update(UPDATE_MD)`; `render_slide_images`; `append_pdf_page`; rimuovi dal manifest ogni voce con `n=85` e aggiungi `{"n":85,"title":update["title"]}`; aggiorna `pdf.pages/bytes`, `files[0].pages/bytes`, `render.rendered/expected/full_bytes`; estendi il topic `t11` a `to=85` e `count+=1`; rimuovi/aggiungi voce in `search.json` come `{"m":MODULE_ID,"n":85,"t":title,"x":" ".join(bullets)}`; aggiorna `scan-report.json` e i totali di `manifest.json` ricalcolandoli dai moduli; imposta `generatedAt` con data/ora ISO locale. Ritorna `{"slide":85, "pages":85}`.

- [ ] **Step 4: implementa `check(root: Path) -> list[str]`**

Firma esatta. Ritorna un elenco di problemi: file slide/thumb mancanti, `pdf.pages != 85`, `slides` senza `n=85`, `search.json` senza voce `n=85`, `scan-report` con totali diversi dal manifest. Ritorna `[]` se tutto coerente.

- [ ] **Step 5: implementa `main(argv=None) -> int`**

Argparse con `--check` e `--root PATH` (default: root del repo). Stampa i problemi di `check()` e ritorna 1 se ce ne sono; altrimenti esegue `apply()` e stampa lo stats dict, ritornando 0.

- [ ] **Step 6: esegui tutti i test e verifica che passino**

Run: `python3 -m unittest scripts.test_apply_update_slide -v`
Expected: PASS (7 test).

- [ ] **Step 7: commit**

```bash
git add scripts/apply_update_slide.py scripts/test_apply_update_slide.py
git commit -m "feat: applica slide 85 in modo idempotente con check"
```

---

### Task 4: Applicazione reale e verifica finale

**File:**
- Modifica: `content/slides/<id>/0085.webp`, `content/thumbs/<id>/0085.webp`, `content/pdf/<id>.pdf`, `content/manifest.json`, `content/search.json`, `content/scan-report.json`

- [ ] **Step 1: applica la slide al content reale**

Run: `python3 scripts/apply_update_slide.py`
Expected: stampa `{'slide': 85, 'pages': 85}`; nessun errore.

- [ ] **Step 2: verifica con la modalità check**

Run: `python3 scripts/apply_update_slide.py --check`
Expected: exit 0, nessun problema stampato.

- [ ] **Step 3: verifica integrità dei file**

Run:

```bash
python3 - <<'PY'
import json, pymupdf
from PIL import Image
from pathlib import Path
root = Path('.')
mid = 'gestione-dei-medicinali-uso-umano-e-disciplina-di-dispensazione-al'
m = json.load(open(root/'content/manifest.json'))
mod = next(x for x in m['modules'] if x['id'] == mid)
assert mod['pdf']['pages'] == 85
assert mod['slides'][-1]['n'] == 85
assert pymupdf.open(root/mod['pdf']['path']).page_count == 85
assert Image.open(root/'content/slides'/mid/'0085.webp').size == (1600, 900)
assert Image.open(root/'content/thumbs'/mid/'0085.webp').size == (420, 236)
s = json.load(open(root/'content/search.json'))
assert len([x for x in s if x['m'] == mid and x['n'] == 85]) == 1
print('VERIFICA OK')
PY
```

Expected: `VERIFICA OK`.

- [ ] **Step 4: verifica ricerca testuale**

Run:

```bash
python3 - <<'PY'
import json
s = json.load(open('content/search.json'))
hits = [x for x in s if 'stupefacenti non SSN' in (x.get('t','')+' '+x.get('x','')).lower()]
print(len(hits), hits[0]['n'] if hits else None)
PY
```

Expected: almeno 1 hit con `n == 85`.

- [ ] **Step 5: commit**

```bash
git add content/
git commit -m "feat: aggiunge slide 85 aggiornamento stupefacenti non SSN"
```

- [ ] **Step 6: push della branch**

```bash
git push -u origin aggiornamento-slide-ricetta-stupefacenti-2026
```

Expected: push riuscito; **non** creare PR né toccare `main` senza ulteriore conferma.
