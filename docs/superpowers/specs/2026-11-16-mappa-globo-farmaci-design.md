# Mappa-globo dei medicinali — specifica di progetto

**Stato:** approvato dall’utente il 16 novembre 2026  
**Progetto:** `~/progetti/mappa-mentale-globo-farmaci/`

## Intento

Trasformare il PDF di 84 slide “Gestione dei medicinali uso umano e disciplina di dispensazione al pubblico” in una mappa mentale navigabile, visualizzata come costellazione-globo. Ogni nodo deve riportare il titolo della slide e, al clic, aprire la slide corrispondente.

Il risultato deve essere consultabile sul PC e pronto per essere pubblicato su GitHub o GitHub Pages, senza dipendenze server e senza percorso locale non portabile.

## Obiettivi

- Rappresentare tutte le 84 slide, inclusi copertina e chiusura.
- Mostrare il titolo di ogni slide direttamente nella mappa.
- Consentire clic, zoom, pan e ricerca per titolo o numero.
- Aprire la slide selezionata in un visualizzatore sovrapposto con navigazione precedente/successiva.
- Raggruppare le slide per argomento e visualizzare le relazioni principali.
- Funzionare offline, in locale e dopo la pubblicazione GitHub Pages.
- Permettere la rigenerazione degli artefatti dal PDF sorgente.

## Non obiettivi

- Non modificare il PDF originale.
- Non riscrivere o sintetizzare il contenuto normativo delle slide.
- Non introdurre un backend, un database o autenticazione.
- Non usare API, CDN o font remoti.
- Non eseguire push GitHub durante questo lavoro.

## Vincoli

- Sito statico: HTML, CSS e JavaScript senza framework applicativo.
- Percorsi relativi; nessun riferimento a `/home/k10` nel sito pubblicabile.
- ECharts incluso come file locale, con versione fissata.
- Slide rasterizzate dal PDF con Poppler `pdftoppm`.
- Dipendenze di sviluppo limitate a Python standard library e Node.js.
- Interfaccia in italiano, accessibile da tastiera e ridimensionabile.
- Il progetto deve superare i controlli automatici e un test browser reale.

## Implementazione valutata

### 1. HTML statico + ECharts locale + slide JPEG — scelta

Grafo ECharts con layout posizionato deterministicamente, libreria vendorizzata, immagini locali e sovrapposizione HTML per il visualizzatore. Offre grafica interattiva coerente, navigazione fluida e portabilità GitHub Pages.

### 2. Visualizzatore PDF nativo

Richiede meno asset, ma il comportamento dipende dal browser e dal plug-in PDF; il passaggio a una pagina specifica è meno affidabile. Scartato.

### 3. React/Vite

Offre un framework applicativo, ma introduce dipendenze, build e complessità non necessarie per una singola pagina statica. Scartato.

## Struttura prevista

```text
mappa-mentale-globo-farmaci/
├── index.html
├── assets/
│   ├── css/styles.css
│   ├── js/app.js
│   ├── js/map-model.js
│   ├── vendor/echarts.min.js
│   ├── data/slides.json
│   ├── slides/slide-01.jpg … slide-84.jpg
│   └── source/slides.pdf
├── scripts/
│   ├── build_slides.py
│   └── smoke_test.py
├── tests/
│   ├── test_build_slides.py
│   └── test_map_model.mjs
├── docs/superpowers/{specs,plans}/
├── PROJECT.md
├── README.md
├── .gitignore
├── .nojekyll
└── .pi/settings.json
```

## Modello dei dati

Ogni slide usa un record JSON con:

- `number`: intero da 1 a 84;
- `title`: titolo leggibile ricavato dalla slide;
- `category`: uno dei nove argomenti;
- `image`: percorso relativo JPEG;
- `sourcePage`: pagina PDF equivalente.

Il grafo aggiunge un nodo centrale, nove nodi tematici, collegamenti verso le slide e collegamenti cronologici sottili. Il modello JavaScript è puro e testabile senza browser.

## Interfaccia

- Intestazione con titolo del corso, conteggio slide e istruzione d’uso.
- Campo di ricerca per titolo o numero.
- Filtri per argomento, selezionabili anche con tastiera.
- Area centrale a forma di globo con reticolo meridiano/parallele e grafo zoomabile.
- Evidenziazione del nodo e dei vicini al passaggio del mouse o al focus.
- Legenda tematica e pulsante di ripristino della vista.
- Visualizzatore a schermo intero con immagine, titolo, numero, chiusura e navigazione.
- Su schermi piccoli, controlli compattati e visualizzatore adattato alla viewport.

## Accessibilità e comportamento

- Ricerca e filtri raggiungibili da tastiera.
- `Esc` chiude il visualizzatore; frecce sinistra/destra cambiano slide quando aperto.
- Focus visibile, contrasto adeguato e supporto `prefers-reduced-motion`.
- Le slide sono immagini con testo alternativo basato su numero e titolo.
- Il grafo è un’alternativa visuale all’elenco; un elenco accessibile delle slide resta disponibile e ricercabile.

## GitHub

- Il repository può ospitare il sito senza build.
- `.nojekyll` impedisce a Jekyll di ignorare directory asset.
- Il README documenta avvio locale, rigenerazione e pubblicazione GitHub Pages.
- Il commit iniziale è locale; nessun push viene eseguito senza autorizzazione valida.

## Criteri di accettazione

1. Il catalogo contiene esattamente 84 slide con titoli non vuoti e immagini esistenti.
2. Ogni slide del catalogo è raggiungibile dalla mappa o dall’elenco accessibile.
3. Il clic su un titolo apre l’immagine della slide corretta.
4. Precedente/successiva, `Esc`, ricerca, filtri, zoom e pan funzionano.
5. Nessun errore JavaScript nel browser durante il test.
6. Tutti gli asset sono locali e i percorsi sono relativi.
7. Il sito è visibile correttamente a 1440, 1024, 768 e 390 px.
8. `python3 -m unittest discover -s tests -v` e `node --test tests/test_map_model.mjs` passano.
9. Il test browser headless conferma caricamento, click e navigazione.
10. Il progetto contiene documentazione GitHub Pages e può essere servito da `python3 -m http.server`.
