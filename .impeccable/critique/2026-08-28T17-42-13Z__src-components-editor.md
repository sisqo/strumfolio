---
target: editor visuale (graphic mode)
total_score: 21
p0_count: 0
p1_count: 3
timestamp: 2026-08-28T17-42-13Z
slug: src-components-editor
---
# Critique — Editor visuale (graphic mode)

Method: dual-agent (A: design review su fork · B: detector deterministico). Review code-only: la rotta dell'editor è dietro il middleware di sessione e senza DATABASE_URL il login Credentials non funziona, quindi nessuna ispezione live; tutte le evidenze sono verificate su `GraphicEditor.tsx`, `EditorScreen.tsx`, `lib/editor/document.ts`, `lib/editor/edits.ts` e `globals.css` 5360–5832.

## Design Health Score — 21/40 (Accettabile)

| # | Euristica | Punti | Problema chiave |
|---|-----------|-------|-----------------|
| 1 | Visibilità dello stato | 2 | Nessuna anteprima di quale lettera riceverà l'accordo al tap; un accordo oltre il testo è visivamente indistinguibile da uno ancorato (`chord-trailing` è solo un gap di 0.35em) |
| 2 | Corrispondenza col mondo reale | 3 | Accordi sopra le parole come su carta; ma la spaziatura dell'editor mente rispetto al lettore (chip sovrapposti) |
| 3 | Controllo e libertà | 3 | Undo a 40 passi, Esc annulla, UnsavedGuard; manca redo, e Ctrl+Z non fa nulla |
| 4 | Coerenza e standard | 2 | Le frecce ‹ › compaiono all'estremità destra della riga, lontane dall'accordo che muovono; tap-riga=aggiungi vs tap-chip=modifica sono verbi diversi a pochi px |
| 5 | Prevenzione degli errori | 2 | Sbagliare lettera col dito è il caso normale, non l'eccezione; correggere costa molto |
| 6 | Riconoscimento vs memoria | 1 | Alt+freccia, tap-sulla-riga, nome-vuoto-cancella: tutti invisibili. Toolbar e modi solo icone (`title` è hover-only su un prodotto touch) |
| 7 | Flessibilità ed efficienza | 2 | Caret+«Chord» è preciso, ma niente suggerimenti accordi, niente drag, nessuna scorciatoia |
| 8 | Estetica e minimalismo | 3 | Sobrio e a sistema; le frecce a destra sono l'unico elemento «appiccicato» |
| 9 | Recupero dagli errori | 2 | Salvataggio gestito bene (modale piani, messaggi); «Chord» su riga vuota/commento non fa nulla, in silenzio |
| 10 | Aiuto e documentazione | 1 | Zero hint nell'editor; ogni gesto nascosto è documentato solo nei commenti del sorgente |

## Verdetto anti-pattern

- **LLM**: l'opposto dello slop sul piano visivo e architetturale (token a sistema, round-trip byte-exact). Il debito è interamente **interazionale**: niente manipolazione diretta, target sotto i 44px sugli oggetti più toccati, tre gesti portanti che esistono solo nei commenti del codice.
- **Detector**: 0 finding su tutti e tre i file dell'editor (scansione confermata valida, exit 0). Nessun falso positivo da discutere.
- **Overlay browser**: saltato — nessuna automazione browser con injection disponibile in sessione.

## Cosa funziona

1. **Input reale + copia fantasma**: caret nativo, tastiera del telefono, IME; posizionamento accordi calcolato dal browser, immune a font-load e cambio tema. Fondamenta giuste.
2. **Sorgente unica + edit puri con round-trip byte-exact**: i modi non possono divergere, l'undo è banale e corretto, `shiftChords` conserva gli accordi attraverso le riscritture.
3. **Grammatica da text editor**: Enter divide con gli accordi che seguono il loro lato, Backspace-a-0 unisce, la riga vuota si promuove al primo tasto, nome vuoto = accordo rimosso.

## Problemi prioritari

**[P1] Gli accordi non si trascinano — il primo gesto che chiunque prova.** I chip sono bottoni tap-only. Fix: drag con Pointer Events sul `.chord-chip` (≥6px di movimento = drag, sotto = il tap-per-modificare attuale), tick nel ghost che mostra la lettera di snap via `letterAt`, drop su un nuovo `moveChordTo(document, line, chord, at)` (generalizzazione a due righe di `moveChord`). Trascinare oltre l'ultima lettera = trailing. Zero cambi al modello/sintassi. → `/impeccable shape`

**[P1] Target touch sotto la regola dei 44px del progetto stesso.** Striscia accordi ~29px, chip a riposo ~18px, `line-remove` ~30px; le frecce ‹ › vivono all'estremo destro della riga. Fix: hit-area estese (overlay `::after` ≥44px) mantenendo la taglia visiva; spostare i controlli in una **barra per-riga sotto la riga in modifica** (‹ › · elimina · fatto), fuori da `.line-scroll` quindi senza il problema di clipping che ha esiliato le frecce. → `/impeccable adapt`

**[P1] Gli accordi oltre il testo esistono già, ma sono invisibili.** Tap a destra dell'ultima parola atterra già a `text.length` e rende in `chord-trailing` — ma niente lo comunica. Vincolo di formato: ChordPro conserva solo l'ordine oltre la fine, mai la distanza; il parser del lettore collassa gli spazi, quindi la «distanza reale» richiederebbe un'estensione di modello+lettore. Fix di visibilità prima: slot ⊕ fantasma dopo l'ultima parola sulla riga a fuoco («accordo dopo il testo»), veste distinta per i chip trailing (tick/puntino e gap maggiore). → `/impeccable shape` + `/impeccable clarify`

**[P2] Il campo accordo ignora il vocabolario che lo schermo già calcola.** `chordTokens(parsed)` esiste già in `EditorScreen`; il campo è un input nudo di 5ch (che clippa i nomi lunghi). Fix: riga di chip di suggerimento sopra il campo aperto — gli accordi della canzone per frequenza, recenti prima; un tap compila e conferma. Campo che si allarga col contenuto. → `/impeccable shape`

**[P2] Chip sovrapposti su lettere uguali o vicine.** I pareggi a metà riga si impilano su un anchor a larghezza zero; due chip lunghi a 1–2 lettere di distanza collidono, mentre il lettore allarga le parole. Il ghost non va allargato (rispecchia l'input). Fix di sola presentazione: misurare i rect dei chip dopo il layout; in caso di overlap, sollevare il chip successivo su una seconda corsia con una lineetta di richiamo verso l'anchor. → `/impeccable polish`

## Red flag per persona

- **Casey (telefono, una mano — l'utente primario da PRODUCT.md)**: la striscia da ~29px sta subito sopra l'input — un mis-tap del pollice muove il caret invece di aggiungere l'accordo, o viceversa; Salva e Undo stanno in alto, fuori dalla zona del pollice, mentre la schermata di lettura ha già risolto lo stesso problema in basso con la ControlBar.
- **Alex (desktop, power user)**: Ctrl+Z non fa nulla (l'input controllato ha mangiato l'undo nativo), niente redo, nessuna scorciatoia per «Chord», Alt+freccia funziona ma non è annunciato da nessuna parte.
- **Il musicista a 5 minuti dal palco, telefono in mano**: trova la riga scrollando (niente ricerca in editor), centra un chip da ~18px sotto luce di palco, ridigita il nome completo sulla tastiera dei simboli, allunga il pollice fino in cima per salvare. Ogni passo è possibile; ogni passo ha attrito esattamente dove lo stress è massimo.

## Carico cognitivo

Pass: focus singolo, chunking per righe, gerarchia visiva (accento = solo accordi), una cosa alla volta, progressive disclosure (Song data in `<details>`). Fail: raggruppamento (frecce all'estremo opposto del chip), memoria di lavoro (tenere a mente «in che riga è il caret», segnalato da un bordo di 2px, mentre si raggiunge la toolbar; più tre gesti invisibili), scelte al limite (~11 controlli nella testata sticky, i 5 comandi icon-only sono una striscia indifferenziata).

## Osservazioni minori

- Peso chip 600 vs spec chord 500 in DESIGN.md: lettore ed editor dovrebbero concordare.
- Il tasto Canc a inizio riga non unisce in avanti (esiste solo il percorso Backspace).
- «+ line» è in stile `editor-hint` da 0.75rem per l'unico controllo sempre visibile che aggiunge righe.
- `insertChord` su riga blank/commento/boundary non fa nulla in silenzio: disabilitare il bottone o promuovere la riga.
- `chord-row` è `role="presentation"` con un click handler: il gesto è invisibile ad AT (il percorso caret+Chord resta la via accessibile, va mantenuto di prima classe).
- Cap di history a 40 con coalescenza per `typing:${index}`: buono; da conservare quando si aggiunge il redo.

## Domande da considerare

1. E se la precisione a lettera fosse una falsa precisione? I musicisti mirano alle **sillabe**: snap del tap a inizio sillaba/parola (drag per il fine-tuning) e la maggior parte degli errori «di una lettera» smette di esistere.
2. E se solo la riga in modifica fosse un `<input>`, e tutte le altre fossero rese esattamente come il lettore? Onestà WYSIWYG e fedeltà dell'input nativo smetterebbero di essere nemiche.
3. L'esistenza del modo Source scusa in silenzio le lacune del Graphic? Se il Graphic assorbisse riordino dei trailing e vocabolario accordi, qualcuno oltre a te aprirebbe mai Source?
