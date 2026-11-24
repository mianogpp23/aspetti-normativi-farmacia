# LOG — migrazione vista mappa → SUNBURST

Data: 2026-11-23. Modalità: esecuzione autonoma, nessuna domanda, ambiguità risolte con `Ruling` esplicite.

## FASE 0 — skill e strumenti

- `modern-web-guidance` è stato invocato **prima** di scrivere ogni riga di UI, come richiesto dalla skill.
- Comandi eseguiti (repo `/home/k10/progetti/aspetti-normativi-farmacia`):

```bash
for q in "responsive svg viewbox" "accessible svg sectors" "reduced motion animation" "keyboard focus svg"; do
  echo "===== $q ====="
  timeout 90 npx -y modern-web-guidance@latest search "$q" --skill-version 2026_11_10-47b4c80e 2>&1 | head -40
done
```

- Guide recuperate con `npx -y modern-web-guidance@latest retrieve <id> --skill-version 2026_11_10-47b4c80e` in `/tmp/mwg/`:

| file | bytes | header |
|---|---:|---|
| `/tmp/mwg/accessibility.txt` | 51734 | `--- Guide for accessibility ---` / `# Accessibility Coding Guidelines` |
| `/tmp/mwg/motion.txt` | 7814 | `--- Guide for motion ---` / `# Motion` |
| `/tmp/mwg/responsive-design.txt` | 1923 | `--- Guide for responsive-design ---` / `# Responsive design` |
| `/tmp/mwg/css-layout.txt` | 21864 | `--- Guide for css-layout ---` / `# CSS Layouts and Responsive Design` |

- Letture mirate effettuate:
  - `accessibility.txt:326-355` — Focus indicators: `:focus-visible`, mai `outline:none` senza sostituto con contrasto ≥3:1, preferire `outline` + `outline-offset`, fallback `forced-colors`.
  - `accessibility.txt:375-427` — Inline SVG: `role="img"` + `<title>`/`aria-label` per SVG non decorativi, `aria-hidden="true"` per decorativi.
  - `accessibility.txt` sezione Target sizes: almeno 24×24 CSS px (o equivalente cerchio 24px).
  - `motion.txt` / `responsive-design.txt` / `css-layout.txt`: consultati per animazioni ridotte, breakpoint e layout a griglia.
- Tooling browser: `playwright-core@1.65.1` installato in `/tmp/verify-tools`; Chromium di sistema `/snap/bin/chromium` versione `157.0.8103.38` avviato con successo in headless (`--no-sandbox --disable-dev-shm-usage`). Nessuna libreria UI aggiunta al sito.

## FASE 1 — analisi del repository

- Repo attivo: `/home/k10/progetti/aspetti-normativi-farmacia`, branch `main`, baseline `b74bb93`, working tree pulita e allineata a `origin/main` (`0 0`).
- Non esistono `specs/`, `CONVENTIONS.md` né `CLAUDE.md`; esiste `.github/workflows/pages.yml`. La hardcoded gate di `survey-context` non può essere soddisfatta: la assenza viene annotata qui e si procede senza domande per mandato esplicito dell'utente.
- Punti di integrazione rilevati:
  - `index.html`: `#orbit-stage`, `#orbit-info`, `.orbit-wrap`, `.orbit-legend`, `#btn-list`, help modal, viewer full-screen.
  - `js/main.js`: `renderHome()` → `createOrbit`/`createInfoPanel`; `route()` usa solo hash `#/` e `#/m/<id>[/<topic>]`; `openModule()` e `pendingSlide` gestiscono già il ritorno dal visore.
  - `js/data.js`: `topicsOf()` sintetizza un argomento `all` quando il manifest non dichiara topics ma esiste un PDF.
  - `js/search.js`: `initSearch({onSelect})` gestisce già moduli, argomenti e slide.
  - `js/viewer.js`: API `viewer.open(mod, n)` e gestione Esc/frecce; **non viene modificata**.
- Dati manifest: 19 moduli, 725 slide, 120 topics dichiarati. Conteggi topics per modulo: `[10, 10, 3, 11, 12, 9, 2, 8, 11, 0, 0, 2, 5, 0, 12, 3, 6, 7, 9]`.
- Contraddizione documentale: README e `<title>` dicevano ancora “Mappa orbitale”, mentre il log Git conteneva `cd32d74 Sostituisce mappa orbitale con mappa radiale interattiva`. La missione chiede il sunburst e la rimozione di ogni residuo: testi e file vengono aggiornati di conseguenza.

### Ruling 1 — moduli senza argomenti

**Ruling:** per i moduli con `topics = 0` e PDF presente si usa `topicsOf()` di `js/data.js`, che genera l'argomento sintetico “Tutte le slide del modulo”. Per i moduli senza PDF si genera un settore di cortesia “Nessuna slide” con impatto 1, così ogni modulo resta visibile nell'anello.
**Perché:** l'arco del modulo deve essere proporzionato al numero di argomenti, ma un arco a ampiezza zero sarebbe invisibile e romperebbe la legenda numerata.
**Costo se sbagliato:** in 4 moduli compare un'etichetta sintetica invece di un argomento reale; il dato originale resta intatto e il tooltip lo dichiara.

### Ruling 2 — titolo, meta e naming

**Ruling:** la struttura di `<title>`/meta e il comportamento dinamico di `document.title` restano invariati; cambia solo l'etichetta testuale `Mappa orbitale` → `Sunburst`, perché la missione vieta residui della vista precedente. File e id vengono rinominati `orbit` → `sun`.
**Perché:** mantenere la vecchia etichetta lascerebbe un riferimento esplicito alla modalità rimossa.
**Costo se sbagliato:** chi cercava il vecchio termine nel titolo della scheda non lo trova più; router, URL e dati restano compatibili.

### Ruling 3 — drill-down di terzo livello

**Ruling:** root = Corso + anello moduli + anello argomenti; modulo = centro + argomenti + slide; argomento = centro + slide sull'anello interno, anello esterno vuoto. Il breadcrumb mostra comunque `Corso › Modulo › Argomento`.
**Perché:** la gerarchia richiesta si esaurisce nelle slide e non esiste un quarto livello di dati nel manifest.
**Costo se sbagliato:** nel drill-down argomento l'anello esterno non è usato; la lettura resta chiara e il tooltip riporta pagina e titolo slide.

## FASE 2 — layout SUNBURST

File creati/riscritti:

- `js/sunburst.js` — modulo SVG + JS vanilla, nessuna libreria, nessun build step.
  - Costruttori DOM locali `h()`/`s()` con `createElement`/`createElementNS`, `textContent`, `setAttribute`, `replaceChildren`: **zero `innerHTML`/`outerHTML` nel modulo nuovo**.
  - Geometria polare calcolata a mano: centro `C=365`, `R0=110`, `R1=205`, `R2=325`, `viewBox 0 0 730 730`, margine bianco di 40 px.
  - Archi con `A r r 0 largeArc 1 ...`, stroke `#F7F6F2` da 3 px tra settori, centro bianco con bordo `#D9D7CF`.
  - Ampiezza modulo = numero di argomenti effettivi; argomenti equamente divisi dentro il modulo; slide equamente divise dentro l'argomento.
  - Palette 8 colori saturi (`#175A86`, `#8A4417`, `#2B6648`, `#6B3D86`, `#963A55`, `#5D541D`, `#0E6A6E`, `#59468F`); tinte argomento ottenute con `mix(...,"#FFFFFF",0.62/0.74)`; contrasto calcolato: saturi 6,35–7,96 vs bianco, tinte vs `#1F2933` > 4,5:1.
  - Etichette radiali con rovesciamento sopra/sotto, hide automatico sotto 16° (moduli) / 18° (argomenti / slide), testo intero in `<title>` e tooltip.
- `css/sunburst.css` — `.sun-*`, legenda a sinistra, card SVG, tooltip, breadcrumb, controlli, focus `:focus-visible` con `outline: 2px solid #1F2933; outline-offset: 2px`, fallback `forced-colors`, `prefers-reduced-motion`, breakpoint 900/640 px.
- `css/app.css` — tema “carta calda” richiesto: `#F7F6F2` / `#1F2933`, ombre leggere, `.aurora span { display:none }`.
- `index.html` — `<title>Sunburst · FARMACISTA</title>`, meta description aggiornata, `css/sunburst.css`, markup `.sun-layout`, `#sun-stage`, `#sun-svg`, legenda `#sun-legend`, dettagli `#sun-detail`, breadcrumb, controlli `+`/`−`/`Ricentra`, help e footer aggiornati, glyph brand a raggiera.
- `README.md` — sezioni e albero file aggiornati a `sunburst`.
- `git rm css/orbit.css js/orbit.js` — rimozione tracciata e reversibile via history git; nessun altro file rimosso.

Verifica residui (grep per `orbit|radiale|shift+trascina|rotella|pan libero|mappa orbitale`, escluso `LOG.md`):

```text
./css/sunburst.css:2:   sunburst.css — mappa radiale a Seth Robert's sunburst
```

L'unica occorrenza è l'header di ispirazione visiva richiesto, non un residuo del vecchio modulo. `innerHTML` resta solo nei file preesistenti `js/flow.js`, `js/search.js`, `js/utils.js`; il modulo nuovo non lo usa.

### Ruling 5 — estensione della ricerca

**Ruling:** aggiungere un callback `onQuery` a `initSearch()` senza toccare `buildIndex()`, l'highlight, il ranking, la tastiera o il renderer dei risultati. `main.js` passa `sun.setQuery`.
**Perché:** il requisito chiede evidenziazione/attenuazione dei settori, ma la ricerca esistente funziona e va conservata.
**Costo se sbagliato:** l'API interna di `search.js` ha un parametro aggiuntivo; il comportamento utente resta invariato e il callback è opzionale.

### Ruling 6 — file legacy

**Ruling:** `css/orbit.css` e `js/orbit.js` sono stati rimossi con `git rm` perché la missione richiede la rimozione completa del vecchio codice. La rimozione è reversibile dalla history di Git; router, dati e visore non sono stati toccati.
**Perché:** lasciare i file avrebbe lasciato codice della vista sostituita.
**Costo se sbagliato:** eventuali link esterni diretti a quei due asset tornerebbero 404; nessun link interno li referenzia (verificato con grep).

## FASE 3 — interazione

- Click modulo → zoom animato ~400 ms (`DUR = reduced ? 0 : 420`), centro e anelli ricalcolati; breadcrumb `Corso › Modulo`.
- Click argomento → breadcrumb `Corso › Modulo › Argomento`, slide sull'anello interno.
- Click slide → `viewer.open(mod, n)` esistente, URL PDF con `#page=<n>&zoom=page-fit`.
- Breadcrumb cliccabile: ogni voce riporta al rispettivo livello.
- Tooltip: nome, numero argomenti, pagine/slide, docente quando presente; sincronizzato anche con hover legenda e dettaglio.
- Touch: primo tap seleziona e mostra dettaglio, secondo tap apre/zooma; mouse: click singolo.
- Tastiera: `Tab` tra settori, `Invio` apre, `Esc`/`Backspace` sale di livello; focus visibile con `outline`.
- Controlli `+`, `−`, `Ricentra` agiscono su `scale(0.85–1.8)`; nessun pan libero, rotazione Shift+trascina o zoom con rotella.
- Ricerca: `onQuery` riceve il testo e `setQuery()` applica `.is-match`/`.is-dim` a settori e voci di legenda; `matched`/`currentResults` e `onSelect` di `search.js` restano intatti.
- `prefers-reduced-motion` azzera durata e transizione.

## FASE 4 — requisiti tecnici

- Nessuna libreria esterna, nessun build step: solo ES modules nativi e SVG.
- Dati solo da `content/manifest.json` tramite `js/data.js`: `topicsOf`, `pagesOf`, `slideTitle`, `topicAt`, `moduleStats`.
- Router hash `#/`, vista elenco, lettore PDF e meta/titolo riutilizzati senza riscrittura.
- Moduli con `topics = 0`: `topicsOf()` genera l'argomento sintetico “Tutte le slide del modulo” con tooltip che dichiara il fallback (Ruling 1).
- Responsive: SVG `width:100%; height:auto` con `viewBox`; legenda sotto la mappa a 900 px; sotto 640 px la vista predefinita è “Vista elenco” e la mappa è attivabile da pulsante.
- Accessibilità: `role="img"` + `aria-label` sul contenitore, `<title>` e `role="button"` su ogni settore, `aria-live` su stage e pannello, `:focus-visible`, target ≥24×24 px sui controlli.

### Verifica statica eseguita

```text
$ for f in js/*.js; do node --check "$f" >/dev/null || echo "FAIL $f"; done; echo SYNTAX_OK
SYNTAX_OK
```

Nota onesta: Pi-lens ha segnalato `JavaScript/TypeScript unconfirmed — no primary checker is enabled for this kind` e `CSS unconfirmed — not fully checked` durante le edit. La sintassi JS è stata quindi verificata con `node --check`; il CSS è stato verificato nel browser reale con Chromium 157.0.8103.38. Nessun check Pi-lens è stato trattato come “clean”.

Durante le edit sono emersi e sono stati corretti:

- 19 issue `Avoid innerHTML/outerHTML` nel primo abbozzo → sostituite dai costruttori DOM.
- 2 dichiarazioni inutilizzate (`BG`, parametro `m` di `topicMeta`) → rimosse.
- `PARTIAL APPLY — 1 edit committed (edits[1])` con `edits[0].oldText ... not found` → file riletto e call site ricostruito dal testo verbale.
- `Invert blocks when performing a negation test` in `js/main.js:147` → riscritto come `if (sun) ... else renderHome();`.

Esito finale:

```text
$ grep -n 'topicMeta' js/sunburst.js
159:function topicMeta(topic) {
200:        meta: topicMeta(topic),
228:      meta: topicMeta(topic),
291:    sub = topicMeta(topic);
```

## FASE 5 — verifica con prove

Server statico locale: `python3 -m http.server 8093 --bind 127.0.0.1`, PID `35425`, HTTP 200 su `/`.

Strumento: `/tmp/verify-tools/verify.mjs` con `playwright-core@1.65.1` + `/snap/bin/chromium` `157.0.8103.38`, eseguito come:

```bash
cd /tmp/verify-tools && node verify.mjs 2>&1 | tee /tmp/verify-tools/verify.log; echo "EXIT=${PIPESTATUS[0]}"
```

Primo tentativo: `20 PASS / 2 FAIL` — (1) assertion E2E confrontava il titolo intero con il breadcrumb volutamente troncato; (2) `waitForSelector` mobile richiedeva visibilità mentre la mappa è nascosta di default. Corretti solo i test, poi **rifatta tutta la verifica**. Secondo tentativo: `30 PASS / 0 FAIL`. Aggiunti poi controlli etichette, vista modulo e screenshot a dimensione esatta viewport; **rifatta tutta la verifica**.

Output finale della verifica completa:

```text
PASS radice: archi moduli+argomenti — DOM=142, attesi=19+123
PASS etichette dentro SVG — visibili=14, fuori=0
PASS etichette non sovrapposte — sovrapposizioni=0
PASS legenda numerata — voci=19, moduli=19
PASS coerenza legenda/manifest — prima=Dispositivi medici e presidi medico-chirurgici, atteso=Dispositivi medici e presidi medico-chirurgici
PASS breadcrumb iniziale — Corso
PASS tooltip hover — visibile=true
PASS tooltip: argomenti e pagine — Dispositivi medici e presidi medico-chirurgici | 10 argomenti · 53 slide · Prof.ssa Marcella Marletta
PASS click modulo → zoom — Corso › Dispositivi medici e presidi …
PASS zoom modulo mostra argomenti+slide — archi=63
PASS pannello dettaglio — Dispositivi medic… |  | 10 argomenti · 53 slide · Prof.ssa Marcella Marletta
PASS click argomento → breadcrumb 3 livelli — Corso › Dispositivi medici e presidi … › I Dispositivi Medici
PASS click slide → visore — visibile=true
PASS visore: PDF con pagina — content/pdf/dispositivi-medici-e-presidi-medico-chirurgici.pdf#page=1&zoom=page-fit
PASS Esc chiude visore — visore chiuso
PASS breadcrumb torna a Corso — root ripristinata
PASS controllo + — translate(365 365) scale(1.000) translate(-365 -365) → translate(365 365) scale(1.200) translate(-365 -365)
PASS controllo Ricentra — transform ripristinato
PASS ricerca evidenzia/attenua — match=11, dim=131
PASS ricerca pulita — nessun settore attenuato
PASS tastiera Invio apre — zoom da tastiera
PASS tastiera Esc sale — root da tastiera
PASS desktop: nessun overflow orizzontale — {"sw":1440,"iw":1440}
PASS vista modulo: griglia slide — slide=3
PASS vista modulo: titolo dal manifest — Dispositivi medici e presidi medico-chirurgici
PASS mobile: elenco predefinito — lista visibile
PASS mobile: mappa nascosta — mappa nascosta
PASS mobile elenco: nessun overflow — {"sw":360,"iw":360}
PASS mobile: mappa come opzione — mappa visibile dopo toggle
PASS mobile mappa: nessun overflow — {"sw":360,"iw":360}
PASS console pulita — 0 errori/warning
PASS nessun pageerror — 0 errori
PASS nessuna richiesta fallita — 0 fallimenti
PASS nessun HTTP 4xx/5xx — 0 errori HTTP
SUMMARY {"total":34,"passed":34,"failed":0}
EXIT=0
```

### Fresh-context review e correzioni sulla verifica

Un review indipendente a contesto pulito ha rilevato 6 difetti reali. Tutti sono stati corretti e **tutta la verifica è stata rilanciata**.

| Priorità | Difetto | Correzione |
|---|---|---|
| P0 | Il drill-down argomento passava solo `{id,title}` e perdeva `from`/`to`/`count`: mostrava 1 slide invece dell'intervallo reale | `openArc()` risolve il topic completo da `modelEntry.topics` |
| P1 | `role="img"` su contenitore e SVG rendeva i settori interattivi non affidabili per gli screen reader | `role="group"` su contenitore/SVG + sommario visivamente nascosto con `role="img"` e `aria-label` |
| P1 | `replaceChildren()` in `draw()` eliminava il focus dopo Invio/Esc | `transition()` accetta `done`; la navigazione da tastiera ripristina il focus sul centro o sul primo settore |
| P2 | Il pannello dettaglio dopo lo zoom mostrava solo il centro, senza azioni | `detailArcForCurrent()` ricostruisce l'arco selezionato con `open-flow` |
| P2 | Il doppio tap veniva applicato anche a click mouse/tastiera su dispositivi coarse | gate solo su `evt.pointerType === "touch"` |
| P2 | La legenda diventava inerte dopo il drill-down | click legenda → `goModule(mod)` diretto |

### Ruling 7 — accessibilità degli SVG interattivi

**Ruling:** mantenere un `role="img"` con etichetta come sommario nascosto, ma usare `role="group"` sul contenitore e sull'SVG che contengono elementi focusabili.
**Perché:** `role="img"` rende i figli presentazionali per le tecnologie assistive; i settori sono controlli reali con `role="button"` e `tabindex="0"`.
**Costo se sbagliato:** un lettore di schermo potrebbe annunciare il sommario e il gruppo separatamente; i controlli restano comunque raggiungibili e il requisito letterale di un `role="img"` descrittivo resta soddisfatto.

E2E finale dopo le correzioni (output completo in `/tmp/verify-tools/verify.log`):

```text
PASS dettaglio after zoom: azione percorso — bottoni=1
PASS argomento: slide reali dal manifest — attese=3, trovate=3
PASS argomento: metadati slide — I Dispositivi Med… — 3 slide · pp. 1–3
PASS legenda: click dopo drill-down — Corso › Dispositivi medici e presidi …
PASS tastiera: focus dopo Invio — attivo=center
PASS tastiera: focus dopo Esc — settore attivo=true
SUMMARY {"total":40,"passed":40,"failed":0}
EXIT=0
PASS_COUNT=40
```

Screenshot (dimensioni verificate con `file`):

```text
/tmp/verify-tools/desktop-1440x900.png: PNG image data, 1440 x 900, 8-bit/color RGB, non-interlaced
/tmp/verify-tools/mobile-360x800.png:   PNG image data,  360 x 800, 8-bit/color RGB, non-interlaced
desktop-1440x900.png 274764 bytes
mobile-360x800.png 122370 bytes
```

Il modello vision non è disponibile in questa sessione (`402 insufficient_credits`), quindi la verifica visiva è stata sostituita da misure DOM: 14 etichette visibili, 0 fuori dal SVG, 0 sovrapposizioni, 0 overflow orizzontale su desktop e mobile.

### Ruling 14 — correzione residue e criterio E2E online

**Ruling:** rimosso il residuo testuale “mappa radiale” da `css/sunburst.css:2` (ora “mappa sunburst a settori concentrici”). Nel verify E2E online, i `requestfailed` con `net::ERR_ABORTED` limitati a `/content/thumbs/` sono trattati come abort benigni di navigazione SPA, non come errori HTTP/funzionali; `nessun HTTP 4xx/5xx` resta un controllo separato.
**Perché:** il commento era un residuo lessicale vietato; gli abort delle miniature durante navigazione non indicano regressione del sito.
**Costo se sbagliato:** un abort reale non-thumb potrebbe essere nascosto solo se erroneamente classificato; il filtro è ristretto a `ERR_ABORTED` + path thumbs.

E2E locale dopo fix residuo (rilancio completo):

```text
SUMMARY {"total":40,"passed":40,"failed":0}
EXIT=0
PASS_COUNT=40
```

## FASE 6 — Git/deploy

- Commit feature: `6e35c5a11fb986b84a37459d38e8194e9f89c0ba` (`feat: sostituisce mappa orbitale con sunburst interattivo`), pushato su `origin/main` (`b74bb93..6e35c5a`).
- Commit finale docs/fix residuo: `20df6d0d06ce3868bc2f7cc8491ea5e7482ebb04` (`docs: registra verifica deploy e rimuove residuo commento`), pushato e sincronizzato `0 0`.
- Deploy GitHub Pages: `PAGES_OK attempt=5` (feature) e `PAGES_OK attempt=5` (commit finale, commento `sunburst.css` aggiornato online).
- Verifica online `https://mianogpp23.github.io/aspetti-normativi-farmacia/`: `<title>Sunburst · FARMACISTA</title>`, `css/sunburst.css` presente, nessun `orbit.css` nell'HTML. Asset: `index.html 200`, `css/sunburst.css 200`, `js/sunburst.js 200`, `js/main.js 200`, `content/manifest.json 200`; legacy `css/orbit.css 404`, `js/orbit.js 404`.
- E2E Playwright online (stessa suite, `BASE_URL` produzione, filtro benigno thumb-abort documentato): `SUMMARY {"total":40,"passed":40,"failed":0}`, `EXIT=0`, `PASS_COUNT=40`. Controlli chiave: console pulita, nessun pageerror, nessuna richiesta fallita, nessun HTTP 4xx/5xx, desktop/mobile overflow ok, vista modulo ok, drill-down argomento con slide reali dal manifest.
- Screenshot online rigenerati: `/tmp/verify-tools/desktop-1440x900.png` 1440x900, `/tmp/verify-tools/mobile-360x800.png` 360x800.

## FASE 7 — rotazione del sunburst

### Ruling 15 — rotazione esplicita senza ripristinare pan/zoom liberi

**Ruling:** aggiunti due pulsanti `↺`/`↻` (`±30°`, etichette accessibili “Ruota a sinistra/destra di 30 gradi”) e trascinamento con `Shift` + pulsante sinistro del mouse. La rotazione avviene su un gruppo `.sun-rotor` separato dal centro, quindi il testo centrale resta leggibile; `Ricentra` azzera anche l'angolo. Lo stato è annunciato in un live region nascosto e viene esposto in `state.rotation`. Non sono stati ripristinati pan libero né zoom con rotella.
**Perché:** la richiesta Telegram “Inserisci la rotazione” è stata interpretata in modo minimale e accessibile: i pulsanti coprono tastiera e screen reader, il trascinamento con `Shift` è un’opzione esplicita che non interferisce con click, tap e selezione dei settori.
**Costo se sbagliato:** chi si aspettava il solo trascinamento libero trova anche i pulsanti; chi usava la vecchia mappa ritrova `Shift` + trascina ma non pan/zoom rotella, che restano volontariamente fuori scope.

**Modifiche:** `index.html` (controlli, help inline e nella finestra scorciatoie, live region), `css/sunburst.css` (cursore `grabbing` durante il trascinamento), `js/sunburst.js` (stato `rotation`, gruppo `.sun-rotor`, pointer capture, aggioramento live region e reset), `README.md`, `/tmp/verify-tools/verify.mjs` (5 nuove assertion).

E2E locale completo dopo la rotazione:

```text
SUMMARY {"total":45,"passed":45,"failed":0}
EXIT=0
PASS_COUNT=45
PASS rotazione iniziale — angolo=0
PASS rotazione: pulsante ↻ — angolo=30, stato=Rotazione 30 gradi.
PASS rotazione: pulsante ↺ — angolo=0
PASS rotazione: trascina con Shift — angolo=270, breadcrumb=Corso
PASS rotazione: Ricentra azzera angolo — angolo=0
```

Screenshot rigenerati dalla corsa locale: `desktop-1440x900.png` 275535 byte, `mobile-360x800.png` 120406 byte, entrambi `PNG image data` alle dimensioni richieste.

### Deploy e verifica online della rotazione

- Commit: `bec3748bee7384c944b564134164b97b8a7d3f57` (`feat: aggiunge rotazione al sunburst`), pushato su `origin/main` (`543b6e4..bec3748`); `origin/main...HEAD` = `0 0`.
- GitHub Pages: `PAGES_OK attempt=6`; HTML pubblicato contiene `data-action="rotate-left"` e `data-action="rotate-right"`.
- E2E online completo: `SUMMARY {"total":45,"passed":45,"failed":0}`, `EXIT=0`, `PASS_COUNT=45`; console pulita (0 errori/warning), 0 pageerror, 0 richieste fallite, 0 HTTP 4xx/5xx; tutte le 5 assertion sulla rotazione passate anche online.
- Screenshot online rigenerati: `desktop-1440x900.png` 276821 byte, `mobile-360x800.png` 120406 byte, entrambi `PNG image data` 1440x900 e 360x800.

### Ruling — restyling dell'universo (nuova richiesta Telegram)

**Decisione:** il sunburst è stato sostituito da un sistema solare navigabile: il corso resta al centro come nucleo, i 19 moduli diventano pianeti su tre orbite, gli argomenti diventano lune e le slide satelliti. La shell prodotto (topbar, ricerca, vista elenco, lettore PDF, router `#/`) resta invariata; cambia solo il palcoscenico della mappa. Modalità Operate: il mondo presta palette, densità e la signature move del moto orbitale, non la struttura di navigazione.

**Motivazione della deroga:** `impeccable context` ha segnalato `NO_PRODUCT_MD`, `BUILD_INIT_REQUIRED` e `MANUAL_DETECTOR_REQUIRED`. La missione vieta domande, quindi ho usato come product truth il repo stesso (README, manifest, titoli e contenuti esistenti) e ho eseguito il detector manuale a UI finita. Nessun dato o PDF è stato modificato.

**Costo se sbagliato:** l'utente potrebbe aver voluto solo una rotazione delle vecchie fette; in quel caso il ripristino è disponibile dalla storia git senza force push.

**Rename e rimozione:** `css/sunburst.css` → `css/universe.css` con `git mv`, poi riscritto; `js/universe.js` è un nuovo modulo SVG + JavaScript vanilla; `js/sunburst.js` è stato rimosso con `git rm` perché la destinazione del `git mv` esisteva già e non volevo sovrascrivere la nuova implementazione. Vecchio codice recuperabile dalla storia git.

**Correzioni emerse dalle verifiche:** la fase iniziale dei pianeti includeva un jitter `idx * 7` che faceva sovrapporsi due etichette (`Dispositivi me…` e `Prodotti cosme…`); rimossa, ora la fase è uniforme per anello. Le etichette dei pianeti usano testo chiaro su sfondo spaziale, non il colore calcolato sul pianeta, perché quest'ultimo produceva testo scuro su sfondo scuro. La regola `.sr-only` è stata ripristinata in `css/universe.css` per il live region della rotazione.

**Fresh-context review:** due finding P2 reali corretti: (1) il centro diceva sempre “19 mondi” anche se il manifest cambia, ora usa `model.length`; (2) con `prefers-reduced-motion` il pulsante pausa partiva dallo stato sbagliato e poteva essere commutato senza effetto, ora si sincronizza, si disabilita e annuncia “Movimento disattivato dalle preferenze di sistema”.

**Tooling e verifica locale:** `node --check` su tutti i file `js/*.js` → `SYNTAX_OK`; E2E Playwright completo aggiornato per il nuovo DOM (`universe-body`, `universe-center`, `orbit-track`, `data-rotation`, `toggle-motion`) → `SUMMARY {"total":55,"passed":55,"failed":0}`, `EXIT=0`, `PASS_COUNT=55`; console 0 errori/warning, 0 pageerror, 0 richieste fallite, 0 HTTP 4xx/5xx. Nuove assertion verdi: `nucleo: conteggio mondi dal manifest — 19 mondi da esplorare` e `prefers-reduced-motion: controllo coerente — {"disabled":true,"pressed":"true","label":"Movimento disattivato dalle preferenze di sistema"}`. Screenshot locali `desktop-1440x900.png` e `mobile-360x800.png`, entrambi `PNG image data` alle dimensioni richieste.

**Detector manuale:** primo `impeccable detect --json index.html css/universe.css js/universe.js js/main.js` → 6 warning; due contrasti bassi (`--ink-4` su placeholder di ricerca e footer) corretti portando quei testi a `--ink-3` (4,77:1 su bianco). Rilanci finali su `index.html css/app.css css/universe.css js/universe.js js/main.js` → 4 warning residui, tutti pre-esistenti e fuori dal surface universo: `<img id="vw-img">` senza `src` nel visore, padding di `flow`/`vw-bar`, glow del visore. Nessun finding introdotto dal nuovo universo; dopo ogni modifica CSS l'E2E completa è stata rilanciata.

### Deploy e verifica online

- Commit `e0bb88fc00eff8db8e504860f96e8280998d4e31` (`feat: trasforma il sunburst in universo di pianeti rotanti`), push non-force su `origin/main`: `4a902aa..e0bb88f`. Dopo `git fetch origin main`, `origin/main...HEAD` → `0 0` e `git status --short` vuoto.
- GitHub Pages pronto al primo controllo: HTTP 200, `<title>Universo · FARMACISTA</title>`, `css/universe.css` 200, `js/universe.js` 200, `css/sunburst.css` 404, `js/sunburst.js` 404.
- E2E Playwright online completo su `https://mianogpp23.github.io/aspetti-normativi-farmacia/`: `SUMMARY {"total":55,"passed":55,"failed":0}`, `EXIT=0`, `PASS_COUNT=55`; console 0 errori/warning, 0 pageerror, 0 richieste fallite, 0 HTTP 4xx/5xx. Verdi anche online: `radice: moduli come pianeti — pianeti=19, moduli=19`, `nucleo: conteggio mondi dal manifest — 19 mondi da esplorare`, `naming universo — title=Universo · FARMACISTA`, `prefers-reduced-motion: controllo coerente`.
- Screenshot online rigenerati: `desktop-1440x900.png` 437930 byte e `mobile-360x800.png` 67154 byte, entrambi `PNG image data` alle dimensioni richieste.

## 2026-11-23 — Mappa mentale orizzontale: decisioni senza domande

- Reference `layout07_mappa_mentale.png` non presente nel filesystem: confronto con immagine non applicabile; layout realizzato dalle specifiche testuali.
- La missione vieta domande: scelte operate e registrate qui. Radice, moduli, argomenti e slide partono tutti espansi; “Comprimi tutto” riporta alla sola radice.
- Zoom solo con `Ctrl`/`⌘` + rotella o pulsanti; rotella ordinaria continua a scorrere la pagina. Pan con trascinamento del fondo; nessuna rotazione e nessuna API volatile (`scroll-axis-lock`).
- Navigazione a frecce con roving tabindex e geometria livedata: se non esiste un nodo nella direzione richiesta, l'evento non viene intercettato e lo scroll nativo resta disponibile.
- I vecchi file `js/universe.js` e `css/universe.css` vengono rimossi; la shell, il router `#/`, la vista elenco, il lettore PDF e i dati originali restano invariati.

### FASE 2–5 — tool, correzioni e verifica locale

- Tool creati e documentati: `tools/serve.js` (HTTP 200 verificato su `PORT=8094`), `tools/check-links.js`, `tools/e2e.js`, `tools/screenshot.js`, `tools/verify-env.js`. Il server usato per le verifiche resta il servitore statico Python già attivo su `127.0.0.1:8093`; `tools/serve.js` è stato provato separatamente senza sostituirlo.
- `check-links`: primo run `CHECKED 81 risorse · 1 errori` per un PDF inesistente fabbricato dal fallback (`content/pdf/introduzione.pdf`). **Ruling:** controllare solo i PDF dichiarati nel manifest (`if (mod.pdf?.path) urls.add(mod.pdf.path)`), perché `introduzione` non ha PDF (`pdfs:18` su 19 moduli); zero 404 sulle risorse reali. Re-run verde: `CHECKED 80 risorse · 0 errori`, `EXIT=0`.
- **Ruling topic/fallback:** rimosso il fallback locale `fallbackTopic(mod)` da `js/mindmap.js`; conteggio, rendering e meta usano `topicsOf()` di `js/data.js`, stessa fonte usata da `tools/e2e.js`. Conteggio topic atteso e renderizzato: `122/122` (120 espliciti + 2 fallback del manifest).
- **Ruling layout:** `cols.topic: 1` e colonna slide a `x=920`, larghezza `1400`; elimina l'intercettazione del click slide causata da colonne topic multiple. `drill-down slide nel visore` PASS.
- **Root cause click modulo:** `search.js` chiude la ricerca con un listener `document` e richiama `onQuery("")` su ogni click; `setQuery("")` rieseguiva `render()` anche senza variazione, incrementando `renderToken` e facendo scartare il `setTimeout` della transizione di collapse. Fix: `setQuery` esce subito se la query non cambia e non c'è uno stato da ripristinare. Verificato con probe browser: `collapsed` passa da `[]` a una chiave e i topic da `122` a `112`.
- **Root cause frecce:** dopo la ricostruzione del DOM il focus veniva perso, quindi `ArrowLeft` non comprimeva il nodo attivo. Fix: `commit()` cattura la chiave del nodo focalizzato, ricostruisce e richiama `focusKey()` (con fallback alla radice); l'assert E2E ora attende l'attributo `aria-expanded="false"` invece di un timeout fisso.
- **Root cause pan:** l'hit-test dell'E2E richiedeva `elementFromPoint() === #mind-stage`, ma il punto libero restituisce il figlio `#mind-world`, che non è un nodo interattivo e lascia salire il pointerdown al gestore dello stage. Fix del test: accettare qualunque discendente dello stage che non sia `.mind-node, button, a, input`. Probe reale: drag su sfondo → `scrollTop 0→80`, `scrollLeft 0→140`. Nessun difetto di pan nel codice di produzione.
- **Craft floor:** `impeccable detect` segnalava `11.52px body text`; portato `.mind-topic-text strong` a `0.875rem`, `.mind-slide-n` a `--ink-3`, tooltip secondario a `#5D6871` e help mobile a `0.8rem`. Detector finale: 6 findings (0 errori), di cui 4 warning pre-esistenti fuori surface (`<img id="vw-img">`, padding `flow`/`vw-bar`, glow visore) e 2 advisory `codex-grid-background` (griglia della mappa, deliberata).
- **Verifica locale finale:** `node --check` su `js/mindmap.js`, `js/main.js` e tutti i tool → `SYNTAX_OK`; `node tools/check-links.js` → `CHECKED 80 risorse · 0 errori`; `node tools/e2e.js` → `SUMMARY {"total":40,"passed":40,"failed":0}`, `EXIT=0`, console/pageerror/richieste fallite/HTTP 4xx-5xx tutti a zero; `node tools/screenshot.js` → `SCREENSHOT` desktop e mobile, entrambe `PNG image data` a `1440x900` e `360x800`. Confronto con `layout07_mappa_mentale.png` non applicabile (file assente).

### Fresh-context review finale

Reviewer read-only, un solo agente, `output=false`, missione vincolante senza domande. Quattro finding concreti, tutti corretti:

1. **P1 — `.sr-only` non più definita:** la regola era solo in `css/universe.css`, quindi i testi per screen reader e il live region diventavano visibili. Aggiunta la regola standard in `css/mindmap.css`. Nuovo assert E2E: `testi screen reader nascosti` PASS.
2. **P2 — contrasto tooltip:** il testo secondario `#5D6871` su `#1F2933` era circa 2,6:1; portato a `#B9C4CC` (oltre 4,5:1).
3. **P2 — doppio toggle rapido:** `toggle()` mutava `state.collapsed` solo nel `setTimeout` di 240 ms, quindi un secondo click prima del callback veniva scartato. Ora lo stato cambia subito, il timer precedente viene annullato e il ritardo serve solo all'animazione. Nuovo assert E2E: `doppio click rapido conserva il secondo toggle — 122/122` PASS.
4. **P2 — README porta 8899:** il comando locale non corrispondeva ai tool (8093). Aggiornato a 8093 e documentato `PORT=8093 node tools/serve.js`.

**Verifica dopo review:** `node --check` → `SYNTAX_OK`; check-links → `CHECKED 80 risorse · 0 errori`; E2E → `SUMMARY {"total":42,"passed":42,"failed":0}`, `EXIT=0`; screenshot desktop/mobile rigenerati e verificati `PNG image data` `1440x900` / `360x800`; detect finale invariato a 6 finding (4 warning pre-esistenti fuori surface + 2 advisory griglia).

### Deploy e verifica online

Commit `3273690023cf8cc4ccac81056182507bcb795f12` pushato su `origin/main` senza force push. Primo workflow `Deploy GitHub Pages` (`45223621562`) fallito per un errore transiente dell'API GitHub: l'artifact `github-pages` era stato caricato correttamente, ma `actions/deploy-pages@v5` non lo trovava al momento del lookup. Rerun dello stesso workflow completato con successo, senza nuovi commit o riscrittura della storia.

Pages verificato: titolo `<title>Mappa mentale · FARMACISTA</title>`, `css/mindmap.css` e `js/mindmap.js` HTTP 200, `js/universe.js` e `css/universe.css` HTTP 404. check-links online: `CHECKED 80 risorse · 0 errori`, `EXIT=0`. E2E online: `SUMMARY {"total":42,"passed":42,"failed":0}`, `EXIT=0`, console/pageerror/richieste fallite/HTTP 4xx-5xx tutti a zero. Screenshot online in `/tmp/verify-tools-online/`: `desktop-1440x900.png` e `mobile-360x800.png`, entrambi `PNG image data` alle dimensioni richieste. `git rev-list --left-right --count origin/main...HEAD` → `0 0`, working tree pulito prima di questa registrazione.

---

## Libreria interattiva — FASE 0/1

Missione: sostituire il modulo visuale della home con una libreria in cui ogni modulo del corso è un volume su uno scaffale. Nessuna domanda all'utente: le ambiguità sono state risolte con ruling espliciti e registrate qui.

- **Ruling L1** — la richiesta si interrompe dopo «I volumi poggiano»: si assume che i volumi poggino sull'asse superiore dello scaffale, allineati alla base. Ogni scaffale ha una barra `#B9B2A3` alta `16px` e un filo `#9C9484` alto `5px` subito sotto.
- **Ruling L2** — `layout12_libreria.png` non è presente in `/home/k10`: si usano le specifiche testuali e il design system live (`--bg:#F7F6F2`, `--ink:#1F2933`, font di sistema).
- **Ruling L3** — `wiki_recall` ha restituito solo contesto storico (globo, deploy della mappa mentale, destinazione del repo): usato per i vincoli di deploy, non come evidenza live del codice.
- **Ruling L4** — MWG `css-layout,accessibility,motion,form-factor-adaptation,card,single-line-overflow` recuperato in `/tmp/mwg-library-guide.md`; `impeccable context` → `EXISTING_VISUAL_SYSTEM`, `SCOPED_EXISTING_ALLOWED`. Non creare `PRODUCT.md`/`DESIGN.md`: questa è un'iterazione dell'implementazione esistente.
- **Ruling L5** — sostituire solo `js/mindmap.js` e `css/mindmap.css` con `js/library.js` e `css/library.css`; restano invariati dati, router hash, vista elenco, lettore PDF, vista modulo e asset PDF.
- **Ruling L6** — un volume per modulo da `manifest.modules`; larghezza da lunghezza del titolo (`108px`–`168px`), altezza dalla paginazione (`184px`–`238px`), palette a otto colori.
- **Ruling L7** — scaffalatura dinamica: misurare `clientWidth`, sommare larghezze più gap `14px`, andare a capo quando non entra più un volume; ricalcolo via `ResizeObserver` e comando esplicito.
- **Ruling L8** — click = selezione e scheda; doppio click/pulsante = apertura modulo; frecce = navigazione roving; `Esc` = deselezione; ricerca globale = evidenziazione e messaggio nella live region; nessuna animazione automatica.
- **Ruling L9** — tool già presenti: adattare E2E ai selettori della libreria e screenshot ai tre viewport `1440×900`, `768×1024`, `360×800`; `check-links` resta tarato sui PDF dichiarati nel manifest.
- **Ruling L10** — implementazione iniziale di `js/library.js` con API `render/layout/select/clear/focus/setQuery/state/destroy`, volumi generati dai dati e scaffali dinamici.
- **Ruling L11** — root cause del STOP automatico su `js/library.js`: import più ampi del necessario; correzione minimale a `el, clamp, norm` e `modules, pagesOf, topicsOf`.
- **Ruling L12** — scrittura e fix degli import non equivalgono a completamento: serve `node --check` verde, integrazione, tool verdi, browser reale e review finale prima di qualunque claim di successo.

## Libreria interattiva — FASE 3/5

- **Ruling L13** — `css/library.css` usa pannello `#EFEDE6`, bordo `18px`, volumi a larghezza variabile, asse `16px` `#B9B2A3` e filo `5px` `#9C9484`; transition limitate a `transform`/`box-shadow`/`filter` con `prefers-reduced-motion`.
- **Ruling L14** — `index.html` convertito ai selettori `#lib-*`; titolo `Libreria · FARMACISTA`; rimossi i vecchi testi sulla mappa mentale. Successivamente corretti `aria-label` del brand e `.mind-footbar` → `.lib-footbar`.
- **Ruling L15** — `js/main.js` integra `createLibrary` mantenendo router hash, vista elenco, visore e dati invariati; rimosso l'unused `const m = modules()`.
- **Ruling L16** — `tools/e2e.js` riscritto per la libreria con 38 assert, inclusi stili richiesti, riempimento dinamico degli scaffali, tastiera, ricerca, visore e mobile.
- **Ruling L17** — `tools/screenshot.js` riscritto per i tre viewport richiesti `1440×900`, `768×1024`, `360×800`.
- **Ruling L18** — root cause del timeout E2E su mobile: la vista elenco è predefinita sotto i 640px, quindi i volumi esistevano ma non erano visibili. Fix minimo: cliccare `#btn-list` prima dell'attesa. Tutta la suite E2E è stata rilanciata: `SUMMARY {"total":38,"passed":38,"failed":0}`, `EXIT=0`.
- **Ruling L19** — root cause del timeout screenshot: il primo `waitForSelector` chiedeva visibilità prima del toggle mobile. Fix: attesa `attached` iniziale, toggle, poi attesa `visible`. Screenshot rigenerati con `EXIT=0` e dimensioni verificate via `file`.
- **Ruling L20** — vecchi file visuali `js/mindmap.js` e `css/mindmap.css` rimossi con `git rm`: sono tracciati, quindi la rimozione è reversibile dalla storia Git. Nessun PDF o file dati toccato.
- **Ruling L21** — verifica visiva automatizzata con modello vision non disponibile (`402 insufficient_credits`): la conformità è stata verificata via DOM, stili calcolati, E2E reale e metadati PNG, senza inventare una valutazione visiva.
- **Ruling L22** — `impeccable detect --json` riletto con parser Node: 6 finding, tutti `warning` pre-esistenti fuori dalla surface libreria (`img` del visore senza src, testo 11px, padding in `flow`/`vw-bar`, glow storico). Nessun finding attribuibile a `.lib-*`.
- **Ruling L23** — `README.md` aggiornato con libreria, nuovi file e comandi di verifica; `LOG.md` usato come evidenza delle decisioni.
- **Ruling L24** — verifica locale verde: `node --check` sui quattro file JS, check-links `CHECKED 80 risorse · 0 errori`, E2E `38/38`, screenshot tre viewport, detect senza finding sulla surface.

## Libreria interattiva — review e verifica finale

- **Fresh-context review** (read-only, `output=false`, una sola missione): nessun P0/P1; tre P2 concreti, tutti corretti.
- **P2 — testo storico in `tools/serve.js`:** commento e messaggio di avvio dicevano “mappa mentale”. Sostituiti con “libreria interattiva” / “libreria”.
- **P2 — race E2E mobile:** il click su `#btn-list` poteva arrivare prima del completamento di `boot()`. Aggiunta attesa `#lib-shelves .lib-book` in stato `attached` prima del click e attesa `visible` dopo; suite rilanciata due volte con esito identico.
- **P2 — focus perso nel re-layout:** `renderShelves()` sostituiva i nodi e faceva cadere il focus su `<body>`, bloccando le frecce. Ora cattura `dataset.moduleId` dell'elemento attivo dentro lo scaffale e lo ripristina dopo `applyState()`. Nuovo assert E2E con ridimensionamento `1440→1100→1440`.
- **Verifica locale finale:** `node --check` verde su `js/library.js`, `js/main.js`, `tools/e2e.js`, `tools/screenshot.js`, `tools/serve.js`; check-links `CHECKED 80 risorse · 0 errori`; E2E `SUMMARY {"total":39,"passed":39,"failed":0}` per due esecuzioni consecutive; screenshot `1440x900`, `768x1024`, `360x800` con `EXIT=0`; detector invariato a 6 warning pre-esistenti fuori surface; `git diff --check` pulito.

## Libreria interattiva — deploy e verifica online

- Commit feature: `a19d3989bfb257c30225930ad2150d545820ec50` (`feat: piattaforma didattica libreria interattiva`), push normale su `origin/main`: `dcdc099..a19d398`. Nessun force push e nessuna riscrittura della storia.
- Workflow Pages `45264268760` completato con `conclusion=success` per lo SHA `a19d3989bfb257c30225930ad2150d545820ec50`.
- Online: `<title>Libreria · FARMACISTA</title>`; `css/library.css` e `js/library.js` HTTP 200; `css/mindmap.css` e `js/mindmap.js` HTTP 404.
- check-links online: `CHECKED 80 risorse · 0 errori`, `EXIT=0`.
- E2E online: `SUMMARY {"total":39,"passed":39,"failed":0}`, `EXIT=0`; console, pageerror, richieste fallite e HTTP 4xx/5xx tutti vuoti.
- Screenshot online in `/tmp/verify-tools-online/`: `desktop-1440x900.png`, `tablet-768x1024.png`, `mobile-360x800.png`, tutti PNG validi alle dimensioni richieste.
- `git rev-list --left-right --count origin/main...HEAD` → `0 0` prima della registrazione documentale finale.

## Vista elenco — board Kanban (FASE 0/1/2)

- `layout08_kanban.png` non è presente nel repo né in `/home/k10`: riferimento authority sono le specifiche testuali e il design system live. Nessuna domanda, come richiesto dalla missione.
- MWG: 5 ricerche e retrieve `css-layout,card,spatial-navigation,accessibility,progress,natural-interactions,form-factor-adaptation` (`EXIT=0`, `117883` byte in `/tmp/mwg-kanban/guide.md`). `impeccable context --target index.html` → `NO_PRODUCT_MD`, `BUILD_INIT_REQUIRED`, `SCOPED_EXISTING_ALLOWED`, `EXISTING_VISUAL_SYSTEM`; non creare `PRODUCT.md`/`DESIGN.md`.
- Target confermato: vecchia vista elenco `#module-list` popolata da `buildModuleList()` in `js/main.js`. Nuovo modulo `js/kanban.js` + `css/kanban.css`; `index.html` usa `<section class="kanban-shell" id="module-list">`; `js/main.js` integra `createKanban` senza toccare router, PDF, dati, libreria o `js/viewer.js`.
- **Ruling K16** — target confermato come sopra; la libreria resta invariata e la board sostituisce solo `#module-list`.
- **Ruling K17/K19** — 7 STOP automatici su `js/kanban.js` corretti con 6 edit minimi: `const expanded`, niente ternari annidati, `for...of` per l'aggiornamento del tab index, ramo positivo prima in `render()`.
- **Ruling K20/K21** — CSS board con tre colonne, colori richiesti, card bianche e bordo `#E3E0D6`; fallback a una colonna sotto `900px` e `prefers-reduced-motion`. Warning “Pi-lens css analysis unavailable” non bloccantema vieta claim di CSS verificato prima di E2E e detect.
- **Ruling K22** — selettore `Mappa | Elenco` nell'hero con `#btn-map`/`#btn-list`; vecchio pulsante in `.lib-footbar` rimosso per evitare duplicati.
- **Ruling K23/K24** — adattati `homeTitle()`, `setListView()` → `setViewMode()`, bootstrap e callback senza modificare `openModule()`, `renderModuleView()` o `route()`.
- **Ruling K25/K26** — integrazione JS completata; STOP 11 e STOP 3 risolti senza variabili fittizie.
- **Ruling K27/K28** — `VIEW_KEY = "farmacista:v1:view"`; `loadViewMode()` usa try/catch e default mobile `list`; `setViewMode()` aggiorna `aria-pressed`, titolo, copy e visibilità di board/libreria.
- **Ruling K29/K36/K37/K38/K39** — root cause del tracciamento: `viewer.current()` restituisce `{ mod, n }`, non un numero. `syncProgressFromViewer()` ora verifica `viewer.isOpen()` e legge `viewer.current()?.n`; `goto()` è stato riletto per non duplicare clamp/logica interna. `js/viewer.js` non modificato.
- **Ruling K30/K33/K34** — callback di board, libreria, ricerca e flusso registrano le slide; il campo `source: "kanban"` evita doppia registrazione in `renderModuleView()`.
- **Ruling K35/K40/K41/K42** — strumenti E2E riscritti sui selettori reali della board; rimossi wait e asserzioni library-oriented. Rilettura di `makeSlide()`/`makeDetail()` come authority per `.kb-slide`, `.kb-topic-btn`, `#kb-detail-<mod.id>` e copy di stato vuoto.
- **Ruling K43** — le colonne vuote restano visibili di default: le specifiche chiedono tre colonne; solo con filtro attivo vengono nascoste. Prima implementazione nascondeva “In corso”/“Completati” all'avvio; corretto in `render()`.
- **Ruling K44** — refuso `Azzzerare` corretto in `Azzerrare` nella conferma in-page; nessun `confirm()` nativo.
- **Ruling K45** — E2E: il primo fallimento era un'assunzione del test (`waitForSelector` su elemento nascosto richiede `state=attached` o `waitForFunction`) e la già citata logica colonne; secondo giro ha corretto aussi ordinamento (le colonne raggruppano lo stato, quindi il confronto va fatto dentro `.kb-column[data-status="doing"]`) e navigazione frecce (l'ordine DOM salta le card nelle altre colonne).
- **Fresh-context review** (read-only, agent `reviewer`): nessun P0/P1; un P2 concreto, corretto.
- **P2 — swipe del visore non tracciato:** il listener di `pointerup` di `js/main.js` era registrato prima di quello di `viewer.js` (che nasce al primo `open()`), quindi leggeva la pagina vecchia prima dello swipe e non c'era un evento successivo. Fix minimo: differire il sync a `requestAnimationFrame`, dopo il `goto()` del visore. Aggiunti due assert E2E che simulano lo swipe e verificano `#vw-cur` e `localStorage...seen`.
- **Verifica locale finale:** `node --check` verde su `js/kanban.js`, `js/main.js`, `tools/e2e.js`, `tools/screenshot.js`, `tools/serve.js`; check-links `CHECKED 81 risorse · 0 errori`; E2E `SUMMARY {"total":73,"passed":73,"failed":0}` con console, pageerror, richieste fallite e HTTP error vuoti; screenshot `1440x900`, `768x1024`, `360x800` PNG validi; `impeccable detect` 8 finding: 6 warning pre-esistenti, 1 advisory em-dash nel testo storico, 1 warning `side-tab` su `css/kanban.css:143`.
- **Deploy e CI:** commit `56d91fc` pushato su `main`. Il workflow Pages è fallito tre volte con `No artifacts named "github-pages"` anche se l'artifact risultava presente via API; root è il bug noto `actions/deploy-pages#451` (upload e deploy nello stesso job). Correzione: `.github/workflows/pages.yml` ora separa `build` (upload) e `deploy` (deploy-pages) come da rimedio ufficiale; rieseguita tutta la verifica locale dopo la modifica. Commit `9eabc14` con workflow separato: Pages run `45289339215` **success**.
- **Verifica online:** `https://mianogpp23.github.io/aspetti-normativi-farmacia/` restituisce `<title>Board · FARMACISTA</title>`, `css/kanban.css` 200, `js/kanban.js` 200; E2E online `SUMMARY {"total":73,"passed":73,"failed":0}` con gli stessi due assert sullo swipe.
- **Ruling K46** — il warning `side-tab` è accettato: la barra laterale a 4px non è decorazione generica ma codifica funzionale dell'identità del modulo con la palette già usata dalla libreria, ed è richiesta esplicitamente dalle specifiche. L'advisory em-dash riguarda testo storico fuori dalla surface board.

## Vista elenco — dashboard (FASE 0)

- **Ruling D0** — il design system live (`css/app.css`: carta calda `#F7F6F2`, inchiostro `#1F2933`, superfici bianche, palette moduli, raggi e ombre esistenti) resta authority per lo stile; il mockup `layout15_dashboard.png` fornisce solo struttura, sezioni e gerarchia.
- **Ruling D1** — la fonte wiki `SRC-2026-11-11-1538` (telemedicina Federfarma Ragusa 2026) è contesto collaterale: non modifica `content/manifest.json`, `js/data.js` né le priorità dei moduli.
- **Ruling D2/D4** — `describe_image` via canale storico era fallito per crediti insufficienti; in questa sessione il canale MCP `image-analysis` locale ha prodotto una descrizione reale con `ok: true`: intestazione “Buongiorno”, quattro metriche, colonna sinistra con “Riprendi da dove eri”, “Prossimi argomenti” e pulsante arancione “Continua”, colonna destra con “Pagine per modulo” e barre colorate. Nessuna descrizione visiva inventata.
- **Ruling D3** — i numeri del mockup (`8 moduli`, `71 argomenti`, `329 pagine`, `38%`) sono illustrativi; la dashboard runtime legge i totali dal manifest (`19` moduli, `120` argomenti, `725` pagine) e la percentuale dallo stato reale di avanzamento. Le barre dei moduli usano la palette già presente nel progetto.
- **Ruling D5** — i tre finding wiki pendenti sono stati registrati con `wiki_retro` (`pages-repo-sostituzione-decisione-storica`, `pages-mirror-axios-migrazione-repo`, `federfarma-telemedicina-2026-fonte-wiki`) e le pagine mancanti create con `wiki_ensure_page` (`GitHub Pages`, `Deploy workflow`, `Aspetti normativi farmacia`).
- **Ruling D6** — `js/kanban.js` e `css/kanban.css` sono moduli della sola vista elenco: vengono rinominati con `git mv` a `js/dashboard.js` e `css/dashboard.css` e riscritti integralmente. La rinomina è reversibile dalla storia Git; nessun PDF, dato o file non correlato viene cancellato.
- **Ruling D7** — lo stato usa `farmacista:v1:dashboard`; se assente, viene letto e migrato una volta il vecchio `farmacista:v1:kanban`, così l'avanzamento già registrato non si perde.
- **Ruling D8** — i tag HTML `<title>` e `<meta name="description">` restano invariati per il vincolo “meta e titolo”; il titolo dinamico della vista Elenco diventa “Dashboard · FARMACISTA”. Il costo accettato è una descrizione meta che cita ancora la board finché non verrà autorizzata una modifica ai meta.
- **Ruling D9** — router hash, vista Mappa, visore PDF full-screen, dati del manifest e contenuti originali restano invariati; il tracciamento slide continua a usare le API pubbliche del visore.
- **Ruling D10** — senza progressi registrati la card “Riprendi da dove eri” mostra uno stato vuoto con azione “Inizia”, e “Prossimi argomenti” propone i primi argomenti del manifest. Nessun dato fittizio: lo screenshot iniziale è meno identico al mockup, ma veritiero.
- **Ruling D11** — gli strumenti di verifica vengono aggiornati ai selettori dashboard e al viewport tablet richiesto `820×1100`; restano i pattern robusti già collaudati (`safePath`, HEAD/Range fallback, abort benigni delle thumbnail). Le riletture parziali/troncate dei file correnti sono state integrate con quelle complete prima dell'implementazione.
- Nessuna domanda o conferma intermedia è stata richiesta, come da missione; le scelte ambigue sono registrate qui.

## Vista elenco — dashboard (FASE 1/2/3)

- **Ruling D12** — `js/dashboard.js` espone `createDashboard({ mount, stats, greeting, subtitle, overallPct, overallBar, resume, next, filter, sort, count, live, reset, confirm, confirmYes, confirmNo, onSlide, onOpenModule })` con API `render`, `recordSlide`, `setQuery`, `state`, `destroy`. Lo stato è `farmacista:v1:dashboard` con migrazione una tantum da `farmacista:v1:kanban`; `localStorage` è protetto da try/catch e fallback in memoria.
- **Ruling D13** — STOP statico su `js/dashboard.js` (variabile `recordSlide` indichiarata, `lastFocused` non dichiarato, ternari annidati, parametro inutilizzato, `forEach`) corretto alla radice: `markSlide()`, `focusKind()`, rami `if/else if`, rimozione `lastFocused` e `for...of`. Nessuna variabile fittizia.
- **Ruling D14** — `PARTIAL APPLY` in `js/main.js`: 10 edit applicati e due non applicati per pattern ambiguo (`kanban?.recordSlide(mod, n);`). Root cause: edit non applicati, non dipendenza mancante. Sostituiti con contesto univoco; `grep` e `node --check` verde. Nessuna modifica a router, visore o libreria.
- **Ruling D15** — il selettore `#dash-overall-bar` ha ricevuto la classe `dash-overall` per collegare il progresso globale agli stili esistenti, senza cambiare ID o logica.
- **Ruling D16** — `handleKey()` chiude l'accordion con `Escape`, rimuove l'ID da `expanded`, rirenderizza e riporta il focus su `.dash-module-main` con `preventScroll`. La complessità `createDashboard cc new→133` resta un warning noto: la logica è concentrata in un modulo locale e i percorsi sono coperti da E2E.
- **Ruling D17** — `tools/e2e.js` e `tools/screenshot.js` riscritti per la dashboard: `data-testid="dashboard"`, `#dash-*`, `.dash-module`, `.dash-slide`, `.dash-topic-btn`, viewport `1440×900`, `820×1100`, `360×800`. I match residui “kanban” in E2E (`LEGACY_KEY`, invariante meta, verifica rimozione `.kb-*`) sono intenzionali e non vanno rimossi alla cieca.
- **Ruling D18** — `README.md` aggiornato da board a dashboard, con nuovi percorsi `css/dashboard.css`/`js/dashboard.js`, viewport tablet `820×1100` e comandi `node --check js/dashboard.js ...`; `tools/serve.js` allineato nel banner.
- **Ruling D19** — primo E2E dashboard `85/85` (poi `86/86`): (a) “Invio espande il modulo raggiunto” falliva perché il test assumeva che il modulo raggiunto fosse chiuso, mentre un precedente `recordFromModule(2,3)` lo aveva già aperto; il test ora normalizza lo stato prima di premere Invio. (b) `net::ERR_ABORTED` su `content/search.json` e `favicon.svg` sono abort di navigazione durante `reload`, non errori di rete: `benignAbort()` li ammette solo per questi asset già caricati con successo nel primo accesso. Nessuna modifica all'app per questi due fallimenti.
- **Ruling D20** — `tools/screenshot.js` inizialmente attendeva `.lib-book` visibile anche su mobile, dove la vista predefinita è dashboard: timeout. Root cause: assunzione del vecchio default desktop. Ora attende `#dash-modules .dash-module` con `state: "attached"` prima di forzare la vista elenco.
- **Ruling D21** — `impeccable detect` segnalava un `side-tab` su `css/dashboard.css:265`. La barra laterale non era richiesta dal mockup (che mostra barre colorate per modulo): rimossa; il colore modulo resta codificato in `.dash-module-key` e nel fill di `progress.dash-progress`, mentre il progresso globale conserva il gradiente brand. E2E aggiornato di conseguenza (`colore modulo dalla palette`, `nessuna barra laterale decorativa`).
- **Verifica visiva screenshot:** le tre catture sono state analizzate con il canale MCP locale `image-analysis` (`ok: true`, provider NVIDIA NIM): desktop mostra hero Buongiorno, quattro statistiche, Riprendi/Prossimi argomenti e Pagine per modulo; tablet mantiene la stessa gerarchia in colonna singola; mobile mostra header, statistiche e avanzamento senza overflow.

### Review finale fresh-context e correzioni

- **Ruling D22** — il reviewer ha segnalato un P1 reale: il modulo `introduzione` ha `pdf.pages: 0` e nessuna slide; `progressOf()` restituiva 0 prima di controllare l'override, quindi “Segna completato” cambiava solo l'etichetta in “Riapri” e `resumeModule()` poteva sceglierlo, generando `slide 1 di 0` e un pulsante che apriva un PDF inesistente. Correzione alla radice: `overrideBtn.disabled = !pagesOf(mod)`, guardia in `setOverride()`, guardia in `markSlide()` e `continue` in `resumeModule()` per i moduli senza pagine. Nessun dato fittizio aggiunto.
- **Ruling D23** — il test dello swipe era tautologico (`check(..., true)`). Ora passa a `check()` l'esito del `waitForFunction`, quindi un mancato salvataggio produce un FAIL nominativo.
- **Ruling D24** — i filtri locali/globali controllavano solo il numero di righe. Ora verificano che ogni `data-module-id` visibile corrisponda a un modulo il cui titolo, argomenti o slide contengano effettivamente il token di ricerca, usando la stessa normalizzazione di `js/dashboard.js`.
- **Ruling D25** — la migrazione “una tantum” non rimuoveva `farmacista:v1:kanban`: se la chiave dashboard veniva cancellata, il vecchio progresso riemergeva. Ora `loadStore()` rimuove la chiave legacy dopo la copia; l'E2E verifica la rimozione e la prevalenza della chiave dashboard quando entrambe sono presenti.
- **Ruling D26** — aggiunta un'asserzione dedicata al modulo senza PDF: azioni `Continua` e `Segna completato` disabilitate, stato “Da iniziare”, e contesto isolato con override `done` per verificare che “Riprendi da dove eri” non lo selezioni. Il reviewer non ha trovato P0; nessun altro finding richiedeva modifiche.
- **Verifica locale finale dopo review:** `node --check` verde su `js/*.js` e `tools/*.js`; `git diff --check` `DIFF_CHECK_OK`; check-links `HTML 200`, `MANIFEST 200 moduli=19`, `CHECKED 81 risorse · 0 errori`; E2E `SUMMARY {"total":92,"passed":92,"failed":0}` con `console pulita — []`, `nessun pageerror — []`, `nessuna richiesta fallita — []`, `nessun errore HTTP — []`; screenshot rigenerati `desktop-1440x900.png`, `tablet-820x1100.png`, `mobile-360x800.png`; `impeccable detect` `DETECT_EXIT=2`, `FINDINGS 7`, tutti in `index.html` e pre-esistenti (broken-image, 3× tiny-text, 2× cramped-padding, dark-glow), nessuno nella surface dashboard. La complessità segnalata è salita a `createDashboard cc new→136`, warning noto e coperto dai 92 controlli E2E.

### Deploy e verifica online

- Commit implementazione: `1fa1e07d9cf9a2218aaadc0220a7c92c4c57440c` — `feat: sostituisci board con dashboard nella vista elenco`; push normale su `main` da `873f205` a `1fa1e07`, senza force push e senza riscrittura della storia.
- Pages: run `45344894075` (`https://github.com/mianogpp23/aspetti-normativi-farmacia/actions/runs/45344894075`) completato con `conclusion: success` sullo SHA dell'implementazione.
- URL verificato: `https://mianogpp23.github.io/aspetti-normativi-farmacia/`. HTTP `200` per home, `css/dashboard.css` e `js/dashboard.js`; HTTP `404` per i vecchi `css/kanban.css` e `js/kanban.js`, come atteso dopo la sostituzione. `<title>Board · FARMACISTA</title>` invariato e `<meta name="description">` byte-identica a `HEAD`.
- check-links online: `HTML 200`, `MANIFEST 200 moduli=19`, `CHECKED 81 risorse · 0 errori`. E2E online: `SUMMARY {"total":92,"passed":92,"failed":0}` con console, pageerror, richieste fallite e HTTP error vuoti.
- Screenshot online validi: `/tmp/verify-dashboard-online/desktop-1440x900.png`, `/tmp/verify-dashboard-online/tablet-820x1100.png`, `/tmp/verify-dashboard-online/mobile-360x800.png` (dimensioni verificate dallo strumento). Nessuna consegna Telegram: sessione disconnessa e non autorizzata per questa missione.

## Quattro viste modulo e selettore globale (FASE 0 — contesto e decisioni)

- **Ruling V8** — ultima evidenza `content/manifest.json`: `modules=19`, `modulesWithSlides=18`, `pdfs=18`, `pages=725`, `topics=120`, `renderedImages=725`, `imageBytes=59016832`, `pdfBytes=43850680`. Il valore storico `59016859` resta solo una discrepanza di contesto: i numeri applicativi leggono sempre il manifest a runtime.
- **Ruling V9** — `<title>` e `<meta name="description">` restano byte-identici; il titolo dinamico continua a seguire il manifest e il router non impone stringhe fisse.
- **Ruling V10** — `pendingSlide`, `trackedModuleId`, `lastTrackedSlide`, `viewMode`, `loadViewMode()` e `saveViewMode()` restano il ponte tra ricerca/dashboard/visore. Le nuove viste aggiungono una chiave dedicata senza cancellare lo stato storico.
- **Ruling V11** — nessuna domanda o approvazione intermedia: le Skill che chiedono scelta preventiva vengono applicate nella parte compatibile; la deroga al divieto utente è registrata qui.
- **Ruling V12** — analisi visiva reale dei quattro mockup ottenuta con il server MCP `image-analysis` locale (`ok: true`) e script `node` dedicati: Carosello, Sommario, Esagoni e Palette. I testi illustrativi dei mockup non diventano dati applicativi.
- **Ruling V13** — Carosello è la vista predefinita. Sommario usa numeri di pagina cumulativi calcolati dal manifest; Esagoni usa 19 celle per i 19 moduli e mostra il dettaglio del modulo selezionato; Cerca è una palette con gruppi Moduli/Argomenti/Slide e conteggi calcolati dai dati reali.
- **Ruling V14** — il selettore globale è un `<select>` semantico nella topbar, sempre presente anche nella vista modulo. Oltre alle quattro nuove viste include Libreria e Dashboard, così le viste esistenti restano raggiungibili. Il parametro condivisibile è `#/?vista=<nome>`; il fallback senza parametro usa `localStorage` e canonicalizza l'URL.
- **Ruling V15** — la palette di otto colori delle viste esistenti viene riutilizzata in tutte le nuove viste; il contrasto sui colori scuri è AA. Serif solo nel Sommario. Nessuna libreria esterna e nessun build step.
- **Ruling V16** — `/` e `Ctrl/Cmd+K` aprono e focalizzano Cerca; `Esc` chiude il visore o riporta alla vista precedente. Lo shortcut `/` globale di `js/search.js` viene spostato nella logica centrale per evitare due comportamenti diversi.
- **Ruling V17** — strumenti aggiornati: E2E per selettore, route con `?vista=`, quattro viste, visore e console; check-links per nuovi CSS/JS e route; screenshot di ogni vista a `1440×900`, `820×1100`, `360×800`.

## Quattro viste modulo e selettore globale (FASE 1 — implementazione)

- **Ruling V18** — `content/search.json` è piatto: 711 record con chiavi `m`, `n`, `t`, `x`; non ha campo `.kind`. La vista Cerca costruisce i gruppi Moduli/Argomenti/Slide tramite `js/search.js` e il manifest, non filtrando il JSON grezzo.
- **Ruling V19** — `content/manifest.json` è un oggetto con array `modules`; il comando `jq` fallito per precedenza di `|` non indica dati corrotti. Totale slide authority: 725 con `[.modules[].slides[]] | length`.
- **Ruling V20** — primo modulo authority: `id: dispositivi-medici-e-presidi-medico-chirurgici`, `slides_n: 53`, `slide0: n=1`, `topics0: t1 count=3 from=1 to=3`. Numeri cumulativi e pagine vanno calcolati dal manifest.
- **Ruling V21** — creato `js/views-common.js` con `MODULE_PALETTE`, `colorFor()`, `padded()`, `plural()`, `buildPageIndex()`. Palette identica a dashboard/libreria; `buildPageIndex()` è la fonte condivisa per pagine cumulative del Sommario e coerenza altre viste.
- **Ruling V22** — Carosello scritto da zero in `js/carousel.js`: API `createCarousel({ mount, onOpenModule })` → `{ render, select, focus, state }`. Metadati card da `topicsOf()` e `pagesOf()`, etichetta con `padded(mod.n) + mod.title + metaOf(mod)`, colori via `colorFor(index)`. Selezione roving tabindex, `aria-current`, dots `aria-selected`, frecce disabilitate agli estremi, scroll centrato, `behavior: reduced() ? "auto" : "smooth"`.
- **Ruling V22 fix** — STOP statico: import `$` inutilizzato rimosso; guard tastiera corretto a `if (!event.target.closest(".car-card")) return;`. Root cause: import non usato e listener su `#car-viewport` ma condizione su `.car-dot`.
- **Ruling V23** — Sommario scritto da zero in `js/summary.js`: API `createSummary({ mount, onOpenModule, onOpenTopic })` → `{ render, focus, state }`. Due colonne con `Math.ceil(list.length / 2)`, righe `<button>` con leader dotted e pagine allineate, `pageOfTopic()` restituisce `—` per casi edge, totali da `modules()`, `topicsOf()`, `buildPageIndex()`.
- **Ruling V24** — Esagoni scritto da zero in `js/honeycomb.js`: API `createHoneycomb({ mount, onOpenModule, onOpenTopic })` → `{ render, select, focus, state }`. Griglia `ROW_SIZES = [3, 4, 5, 4, 3]` per 19 moduli, SVG accessibile con `role="img"`/`title`/`desc`, roving tabindex, navigazione geometrica frecce, pannello dettaglio `aria-live="polite"`, colori via `colorFor()`.
- **Ruling V24 fix XSS** — STOP `L104` da `detail.innerHTML`; correzione DOM-only con `el()`, `detail.replaceChildren()`, `text` nelle label. Nessun sanitizer esterno.
- **Ruling V24 fix import** — dopo rewrite DOM-only, `esc` non usato; edit mirato a `import { el, svgEl } from "./utils.js";`.
- **Ruling V25** — Cerca/Palette scritto da zero in `js/palette.js`: API `createPalette({ mount, onOpenModule, onOpenTopic, onOpenSlide, onEscape })` → `{ render, setQuery, focus, state }`. Gruppi con limiti `{ module: 4, topic: 6, slide: 8 }`, input `#pal-input`, conteggi reali, ricerca tokenizzata su `norm()`, navigazione `ArrowDown/Up/Enter/Escape`. Usa `state.search` piatto e manifest/topics/slide title.
- **Ruling V25 fix STOP** — callback `forEach` con return implicito; corretto con blocco `items.forEach((node, i) => { node.setAttribute(...) });`.
- **Ruling V26** — `css/views.css` scritto da zero con `.view-picker`, `.car-*`, `.sum-*`, `.hex-*`, `.pal-*`, media query `900px`/`820px`/`480px` e `prefers-reduced-motion`. Serif confinata al Sommario, palette condivisa via variabili CSS/colori inline.
- **Ruling V27** — `index.html`: aggiunto `css/views.css`, `select#view-select` in topbar, mount per quattro nuove sezioni; vecchio `#view-switch`/`#btn-map`/`#btn-list` rimosso.
- **Ruling V28** — `js/main.js`: `GLOBAL_VIEW_KEY = "farmacista:v1:global-view"`; `DEFAULT_VIEW = "carosello"`; `loadGlobalView()` valida `VIEWS` e migra legacy `map→libreria`, `list→dashboard`; `goToView()` canonicalizza `#/?vista=<canonical>`. `libreria` e `dashboard` restano alias di `VIEW_HOME`. `onOpenSlide` imposta `pendingSlide` e calcola `topicAt()`.
- **Ruling V29** — scorciatoie centralizzate in `initShortcuts()`: `/` globale rimosso da `js/search.js`, `Ctrl/Cmd+K` e `/` (non digitando) aprono Cerca; `Esc` riporta a `DEFAULT_VIEW` solo se `activeView === "cerca"` e `activeElement === body`.
- **Ruling V28 fix STOP** — 17 issue iniziali (import/variabili inutilizzate) risolti implementando `initViews()`, `initShortcuts()`, `NEW_VIEWS`, `activeView`; 5 issue da chiavi duplicate in `parse()` risolte con `kind` + `view`.
- **Ruling V30** — warning `initShortcuts cc new→15` accettato come non bloccante: keyboard handling centralizzato richiede più rami; documentato.
- **Ruling V31** — `js/search.js` `render()` riscritta: `panel.innerHTML` → costuzione DOM via `el()`, `head()`, `groupNode()`, `panel.replaceChildren()`. Conservati `snippet()`, `esc()`, `dataset`, click handler `.sp-item`.
- **Ruling V32** — STOP aggiornato: `L176` XSS rimosso; rimangono `L192` (prefer `for...of` a `forEach`) e `L240` (chiusura `initSearch()` mancante). Correzione loop e chiusura senza toccare `snippet()`/`initSearch()` iniziale.
- **Ruling V33** — lettura `offset=105,limit=70` authority per root cause `L240`: la `}` di `initSearch()` era stata inclusa nel `oldText` della rimozione listener `/`; ripristinata subito dopo click esterno.
- **Ruling V34** — fix `js/search.js` completato: `}` ripristinata; loop `forEach` → `for...of` in `groupNode`; `node --check` verde su `js/*.js` e `tools/*.js`; `SYNTAX_OK`.
- **Ruling V35** — warning post-fix: 10 errori linter pre-esistenti in `js/search.js` e `⚠ complexity render cc 16→17` sono non bloccanti, da registrare non "pulire" ciecamente prima dei test E2E.
- **Ruling V36** — `tools/e2e.js` helper `check`, `norm`, `haystack`, `benignAbort`, `watch` preservati/adattati. `norm`: lowercase/NFD/diacritici/punteggiatura/whitespace; `haystack`: `M${pad(mod.n)}`, titoli modulo/argomenti/slide; `benignAbort`: `ERR_ABORTED` su `content/thumbs/`, `content/search.json`, `favicon.svg`; `watch`: console error/warning, pageerror, requestfailed non benigni, HTTP≥400, dialog.
- **Ruling V37** — controlli dashboard storici preservati: annullo conferma, reset, `dialogs.length===0`, `recordFromModule(1,1)`/`(2,3)`, ordinamento `#dash-sort-select` (progress/course), filtro `deontologico`. Output troncato non authority per seguito.
- **Ruling V38** — lettura parziale `js/carousel.js` authority solo per porzione visibile: `metaOf()` con `topicsOf()`/`pagesOf()`, pluralizzazione, `reduced()`, import `el/esc/clamp`, `modules/pagesOf/topicsOf`, `colorFor/padded/plural`, DOM iniziale con `#car-viewport` `tabindex=0` `role=group` `aria-label="Carosello dei moduli"`. Resto troncato non autorizza assunzioni.
- **Ruling V39** — `tools/verify-env.js`: `BASE_URL`, `OUT_DIR`, `CHROMIUM`, `results` (array `console`, `pageErrors`, `failedRequests`, `httpErrors`) sono configurazione condivisa; `tools/e2e.js` li importa già. Aggiornamenti futuri conservano i quattro array.

## Quattro viste modulo e selettore globale (FASE 2 — verifica e deploy)

- **Ruling V40** — E2E completo `75/75 PASS`: selettore, Carosello (card, frecce, tastiera, dots, Enter→modulo→visore), Sommario (moduli, argomenti, pagine cumulative, serif), Esagoni (19 celle, SVG accessibile, dettaglio, navigazione geometrica), Cerca (Ctrl+K, `/`, ricerca reale, gruppi, tastiera, Esc), visore (slide, frecce, swipe, brand→home), dashboard/libreria storiche, migrazione legacy, modulo senza PDF, responsive tablet/mobile, console/pageerror/request/HTTP/dialog vuoti.
- **Ruling V41** — `check-links` `CHECKED 82 risorse · 0 errori`: route `#/?vista=carosello|sommario|esagoni|cerca|libreria|dashboard` e `#/m/<id>` verificate.
- **Ruling V42** — screenshot 18 catture (4 nuove viste × 3 viewport + libreria/dashboard × 3 viewport) con `EXIT=0`.
- **Ruling V43** — `impeccable detect` su `index.html`, `css/views.css`, 6 JS nuovi: 7 finding, tutti pre-esistenti in `index.html` (broken-image, 3× tiny-text, 2× cramped-padding, dark-glow); zero finding su `css/views.css` e 6 file JS nuovi. Warning complessità `initShortcuts` 15 e `render` 17 documentati.
- **Ruling V44** — `node --check` verde su `js/*.js` e `tools/*.js`; `git diff --check` `DIFF_CHECK_OK`.
- **Ruling V45** — commit atomici includono: `LOG.md`, `index.html`, `css/views.css`, `js/views-common.js`, `js/carousel.js`, `js/summary.js`, `js/honeycomb.js`, `js/palette.js`, `js/main.js`, `js/search.js`, `tools/e2e.js`, `tools/check-links.js`, `tools/screenshot.js`.
- **Ruling V46** — push normale su `main` senza force push; Pages run completato con success; check-links e E2E online rilanciati e verdi; screenshot online catturati; consegna finale con tutto verde.
