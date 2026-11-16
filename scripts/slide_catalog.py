"""Curated metadata for the 84 slides in the medicinali course PDF."""

from __future__ import annotations

from typing import TypedDict


class SlideMeta(TypedDict):
    """Stable metadata shared by the build pipeline and the web application."""

    number: int
    title: str
    category: str


CATEGORIES: dict[str, str] = {
    "introduzione": "Introduzione",
    "fondamenti": "Fondamenti e classificazione",
    "prescrizione": "Prescrizione medica",
    "tipi-di-ricetta": "Tipi di ricetta",
    "ricetta-rossa": "Ricetta rossa SSN",
    "dematerializzazione": "Dematerializzazione",
    "stupefacenti": "Stupefacenti e dolore",
    "registri": "Registri e adempimenti",
    "adempimenti": "Responsabilità e sintesi",
}

_RAW_SLIDES: tuple[tuple[int, str, str], ...] = (
    (1, "Gestione dei medicinali uso umano e disciplina di dispensazione al pubblico", "introduzione"),
    (2, "Gestione dei medicinali per uso umano – Disciplina di dispensazione al pubblico", "introduzione"),
    (3, "Classificazione dei medicinali", "fondamenti"),
    (4, "Classificazione dei medicinali – Regime di dispensazione al pubblico", "fondamenti"),
    (5, "Medicinali – Il bilancio rischio-beneficio", "fondamenti"),
    (6, "Classificazione dei medicinali sulla base del regime di dispensazione", "fondamenti"),
    (7, "La prescrizione medica", "prescrizione"),
    (8, "La prescrizione medica – Supporti ammessi", "prescrizione"),
    (9, "La prescrizione medica – Regime SSN e regime privato", "prescrizione"),
    (10, "Tipologie di ricette: classificazione", "tipi-di-ricetta"),
    (11, "Classificazione dei farmaci e regime di rimborsabilità", "tipi-di-ricetta"),
    (12, "Farmaci A/PHT – Prontuario ospedale territorio", "tipi-di-ricetta"),
    (13, "Etichettatura dei medicinali e regime di dispensazione", "tipi-di-ricetta"),
    (14, "Etichettatura dei medicinali e regime di dispensazione", "tipi-di-ricetta"),
    (15, "Ricetta ripetibile (RR)", "tipi-di-ricetta"),
    (16, "Ricetta ripetibile (RR) – Elementi obbligatori", "tipi-di-ricetta"),
    (17, "Ricetta da rinnovare volta per volta (RNR)", "tipi-di-ricetta"),
    (18, "Ricetta da rinnovare volta per volta (RNR) – Elementi obbligatori", "tipi-di-ricetta"),
    (19, "Ricetta limitativa (RRL; RNRL)", "tipi-di-ricetta"),
    (20, "Ricetta limitativa (RRL; RNRL) – Elementi obbligatori", "tipi-di-ricetta"),
    (21, "Ricetta rossa a lettura ottica SSN", "ricetta-rossa"),
    (22, "Ricetta rossa a lettura ottica SSN – Uso personale e responsabilità", "ricetta-rossa"),
    (23, "Ricetta rossa a lettura ottica SSN – Istruzioni per la corretta compilazione", "ricetta-rossa"),
    (24, "Ricetta rossa a lettura ottica SSN – Codice della ricetta", "ricetta-rossa"),
    (25, "Ricetta rossa a lettura ottica SSN – Modalità di compilazione", "ricetta-rossa"),
    (26, "Ricetta rossa a lettura ottica SSN – Elementi obbligatori", "ricetta-rossa"),
    (27, "Ricetta rossa a lettura ottica SSN – Assistito e codice fiscale", "ricetta-rossa"),
    (28, "Ricetta rossa a lettura ottica SSN – Dati relativi all’esenzione", "ricetta-rossa"),
    (29, "Ricetta rossa a lettura ottica SSN – Prescrizione e Note AIFA", "ricetta-rossa"),
    (30, "Le Note AIFA", "ricetta-rossa"),
    (31, "Ricetta rossa a lettura ottica SSN – Data, timbro e firma del medico", "ricetta-rossa"),
    (32, "Ricetta rossa a lettura ottica SSN – Sigla provincia e codice ASL", "ricetta-rossa"),
    (33, "Ricetta rossa a lettura ottica SSN – Numero confezioni e tipo di ricetta", "ricetta-rossa"),
    (34, "Ricetta rossa a lettura ottica SSN – Tipi di ricetta per assistito straniero", "ricetta-rossa"),
    (35, "Ricetta rossa a lettura ottica SSN – Tipi di ricetta per assistito straniero", "ricetta-rossa"),
    (36, "Straniero temporaneamente presente (STP) – Tipo di ricetta", "ricetta-rossa"),
    (37, "Assistito SASN da istituzioni europee (NE) – Tipo di ricetta", "ricetta-rossa"),
    (38, "Assistito SASN da istituzioni extraeuropee (NX) – Tipo di ricetta", "ricetta-rossa"),
    (39, "Assistito SASN da istituzioni europee (UE) – Tipo di ricetta", "ricetta-rossa"),
    (40, "Assistito SASN da istituzioni europee (UE) – Tipo di ricetta", "ricetta-rossa"),
    (41, "Stranieri appartenenti alla Comunità Europea – Denominazione e codice paese", "ricetta-rossa"),
    (42, "Stranieri appartenenti alla Comunità Europea", "ricetta-rossa"),
    (43, "Dematerializzazione della prescrizione medica", "dematerializzazione"),
    (44, "Dematerializzazione della ricetta medica – La normativa non cambia", "dematerializzazione"),
    (45, "Flusso prescrizione medica dematerializzata", "dematerializzazione"),
    (46, "Ricette SSN – Riepilogo degli adempimenti del farmacista", "dematerializzazione"),
    (47, "La ricetta medica dematerializzata – Farmaci non SSN", "dematerializzazione"),
    (48, "Promemoria ricetta dematerializzata – Farmaci non SSN", "dematerializzazione"),
    (49, "Disciplina degli stupefacenti e sostanze psicotrope", "stupefacenti"),
    (50, "Legge 12/2001 e legge 38/2010 – Terapia del dolore", "stupefacenti"),
    (51, "Medicinali stupefacenti – Classificazione", "stupefacenti"),
    (52, "Gradi per la classificazione del dolore e dei rispettivi farmaci", "stupefacenti"),
    (53, "Medicinali stupefacenti – Ricettario a ricalco", "stupefacenti"),
    (54, "Medicinali stupefacenti – Ricetta a ricalco", "stupefacenti"),
    (55, "Medicinali stupefacenti – Utilizzo ricettario SSN", "stupefacenti"),
    (56, "Medicinali stupefacenti – Utilizzo ricetta elettronica", "stupefacenti"),
    (57, "Medicinali stupefacenti – Utilizzo ricetta elettronica", "stupefacenti"),
    (58, "Medicinali stupefacenti – Prescrizione dematerializzata", "stupefacenti"),
    (59, "Modalità di compilazione della ricetta SSN", "stupefacenti"),
    (60, "Medicinali stupefacenti – Obbligo di RMR", "stupefacenti"),
    (61, "Medicinali stupefacenti – Ricetta a ricalco", "stupefacenti"),
    (62, "Medicinali stupefacenti – Sezione A", "stupefacenti"),
    (63, "Ricetta speciale (RMR)", "stupefacenti"),
    (64, "Ricetta speciale (RMR) – Elementi obbligatori", "stupefacenti"),
    (65, "Medicinali stupefacenti – Sezione B e C", "stupefacenti"),
    (66, "Medicinali stupefacenti – Sezione B e C", "stupefacenti"),
    (67, "Ricetta non ripetibile (RNR)", "stupefacenti"),
    (68, "Ricetta non ripetibile (RNR) – Elementi obbligatori", "stupefacenti"),
    (69, "Medicinali stupefacenti – Sezione A-B-C: Buono acquisto e registri", "registri"),
    (70, "Medicinali stupefacenti – Sezione A-B-C: Dispensa frazionata", "registri"),
    (71, "Medicinali stupefacenti – Sezione D", "registri"),
    (72, "Ricetta non ripetibile (RNR)", "stupefacenti"),
    (73, "Ricetta non ripetibile (RNR) – Elementi obbligatori", "stupefacenti"),
    (74, "Medicinali stupefacenti – Sezione E", "registri"),
    (75, "Ricetta ripetibile (RR)", "stupefacenti"),
    (76, "Ricetta ripetibile (RR) – Elementi obbligatori", "stupefacenti"),
    (77, "Medicinali stupefacenti – Regime di dispensazione e adempimenti", "registri"),
    (78, "Prescrizione medicinali stupefacenti – Sezione A e D", "adempimenti"),
    (79, "Stupefacenti SSN – Riepilogo degli adempimenti del farmacista", "adempimenti"),
    (80, "Classificazione dei medicinali sulla base del regime di fornitura", "fondamenti"),
    (81, "Classificazione dei medicinali sulla base del regime di fornitura", "fondamenti"),
    (82, "Classificazione dei medicinali sulla base del regime di rimborsabilità", "fondamenti"),
    (83, "I farmaci soggetti a ricetta medica – La responsabilità del farmacista", "adempimenti"),
    (84, "Gestione dei medicinali per uso umano – Grazie per l’attenzione", "introduzione"),
)

SLIDES: list[SlideMeta] = [
    {"number": number, "title": title, "category": category}
    for number, title, category in _RAW_SLIDES
]
