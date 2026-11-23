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
