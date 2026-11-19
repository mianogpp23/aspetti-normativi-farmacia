# Piattaforma didattica orbitale — FARMACISTA

Sito statico (HTML + CSS + ES modules, **zero build step**) che trasforma l'archivio delle
dispense PDF in un ambiente didattico navigabile:

- **Mappa orbitale** (`#/`): nodo centrale del corso, moduli didattici su orbite concentriche,
  collegamenti luminosi, hover con pannello informativo, drag per ruotare, vista elenco.
- **Percorso gerarchico** (`#/m/<modulo>`): argomenti in sequenza (rail), sotto-argomenti,
  griglia delle slide con miniature.
- **Visore a schermo intero**: immagine della pagina PDF, navigazione avanti/indietro,
  numero pagina, slider, zoom, scorciatoie da tastiera, link al PDF originale.

## Struttura

```
piattaforma-didattica/
├── index.html
├── favicon.svg
├── config.json          # sorgente + titolo del corso (usato da scripts/scan.py)
├── css/
│   ├── app.css          # design system (token, topbar, ricerca, modali, elenco)
│   ├── orbit.css        # mappa orbitale
│   ├── flow.css         # percorso gerarchico del modulo
│   └── viewer.css       # visore a schermo intero
├── js/
│   ├── utils.js         # helper DOM/format
│   ├── data.js          # unico livello di accesso ai dati (manifest)
│   ├── orbit.js         # mappa orbitale + pannello info
│   ├── flow.js          # argomenti → sotto-argomenti → slide
│   ├── viewer.js        # visore full-screen
│   ├── search.js        # ricerca globale (moduli, argomenti, slide)
│   └── main.js          # bootstrap, hash router, orchestrazione
├── content/             # generato: manifest, indice di ricerca, slide, PDF
│   ├── manifest.json
│   ├── search.json
│   ├── slides/<modulo>/NNNN.webp
│   ├── thumbs/<modulo>/NNNN.webp
│   └── pdf/<modulo>.pdf
└── scripts/scan.py      # scanner + renderer (ricorsivo, nessun elenco hardcoded)
```

## Rigenerare il contenuto

```bash
python3 scripts/scan.py            # scansione + rendering completo
python3 scripts/scan.py --no-render  # solo indice, nessuna immagine
python3 scripts/scan.py --only <slug>  # un singolo modulo
```

Lo scanner legge `config.json` (`source` = cartella radice dell'archivio), individua
ricorsivamente PDF e video, estrae i titoli dalle pagine, raggruppa le pagine in argomenti,
copia i PDF in `content/pdf/` e genera le immagini WebP delle slide.
L'archivio originale non viene mai modificato: nessun file è spostato, rinominato o cancellato.

## Avvio locale

```bash
python3 -m http.server 8899
# http://127.0.0.1:8899/index.html
```

Il sito usa solo percorsi relativi, quindi funziona sia in radice sia in sottocartella
(es. `https://utente.github.io/nome-repo/`).

## Pubblicazione su GitHub Pages

**Il repository GitHub corrisponde a questa cartella** (`piattaforma-didattica/`), non
all’archivio: i video originali (19 MP4, 4.35 GB, 10 file oltre i 100 MB) restano
*fuori* dal repository per costruzione e non possono mai far fallire un push.
Le copie dei 18 PDF delle dispense sono incluse in `content/pdf/` e quindi online.

```bash
git init -b main          # già presente in questa cartella
git add .
git commit -m "feat: piattaforma didattica orbitale"
git remote add origin git@github.com:utente/nome-repo.git
git push -u origin main
```

Poi in **Settings → Pages** scegliere *Source: GitHub Actions*: il workflow
`.github/workflows/pages.yml` pubblica la radice del repository ad ogni push.
Il file `.nojekyll` evita l’elaborazione Jekyll e mantiene le cartelle intatte.

URL risultante: `https://utente.github.io/nome-repo/` (il sito usa solo percorsi
relativi, quindi funziona anche se ospitato in una sottocartella).

## Contenuto attuale

19 moduli · 18 PDF · 725 slide · 120 argomenti · 19 video (video non copiati nel sito).

## Note operative

- `scripts/scan.py` esegue la potatura degli artefatti obsoleti: a ogni scansione
  elimina da `content/` le copie e le immagini riferite a moduli ormai inesistenti,
  così il contenuto pubblicato non accumula residui.
- Il manifest pubblicato contiene solo il *nome* della cartella sorgente, mai un
  percorso assoluto della macchina che ha generato il sito.
- In `--no-render` il manifest riporta lo stato **reale** delle immagini già presenti
  su disco (conteggio e byte), non zero fittizi.
