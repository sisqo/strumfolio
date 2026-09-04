# L'editor su foglio bianco, e la selezione di più righe — piano

> Documento a sé, non una sezione di `PLAN.md`: quella tabella è il registro delle decisioni
> già consegnate e in produzione. **Costruito il 4 settembre 2026** — vedi *Costruito* in
> fondo per gli otto punti in cui la costruzione ha corretto questo piano, e per cosa è stato
> verificato in esecuzione anziché solo compilato. Va ripiegato in `PLAN.md` come sezione di
> versione quando si farà quel giro, verificando al momento quale numero è libero — diversi
> altri `PLAN-<feature>.md` consegnati aspettano lo stesso trattamento. Precedente diretto per
> la forma: `PLAN-import.md`.

## Cos'è

Due richieste sull'editor delle canzoni, indipendenti fra loro ma entrambe sulla modalità
grafica:

1. **Il foglio dove stanno le parole deve essere bianco**, come il foglio del lettore. Oggi
   è grigio, e non c'è una ragione per cui debba esserlo.
2. **Copia e incolla su più righe deve funzionare**, selezionando col trascinamento — oggi
   non si può selezionare oltre il confine di una riga, e un incolla multi-riga viene
   silenziosamente appiattito su una riga sola.

## Parte 1 — il foglio bianco

### Da dove viene il grigio

Non è una scelta: è l'assenza di una. Le righe della modalità grafica stanno direttamente
sullo sfondo pagina (`--bg: #f6f5f2`), mentre il lettore disegna un foglio (`.song-card`,
`background: var(--surface)`, `#ffffff`). La modalità Source è **già** bianca — `.editor-raw`
usa `var(--surface)` — quindi delle tre modalità dell'editor una sola è vestita giusta, e le
altre due lo sono per dimenticanza.

### Cosa si costruisce

Un pannello chiuso dietro le righe, in modalità grafica soltanto: il `<div translate="no">`
che è già la radice di `GraphicEditor` prende una classe `.editor-sheet` e diventa quel
pannello. Nessun nodo nuovo nel DOM.

```css
.editor-sheet {
  margin-block-start: 0.75rem;
  padding: 1.25rem 1.125rem;
  background: var(--surface);
  border: 1px solid var(--edge);
  /* 1.5rem come `.song-card`, non `--r-xl`: è lo stesso ragionamento che quel
   * commento fa già — la superficie più grande della schermata, e la sola cosa
   * su questa pagina che si è lì per leggere. */
  border-radius: 1.5rem;
}
```

Niente `box-shadow`: `.song-card` non ne ha, perché è un foglio appoggiato sull'app e non una
card che galleggia sopra di essa. `--edge` è `transparent` in tema chiaro e diventa `--line`
in scuro, quindi quel bordo è già la risposta giusta a entrambi i temi senza un secondo
blocco: in chiaro il foglio è definito dal bianco sul grigio, in scuro da un contorno.

### I dettagli che questa modifica tocca

- **`+ line` sta dentro il pannello.** È il posto dove una riga andrà, quindi appartiene alla
  carta. Il suo `margin-block-start` attuale (0.75rem) resta.
- **La riga elimina-canzone, la card «Song data» e il footer restano fuori**, sul grigio. È il
  motivo per cui l'ambito si ferma qui: se andasse bianca tutta la pagina, la card «Song data»
  — che è `.card`, quindi `--surface` — diventerebbe bianco su bianco e perderebbe il proprio
  contorno, e la barra sticky smetterebbe di leggersi come chrome.
- **`.editor-head` non cambia**: resta `background: var(--bg)`. Le righe che scorrono sotto di
  essa passano da bianco a grigio al bordo della barra, che è esattamente ciò che si vuole —
  la barra è chrome, il foglio è carta.
- **La tinta di ritornello e bridge** (`color-mix(in srgb, var(--accent) 5%, transparent)` su
  `.editor-line`) ora si legge sul bianco anziché sul grigio: leggermente più marcata, e la
  fascia risulta rientrata dall'imbottitura del pannello invece che a tutta larghezza. È un
  miglioramento, non un effetto collaterale da correggere.
- **L'anteprima resta grigia.** L'ho verificato ed è grigia per la stessa ragione (nell'editor
  `SongSheet` è renderizzato senza `.song-card`), ma è fuori ambito per scelta: vedi *Domande
  aperte*.

## Parte 2 — la selezione di più righe

### Il vincolo che decide tutto

Una `Selection` del browser **non può attraversare due `<input>`**. Ogni riga della modalità
grafica è un input suo — scelta portante, non un dettaglio: il caret nativo e la tastiera del
telefono valgono più di qualunque superficie di testo scritta a mano — e ogni input possiede
i propri `selectionStart/End`. Trascinare dalla riga 3 alla riga 7 lascia la selezione dentro
la riga 3, e nessuna proprietà CSS o attributo la fa uscire da lì.

Quindi «far funzionare la selezione nativa su più righe» non è un'opzione sul tavolo. Ogni
strada è un **modello di selezione custom**, e l'unica domanda vera è la sua granularità.

### Il modello: due indici di blocco

La selezione è `{ from: number; to: number }` — indici di blocco nel documento, normalizzati
(`from <= to`), **righe intere**. Nient'altro. Ogni operazione si compone da funzioni che
esistono e hanno già test: `splitLine`, `insertLineAfter`, `removeLine`, `joinLines`.

La granularità è **ibrida**, che non è un compromesso ma il modo in cui gli editor a blocchi
si comportano davvero:

- Finché il trascinamento resta dentro la riga, è la selezione nativa del browser, a lettera.
  Non cambia niente rispetto a oggi.
- Nell'istante in cui supera il confine di riga, l'input viene sfocato e prende il comando la
  selezione a blocchi — **inclusa per intero la riga di partenza**, non il pezzo da cui il
  trascinamento era nato.

La precisione a lettera *fra* righe diverse è stata scartata: significherebbe reimplementare
tutto il problema dell'editor di testo sopra input separati (caret che attraversa le righe,
shift+frecce, accordi da spezzare a metà riga) per riottenere ciò che la modalità Source già
offre nativa e gratis, essendo una `<textarea>` con l'intero ChordPro dentro.

La selezione vive in `EditorScreen`, accanto a `caret` ed `editing`, e scende in
`GraphicEditor` come prop: la striscia dei comandi che deve mostrarne le azioni sta in
`EditorScreen`, quindi lo stato non può stare più in basso.

### Come nasce una selezione

**Due porte, nessuna delle due a spese dell'altra.**

- **Col mouse, trascinando.** Un trascinamento che esce dalla riga non collide con niente: il
  verticale sull'area righe è lo scorrimento pagina (solo al tocco), l'orizzontale che sposta
  un accordo vive su `.chord-row`, e i gestori pointer di quella riga sono l'unico codice
  pointer dell'editor. Nessuna modalità da accendere.
- **Al tocco, dal pulsante «Seleziona».** Al tocco il budget dei gesti è finito: il
  trascinamento verticale è lo scorrimento, l'orizzontale sulla riga accordi sposta un accordo
  (scelta esplicita dell'utente, cfr. la memoria `editor-chord-interaction-decisions`), e un
  trascinamento non può dichiarare la propria intenzione al primo tocco. Quindi la porta al
  tocco è un interruttore visibile: mentre è acceso, `touch-action` sull'area righe passa a
  `none` e il trascinamento seleziona invece di scorrere.

**Il trascinamento di selezione nasce solo sulla metà parole** (`.line-input` /
`.line-inner`), mai su `.chord-row`: quella riga ha i propri `setPointerCapture` e i propri
tre significati del trascinamento, e non ne prende un quarto.

> **Corretto in costruzione — vedi *Costruito* §1.** Provato in browser, questo lasciava il
> gesto quasi irraggiungibile: su una riga di testo la `.chord-row` è la maggior parte
> dell'altezza. Ciò che è spedito lascia ascoltare entrambi e fa arbitrare la **direzione**.

Quando il confine viene superato, la selezione nativa dentro l'input va cancellata
(`window.getSelection()?.removeAllRanges()` dopo il `blur`), altrimenti restano due
evidenziazioni sullo schermo che dicono cose diverse.

Il resto del vocabolario: **shift+clic** estende dall'ancora, **Escape** annulla la
selezione, e **qualunque modifica al documento** la annulla — gli indici di blocco non
sopravvivono a un `splitLine` altrui, e una selezione che punta al blocco sbagliato è peggio
di nessuna selezione.

### Il fuoco, mentre una selezione esiste

Con tutti gli input sfocati non c'è nessun elemento che riceva i tasti — e sul telefono è
proprio ciò che si vuole, perché la tastiera si chiude. Il contenitore delle righe prende
quindi `tabIndex={-1}` e il fuoco reale, ed è lui a portare i gestori di tastiera e l'evento
`paste`.

Mentre la selezione copre più di un blocco, il bordo sinistro d'accento di `.editor-line.is-focused`
non si mostra: il marcatore è la fascia di selezione, e due marcatori diversi sulla stessa
riga direbbero due cose.

### La striscia dei comandi si trasforma

A riposo la striscia guadagna **un solo pulsante**, «Seleziona». Appena esiste una selezione —
da qualunque porta sia nata — l'intera striscia diventa quella della selezione:

```
a riposo:                          con 3 righe selezionate:
┌───────────────────────────────┐  ┌────────────────────────────────┐
│ + Accordo  ⬚ ⬚ ⬚ ⬚  Seleziona │  │ Copia Taglia Incolla Elim. Fine│
└───────────────────────────────┘  └────────────────────────────────┘
```

I comandi di riga si ritirano perché **agiscono su `caret.line`**: con più righe prese non
sanno su quale, e mostrarli spenti sarebbe cinque pulsanti che passano la vita disabilitati in
una striscia che sul telefono già scorre di lato. Niente barra flottante accanto alla
selezione: `.line-scroll` ritaglia in verticale di proposito, ed è già il motivo per cui
`.chord-bar` è finita a tutta larghezza *sotto* la riga anziché sopra di essa.

«Fine» spegne la modalità e annulla la selezione — una cosa sola, perché sono la stessa cosa.

### Copia

Negli appunti va **ChordPro come `text/plain`**: `[C]Nel blu [G]dipinto di blu`. Gli accordi
sopravvivono sempre — altra scheda, altro giorno, incollato nella modalità Source o nella
schermata di import — al prezzo di un incolla fuori dall'app pieno di parentesi quadre. La
via alternativa (parole nude negli appunti più gli accordi ricordati in memoria, indicizzati
sul testo esatto) è stata scartata: più pulita fuori, ma perde gli accordi appena si cambia
scheda o si ricarica, e un unico percorso vale più di due.

**Le sezioni vengono bilanciate in copia.** Se l'intervallo apre una sezione senza chiuderla
— seleziono da dentro un ritornello a fuori — la copia aggiunge la direttiva di chiusura
mancante, e simmetricamente premette quella d'apertura quando l'intervallo eredita un
`{end_of_chorus}` orfano. Il motivo è verificato, non teorico: `sectionsOf` tiene `forced`
acceso fino alla direttiva di chiusura, quindi un `{soc}` spaiato tinge di ritornello **tutto
ciò che segue fino alla fine della canzone**. Il prezzo è che negli appunti c'è una riga che
non si era selezionata; il guadagno è un blocco autoconsistente anche fuori dall'app.

`navigator.clipboard.writeText()` dentro il gesto dell'utente: la scrittura è supportata
ovunque, è la lettura il problema (sotto).

### Incolla

Il testo incollato passa da **`convert()` di `src/lib/import/convert.ts`** — la stessa
macchina della schermata di import, il cui commento d'apertura dice letteralmente «Turns
pasted text into ChordPro». Importa solo `../music/chord`, quindi è sicuro da un componente
client. Riconosce da sé:

- **ChordPro** → passa intatto (`looksLikeChordPro` valida le parentesi con `parseChord`,
  quindi `[Verse 1]` non lo inganna);
- **accordi sopra le parole**, allineati per colonna, formato Ultimate Guitar → fusi sulle
  sillabe giuste;
- **`[Verse 1]` / `[Chorus]`** → `{comment: …}`;
- **blocchi di tab** → verbatim, dentro `{start_of_tab}`/`{end_of_tab}`, estratti *prima* del
  merge degli accordi.

Incollare una pagina copiata dal web arriva quindi già vestita di accordi, con la stessa
euristica e gli stessi test dell'import.

**L'incolla non è 1:1, e va accettato.** `convert()` fa `.trim()` sul corpo e collassa le
righe vuote consecutive (`\n{3,}` → `\n\n`): un intervallo copiato che inizia o finisce con
una riga vuota, o che ne contiene due di fila, non torna byte per byte. È il prezzo dichiarato
della strada scelta, non un difetto da inseguire.

Dove atterra il testo convertito. **Con una selezione a blocchi attiva** la sostituisce. Con il
solo caret, `pasteInto` deve ramificare **sul tipo del blocco di destinazione**, non chiamare
`splitLine` alla cieca — `splitLine` non fa la stessa cosa per tutti i tipi, e la differenza è
silenziosa:

| blocco di destinazione | cosa fa `pasteInto` | perché |
| --- | --- | --- |
| `lyrics` | `splitLine` al caret, le righe convertite in mezzo, la coda attaccata all'ultima riga incollata | comportamento standard di ogni editor; `splitLine` porta con sé gli accordi oltre il taglio (`edits.ts:233`), quindi non serve codice nuovo sugli accordi |
| `blank` | **sostituisce** il blocco vuoto con le righe incollate | è il caso più comune («+ line», poi incolla), e su una riga vuota non c'è nessuna coda da riattaccare. `splitLine` su un blocco non-`lyrics` **ignora `at`** e si limita a inserire una riga vuota dopo di esso: il ramo `else` di `splitLine` |
| `comment`, `directive`, `boundary`, `tab` | inserisce **dopo**, senza spezzare | `splitLine` su un `comment` lo taglia in `{comment}` + un blocco **`lyrics`**: incollare a metà commento convertirebbe in silenzio il resto del commento in parole cantate |

La riga `blank` non è un caso di scuola: una riga appena spezzata o appena aggiunta **è** un
blocco `blank`, byte per byte, come dice `fromSource` — quindi è proprio la riga su cui un
incolla arriva più spesso, e `onPaste` su `.line-input` scatta anche lì.

**Il pulsante «Incolla» c'è, e degrada spiegandosi.** Prova `navigator.clipboard.readText()`;
se il browser rifiuta o non sa farlo, non fallisce in silenzio ma dice «usa ⌘V» nell'area
messaggi che l'editor ha già per l'esito del salvataggio (`.editor-outcome`, dentro la barra
sticky, con il suo `role="status"`). Su iOS Safari funziona con la conferma di sistema; su
Firefox desktop la lettura degli appunti da pagina web non esiste, e lì la scorciatoia
funziona sempre.

**L'incolla multi-riga vale anche senza selezione, su ogni dispositivo**, e questa metà è la
più economica di tutto il piano: oggi un `onPaste` sull'input non esiste, quindi il browser
appiattisce `"a\nb"` in una riga sola e le interruzioni di riga si perdono in silenzio. Un
`onPaste` su `.line-input` che intercetti l'evento e chiami lo stesso percorso di incolla
risolve il caso d'uso più frequente — incollare un testo preso da fuori — senza toccare
nessuna selezione.

### Taglia ed elimina

Non sono state chieste e non sono opinabili: una selezione che il tasto Canc ignora è una
bugia. `⌘X`/`Ctrl+X` copia e rimuove; `Delete`/`Backspace` rimuove senza toccare gli appunti;
entrambi si compongono da `removeLine`. Dopo la rimozione il caret va all'inizio del blocco
che ha preso il posto di quelli rimossi, o all'ultimo blocco se la selezione arrivava in fondo.

Nient'altro. Duplicare una strofa resta copia+incolla e spostarla resta taglia+incolla: due
gesti invece di uno, ma nessun meccanismo nuovo da costruire, e ogni operazione passa dallo
stesso unico percorso testato. Trascinare la selezione per spostarla e un comando «Duplica
sotto» sono stati valutati e scartati — vedi *Decisioni*.

### Un solo passo di Annulla

`apply()` chiama `onChange(toSource(next), kind)` e `EditorScreen` accorpa i passi di
cronologia su `kind`: con `kind === null` ogni chiamata è un passo nuovo. Un incolla scritto
come ciclo di `apply()` diventerebbe **N voci di cronologia**, e servirebbero N Annulla per
disfare un gesto. Il documento multi-riga va quindi costruito **interamente in memoria** e
emesso con un solo `onChange`, con un `kind` non accorpante. Vale identico per taglia ed
elimina.

### Dove si dipinge l'evidenziazione

**Non dentro `.line-scroll`**: ritaglia in verticale di proposito, ed è la stessa cosa che ha
espulso `.chord-bar` a tutta larghezza sotto la riga. La fascia va su `.editor-line`, come
`::before` sovrapposto anziché come `background`:

```css
.editor-line { position: relative; }   /* i chip restano ancorati a `.chord-anchor` */

.editor-line.is-selected::before {
  content: '';
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  pointer-events: none;
}
```

Sovrapposto e non `background` perché la tinta di ritornello sta **sullo stesso elemento**:
un secondo `background` la sostituirebbe, e una riga di ritornello selezionata smetterebbe di
dirsi ritornello proprio mentre la si sta per spostare.

## I moduli, e cosa è testabile

`npm test` è `node:test` su funzioni pure: non c'è un runner di componenti React in questo
repo, quindi la logica che merita test vive in un modulo piano. Tutta la parte che decide
*cosa* accade al documento va lì, e la parte React resta gesti e pittura.

**Nuovo: `src/lib/editor/clipboard.ts`**, accanto a `document.ts` ed `edits.ts`, puro, senza
import di React né di `@/lib/db`:

| funzione | cosa fa | test che merita |
| --- | --- | --- |
| `copyRange(doc, from, to): string` | il ChordPro dell'intervallo, sezioni bilanciate | `{soc}` spaiato in apertura e in chiusura; intervallo che contiene una sezione intera (nessuna aggiunta); intervallo di una riga sola; commenti, direttive, tab e righe vuote nell'intervallo, verbatim |
| `removeRange(doc, from, to): SongDocument` | via i blocchi, un solo documento nuovo | rimozione in testa, in coda, e di tutto il documento (che deve restare con una riga su cui stare) |
| `pasteInto(doc, target, text): { document, caret }` | `convert()` + innesto, un solo documento nuovo | **un test per ramo della tabella dei tipi sopra**: su `lyrics` a metà riga (coda riattaccata, accordi oltre il taglio che seguono), su `blank` (sostituzione), su `comment` (inserimento dopo, commento intatto); più incolla su selezione, incolla di accordi-sopra-le-parole, e incolla di testo di una riga sola, che deve restare equivalente a digitarlo |

### Il round-trip: cosa è garantito e cosa no

Un intervallo che **contiene almeno un accordo** torna verbatim, e questa è la garanzia
robusta: `convert()` chiama `looksLikeChordPro` per prima cosa, quella trova una parentesi che
`parseChord` valida, e il testo passa intatto senza che nessuna euristica lo esamini.

Un intervallo **senza nemmeno un accordo** non ha quella garanzia, e il piano non finge di
darla: `looksLikeChordPro` è falsa, quindi il testo scende nel ramo `chords-above` /
`lyrics-only`, dove `isChordLine` ha un voto su ogni riga. Una riga di parole che somigliano a
nomi di accordi può tornare **ri-parentesata come accordi** — `looksLikeSungNotes` è la
guardia scritta esattamente per questo, ma è un'euristica tarata sull'import, dove la via
d'uscita è la preview con il corpo editabile, come dice il commento d'apertura di
`convert.ts`. L'incolla non ha preview: ha Annulla, che è un passo solo (vedi sopra) e basta.

Il test quindi **non asserisce un round-trip**: asserisce le due cose separatamente — verbatim
con accordi, e *ciò che davvero accade* a un intervallo chordless, fissato in fixture perché
un cambiamento di quell'euristica si veda qui invece di sorprendere qualcuno mentre incolla.
Vale identico per `.trim()` e il collasso delle righe vuote consecutive.

## Ordine di costruzione

Cinque commit, ognuno spedibile da solo:

1. **Il foglio bianco.** `.editor-sheet` in `globals.css` più una classe sulla radice di
   `GraphicEditor`. Nessuna logica, nessun rischio, valore immediato — ma da **guardare nel
   browser** prima di chiuderlo, perché guardarlo è il senso del commit: dentro il pannello il
   bordo d'accento della riga a fuoco e la fascia di ritornello finiscono 1.125rem dentro il
   margine della carta anziché vicini al bordo pagina, e l'unico modo di sapere se quella
   distanza legge bene è vederla.
2. **`src/lib/editor/clipboard.ts` + `clipboard.test.ts`.** Nessuna UI, tutto il pensiero.
3. **`onPaste` su `.line-input`.** L'incolla multi-riga funziona su ogni dispositivo, senza
   selezione, senza pulsanti: è il caso d'uso più frequente e costa un gestore.
4. **Il modello di selezione**: stato in `EditorScreen`, evidenziazione, trascinamento col
   mouse, tastiera (`⌘C`/`⌘X`/`⌘V`, Canc, Escape, shift+clic).
5. **Il pulsante «Seleziona» e la striscia che si trasforma**: la via al tocco, `touch-action`
   sull'area righe, e l'Incolla che degrada spiegandosi.

Verifica prima di ogni push: `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`
contro `git archive HEAD` in una cartella fuori dal repo, come prescrive `CLAUDE.md` — e
`ss -ltnp | grep 300` prima della build, perché un `next dev` vivo e una build si corrompono
a vicenda sulla stessa `.next`.

A feature chiusa vale rilanciare `/impeccable critique` sull'editor: la baseline è 21/40
(snapshot `.impeccable/critique/2026-08-28T17-42-13Z__src-components-editor.md`), e serve per
misurare il delta anziché dedurlo.

## Trappole già note, da non riscoprire

- **`.line-scroll` ritaglia in verticale di proposito.** Niente controlli flottanti e niente
  evidenziazioni che debbano sbordare, dentro di esso.
- **Gli accordi sono posizionati da una copia nascosta delle parole.** Qualunque cosa allarghi
  o alteri `.chord-ghost` sposta ogni accordo dalla sua sillaba. La radice di `GraphicEditor`
  porta `translate="no"` per la stessa ragione, e va conservato quando prende `.editor-sheet`.
- **`caret.line` è ciò su cui agiscono i comandi di riga.** È già stato un bug reale (un
  accordo aperto sulla riga quattro col caret ancora sulla zero puntava «Elimina riga» sulla
  riga sbagliata, in silenzio): la selezione deve ritirare quei comandi, non conviverci.
- **La cronologia si accorpa su `kind`.** Un gesto, un passo di Annulla.

## Decisioni

| Decisione | Perché |
| --- | --- |
| Bianco **solo dietro le righe**, non tutta la pagina | pagina bianca renderebbe la card «Song data» e la textarea Source bianco su bianco, e la barra sticky smetterebbe di leggersi come chrome |
| **Pannello chiuso** (tondo sui quattro lati, finisce con la canzone), non il foglio aperto del lettore | `.song-card` ha `min-height: calc(100dvh - 4.375rem)` e nessun bordo sotto: riusarlo alla lettera costringerebbe `+ line`, elimina-canzone e footer dentro il foglio |
| `+ line` **dentro** il pannello | è il posto dove una riga andrà: appartiene alla carta |
| L'anteprima resta grigia | fuori ambito per scelta; è grigia per la stessa ragione e resta una domanda aperta |
| **ChordPro negli appunti** come `text/plain` | gli accordi sopravvivono a schede, ricarichi e alla modalità Source; un solo percorso invece di due |
| Granularità **ibrida**: lettera dentro la riga, blocchi interi fuori | una `Selection` non attraversa due `<input>`; la precisione a lettera fra righe sarebbe reimplementare l'editor di testo per riavere ciò che Source dà nativo |
| Col **mouse** basta trascinare; il **pulsante** è la via al tocco | al mouse il gesto è gratis, al tocco no — il budget dei gesti sull'area righe è già speso fra scorrimento e spostamento accordi |
| La **striscia si trasforma** invece di guadagnare pulsanti | i comandi di riga agiscono su `caret.line` e con più righe non saprebbero su quale; cinque pulsanti spenti in una striscia che già scorre sono peggio |
| Nessuna barra flottante accanto alla selezione | `.line-scroll` la taglierebbe: è già il motivo dell'esistenza di `.chord-bar` |
| **Sezioni bilanciate in copia**, non in incolla | `sectionsOf` propaga `forced` fino alla chiusura: un `{soc}` spaiato tinge di ritornello tutto il resto della canzone. Bilanciare in copia rende il blocco autoconsistente anche fuori dall'app |
| L'incolla passa da **`convert()`** | è la stessa macchina dell'import, già testata, e fa arrivare vestita di accordi una pagina copiata dal web. Prezzi accettati: non è 1:1 (trim, collasso delle righe vuote) e un intervallo *senza nessun accordo* attraversa l'euristica anziché passare intatto — con accordi, `looksLikeChordPro` corto-circuita e il verbatim è garantito |
| **Taglia ed elimina** ci sono, senza chiederlo | una selezione che Canc ignora è una bugia |
| **Niente** trascina-per-spostare, **niente** duplica-sotto | duplicare resta copia+incolla, spostare resta taglia+incolla: un percorso solo, testato. Trascinare per spostare vorrebbe indicatore di rilascio, scorrimento automatico e un terzo significato del trascinamento al tocco |
| Il pulsante **Incolla** c'è e **degrada spiegandosi** | al tocco è il caso per cui la modalità esiste; dove `readText()` non c'è (Firefox) resta la scorciatoia, e il rifiuto va detto, non subìto in silenzio |
| Un **solo passo di Annulla** per gesto | la cronologia accorpa su `kind`: un incolla come ciclo di `apply()` costerebbe N Annulla |
| Evidenziazione come `::before` su `.editor-line` | un `background` sostituirebbe la tinta di ritornello, e sotto `.line-scroll` verrebbe ritagliata |

## Domande aperte

- **L'anteprima nell'editor.** È grigia per la stessa dimenticanza della modalità grafica
  (`SongSheet` renderizzato senza `.song-card`). Vale un commit suo — «l'anteprima somiglia
  davvero al player» — o resta com'è?
- **`⌘A` / Ctrl+A** con il fuoco sul contenitore: seleziona tutti i blocchi della canzone? Non
  chiesto, banale da aggiungere una volta che il modello esiste, e ambiguo finché il fuoco può
  stare dentro un input (dove ⌘A significa già «tutta questa riga»).
- **Copiare *dentro* una riga sola porta gli accordi?** Oggi la selezione nativa in un input
  copia solo testo, e questo piano non la tocca. Un intervallo di una riga selezionato a
  lettera potrebbe portarsi i propri accordi — coerente col resto, ma è un secondo percorso
  di copia e va deciso a parte.
*(La quarta — il tab spaiato — si è chiusa da sé verificandola: un tab è **un blocco solo**
che si inghiotte tutte le proprie righe fino alla direttiva di chiusura, e `lineOf` scrive
sempre un `{end_of_tab}`, anche quando `endDirective` è `null`. Un intervallo di indici di
blocco non può quindi tagliare un tab a metà, e `copyRange` non ha bisogno di nessun caso
speciale per i tab: il bilanciamento riguarda solo `{soc}`/`{sob}`, che sono blocchi
`boundary` separati.)*

## Costruito

Otto punti in cui la costruzione ha corretto il piano scritto sopra, il primo dei quali è un
buco di progetto e il secondo un bug che solo il browser poteva mostrare.

1. **La riga degli accordi non viene sbarrata al drag di selezione — arbitra la direzione, non
   il bersaglio.** Il piano diceva «il trascinamento di selezione nasce solo sulla metà
   parole». Provato in browser, quel gesto era quasi irraggiungibile: su una riga di testo la
   `.chord-row` occupa la maggior parte dell'altezza (porta la sua headroom più una corsia per
   ogni accordo sollevato), e le parole sono una striscia di ~24px in fondo. Un drag che
   partiva più in alto non prendeva niente, in silenzio. La soluzione non tocca il contratto
   esistente: spostare un accordo è **orizzontale** (la macchina della riga non parte prima di
   6px di lato, e `touch-action: pan-y` lo dichiara), prendere righe è **verticale** per
   definizione — qui non accade nulla finché il puntatore non è su una riga *diversa*. Quindi
   entrambi ascoltano e uno solo dei due può essere il gesto in corso. In più `ChordRow` ha
   ora un `onLostPointerCapture` che scioglie il proprio drag quando il foglio gli sottrae il
   puntatore, altrimenti l'accordo restava vestito da accordo-in-trascinamento sopra una riga
   che il run stava per spostare.
2. **`focus({ preventScroll: true })`, e non è una rifinitura.** Il fuoco preso sul foglio
   all'aggancio è impianto — qualcosa deve essere l'elemento a cui ⌘V arriva — ma un `focus()`
   normale porta l'elemento in vista: la canzone si muove sotto il dito a metà gesto. Misurato
   nel browser: un trascinamento di **tre righe ne prendeva dieci**. Con `preventScroll` ne
   prende tre.
3. **`splitLyrics` e `joinLyrics` estratte da `edits.ts`** invece di riscritte nel clipboard.
   `splitLine` e `joinLines` contenevano l'aritmetica degli accordi ai due lati di un taglio,
   che è esattamente quella che serve alle due cuciture di un incolla: ora è una funzione
   ciascuna, esportata, e le vecchie chiamano quelle. Due copie sarebbero state due idee di
   dove finisce un accordo.
4. **L'incolla di una riga sola non arriva mai a `pasteAt`.** Il piano ramificava anche il caso
   `comment` a riga singola; nel gestore reale un incolla senza ritorni a capo dentro una
   `.line-input` è restituito al browser, che lo fa passare per `onChange` → `setLineText`
   come una digitazione, accordi trasportati. Quindi la ramificazione per tipo di blocco serve
   solo al caso multi-riga, che è l'unico che ci arriva.
5. **Tastiera e incolla vivono sulla `window`, in `EditorScreen`**, non sul foglio: `⌘C`/`⌘X`,
   Canc e Escape entrano dalla stessa porta di `⌘Z`, che era già lì per la stessa ragione (le
   parole stanno in input controllati la cui cronologia non è questa). Al foglio resta solo il
   `tabIndex={-1}`, perché con ogni riga sfocata qualcosa deve pur essere l'elemento a cui
   l'evento `paste` arriva. Costo: quattro prop in meno.
6. **`.editor-tools .btn.is-on` non esisteva.** `.btn` non aveva stato acceso: il pulsante
   «Select lines» è un interruttore, e senza quella regola restava spento anche da accesso.
   Aggiunto accento pieno, che è la cosa che in questa app significa «on» (`.segment-button`
   la dice così), limitato alla striscia perché non reclami ogni `.btn` dell'app.
7. **Un tab è un blocco solo** — la quarta domanda aperta si è chiusa verificandola, e c'è ora
   un test che lo asserisce: un intervallo di indici non può tagliare un tab a metà, quindi
   `copyRange` non bilancia i `{sot}` come bilancia i `{soc}`.
8. **`btn-inset` è una classe morta**: usata dai due pulsanti della striscia e definita da
   nessuna parte. I pulsanti nuovi la portano per uniformità; toglierla è un giro di pulizia
   a sé, fuori da questa consegna.

### Verificato in esecuzione, non solo compilato

`npm test` copre 30 asserzioni su `clipboard.ts`. Il resto — i gesti — è stato provato nel
browser vero, con Playwright su una copia isolata del working tree servita su un'altra porta
(una `.next` sua, così non corrompe il dev server già attivo) e **senza `DATABASE_URL`, che è
ciò che rende l'editor raggiungibile senza login**: `hasDatabase` falso ⇒ `role = 'admin'` e
`requirePlanChoice` esce subito. La sessione si mina da sé con `encode` di `@auth/core/jwt`
sul segreto passato a quel server (Node 18 vuole il polyfill di `webcrypto`).

Provato e passato: un drag dentro la riga resta la selezione nativa; superato il confine
prende esattamente le righe attraversate; `is-taking` e `is-picking` compaiono quando devono;
la striscia si trasforma e conta le righe; `⌘C` mette in appunti il ChordPro con
`{start_of_chorus}`/`{end_of_chorus}` bilanciati; `⌘V` sullo stesso run **rende il sorgente
identico byte per byte**; un solo Annulla disfa l'incolla; un incolla multi-riga a metà riga
spezza e riattacca la coda; una riga sola conserva gli accordi; accordi-sopra-le-parole
arrivano fusi; al tocco «Select» chiude la barra dell'accordo aperto, `touch-action` diventa
`none`, un tap prende una riga senza dare fuoco all'input, shift+clic estende, Canc toglie
esattamente le righe prese, Escape lascia il run e «Done» esce dalla modalità. E la
regressione che contava: **il drag di un accordo lungo la sua riga funziona ancora**, senza
prendere nessun run.

Una trappola per chi riproverà: gli eventi touch sintetizzati a mano vanno inviati **al
foglio**, come la pointer capture vera li ritargetta — se si fa hit-testing a ogni `pointermove`
si perde l'ultimo evento e un drag di tre righe ne conta due. Vale accanto a quanto già
annotato in [[verifying-drag-reorder-in-browser]].
