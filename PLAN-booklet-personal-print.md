# Stampa nelle proprie impostazioni — piano

> Documento a sé, non una sezione di `PLAN.md`: quella tabella è il registro delle
> decisioni già *consegnate e in produzione* (la sua stessa nota d'apertura lo dice), e
> questa feature non è ancora scritta. Quando è chiusa, va ripiegato lì come sezione
> `### Stampa nelle proprie impostazioni (v3.15)`, stesso formato di tabella già in uso.
> Precedente diretto: `PLAN-comments.md`, stessa ragione, mai ancora ripiegato.

## Cos'è

Oggi `/booklet` stampa sempre la canzone nella tonalità **scritta**: `prepare()` in
`src/lib/booklet/document.tsx:575-591` chiama `transposeChord(chord, 0, written)`, zero
semitoni fissi, a prescindere da cosa un lettore abbia salvato per sé su quella canzone
(`user_song_prefs.semitones`/`.capo`). È una scelta di design dichiarata ed esplicita, non
un limite tecnico — il commento di testa a `document.tsx:17-19` dice *"a booklet is
printed for a room, not for the one person who happened to press the button"* — e la
FAQ pubblica in `src/app/login/page.tsx:325-326` la promette esplicitamente ("Does the
printed booklet use my own key and capo… The song as written.").

La richiesta: la stampa dovrebbe poter usare — su richiesta, non di default — le
impostazioni personali del lettore che scarica (tonalità/capo), non solo la versione
scritta.

## Cosa cambia, risolto nell'intervista

- **Ogni download riparte dalla tonalità scritta.** Non è un'impostazione che l'app
  ricorda: nessuna persistenza (né account, né localStorage). Ogni volta che si apre
  `/booklet`, la scelta è di nuovo com'era di default — coerente col principio "per la
  stanza" del commento in `document.tsx:17-19`, che resta il default reale, non solo
  quello iniziale.
- **Meccanismo**: una checkbox visibile nel pannello, sopra il bottone "Download PDF",
  spenta di default — non un modale al click, non due bottoni distinti.
- **Annotazione in stampa**: quando la checkbox è attiva **e** una canzone ha
  capo/trasposizione salvati (diversi da zero), la sua pagina porta una riga sotto il
  titolo che rispecchia quella già mostrata in lettura — `TransposeNote` in
  `src/components/LiveSong.tsx:116-132` — stessa logica (`capo !== 0 || semitones !== 0`
  per mostrarla, altrimenti niente riga). Questo risolve anche il caso limite trovato in
  fase di ricerca: capo = semitoni (es. entrambi 2) fa sì che `readShift` restituisca 0 e
  gli accordi stampati risultino identici alla versione scritta — la riga resta comunque
  vera e visibile, quindi il capo impostato non sparisce silenziosamente dalla pagina.

## Impianto dati — dove si aggancia

Nessuna migrazione: i dati (`user_song_prefs.semitones`/`.capo`) esistono già. Manca solo
il filo che li porta dentro la generazione del PDF:

1. **`songs.slug` non è nel payload del booklet.** `BookletSong`
   (`src/lib/booklet/actions.ts:21-28`) e la query che lo popola
   (`actions.ts:79-92`) selezionano `title, artist, link1-3, body` ma non lo slug — non
   c'è oggi nulla su cui agganciare una mappa di preferenze per canzone. Va aggiunto per
   primo, prima di ogni altro passo.
2. **Fetch in blocco delle preferenze dell'utente firmato** (non `accountOwnerEmail`,
   che può divergere quando un proprietario globale scarica il canzoniere di un cliente
   — vedi *Assunzioni*), scoped alle canzoni di quel songbook. Precedente diretto:
   il join in `clearRecentlyOpened` (`src/lib/prefs/actions.ts:280-294`) che scopa
   `user_song_prefs` alle "canzoni di questo account". Risultato: una
   `Map<songSlug, { semitones, capo }>`.
3. **`loadBooklet(bookletSlug, usePersonalSettings)`** — nuovo secondo parametro
   booleano; quando `true`, fa il fetch del punto 2 e lo porta nel valore di ritorno.
4. **Filo fino a `prepare()`**: da `BookletPanel.tsx:90` (`bookletToBlob`) fino a
   `paginateSong` fino a `prepare(song, notation)` in `document.tsx`, serve una mappa
   opzionale di prefs per song. Dentro `prepare()`, quando la canzone ha prefs
   applicabili:
   - `shift = readShift(semitones, capo)` (da `src/lib/music/capo.ts:76-78`) al posto
     dello `0` fisso;
   - **e**, insieme — non uno dei due soli — `spellingKey = readKey(written, semitones,
     capo)` (`capo.ts:81-82`) al posto di `written` come terzo argomento di
     `transposeChord`. Cambiare solo il primo e lasciare `written` produrrebbe
     l'enarmonica sbagliata (F♯ contro Sol♭) esattamente come succederebbe a schermo se
     si sbagliasse la stessa cosa in `SongSheet.tsx:55-59`.
   - Canzoni senza prefs salvate (mai aperte/trasposte da quel lettore) restano scritte:
     nessun cambiamento, nessuna riga aggiunta — stesso comportamento di oggi.
5. **Riga di annotazione**: nuovo elemento nel layout di `paginateSong`/`document.tsx`,
   sotto il titolo, stesso testo/formattazione concettuale di `TransposeNote`
   (`LiveSong.tsx:118-124`: "capo on fret N", "transposed ±N semitones", uniti da " · "),
   mostrata solo se almeno uno dei due è diverso da zero per quella canzone.
6. **`BookletPanel.tsx`**: stato locale `usePersonalSettings` (default `false`,
   nessuna persistenza — resettato ad ogni mount/navigazione), checkbox sopra il
   bottone, passato a `loadBooklet`.

## Testo da aggiornare (non più vero dopo questa feature)

- `document.tsx:17-19` — il commento di principio va riscritto per riflettere che
  "scritta" resta il *default*, non più l'unica possibilità: qualcosa come *"Written key
  by default — a booklet is for a room, not for the one person who happened to press
  the button — but a reader may explicitly opt in, per download, to their own
  capo/transposition; when they do, the page says so."*
- `src/app/login/page.tsx:325-326` — la FAQ ("Does the printed booklet use my own key
  and capo… The song as written.") deve smettere di essere categorica; nuova risposta
  nel senso di *"By default, the song as written — for the room. You can choose your
  own key and capo for a personal copy, one download at a time."*

## Fuori scope, dichiarato

- **Nessuna selezione per singola canzone dentro il toggle.** Il booklet resta per
  intero songbook (`BookletPanel.tsx` non ha oggi alcuna UI per scegliere un
  sottoinsieme di canzoni) — la checkbox è un interruttore unico per tutto il download,
  non una scelta canzone per canzone.
- **Nessuna persistenza della scelta**, né per account né in `localStorage` — già
  deciso sopra, non un'omissione.
- **Nessun rendering di diagrammi d'accordo/tastiera nel PDF.** Il booklet stampa
  accordi come testo sopra le sillabe, non come shape; `ChordDiagram`/il badge capo per
  singolo accordo (`ChordDiagram.tsx:89-96`) non hanno equivalente qui e restano fuori.
- **Nessun cambiamento a `scrollSpeed` o `note`** di `user_song_prefs`: fuori tema per
  una stampa.

## Decisioni

| # | Scelta | Perché |
|---|---|---|
| 1 | Scelta chiesta **ad ogni download**, nessuna persistenza; default tonalità scritta | Mantiene intatto il principio "per la stanza" già scritto in `document.tsx:17-19`: nessun rischio di consegnare per errore una copia col proprio capo perché rimasta selezionata da un download precedente |
| 2 | Meccanismo: **checkbox** visibile sopra "Download PDF", non un modale al click né due bottoni | Coerente con la semplicità attuale del pannello booklet (un `<select>` e un bottone); la scelta resta visibile prima di premere, senza un passaggio interrotto in più |
| 3 | Annotazione **per canzone**, stesso testo/logica di `TransposeNote` a schermo, mostrata solo se capo o semitoni ≠ 0 | Autodescrittiva anche se la pagina è fotocopiata o separata dal resto; resta vera e visibile anche nel caso limite in cui capo e semitoni si annullano a vicenda e gli accordi stampati appaiono identici alla versione scritta |
| 4 | Preferenze lette per l'**email realmente firmata**, non `accountOwnerEmail` | Coerente con come `user_song_prefs` funziona già ovunque (`src/lib/prefs/actions.ts`); un proprietario globale che scarica il canzoniere di un cliente prende le *proprie* preferenze (quasi sempre assenti → tonalità scritta), non quelle del cliente — nessuna gestione speciale necessaria, il fallback esistente basta |
| 5 | Piano tenuto in un **file a sé** (`PLAN-booklet-personal-print.md`), non una sezione nuova di `PLAN.md` | `PLAN.md` documenta solo lavoro già consegnato; una voce `v3.15` per una feature non ancora scritta sarebbe falsa nella sua stessa collocazione. Stesso precedente di `PLAN-comments.md` |

## Assunzioni prese senza chiedere

Da correggere se una è sbagliata — nessuna è irreversibile.

- **Scope delle "impostazioni proprie" = solo `semitones` + `capo`.** `scrollSpeed` e
  `note` non hanno nulla a che vedere con cosa viene stampato.
- **Fallback per canzoni senza prefs salvate**: restano scritte, nessuna riga aggiunta —
  esattamente il comportamento di oggi per quella singola canzone.
- **Checkbox = interruttore per l'intero booklet**, non per singola canzone — il
  pannello non ha oggi alcuna selezione di canzoni, quindi non c'è granularità più fine
  da offrire senza costruirla da zero.
- **Global owner che scarica il canzoniere di un cliente**: nessuna gestione speciale,
  vedi Decisione 4 — il fallback a tonalità scritta lo risolve da sé nella quasi
  totalità dei casi reali.

## Domande ancora aperte

- **Copy esatta della riga di annotazione e della checkbox** nel PDF/pannello: le
  formulazioni sopra sono proposte, non testo finale — da rivedere a schermo/su una
  bozza di PDF reale prima di considerarle chiuse.
- **Dove esattamente nel layout di pagina** va la riga di annotazione (sotto il titolo,
  sopra i link in fondo, in un colore diverso?) — `document.tsx` ha un'impaginazione
  elaborata (colonne, misurazione reale delle pagine); l'inserimento va verificato che
  non rompa il conteggio pagine dell'indice, che oggi dipende da un rendering ripetuto.
