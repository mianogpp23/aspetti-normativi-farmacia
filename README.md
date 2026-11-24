# Piattaforma didattica — FARMACISTA

Sito statico (HTML + CSS + ES modules, **zero build step**) che trasforma l'archivio delle
dispense PDF in un ambiente didattico navigabile:

- **Dashboard** (`#/`, vista *Elenco*): quattro statistiche, ripresa dello studio, prossimi
  argomenti e pagine per modulo con avanzamento calcolato dalle slide aperte, filtri,
  ordinamento, override completato, continuazione dall'ultima slide e navigazione da tastiera.
- **Libreria interattiva** (`#/`, vista *Mappa*): un volume per modulo su scaffali calcolati dalla
  larghezza disponibile; scheda di dettaglio, legenda, navigazione con frecce, ricerca
  con evidenziazione e doppio clic per aprire il modulo. Il selettore *Mappa | Elenco*
  ricorda la scelta; sotto `640px` la dashboard è la vista predefinita.
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
│   ├── app.css          # design system (token, topbar, ricerca, modali)
│   ├── dashboard.css     # dashboard della vista elenco (metriche, card, filtri)
│   ├── library.css      # libreria interattiva (volumi, scaffali, responsive)
│   ├── flow.css         # percorso gerarchico del modulo
│   └── viewer.css       # visore a schermo intero
├── js/
│   ├── utils.js         # helper DOM/format
│   ├── data.js          # unico livello di accesso ai dati (manifest)
│   ├── dashboard.js     # dashboard, progressi e interazioni della vista elenco
│   ├── library.js       # libreria interattiva + interazioni
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
ricorsivamente i PDF, estrae i titoli dalle pagine, raggruppa le pagine in argomenti,
copia i PDF in `content/pdf/` e genera le immagini WebP delle slide.
I video originali (19 MP4) **non fanno parte del sito**: non vengono copiati, non
vengono referenziati e il manifest pubblicato non ne contiene alcun metadato.
L'archivio originale non viene mai modificato: nessun file è spostato, rinominato o cancellato.

## Avvio locale

```bash
python3 -m http.server 8093
# http://127.0.0.1:8093/index.html
# oppure: PORT=8093 node tools/serve.js
```

Il sito usa solo percorsi relativi, quindi funziona sia in radice sia in sottocartella
(es. `https://utente.github.io/nome-repo/`).

## Pubblicazione su GitHub Pages

**Il repository GitHub corrisponde a questa cartella** (`piattaforma-didattica/`), non
all’archivio: i video originali (19 MP4, 4.35 GB, 10 file oltre i 100 MB) restano
*fuori* dal repository per costruzione, non sono pubblicati e non possono mai far
fallire un push.
Le copie dei 18 PDF delle dispense sono incluse in `content/pdf/` e quindi online.

```bash
git init -b main          # già presente in questa cartella
git add .
git commit -m "feat: sostituisci vista elenco con dashboard"
git remote add origin git@github.com:utente/nome-repo.git
git push -u origin main
```

Poi in **Settings → Pages** scegliere *Source: GitHub Actions*: il workflow
`.github/workflows/pages.yml` pubblica la radice del repository ad ogni push.
Il file `.nojekyll` evita l’elaborazione Jekyll e mantiene le cartelle intatte.

URL risultante: `https://utente.github.io/nome-repo/` (il sito usa solo percorsi
relativi, quindi funziona anche se ospitato in una sottocartella).

## Contenuto attuale

19 moduli · 18 PDF · 725 slide · 120 argomenti (i video non fanno parte del sito).

## Verifica

```bash
node --check js/dashboard.js && node --check js/main.js && node --check tools/e2e.js
node tools/check-links.js
node tools/e2e.js
node tools/screenshot.js
```

Gli screenshot vengono scritti in `/tmp/verify-tools` (desktop 1440×900,
tablet 820×1100, mobile 360×800). `BASE_URL` può puntare al sito pubblicato
per ripetere le stesse verifiche online. La suite E2E copre statistiche, coerenza
con il manifest, ripresa, prossimi argomenti, progressi, override, ricerca,
ordinamento, tastiera, migrazione dello stato e mobile.

## Note operative

- `scripts/scan.py` esegue la potatura degli artefatti obsoleti: a ogni scansione
  elimina da `content/` le copie e le immagini riferite a moduli ormai inesistenti,
  così il contenuto pubblicato non accumula residui.
- Il manifest pubblicato contiene solo il *nome* della cartella sorgente, mai un
  percorso assoluto della macchina che ha generato il sito.
- In `--no-render` il manifest riporta lo stato **reale** delle immagini già presenti
  su disco (conteggio e byte), non zero fittizi.
