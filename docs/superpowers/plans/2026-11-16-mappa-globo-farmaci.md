# Mappa-globo dei medicinali — piano di implementazione

> **Per il worker AI:** esegui questo piano in modo nativo nella sessione corrente, task per task, usando `executing-plans`. Traccia i passaggi con caselle `- [ ]`.

**Obiettivo:** creare una mappa-globo HTML statica, offline e GitHub Pages-ready che rappresenta tutte le 84 slide del PDF e apre la slide selezionata al clic.

**Architettura:** `pdftoppm` rasterizza il PDF in JPEG; uno script Python produce `slides.json`; un modello JavaScript puro costruisce nodi e collegamenti; ECharts locale renderizza il grafo; un controllo `<dialog>` mostra le slide. Il sito non richiede build né backend.

**Stack:** Python 3 standard library, Node.js 22, ECharts 6.1.0 vendorizzato, Poppler `pdftoppm`, Chromium headless.

**Specifica:** `docs/superpowers/specs/2026-11-16-mappa-globo-farmaci-design.md`

## Vincoli globali

- 84 slide; percorsi relativi; nessun CDN o servizio remoto.
- Il PDF sorgente originale non viene modificato.
- UI in italiano, accessibile da tastiera, responsive e compatibile con `prefers-reduced-motion`.
- Nessun push GitHub; commit locali Conventional Commits.
- Ogni file Markdown del progetto resta sotto 200 righe.

## Review focus

- Titolo vuoto o errato: ogni slide 1–84 deve avere un titolo non vuoto e il proprio numero.
- Immagine non trovata: nessun nodo può puntare a un file JPEG assente.
- Relazione pendente: ogni collegamento del grafo deve avere origine e destinazione valide.
- Sovrapposizione dei filtri: ricerca e categoria devono combinarsi senza nascondere il risultato attivo.
- Viewer non accessibile: `Esc`, frecce, focus e chiusura devono funzionare anche senza mouse.

---

### Task 1: scaffold e catalogo verificabile
**File:**
- Creare: `PROJECT.md`, `.pi/settings.json`, `.pi/plan.md`
- Creare: `scripts/slide_catalog.py`
- Test: `tests/test_build_slides.py`

- [x] **Step 1: scrivere il test RED del catalogo**

Il test importa `SLIDES` e `CATEGORIES` e asserisce: 84 record, numeri da 1 a 84 senza duplicati, titolo non vuoto, categoria nota e copertura delle pagine 1 e 84.

- [x] **Step 2: eseguire il test e verificare il fallimento**

Comando: `python3 -m unittest tests.test_build_slides -v`  
Atteso: FAIL perché `scripts/slide_catalog.py` non esiste.

- [x] **Step 3: implementare il catalogo**

`slide_catalog.py` espone `CATEGORIES: dict[str, str]` e `SLIDES: list[dict]`; ogni record contiene `number`, `title`, `category`. I titoli derivano dal testo del PDF e le categorie sono: introduzione, fondamenti, prescrizione, tipi di ricetta, ricetta rossa, dematerializzazione, stupefacenti, registri, adempimenti.

- [x] **Step 4: eseguire il test e verificare il passaggio**

Comando: `python3 -m unittest tests.test_build_slides -v`  
Atteso: PASS.

- [x] **Step 5: creare metadati progetto e piano sintetico**

`PROJECT.md` descrive scopo, struttura, comandi e regole; `.pi/settings.json` abilita le skill; `.pi/plan.md` riassume il piano in meno di 100 righe.

- [x] **Step 6: commit**

`git add PROJECT.md .pi scripts/slide_catalog.py tests/test_build_slides.py && git commit -m "feat: define slide catalog and project scaffold"`

### Task 2: pipeline PDF → JPEG + JSON
**File:**
- Creare: `scripts/build_slides.py`
- Creare: `assets/source/slides.pdf`, `assets/data/slides.json`, `assets/slides/slide-01.jpg` … `slide-84.jpg`
- Test: `tests/test_build_slides.py`

- [ ] **Step 1: estendere il test RED della pipeline**

Il test esegue `build_slides.build_catalog(source, temp_output, temp_images)` in una directory temporanea e asserisce 84 JPEG validi, 84 record JSON e percorsi relativi.

- [ ] **Step 2: eseguire il test e verificare il fallimento**

Comando: `python3 -m unittest tests.test_build_slides -v`  
Atteso: FAIL per la funzione pipeline mancante.

- [ ] **Step 3: implementare `build_slides.py`**

Firma: `build_catalog(source_pdf: Path, output_json: Path, images_dir: Path) -> list[dict]`. La funzione copia il sorgente in `assets/source/slides.pdf`, esegue `pdftoppm -jpeg -r 120 -jpegopt quality=84,progressive=y,optimize=y`, rinomina gli output in `slide-NN.jpg` e scrive il JSON con `number`, `title`, `category`, `image`, `sourcePage`.

- [ ] **Step 4: eseguire pipeline e test**

Comandi: `python3 scripts/build_slides.py && python3 -m unittest tests.test_build_slides -v`  
Atteso: 84 immagini, JSON valido, test PASS.

- [ ] **Step 5: verificare gli artefatti**

Comando: `pdfinfo assets/source/slides.pdf` e conteggio JPEG/JSON.  
Atteso: 84 pagine, 84 JPEG, 84 record.

- [ ] **Step 6: commit**

`git add scripts/build_slides.py assets tests && git commit -m "feat: generate slide assets and catalog"`

### Task 3: modello puro del grafo
**File:**
- Creare: `assets/js/map-model.js`
- Test: `tests/test_map_model.mjs`

- [ ] **Step 1: scrivere il test RED**

`node --test tests/test_map_model.mjs` asserisce 94 nodi (1 centro + 9 hub + 84 slide), 176 collegamenti senza dangling endpoint, ID univoci, categorie e query di ricerca combinabili.

- [ ] **Step 2: eseguire il test e verificare il fallimento**

Atteso: FAIL perché il modulo non esiste.

- [ ] **Step 3: implementare il modulo ES**

Esporta `buildGraph(slides, categories)`, `filterGraph(graph, query, category)` e `neighborIds(graph, id)`. Il layout posiziona il centro, gli hub in ellisse e le slide in anelli locali deterministici.

- [ ] **Step 4: eseguire il test e verificare il passaggio**

Comando: `node --test tests/test_map_model.mjs`  
Atteso: PASS.

- [ ] **Step 5: commit**

`git add assets/js/map-model.js tests/test_map_model.mjs && git commit -m "feat: add deterministic globe graph model"`

### Task 4: interfaccia completa e accessibile
**File:**
- Creare: `index.html`, `assets/css/styles.css`, `assets/js/app.js`
- Creare: `assets/vendor/echarts.min.js`

- [ ] **Step 1: vendorizzare ECharts**

Usare `npm pack echarts@6.1.0`, copiare solo `dist/echarts.min.js` in `assets/vendor/` e registrarne la versione nel README. Nessun CDN nel sito.

- [ ] **Step 2: costruire la shell HTML**

Includere meta, skip link, intestazione, ricerca, nove filtri, area grafo, legenda, elenco accessibile delle slide e `<dialog>` con immagine, titolo, numero, chiusura e navigazione.

- [ ] **Step 3: implementare l’interazione**

`app.js` importa il modello, inizializza ECharts, applica filtri, gestisce highlight/zoom, apre il viewer al clic e supporta `Esc`, frecce, focus e riduzione del movimento.

- [ ] **Step 4: applicare il sistema visivo**

Palette medica blu notte/ciano, globo con meridiani, nodi tipizzati per categoria, label leggibili, pannelli compatti, layout responsive e target mobili da almeno 44 px.

- [ ] **Step 5: controlli statici**

Verificare percorsi relativi, assenza di URL remoti, JSON valido, `node --check` e tutti i test.  
Atteso: nessun errore e test PASS.

- [ ] **Step 6: commit**

`git add index.html assets && git commit -m "feat: build interactive globe map interface"`

### Task 5: test browser e confezionamento GitHub
**File:**
- Creare: `scripts/smoke_test.py`, `tests/browser-harness.html`
- Creare: `README.md`, `.gitignore`, `.nojekyll`

- [ ] **Step 1: scrivere il test browser RED**

L’harness importa il modello, carica `slides.json`, simula il click su slide 43 e verifica apertura, titolo e navigazione; espone `data-test-result` e `data-test-error`.

- [ ] **Step 2: eseguire lo smoke test e verificare il fallimento**

Comando: `python3 scripts/smoke_test.py`  
Atteso: FAIL finché l’harness o il viewer non funzionano.

- [ ] **Step 3: completare harness e smoke runner**

Lo script avvia un server HTTP temporaneo, esegue Chromium headless con `--dump-dom`, controlla il risultato e genera screenshot desktop/mobile in `shots/`.

- [ ] **Step 4: documentare GitHub**

README: avvio locale, rigenerazione, test, struttura, pubblicazione GitHub Pages, assenza di build e licenza da definire prima della pubblicazione. `.gitignore` esclude cache e screenshot; `.nojekyll` abilita la pubblicazione statica.

- [ ] **Step 5: eseguire la verifica completa**

Comandi: `python3 -m unittest discover -s tests -v`, `node --test tests/test_map_model.mjs`, `python3 scripts/smoke_test.py`, controllo link/asset e `git status --short`.  
Atteso: test PASS, nessun asset mancante, working tree pulito salvo artefatti esclusi.

- [ ] **Step 6: commit finale**

`git add README.md .gitignore .nojekyll scripts tests shots && git commit -m "test: verify browser behavior and GitHub packaging"`

### Task 6: avvio locale e consegna
- [ ] **Step 1: avviare il server locale**

Avviare `python3 -m http.server 8091 --bind 127.0.0.1` dalla root del progetto, con log in `/tmp/mappa-globo-farmaci-8091.log`.

- [ ] **Step 2: verificare HTTP e asset**

Controllare `/`, `/assets/data/slides.json`, una slide JPEG, ECharts e il repository Git.  
Atteso: HTTP 200 su tutti i percorsi.

- [ ] **Step 3: registrare esito e artefatti**

Aggiornare `~/.pi/agent/logs/agent.log` e `~/.pi/agent/logs/created-files.txt`; osservare e riassumere in wiki il progetto e le lezioni tecniche.

- [ ] **Step 4: consegna**

Riportare URL locale, percorso progetto, commit, test, file principali e nota esplicita: nessun push GitHub eseguito.
