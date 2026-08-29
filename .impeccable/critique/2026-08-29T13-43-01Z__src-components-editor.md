---
target: editor visuale (graphic mode), secondo giro
total_score: 24
p0_count: 0
p1_count: 3
timestamp: 2026-08-29T13-43-01Z
slug: src-components-editor
---
# Critique — Editor visuale (graphic mode), secondo giro

Method: dual-agent (A: design review su fork isolato · B: detector + evidenze browser, isolato). **Questa volta con ispezione live**: server di sviluppo con auth bypassata su una copia scratch, quindi tutte le misure sono `getBoundingClientRect()`/`getComputedStyle` sulla pagina vera a 390×844 (persona primaria), 768, 1440 e ~200% di zoom, in entrambi i temi. Il giro precedente (21/40) era code-only: il salto di punteggio va letto anche alla luce di questo.

## Design Health Score — 24/40 (Accettabile, +3 dal 21/40 del 28/08)

| # | Euristica | Punti | Problema chiave |
|---|-----------|-------|-----------------|
| 1 | Visibilità dello stato | 2 | L'esito del salvataggio — successo *e* fallimento — viene renderizzato a y = **−639px**, fuori schermo, salvando da dentro una canzone lunga. Zero live region in tutta la schermata |
| 2 | Corrispondenza col mondo reale | 3 | `{title:}` `{artist:}` `{songbook:}` mostrati come righe ChordPro grezze, cancellabili ma non modificabili, in doppione con la card «Song data» appena sopra |
| 3 | Controllo e libertà | 3 | Ctrl+Z/Shift+Z/Ctrl+Y funzionano; ma **nessun controllo Redo** — su telefono il redo non esiste. `UnsavedGuard` è un `window.confirm` nativo senza «Salva ed esci» |
| 4 | Coerenza e standard | 2 | Cinque controlli icon-only in cinque taglie e quattro raggi (30.4/38/44/66/40px); tre fanno lo stesso mestiere con tre vocabolari diversi |
| 5 | Prevenzione degli errori | 2 | `×` Rimuovi è il vicino immediato di `✓` Fatto, entrambi 44×44, stesso fill, stesso raggio — il rosso che li distingue vive dentro `@media (hover:hover)`, cioè mai su un telefono |
| 6 | Riconoscimento vs memoria | 3 | Lo slot ⊕ rende finalmente visibile un gesto nascosto — poi viene tagliato a ~3px dei suoi 23px a 390px |
| 7 | Flessibilità ed efficienza | 3 | Drag e suggerimenti spediti e funzionanti; ma i 7 chip di suggerimento non hanno percorso da tastiera e ne sono visibili ~2.5 su 8 con la scrollbar soppressa |
| 8 | Estetica e minimalismo | 3 | Bello a riposo; la corsia 2 non è gestita, quindi tre accordi vicini si impastano in una parola illeggibile |
| 9 | Recupero dagli errori | 2 | Un salvataggio fallito è silenzioso: messaggio fuori schermo e il bottone Save resta semplicemente abilitato |
| 10 | Aiuto e documentazione | 1 | Nulla spedito. Tap-per-aggiungere, drag-per-spostare, nome-vuoto-rimuove e Alt+freccia sono documentati solo nei commenti del sorgente |

**I tre P1 del giro precedente, verificati:**
- **Accordi non trascinabili → RISOLTO, e risolto bene.** Verificato indipendentemente da entrambi gli agenti (pointer events e input mouse CDP reale): soglia 6px, drop preciso alla lettera, auto-scroll ai bordi, `touch-action: pan-y`, feedback `is-dragging` con fill accent-soft. Il sorgente cambia come deve; il tap-per-modificare sotto i 6px continua a funzionare.
- **Target sotto i 44px → PARZIALE.** La barra accordi è 44×44, `.line-remove` è 44.8×44.8 effettivi, i segmenti 66×44. Ma il chip accordo — l'oggetto più toccato — resta 22.4px dipinti / 32px effettivi, e la `.chord-row` che è la vera superficie del gesto è alta 33.2px. La toolbar è 38×40.
- **Accordi trailing invisibili → RISOLTO, POI TAGLIATO.** La cucitura tratteggiata e lo slot ⊕ sono corretti e leggibili — e a 390px ne sono visibili ~3px su 23.

## Verdetto anti-pattern

**LLM**: l'opposto dello slop, e non di poco. `syllables.ts` è un vero modello di sillabazione italiana (nuclei vocalici, code `l/m/n/r`, digrammi e s-impura) scritto perché il pollice atterri dove il musicista intende; i chip pendono da anchor a larghezza zero sulla *baseline* del ghost, con l'argomento scritto del perché misurare dall'alto era sbagliato; `.chord-field` è 17px con un commento che nomina la soglia dei 16px sotto cui iOS zooma. Roba scritta, non generata.

Due ban però sono colpiti davvero:
- **Text overflow**: con `[Cmaj7]a[Ebm7b5]b[F#m7]c` due chip sollevati in corsia 2 si sovrappongono di **49.6px in orizzontale e 22.4 in verticale**, dipingendo `EF#m7b5`. Anche il `.chord-field` aperto copre il chip vicino.
- **Vocabolario di componenti incoerente**: le cinque taglie/quattro raggi della riga 4 della tabella.
- **Modal-as-first-thought (parziale)**: `UnsavedGuard` usa `window.confirm` — chrome di sistema, font di sistema — in un'app che ha sostituito perfino il triangolo nativo di `<details>` perché era «l'unica cosa su questa schermata non in mano all'app».

**Detector deterministico**: 0 finding su `src/components/editor` (exit 0), verificato tre volte e con un controllo sul parent (`src/components` → 20 finding, nessuno dentro `editor/`). **Attenzione al valore di questa prova**: sui file non-HTML il detector fa solo pattern matching regex, quindi `[]` significa «nessun pattern ha fatto match», non «audit pulito».

In modalità URL il detector **fallisce in silenzio in questo ambiente** (puppeteer assente + Chrome in cache x86 su host aarch64): stampa `[]` ed esce `0`, con l'errore solo su stderr — una scansione fallita è indistinguibile da una pulita. Forzata a mano, dà 5 finding: `low-contrast` ×2, `cramped-padding` ×2, `flat-type-hierarchy` ×1. **Tre sono falsi positivi**: i due `low-contrast` colpiscono controlli *disabilitati* (WCAG 1.4.3 li esenta, e `globals.css:54` documenta `--faint` proprio come «riservato ai controlli disabilitati esenti»); `flat-type-hierarchy` misura una rampa 11–18px che attraversa TopBar, Footer e il form Song-data collassato — è di pagina, non dell'editor.

**Overlay browser**: non presentato — nessun overlay iniettato in un browser visibile all'utente in questa sessione. Le evidenze visive sono screenshot letti dagli agenti, non un overlay live.

## Cosa funziona

1. **Ghost anchor + snap sillabico** (`GraphicEditor.tsx:969`, `syllables.ts:31-64`). I chip sono posizionati dal layout del browser su una copia nascosta della riga, quindi nulla deriva al caricamento del font o al cambio tema — verificato stabile su due temi e quattro larghezze. E il tap si aggancia a una *sillaba modellata*, non alla lettera cruda: cancella l'intera classe di errore «sbagliato di una lettera» invece di mitigarla. È la correzione rara che rimuove un problema invece di aggiungere un controllo.
2. **La barra accordi per-riga** (`globals.css:6547-6601`). È la risposta giusta a un vincolo che il codice dichiara: `.line-scroll` taglia in verticale apposta, quindi un controllo da pollice non può viverci dentro. Ogni controllo misura esattamente 44×44, non scorre mai via con una riga lunga, e i suggerimenti sono il vocabolario della canzone stessa — 7 degli 8 offerti erano già nel brano, quindi nominare è di solito **un tap** invece di otto battute sulla tastiera dei simboli.
3. **La misura del gesto di drag** (`GraphicEditor.tsx:898-980`). Soglia 6px; raggio di presa 16px ma raggio di *tap* solo 6px, così lo spazio fra due accordi resta un posto dove **aggiungere**; `touch-action: pan-y` perché il browser non rubi mai la trazione; auto-scroll a 28px dal bordo in passi da 12. Quattro decisioni separate, ognuna delle quali sarebbe stata sbagliata al contrario.
4. **Accessibilità di base migliore di quanto sembri.** Tab walk completo: **85 stop, tutti raggiungibili, tutti con outline accent da 2px**, inclusi tutti e 34 i chip. Zero bottoni senza nome, zero etichette solo-`title` nell'albero AX. Contrasto verificato su ~20 elementi in entrambi i temi: passa ovunque tranne un caso (sotto).

## Problemi prioritari

**[P1] La corsia 2 non è gestita: tre accordi vicini diventano una parola illeggibile.** Il passaggio di collisione (`GraphicEditor.tsx:850-858`) traccia `groundRight` per la corsia di base e solleva in corsia 2 ciò che si sovrapporrebbe — ma nulla traccia il bordo destro *dentro* la corsia 2. Due accordi in collisione sono gestiti bene; il terzo no. Accordi su sillabe consecutive sono ordinari in questo repertorio, e il musicista che abbassa lo sguardo vede una macchia. È solo presentazione (il file resta integro), per questo P1 e non P0. **Fix**: nel `useLayoutEffect` sostituire il singolo `groundRight` con un array di bordi-destri per corsia, assegnare a ogni chip la prima corsia che libera, ed emettere un *indice* di corsia invece di un booleano; poi pilotare `inset-block-end` e l'altezza del richiamo da una custom property `--lane`, e rendere `padding-block-start` di `.has-lanes` funzione della corsia più profonda invece del fisso `1.85rem`. → `/impeccable polish`

**[P1] L'esito del salvataggio — successo e fallimento — finisce fuori schermo.** `notice`/`error` sono renderizzati nel flusso normale sotto la testata sticky (`EditorScreen.tsx:460-471`), ma Save vive *dentro* la testata sticky. Misurato su una canzone lunga a `scrollY 816`: il messaggio a `y: -639`, `inViewport: false`. E non c'è **nessuna live region** in tutta la schermata, quindi neanche uno screen reader lo annuncia. I due casi non sono simmetrici: in caso di successo il bottone Save si disabilita (un segnale debole che bisogna già sapere di guardare); in caso di fallimento resta abilitato — logica corretta, segnale zero. Per la persona a cinque minuti dal palco, i due momenti che più chiedono rassicurazione — *ha salvato?* e *sto per perdere tutto?* — sono i due gestiti peggio. **Fix**: rendere l'esito dove sta l'azione — `notice`/`error` dentro `.editor-head` (già sticky), o meglio uno stato transitorio «salvato» sul bottone stesso e la barra sticky riservata a `error !== null`; più una live region `role="status"`. → `/impeccable harden`

**[P1] L'editor non è d'accordo con sé stesso su «che riga stai modificando».** `onAddChord` e `onInsertChordAmong` (`GraphicEditor.tsx:171-187`) chiamano `onEditing` ma **mai** `onCaret` — confermato leggendo il codice, oltre che misurato. Effetto: dopo aver messo un accordo sulla riga 4 toccando la striscia, `.editor-line.is-focused` è ancora sulla riga 0 e il bottone «Chord» risulta ancora disabilitato. Due indicatori di «riga corrente» si contraddicono a schermo insieme — e i cinque comandi della toolbar, **Delete line incluso**, agiscono su `caret.line`, cioè sulla riga sbagliata, senza preavviso. Recuperabile con undo, quindi P1 e non P0. **Fix**: chiamare `onCaret({ line: index, at })` accanto a `onEditing` nei tre handler. Una riga per handler, e bordo di focus, stato del bottone e bersaglio dei comandi tornano d'accordo. → `/impeccable harden`

**[P2] Il chip accordo — l'oggetto più toccato — non arriva a 44px in nessun asse, ed è il punto che hai appena sollevato.** Dipinto 22.4px di altezza; `::after` a `inset: -0.6rem -0.2rem 0` lo porta a **32px di altezza** e, per un nome di una lettera, a **21px di larghezza**. L'intera `.chord-row` è alta 33.2px, quindi nessun gesto sull'accordo può superare i 33px in verticale, e subito sotto c'è l'`<input>` dei versi: un pollice basso sposta il caret invece di prendere l'accordo. Il recente passaggio del nome da 0.9rem a 1rem aiuta la lettura ma non cambia il tetto strutturale. **Fix (quello che scioglie il nodo, non lo sposta)**: far espandere *solo la riga a fuoco* — chord row e input a 44px pieni ciascuno, come una riga di foglio di calcolo che cresce quando ci entri — lasciando le righe non a fuoco compatte e fedeli alla vista di lettura. Ogni problema di target in questo report discende dalla riga alta una riga di testo. → `/impeccable adapt`

**[P2] Lo slot ⊕ trailing è tagliato a una scheggia proprio sul telefono per cui è stato fatto, e il suo «+» non passa il contrasto.** Il seat ⊕ sta nel flusso dopo il ghost, dentro `.line-scroll`: su una riga normale a 390px è a `x: 364, w: 22.9` contro un viewport che finisce a ~371 — circa 3px su 23 visibili, e nulla dice che la riga scorre. In più `.chord-add-slot` usa `color-mix(… accent 65%, transparent)` e misura **2.92:1 in tema chiaro** (4.84:1 in scuro) — sotto il 4.5:1, ed è un'affordance *attiva*, non un controllo disabilitato: l'unico fallimento di contrasto reale trovato in tutta la schermata. **Fix**: quando la riga a fuoco eccede in larghezza, o portare ⊕ in vista (`scrollIntoView({ inline: 'end' })` nell'effect che già gira su `focused`), o fissarlo con `position: sticky; inset-inline-end: 0`; più una sfumatura sul bordo di `.line-scroll` che dica che la riga scorre. E alzare l'opacità del «+» oltre il 4.5:1. → `/impeccable adapt` + `/impeccable polish`

## Red flag per persona

**Casey — distratta, una mano, telefono (persona primaria di PRODUCT.md).**
- Il chip accordo non raggiunge 44px in nessun asse (sopra), e sotto c'è l'input dei versi: il mis-tap del pollice sposta il caret.
- Sulla barra accordi, `×` Rimuovi è il vicino immediato di `✓` Fatto — entrambi 44×44, stesso `--surface-2`, stesso `--r-sm`. Il rosso che li distingue è dentro `@media (hover: hover)` e **sul suo telefono non viene mai disegnato**. Allungarsi verso Fatto significa passare sopra Rimuovi.
- **Il Redo per lei non esiste**: nessun bottone Redo nel DOM, solo Ctrl+Shift+Z / Ctrl+Y. Ha un Undo a senso unico.
- Nella toolbar «Tab» e «Delete line» sono icone non etichettate di forma quasi identica, affiancate a 38×40 — e una delle due distrugge una riga.

**Alex — power user, desktop, tastiera.** *(Qui l'assessment A e il B si sono contraddetti, e il B ha ragione: ha guidato la tastiera davvero.)*
- La barra accordi **non è inerte** come temuto: `Alt+←/→` sposta, `Escape` annulla, `Enter` conferma, `Ctrl+A Delete Enter` rimuove — tutti verificati sul sorgente prima/dopo. Il `Tab` che chiude la barra è un commit deliberato, non un bug.
- Restano due buchi reali: **i 7 chip di suggerimento non hanno alcun percorso da tastiera** (sono `onMouseDown`-only), e dopo il commit il focus cade su `<body>` invece di tornare al chip.
- Nessuna scorciatoia per il comando più usato, «Chord». Alt+freccia funziona ma non è annunciato da nessuna parte.
- A 1280px la testata occupa 158px in tre righe impilate, identiche a 768px: al desktop non dà nulla che il telefono non abbia.

**Sam — accessibilità.**
- **Contrasto: passa ovunque in entrambi i temi** (chip 5.88 chiaro / 10.06 scuro, versi 16.29/16.13, testo muto 5.63/7.11) tranne il «+» dello slot ⊕ a 2.92:1. Punto di forza reale.
- **Focus: 85 stop, tutti con anello da 2px**, chip inclusi. Anche questo un punto di forza.
- Blocco vero: `.chord-row` è `role="presentation"` con sopra tutta la macchina a stati del puntatore, quindi **tap-per-aggiungere e drag sono invisibili alle tecnologie assistive**; la via annunciata resta caret + «Chord», e lo stato disabilitato di quel bottone è spiegato solo da un `title` (hover-only) senza `aria-describedby`.
- `role="tablist"` senza `aria-controls` e **zero `role="tabpanel"`** nel documento.
- Il richiamo della corsia sollevata è una linea da 1px al 40% di accento — l'unico legame fra un accordo sollevato e la sua lettera, sotto qualunque soglia ragionevole.

## Carico cognitivo

**Pass**: focus singolo, chunking, una cosa alla volta, progressive disclosure (`<details>`, barra solo mentre un accordo è aperto, ⊕ solo sulla riga a fuoco).

**Migliorato**: il raggruppamento — le ‹ › ora stanno *sotto l'accordo che muovono*, che era esattamente il reclamo del giro scorso.

**Fail — scelte minime, nel momento peggiore.** Nominare un accordo presenta **12 opzioni**: 2 nudge + fino a 8 suggerimenti + × + ✓. Misurato `scrollWidth 394 / clientWidth 148`: ne sono visibili ~2.5, e `scrollbar-width: none` toglie l'unico indizio che ne esistano altri.

**Fail — memoria di lavoro.** Bisogna tenere a mente «su che riga è il caret» mentre si raggiunge una toolbar a 200px, con un bordo da 2px come unico indizio — e quel bordo **è misurabilmente in disaccordo con la realtà** (vedi P1 #3).

## Osservazioni minori

- `chordVocabulary` è tagliato a 8 ma solo ~2.5 entrano a 390px, e la scrollbar è nascosta: tagliare a quel che entra, o aggiungere una sfumatura.
- Il peso del chip è ora 500, allineato alla spec `chord` di DESIGN.md e a `.sheet-chord` del lettore — la discrepanza 600/500 del giro scorso è chiusa.
- `.chord-seat-strut` è 0.9rem mentre `.chord-chip` è 1rem: il puntello nascosto riserva ~10% di spazio in meno del chip che rappresenta, quindi i chip trailing stringono lo slot ⊕.
- `syllables.ts` è esplicitamente solo-italiano (vocali accentate, regola di coda `l/m/n/r`). È una decisione dichiarata, ma la registrazione è aperta a chiunque: una canzone inglese o francese oggi si aggancia con regole italiane.
- `UnsavedGuard` offre due scelte e quella che il musicista vuole — «Salva ed esci» — non è fra queste.
- Le tre righe `{directive}` hanno una `×` che cancella ma nessun modo di modificare («si modifica in Source»): l'unica azione disponibile sul titolo della canzone è distruggerlo, mentre la card Song data appena sopra ne tiene la copia modificabile.
- Il segmento di modo attivo è un fill accent pieno 66×44 — l'elemento più forte a schermo, più forte di qualunque accordo — mentre DESIGN.md dice che chi prende in prestito l'accento deve leggersi *più quieto* di un accordo.
- Aprire un accordo inserisce una barra da 44px e fa rifluire ogni riga sotto; durante un drag, una riga che guadagna `has-lanes` aggiunge 1.85rem e sposta il resto della canzone a gesto in corso.
- `+ line` è l'unico controllo sempre visibile che aggiunge struttura, ed è 14px muto con etichetta minuscola in un prodotto la cui prosa è altrove curata.
- Il bordo tratteggiato di `.editor-add-line` misura 1.28:1 chiaro / 1.40:1 scuro: è l'affordance visiva del bottone.

## Domande da considerare

1. **La chord row e l'input dei versi sono due strisce da 33px e 24px, impilate — e tutto il problema di target dell'editor è che nessuna delle due può essere 44.** E se la riga a fuoco, e solo quella, si espandesse per dare a entrambe i loro 44px pieni, come una riga di foglio di calcolo che cresce quando ci entri?
2. **`caret.line` — un intero per «dov'è l'utente» — è il modello sbagliato?** È già in disaccordo con la realtà, costringe cinque comandi a vivere a 200px dalla riga su cui agiscono, e rende il comando primario disabilitato al primo paint. E se i cinque comandi di riga vivessero sulla barra per-riga che esiste già, e la testata sticky si riducesse a indietro / titolo / Salva?
3. **Corsie, ghost, cucitura trailing e slot ⊕ esistono tutti per un solo motivo: ChordPro salva un offset intero e lo schermo ha bisogno di una posizione.** E se l'editor smettesse di fingere che le due cose siano uguali, e lasciasse alla *riga in modifica* una spaziatura reale fra accordi affollati — allargando solo la riga sotto il dito, mai quelle che si stanno leggendo? La regola «il ghost non si allarga mai» è giusta per una riga a riposo. È giusta per la riga che si sta modificando?
