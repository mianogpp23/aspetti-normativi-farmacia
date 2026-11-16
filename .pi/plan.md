# Piano sintetico — mappa-globo dei medicinali

Piano completo: `docs/superpowers/plans/2026-11-16-mappa-globo-farmaci.md`  
Specifica: `docs/superpowers/specs/2026-11-16-mappa-globo-farmaci-design.md`

## Obiettivo

Sito statico, offline e GitHub Pages-ready con 84 nodi cliccabili, ciascuno collegato alla slide originale.

## Interfacce condivise

```text
scripts/slide_catalog.py
  → scripts/build_slides.py
  → assets/data/slides.json
  → assets/js/map-model.js
  → assets/js/app.js
  → index.html
```

Il record canonico contiene `number`, `title`, `category`, `image`, `sourcePage`.

## Task

- [x] Task 1 — catalogo e scaffold verificabili.
- [ ] Task 2 — pipeline PDF → JPEG + JSON.
- [ ] Task 3 — modello puro del grafo.
- [ ] Task 4 — interfaccia completa e accessibile.
- [ ] Task 5 — test browser e confezionamento GitHub.
- [ ] Task 6 — server locale, log e consegna.

## Review focus

- Titoli e numeri 1–84 completi.
- Nessun collegamento del grafo puntato a un asset assente.
- Ricerca e filtro combinati correttamente.
- Viewer navigabile da tastiera.
- Percorsi relativi e nessuna risorsa remota.

## Criteri di completamento

- Test Python, Node e Chromium headless verdi.
- 84 JPEG e 84 record JSON presenti.
- Sito responsive a 1440, 1024, 768 e 390 px.
- Nessun path `/home/k10` nel sito pubblicabile.
- README con istruzioni GitHub Pages.
- Commit locali Conventional Commits; nessun push.
