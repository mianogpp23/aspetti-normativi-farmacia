# Mappa-globo dei medicinali

Sito statico che trasforma il PDF del corso FAD “Gestione dei medicinali uso umano e disciplina di dispensazione al pubblico” in una mappa mentale-globo interattiva.

## Obiettivo

Ogni nodo rappresenta una delle 84 slide. Il clic apre la slide corrispondente in un visualizzatore accessibile, con navigazione, ricerca e filtri per argomento.

## Stack

- HTML, CSS e JavaScript ES modules.
- ECharts 6.1.0 vendorizzato in `assets/vendor/`.
- Python 3 standard library per catalogo e pipeline PDF.
- Poppler `pdftoppm` per rasterizzare le slide.
- Node.js 22 `--test` per il modello del grafo.
- Chromium headless per lo smoke test browser.

## Struttura

```text
assets/css/       stile responsive e accessibile
assets/data/      catalogo JSON delle 84 slide
assets/js/        modello del grafo e interfaccia
assets/slides/    slide JPEG locali
assets/source/    copia del PDF sorgente
assets/vendor/    ECharts locale
scripts/          build e smoke test
tests/            test Python, Node e harness browser
docs/superpowers/ specifica e piano di implementazione
```

## Comandi

```bash
# rigenera slide e catalogo
python3 scripts/build_slides.py

# test Python
python3 -m unittest discover -s tests -v

# test del modello JavaScript
node --test tests/test_map_model.mjs

# smoke test browser
python3 scripts/smoke_test.py

# server locale
python3 -m http.server 8091 --bind 127.0.0.1
```

## Regole

- Nessuna dipendenza remota: il sito deve funzionare offline.
- Tutti i percorsi pubblicabili sono relativi.
- Il PDF sorgente originale non viene modificato.
- ECharts è incluso localmente; non usare CDN.
- Nessun push GitHub automatico.
- I test devono essere eseguiti prima di dichiarare completato un task.
