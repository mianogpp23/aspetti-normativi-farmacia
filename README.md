# Mappa mentale — Gestione dei medicinali uso umano

Sito statico che trasforma il corso FAD "Gestione dei medicinali uso umano e disciplina di
dispensazione al pubblico" (Dott. Michele Dalfino Spinelli) in una **mappa mentale a forma di
globo**: 84 nodi cliccabili, uno per slide, con ricerca per titolo o numero, filtri per area
tematica ed elenco accessibile. Ogni nodo apre la slide originale in un visualizzatore con
navigazione avanti/indietro.

Il progetto è pensato per **GitHub Pages**: niente backend, niente dipendenze remote, percorsi
relativi, funzionamento offline.

## Avvio locale

```bash
python3 -m http.server 8091 --bind 127.0.0.1
```

Poi apri `http://127.0.0.1:8091/`.

## Rigenerare le slide dal PDF sorgente

Il PDF originale è incluso in `assets/source/slides.pdf` (non modificato). Per rigenerare
JPEG e catalogo:

```bash
python3 scripts/build_slides.py --source assets/source/slides.pdf
```

Per usare un altro PDF sorgente, passa il percorso con `--source`. Il build richiede
Poppler (`pdftoppm`).

## Test

```bash
python3 -m unittest discover -s tests -v
npm run test:model
python3 scripts/smoke_test.py
```

## Struttura

- `index.html` — shell dell'applicazione.
- `assets/css/styles.css` — stile e layout responsive.
- `assets/js/app.js` — interazione, filtri, visualizzatore slide.
- `assets/js/map-model.js` — modello puro del grafo (testabile con Node).
- `assets/vendor/echarts.min.js` — ECharts 6.1.0 locale (nessun CDN).
- `assets/data/slides.json` — catalogo delle 84 slide.
- `assets/slides/slide-NN.jpg` — slide rasterizzate a 120 dpi.
- `assets/source/slides.pdf` — PDF originale, copia integrale.
- `scripts/build_slides.py` — pipeline PDF → JPEG + JSON.
- `scripts/smoke_test.py` — smoke test headless con Chromium.
- `tests/` — test Python e Node.

## Pubblicazione su GitHub Pages

1. Crea un repository GitHub e carica il contenuto di questa cartella.
2. In *Settings → Pages*, scegli *Deploy from a branch* e seleziona `main` / `/ (root)`.
3. Il file `.nojekyll` disabilita il processing Jekyll e garantisce la pubblicazione statica.
4. L'URL risultante è del tipo `https://<utente>.github.io/<repo>/`.

Nessun build step è richiesto: il sito è già pronto.

## Note

- Nessun CDN o risorsa remota: tutto è incluso localmente.
- Tutti i percorsi sono relativi: il sito funziona sia in locale sia sotto un sottopercorso Pages.
- Licenza da definire prima della pubblicazione pubblica.
