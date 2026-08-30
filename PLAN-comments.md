# Commenti ancorati — piano

> Documento a sé, non una sezione di `PLAN.md`: quel file è il registro delle decisioni già
> prese e la sua stessa nota d'apertura dichiara di non coprire ancora le versioni dopo la
> v3.3. Questo piano andrà ripiegato lì come sezione di versione quando la feature è chiusa.
>
> Italiano nella prosa, inglese nelle stringhe che il codice spedisce — la convenzione già
> in uso nel repo.

## Cos'è

Un **commento** è un appunto testuale privato che un lettore aggancia a un punto preciso di
una canzone: una sillaba della riga di testo, oppure un accordo della riga sopra.

> **Aggiornamento (30/08/2026).** Il piano prevedeva che convivesse con la nota di canzone
> già esistente (`user_song_prefs.note`, la striscia «Attacca piano, il ritornello va giù di
> un tono» sotto il titolo), come nei mock, che le disegnano insieme in entrambe le board.
> A feature finita quella nota è stata invece **eliminata** (migrazione 0030): un appunto
> agganciato alla parola di cui parla dice tutto quello che diceva la striscia e in più dice
> *dove*, e due posti dove scrivere un promemoria sulla stessa canzone erano due posti dove
> cercarlo. Contate prima di toglierla: 48 righe di preferenze e zero note non vuote in tutta
> l'installazione — nessuno ne aveva mai scritta una. Le righe che seguono la nominano ancora
> come termine di paragone per il gating (Decisione 5), e quel confronto resta valido:
> descrive perché nessuna delle due si vende.

Tre stati, non due, esposti da un interruttore a tre segmenti nell'header della canzone:
commenti **nascosti**, commenti **visibili** (lo stato in cui si sta), e **modalità aggiunta**,
in cui un tocco su qualunque parola o accordo apre un nuovo commento. Il terzo stato è
distruttivo della superficie di lettura — ogni parola diventa un bersaglio — quindi deve
sembrare *armato*, non semplicemente selezionato.

I mock di riferimento sono nel progetto Claude Design `f366724a`: `Comment Mode.dc.html`
(le tre questioni di design, §9 §10 §11), `Song Reader.dc.html` (desktop, col rail),
`Song Reader Mobile.dc.html` (telefono).

## Il modello dei dati

Tabella nuova — `user_song_comments`. La riga singola di `user_song_prefs` non può ospitare
una lista, e la sua coda di scrittura (`prefsQueue`) tiene **una sola voce per canzone con
last-write-wins**: giusto per un capo, distruttivo per una lista.

```ts
export const userSongComments = pgTable('user_song_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userEmail: text('user_email').notNull().references(() => accounts.ownerEmail, { onDelete: 'cascade' }),
  songSlug: text('song_slug').notNull().references(() => songs.slug, { onDelete: 'cascade' }),

  /** Indice del blocco in `SongDocument.blocks`. null = orfano. */
  blockIndex: integer('block_index'),
  /** Offset in caratteri dentro `block.text`, snappato a inizio sillaba. null = orfano. */
  charOffset: integer('char_offset'),
  /** 'lyric' | 'chord' — se la nota parla della sillaba o dell'accordo sopra di essa. */
  target: text('target').notNull().default('lyric'),

  /** Il testo ancorato al momento della scrittura: serve all'etichetta «on grace». */
  anchorLabel: text('anchor_label').notNull().default(''),
  body: text('body').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('user_song_comments_song_idx').on(t.userEmail, t.songSlug)])
```

`blockIndex`/`charOffset` nullable insieme sono lo stato **orfano**: nullable e non un
booleano separato, così è impossibile rappresentare un orfano che ha ancora un'ancora.

`anchorLabel` è **denormalizzato di proposito**. Il rail scrive «on grace» e il popup scrive
«New note on sweet»: ricalcolarlo dal documento a ogni render funziona finché l'ancora esiste,
e per un orfano non funziona affatto — è proprio il caso in cui serve di più, perché è l'unica
traccia di cosa parlasse la nota.

Nessun campo in `PlanLimits`, nessun punto di controllo, nessuna riga su `/pricing`: vedi
Decisione 5.

## L'ancoraggio, e come sopravvive a una modifica

È il cuore del piano, ed è la parte che **non esiste già**.

Le coordinate sono quelle del modello fedele al sorgente dell'editor (`src/lib/editor/document.ts`),
non gli indici dell'AST di lettura. `parseChordPro` scarta le righe vuote e le direttive che non
conosce, quindi i suoi indici non risalgono al sorgente; `SongDocument.blocks` invece è 1:1 con
le righe del sorgente e `toSource(fromSource(x)) === x` byte per byte. Lo snap a inizio sillaba
riusa `nearestSnap` (`src/lib/editor/syllables.ts`) — la stessa euristica italiana già decisa e
testata per il tap sulla chord-row dell'editor.

**Conseguenza da mettere in conto:** la schermata di lettura dovrà costruire anche il
`SongDocument` con `fromSource(song.body)`, oggi importato solo da `EditorScreen` e
`GraphicEditor`. `SongReader` già fa `parseChordPro(song.body)`; diventano due passate sullo
stesso sorgente.

### Il trigger dell'orfano — regola nuova, da scrivere

`shiftChords` **non produce mai** un orfano. I suoi tre rami sono:

```ts
if (chord.at < prefix)   return chord                          // 1. prima della modifica: fermo
if (chord.at >= spanEnd) return { ...chord, at: chord.at + delta }  // 2. dopo: scorre
return { ...chord, at: prefix }                                 // 3. dentro: COLLASSA
```

Il ramo 3 collassa l'ancora all'inizio del pezzo riscritto. Per un accordo è la scelta giusta
(è un punto, si sposta di poco, e perderlo perché una parola è stata ribattuta sarebbe «il
peggior tipo di danno silenzioso», dice il suo stesso commento). Per un commento no: il rail
scriverebbe «on grace» accanto a una parola che non è più «grace».

Serve quindi una funzione sorella in `src/lib/comments/reanchor.ts`, che riusa **identico** il
calcolo di `prefix`/`suffix`/`spanEnd`/`delta` e cambia solo la politica del ramo 3:

```ts
export type Reanchored = { blockIndex: number; charOffset: number } | 'orphaned'
```

Un commento diventa orfano in **tre** casi, tutti decidibili senza euristiche:

1. **Il blocco non sopravvive.** Confronto i `blocks` prima e dopo con un diff (LCS sulle righe
   sorgente) e ottengo una mappa vecchio-indice → nuovo-indice; un blocco che non compare nella
   mappa porta con sé le sue note. Questo passaggio serve comunque, e non solo per gli orfani:
   `blockIndex` è posizionale, quindi inserire una riga in cima sposta ogni commento sotto — un
   caso che `shiftChords` non vede nemmeno, perché lavora dentro una riga sola.
2. **Il blocco cambia natura.** `kind` non è più `'lyrics'` (è diventato `tab`, `blank`,
   `directive`…): non ci sono più sillabe a cui agganciarsi.
3. **Il testo sotto l'ancora è stato riscritto** — cioè `prefix <= at < spanEnd`, esattamente
   il ramo 3 di `shiftChords`. Dove un accordo collassa, un commento si stacca.

Il ri-ancoraggio gira **una volta al salvataggio** della canzone, non a ogni render: il
salvataggio è l'unico momento in cui esistono entrambe le versioni del sorgente.

### Cosa fa un orfano

Non si perde e non mente:

- Riceve un **pallino parcheggiato in fondo alla sezione** in cui stava, con lo stesso aspetto
  degli altri, così resta raggiungibile con lo stesso gesto su qualunque schermo.
- Nel rail desktop compare comunque, ma l'etichetta non dice «on ‹parola›»: dice che non è più
  agganciata, e mostra `anchorLabel` come memoria di cosa parlasse.
- Da lì si può rileggere, cancellare, o riagganciare (entrando in modalità aggiunta e toccando
  un nuovo punto).

**Costo accettato, da tenere presente quando lo si vede a schermo:** il pallino parcheggiato
sta in un punto che non è quello di cui la nota parla, e il rail è l'unico posto che lo
dichiara. È la stessa bugia che la regola dell'orfano voleva evitare, spostata di qualche riga
— si è scelto di pagarla in cambio della raggiungibilità su mobile, dove non esiste rail.

## La resa nella pagina

Valori presi alla lettera dalle board, non reinterpretati.

**Il colore è blu `#2f5f8f`** (opzione 11a, «una seconda voce»). L'accento `#97490f` appartiene
agli accordi: una nota non può mai essere scambiata per musica. Il rischio dichiarato dal mock
è che su una pagina piena di `#97490f` il blu somigli a un link; sorvegliarlo in dark theme.

| Elemento | Valore |
|---|---|
| Sottolineatura del testo ancorato | `border-bottom: 1px dotted rgb(47 95 143 / 60%)` |
| Pallino numerato, desktop | `15×15`, `border-radius: 50%`, `background: #2f5f8f`, `color: #fff`, `font: 600 10px`, `vertical-align: .32em`, `margin: 0 .1em 0 .14em` |
| Pallino numerato, mobile | `14×14`, `font: 600 9.5px`, resto identico |
| Badge contatore, desktop | `min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: #e3edf6; color: #2f5f8f; font: 600 11.5px; font-variant-numeric: tabular-nums` |
| Contatore, mobile | nessuna pillola: solo il numero, `font: 600 13px`, `color: #2f5f8f` |

**Il pallino sta inline dentro `.sheet-lyric`, subito dopo il testo ancorato** — così lo
disegnano entrambe le board del lettore. Va detto esplicitamente perché contraddice la prosa di
`Comment Mode` §10, che prometteva il segno «sulla linea di base della riga degli accordi, così
non spinge mai una sillaba di lato». Le board sono l'artefatto più concreto e vincono, ma la
conseguenza va accettata a occhi aperti: **il pallino consuma spazio orizzontale e la riga può
riandare a capo diversamente**. `globals.css` avverte che le larghezze qui sono portanti — «la
larghezza di questa scatola è dove la riga decide di andare a capo». Il reflow quando i commenti
sono visibili è quindi previsto, non un bug; è anche l'argomento più forte a favore dello stato
«nascosti», che restituisce esattamente la riga di prima.

La numerazione `1, 2, 3` è **derivata al render in ordine di documento**, mai memorizzata:
altrimenti ogni inserimento rinumera righe nel database.

## L'interruttore a tre segmenti

Nell'**header della canzone**, tra il titolo e il pulsante Edit — non nella top bar, malgrado
il titolo di `Comment Mode` §9 dica «the switch in the top bar»: entrambe le board del lettore
lo mettono nell'header, ed è anche «la parte alta della canzone» com'era stato chiesto.

È l'opzione **9a**, la traccia a tre segmenti in cui solo l'attivo porta una parola, così il
controllo resta largo quanto un'etichetta più due icone.

Desktop — traccia `height: 34px; padding: 3px; border-radius: 12px; background: #edebe5; gap: 3px`:

| Segmento | Specifica |
|---|---|
| Nascondi | `34×28`, `border-radius: 9px`, `color: #8d939c`, icona 17px (fumetto sbarrato) |
| Visibili *(attivo)* | `height: 28px; padding: 0 11px 0 9px; border-radius: 9px; background: #fff; color: #16181d; box-shadow: 0 1px 2px rgb(22 24 29 / 8%)`, `font: 500 13px`, icona 17px + «Notes» + badge contatore |
| Aggiungi | `34×28`, `border-radius: 9px`, `color: #8d939c`, hover `#97490f`, icona 17px (fumetto con +) |

Mobile — traccia `height: 44px; padding: 3px; border-radius: 14px; gap: 2px`, segmenti `38×38`
`border-radius: 11px`: **due rese diverse, non una scalata.** Il segmento attivo non porta la
parola «Notes» (non ci sta): solo icona + numero nudo.

Quando la modalità aggiunta è armata, l'intera traccia prende l'accento — non solo il segmento —
perché mentre è attiva *ogni parola della canzone si comporta diversamente*.

Il `ControlBar` in basso non è toccato. La sua regola dichiarata («un controllo che si tocca a
metà canzone sta qui fuori, uno che si imposta una volta sta dietro il pulsante») non si applica:
questo controllo non è del dock, è dell'intestazione della canzone, accanto a Edit.

## Il rail desktop, e il popup

**Rail** — `<aside>` `width: 328px; position: sticky; top: 78px; padding: 6px 6px 8px;
background: #fff; border: 1px solid #e6e3dc; border-radius: 22px; box-shadow: 0 1px 3px rgb(22 24 29 / 6%)`.

Il contenitore diventa `display: flex; align-items: flex-start; justify-content: center;
gap: 16px; width: 1112px` e **la colonna della canzone resta 768px**: il rail non la stringe,
occupa la gronda che c'era già. Il dock in basso prende `padding-right: 344px` (328 + 16) per
restare centrato sotto la canzone.

Righe: badge numerato `19×19`; riga meta `font-size: 12.5px; color: #8d939c` con l'ancora in
`#2f5f8f` («on **grace** · 3 days ago»); corpo `font-size: 14.5px; line-height: 1.45;
color: #16181d; text-wrap: pretty`. Riga `padding: 13px 14px; border-radius: 14px`, hover
`background: #e3edf6`. Separatori `height: 1px; margin: 0 14px; background: #f1efe9`.

In fondo: pillola «Add a note» (`height: 36px`, `color: #2f5f8f`, hover `background: #e3edf6`)
e, a destra, **«only you see these»** `font-size: 12.5px; color: #b0b2b8` — la frase che
stabilisce la privacy dell'intera feature.

**Popup** (da `Comment Mode` §10) — card nella forma dei pannelli ordinari, appuntata sotto il
segno a cui appartiene, con in testa a cosa è ancorata («on grace»), perché un segno accanto a
una sillaba non è abbastanza preciso una volta che la card copre la riga. Più note sullo stesso
punto **si impilano dentro una sola card** invece di aprirne diverse: sono lo stesso posto, e
leggerle in ordine è il punto. In scrittura: «Write it here…», Cancel e Save, con **Save inerte
finché non si è digitato qualcosa**.

Su mobile il popup è l'unico modo di leggere una nota: **non c'è elenco**. Il contatore dice
quante ce ne sono, e si raggiungono toccandole una per una — orfani inclusi, grazie al pallino
parcheggiato.

## Dove i commenti *non* compaiono

`SongSheet` è renderizzato da quattro posti. I commenti sono un prop, spento per difetto:

| Chiamante | Commenti | Perché |
|---|---|---|
| `LiveSong` | **sì** | è la lettura |
| `FollowSession` (ospite Strum Together) | **no** | «only you see these» — l'ospite non vede le note di chi trasmette |
| `SongForm` (anteprima) | no | è un'anteprima di editing |
| `EditorScreen` (anteprima) | no | idem |

La riga dell'ospite non è un dettaglio: senza il prop esplicito, un ospite vedrebbe gli appunti
privati di chi guida.

## Offline e scrittura

Si legge **e si scrive** offline, con un **outbox persistente su localStorage** separato da
`prefsQueue`, con chiave l'**id del commento** invece che lo slug della canzone: due note
modificate una dopo l'altra non si sovrascrivono. Si svuota alla riconnessione con gli stessi
agganci già usati (`online`, `visibilitychange`).

Non riusa `prefsQueue` perché quella vive **solo in memoria** — il suo stesso commento dichiara
che ricaricare la pagina mentre si è ancora offline perde la modifica in attesa. Costo
accettabile per un numero, non per un paragrafo scritto a mano sul palco.

Le server action sono POST e non vengono mai messe in cache dal service worker: serve comunque
un mirror su localStorage per la lettura offline, come già fa `prefs/store.ts`.

## Fuori scope, dichiarato

- **Nessun gating di piano.** Coerente con la nota di canzone, che non ha alcun controllo: ciò
  che riguarda solo come un lettore legge sul proprio schermo non si vende.
- **Niente condivisione.** Un commento è di chi lo scrive, punto; non esiste un commento di
  canzoniere o di band.
- **Niente notifiche, niente thread, niente risposte.** Le note si impilano su un punto, non si
  rispondono.
- **`npm run db:generate` non va lanciato.** Lo snapshot di drizzle-kit è fermo alla 0015 e
  proporrebbe di ricreare `accounts`, le colonne di `songbooks` e persino `members`. La
  migrazione va scritta a mano con `--custom`, come le sei precedenti.

## Decisioni

| # | Scelta | Perché |
|---|---|---|
| 1 | Ancoraggio sulle **coordinate sorgente dell'editor** (`blockIndex`, `charOffset`), snap a sillaba con `nearestSnap` | L'AST di lettura scarta le posizioni sorgente; `SongDocument` è 1:1 col sorgente ed è l'unico spazio di indici stabile. Coerente con la decisione già presa per l'editor. |
| 2 | Un commento che perde l'appiglio **diventa orfano ed è dichiarato tale** | Non si perde prosa scritta a mano come effetto collaterale invisibile di una modifica, e l'etichetta «on ‹parola›» non mente mai. |
| 2b | Il trigger dell'orfano è una **regola nuova**: blocco sparito, blocco non più `lyrics`, o ancora dentro lo span riscritto (ramo 3 di `shiftChords`) | `shiftChords` collassa e non orfanizza mai: la politica va scritta, non ereditata. |
| 3 | **Niente elenco su mobile**; l'orfano riceve un pallino parcheggiato a fine sezione | Mobile resta «si tocca solo ciò che si vede». Costo esplicito: il pallino sta dove la nota non parla. |
| 3b | Il pallino parcheggiato esiste **ovunque**, e il rail lo elenca comunque | Una regola sola: `SongSheet` rende sempre allo stesso modo e non deve sapere quanto è largo lo schermo. Il rail è puro sovrappiù desktop. |
| 4 | Scrittura offline con **outbox persistente** per-commento | `prefsQueue` è last-write-wins per canzone e vive in memoria: entrambe le cose sono sbagliate per una lista di paragrafi. |
| 5 | **Nessun gating di piano** | Stessa categoria della nota di canzone, che non è gated: «non sono modifiche di qualcosa di condiviso, sono come questo lettore legge, sul proprio schermo». |

## Assunzioni prese senza chiedere

Da correggere se una è sbagliata — nessuna è irreversibile.

- **Modificare e cancellare** una nota esistente: toccarla nel rail o nella card la apre in
  modifica, con un'azione di cancellazione lì dentro. Nessun mock lo copre.
- **Numerazione derivata** in ordine di documento, mai memorizzata.
- **Lunghezza del corpo** non limitata a schema; se serve un tetto è UI, non `CHECK`.
- Il **breakpoint del rail** non è nei mock: le board sono artboard a larghezza fissa e nel
  progetto non esiste **una sola** `@media`. La board desktop è 1280px con 1112px di contenuto
  (768 + 16 + 328), quella mobile 402px. Proposta: rail sopra ~1180px di viewport, sotto solo
  popup. Da confermare a schermo.

## Scostamenti dal piano, emersi in implementazione

Ognuno è una scelta consapevole con un costo dichiarato, non una scorciatoia.

1. **Gli orfani si parcheggiano in fondo al foglio, non a fine della loro sezione.** Il piano
   chiedeva «a fine della sezione in cui stava», e scrivendo il codice si è visto che è una
   domanda **senza risposta**: un orfano è per definizione una nota a cui è stato tolto il
   `blockIndex`, quindi la sezione di provenienza non è un fatto che i dati conservino
   ancora. Ricostruirla avrebbe richiesto di tenere una coordinata che avevamo deciso di
   buttare, contraddicendo «nullable insieme = orfano». Vengono quindi raccolti sotto una
   sola intestazione a piè di foglio («2 notes no longer sit on the words»). È anche
   *meglio* del piano sul punto che più preoccupava: il badge non finge più una posizione,
   dichiara che la posizione è andata persa — e resta raggiungibile con lo stesso tocco di
   ogni altra nota, che era tutto il motivo per cui doveva esistere su un telefono.
2. **Il pallino è dimensionato in `em`, non nei 15px fissi delle board.** Un badge fermo a
   15px mentre il testo va a 34px smetterebbe di essere trovabile proprio alla dimensione
   che questa app esiste per offrire.
3. **Il blu ha token propri `--note`/`--note-soft`,** non riusa `--plan-standard` che oggi
   porta gli stessi due valori. Significano cose diverse: un cambio di prezzi che
   ricolorasse ogni annotazione dell'app è esattamente la deriva che questa separazione
   previene.
4. **Il breakpoint del rail è `75rem`.** Sotto, `.reading-layout` è `display: contents`, così
   `.song-card` conserva **esattamente** larghezza, margini e centratura che aveva prima:
   la schermata stretta non è «simile a com'era», è immutata.
5. **`editedSpan` è stato estratto da `shiftChords`** (`lib/editor/document.ts`) invece di
   duplicarne il calcolo. Stessa misura, due politiche: un accordo collassa, un commento si
   stacca. Le 724 asserzioni preesistenti passano invariate.
6. **Il ri-ancoraggio gira dopo la transazione, non dentro.** Portare le note attraverso una
   modifica è una cortesia verso chi le ha scritte; un suo fallimento non deve annullare la
   modifica che il lettore ha effettivamente chiesto.

## Domande ancora aperte

1. **Il dark theme.** `#2f5f8f` e `#e3edf6` sono valori della board chiara. `DESIGN.md` è la
   fonte viva dei token e il tema scuro è «caldo e accordato a mano, non un'inversione
   formulaica»: le due varianti blu vanno scelte lì, non calcolate.
2. **Il blu è già il colore del piano Standard** nel design system, e il teal (opzione 11c) è
   quello di Lifetime. Il mock nota che la collisione esiste solo sulla pagina prezzi, ma la
   palette porta comunque un significato in più: da verificare che su `/pricing` non si
   incontrino.
3. **Riagganciare un orfano** è descritto come «entra in modalità aggiunta e tocca un punto»,
   ma non c'è mock del gesto — in particolare di come si dice *quale* orfano si sta
   riagganciando.
4. **Ordinamento del rail**: le board mostrano ordine di documento (1, 2, 3 dall'alto), ma le
   date sono «3 days ago / yesterday / 14 March», cioè non cronologiche. Confermato che
   l'ordine è quello del documento e non quello di scrittura.
