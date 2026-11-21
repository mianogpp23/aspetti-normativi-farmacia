# Aggiunta slide: ricetta elettronica stupefacenti non SSN (23 novembre 2026)

Data: 2026-11-21
Stato: design approvato (approccio 1)
Branch: `aggiornamento-slide-ricetta-stupefacenti-2026` da `origin/main = 10a960e`

## Contesto

L’utente vuole inserire nella piattaforma didattica orbitale la novità: “Ricetta elettronica per gli stupefacenti non a carico del Ssn: dal 23 novembre parte la dematerializzazione”, come slide nella sezione **Gestione dei medicinali uso umano e disciplina di dispensazione al pubblico**, usando l’aggiornamento anche per riportare la modalità di dispensazione.

Il repository contiene solo `content/` generato: l’archivio PDF sorgente (`config.json` → `source: "../"`) non è disponibile in questa macchina. Perciò non è possibile aggiungere la pagina al PDF sorgente e rigenerare con `scripts/scan.py` senza recuperare l’archivio.

## Obiettivo

- Aggiungere una slide di aggiornamento come **n. 85** del modulo `gestione-dei-medicinali-uso-umano-e-disciplina-di-dispensazione-al` (84 slide esistenti).
- Aggiornare manifest, indice di ricerca, report, thumbnail e PDF pubblicato.
- Mantenere la modifica riapplicabile dopo una futura scansione.
- Non toccare `main`, il vecchio globo o la copia locale divergente.

## Non obiettivo

- Riscrivere le 84 slide esistenti.
- Modificare l’archivio PDF sorgente esterno.
- Cambiare il layout dell’interfaccia o il comportamento del visore.

## Decisione

Iniezione controllata nei file generati, con una fonte testuale versionata e uno script di riapplicazione idempotente.

### Testo della slide 85

**Titolo**

`AGGIORNAMENTO 23 NOVEMBRE 2026 — Ricetta elettronica stupefacenti non SSN`

**Corpo**

1. `Dal 23/11/2026 sono operative le procedure di dematerializzazione (art. 1, comma 317, legge 30/12/2024 n. 207) per le ricette "bianche" non a carico del SSN, ripetibili e non ripetibili, relative alle sezioni B, C, D, E della tabella del DPR 309/1990.`
2. `Modalità di dispensazione: il farmacista accetta la ricetta elettronica resa operativa dal SAC del Sistema Tessera sanitaria e trasmette al Sistema TS i dati della ricetta bianca elettronica stupefacenti erogata in farmacia, secondo le specifiche tecniche aggiornate. Nelle Regioni con SAR l'avvio dipende dall'implementazione del sistema.`
3. `Restano escluse la sezione A (ricetta ministeriale a ricalco, art. 3 DM 2/11/2011) e le preparazioni magistrali; con la piena attuazione scatta l'obbligo di accettare le ricette elettroniche.`
4. `Riferimenti: circolare Fofi; comunicazioni n. 13592/2022, 15175/2024, 15190/2025.`

## Modifiche previste

| File | Azione |
|---|---|
| `content/slides/<id>/0085.webp` | Nuova immagine 1600×900 (stesso rapporto 720×405.36 del PDF) |
| `content/thumbs/<id>/0085.webp` | Miniatura 420 px |
| `content/pdf/<id>.pdf` | Aggiunta pagina 85 con testo equivalente, salvata in modo incrementale |
| `content/manifest.json` | `pdf.pages` 84→85, `pdf.bytes`, `files[0].pages/bytes`, `render.rendered/expected`, `render.full_bytes`, `slides += {n:85,title}`, topic `t11` 80–84 → 80–85 e `count` 5→6, `totals.pages/renderedImages/imageBytes/pdfBytes`, `generatedAt` |
| `content/search.json` | Nuova voce `{m:<id>, n:85, t:<titolo>, x:<testo>}` |
| `content/scan-report.json` | Stessi totali del manifest e voce modulo con `pages:85`, `rendered:85` |
| `content/updates/2026-11-23-ricetta-stupefacenti-non-ssn.md` | Fonte testuale del contenuto, URL e data |
| `scripts/apply_update_slide.py` | Rigenera slide/thumb/PDF e reinietta i metadati in modo idempotente |

Lo script userà `pymupdf` per l’append incrementale e Pillow + font DejaVu Sans per le immagini.Modalità `--check` verificherà la presenza coerente di slide, metadati e ricerca senza scrivere.

## Rischi e mitigazioni

- **Una futura `scan.py` cancella `content/slides` e riscrive manifest/search:** il file `content/updates/*.md` e lo script restano fuori da `content/` generato; lo script va rieseguito dopo la scansione. Aggiungere un avviso nel README della cartella updates.
- **PDF sovrascritto male:** usare `doc.saveIncr()` per non riscrivere le pagine esistenti; verificare che `page_count == 85`.
- **Duplicati:** lo script rimuove/reinserisce sempre la voce `n=85` prima di riscrivere i JSON.
- **Font non disponibile:** usare percorso assoluto `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`, con fallback a font di sistema.

## Verifica

1. `python3 scripts/apply_update_slide.py --check` (dopo l’applicazione) →nessun errore.
2. JSON validi; `manifest.modules[id].pdf.pages == 85`; `slides[-1].n == 85`; `search.json` contiene una voce `n:85`.
3. Esistono `0085.webp` in slides e thumbs; dimensioni corrette.
4. `pymupdf` riporta 85 pagine nel PDF.
5. Ricerca per `stupefacenti non SSN` trova la slide 85.
6. `git status` pulito dopo il commit; push solo della nuova branch.

## Alternativa scartata

Ricostruire l’archivio sorgente e rigenerare con `scripts/scan.py`: richiede PDF originali non presenti localmente e rischia di alterare le 84 slide esistenti.

## Fonti

- https://www.ilfarmacistaonline.it/lavoro-e-professioni/articolo.php?articolo_id=135253
- https://www.rifday.it/2026/11/19/ricette-stupefacenti-non-a-carico-del-ssn-la-dematerializzazione-parte-il-23-novembre
- Wiki: `sources/fofi-dematerializzazione-ricetta-stupefacenti-non-ssn-23-novembre-2026`
- Wiki: `sources/fonti-nre-federfarma-doppia-copia-circolare-119`
