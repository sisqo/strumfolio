# Forme alternative degli accordi — piano

> Documento a sé, non una sezione di `PLAN.md`: quella tabella è il registro delle
> decisioni già *consegnate e in produzione* (la sua stessa nota d'apertura lo dice), e
> questa feature non è ancora scritta. Quando è chiusa, va ripiegata lì come sezione
> `### Forme alternative degli accordi (v4.2)`, stesso formato di tabella già in uso.
> Precedente diretto per la forma del documento: `PLAN-booklet-personal-print.md`.

## Cos'è

Oggi, per ogni accordo, `shapeFor` (`src/lib/music/shapes.ts:462-476`) sceglie *una sola*
forma e la impone ovunque: nel pannello riassuntivo in cima alla canzone
(`ChordSummary`/`summarise` in `src/components/SongSheet.tsx:242-334`), nel diagramma
inline sopra la sillaba quando `chordDisplay: 'shape'` (`SheetChord`, stessa pagina,
riga 613) e nel popup che si apre toccando l'accordo (`ChordPopup.tsx`). Per la chitarra
la scelta viene da `candidates()` (righe 409-433: la forma aperta della tabella `OPEN`
più le due forme mobili di `FORMS`, spostate sul tasto giusto); per l'ukulele da una
ricerca a forza bruta (`ukuleleShape`, righe 364-406) che tiene solo la vincitrice e
scarta ogni altra combinazione provata.

La richiesta: rendere visibili anche le forme scartate, lasciare che il lettore ne scelga
una diversa **toccando l'accordo**, ricordare quella scelta **per quella canzone**
(non per l'accordo in generale, non per l'account intero), e mostrare — nel pannello
riassuntivo in alto — un piccolo segno quando un accordo di quella canzone non usa più
la forma di default.

## Cosa cambia, risolto nell'intervista

- **Strumenti**: chitarra *e* ukulele fin dall'inizio, non solo chitarra. Conseguenza
  diretta: `ukuleleShape` non può più scartare tutto tranne la vincitrice, va riscritta
  per tenere le prime N forme distinte classificate per lo stesso `cost()` che già usa
  (righe 331-344), non solo la prima.
- **Stabilità sotto trasposizione/capotasto**: la forma scelta è legata all'accordo
  **così come appare ora sullo schermo** — stessa radice (classe di altezza, 0-11) e
  stessa famiglia *dopo* lo shift che `readShift`/`readChord` già applicano — non
  all'accordo scritto nel sorgente. Se il lettore trasporta la canzone o sposta il capo
  dopo aver scelto una forma, quell'accordo può sparire dalla canzone; la preferenza
  resta salvata ma inutilizzata, senza errori e senza forme sbagliate — torna al
  default finché non se ne sceglie una nuova. Stesso principio già in uso altrove in
  questo file: un dato che smette di applicarsi non va ripulito attivamente, va solo
  ignorato con sicurezza.
- **Meccanismo**: nessun nuovo modo di toccare un accordo. `ChordPopup`, che si apre già
  da ognuno dei tre punti sopra, guadagna un selettore fra le forme candidate di
  quell'accordo; toccarne una la applica **subito** come preferenza per quella canzone —
  nessun pulsante "salva" separato, coerente con come capo e trasposizione già
  funzionano nel resto dell'app.
- **Indicatore**: un puntino pieno, colore accento, subito dopo il nome dell'accordo —
  sia nella variante `diagrams` del pannello (sotto il diagramma) sia nella variante
  `fingerings` (accanto ai numeri di tasto). Stesso trattamento in entrambe, nessuna
  sovrapposizione al disegno del diagramma.

## Impianto dati — dove si aggancia

**1. Identità di un accordo, per la chiave di salvataggio.** Una stringa
`${instrument}:${root}:${family}`, dove `root` è la classe di altezza 0-11 *dopo* lo
shift e `family` è la famiglia canonica che `familyOf(chord.suffix)`
(`shapes.ts:187-232`) risolve — non la sigla scritta nel file, per lo stesso motivo per
cui `distinctChords` in `src/lib/music/capo.ts:137-150` già collassa `Cmaj7`/`CΔ7` sulla
stessa identità. L'`instrument` è necessario perché è una preferenza globale del
lettore, non della canzone: chi passa da chitarra a ukulele a metà lettura deve trovare
le forme dell'uno intatte quando torna sull'altro.

**2. Cosa si salva non è un indice, è la sagoma stessa.** Il valore salvato per una
chiave è il testo della diteggiatura che `fingeringText` già produce (`shapes.ts:457-460`,
es. `"320003"` o, sopra il decimo tasto, `"10 12 10 10 10 10"`), non un indice numerico
nell'array delle candidate. Un indice si romperebbe silenziosamente il giorno in cui la
tabella `FORMS`/`OPEN` guadagna una voce e l'ordine delle candidate cambia: la riga N
salvata a marzo non indicherebbe più la stessa forma a settembre. Il testo della
diteggiatura è invece autodescrittivo — se in futuro sparisce dalle candidate (tabella
cambiata, famiglia non più raggiungibile) la ricerca semplicemente non lo trova più e la
canzone torna al default, stesso principio di "si applica finché l'accordo esiste
ancora" già deciso sopra.

**3. `shapes.ts` — dalla scelta singola alla lista ordinata.**
   - Nuova funzione esportata, es. `shapesFor(chord, instrument): ChordShape[]`: la
     lista *ordinata* di tutte le forme candidate per quell'accordo, la prima delle
     quali è esattamente quella che `shapeFor` sceglie oggi (stessa regola: la forma
     aperta se c'è, altrimenti la forma mobile più bassa sul manico). `shapeFor` stessa
     resta invariata nella firma e nel comportamento — resta la scorciatoia "dammi il
     default" per ogni chiamante che non ha bisogno delle alternative.
   - Per la chitarra, `shapesFor` deduplica l'output di `candidates()` per diteggiatura
     (due voci con esattamente gli stessi tasti non sono due alternative) e ordina il
     resto per tasto più alto crescente, a parità di logica con `shapeFor` di oggi.
   - Per l'ukulele, `ukuleleShape` (righe 364-406) tiene oggi `best`/`bestCost`, una sola
     coppia; va tenuta una lista corta (proposta: le migliori 4, si veda *Domande
     aperte*) ordinata per lo stesso `cost()`, con lo stesso confronto `cheaper()` usato
     per inserire/scartare durante lo stesso ciclo di ricerca — nessun secondo giro sui
     tredicimila tentativi, la cache `searched` (riga 354) passa da `Fret[] | null` a
     `Fret[][]`.

**4. `SongPrefs` (`src/lib/prefs/types.ts:86-98`)**: nuovo campo
   `chordShapes: Record<string, string>` (chiave → diteggiatura, punti 1-2 sopra).
   `DEFAULT_SONG_PREFS` (riga 143) guadagna `chordShapes: {}`. Una funzione di lettura
   difensiva sul modello di `readAccidentals`/`readChordDisplay` (righe 130-141):
   scarta l'intero campo se non è un oggetto piatto di stringhe, così un valore
   corrotto non fa esplodere il resto delle preferenze della canzone.

**5. `src/lib/prefs/store.ts:74-89`** (`readSongPrefs`): oggi valida ogni campo uno per
   uno anziché fare spread dell'oggetto grezzo — `chordShapes` va validato allo stesso
   modo, con la funzione del punto 4, fallback a `{}`. `writeSongPrefs` non cambia:
   scrive l'intero oggetto `SongPrefs` così com'è.

**6. Migrazione database.** `userSongPrefs` (`src/lib/db/schema.ts:544-575`) guadagna
   una colonna `chord_shapes` di tipo `jsonb`, `not null default '{}'` — nessuna colonna
   jsonb esiste oggi in questo schema, va aggiunto `jsonb` all'import da
   `drizzle-orm/pg-core` (riga 13). `npm run db:generate`, poi `npm run db:migrate`
   contro `songs-db-dev` in locale; la messa in produzione segue la strada già
   documentata in `CLAUDE.md` ("Migrating the production database"): CLI Vercel
   inutilizzabile su Production, console SQL di Neon con la riga di journal scritta a
   mano nella stessa transazione.

**7. `src/lib/prefs/actions.ts`**: `loadPrefs` (righe 96-138) e `saveSongPrefs` (righe
   195-218) leggono/scrivono la nuova colonna con la stessa validazione del punto 4.

**8. `PrefsProvider.tsx`**: `PrefsContextValue` (righe 39-52) guadagna
   `setChordShape(key: string, fingering: string | null): void` — `null` rimuove la
   chiave (torna al default) invece di scrivere la diteggiatura di indice 0, così "la
   chiave è presente" resta l'unico segnale che serve per il puntino. Stesso schema di
   merge già usato da `setCapo`/`setSemitones` attraverso `songRef` (righe 90-107). In
   `FollowSession` (`persist=false`) si comporta come il capo, non come la tonalità: **non
   è bloccato** per l'ospite — la forma di un accordo è come tiene le proprie mani chi
   guarda lo schermo, non cosa suona il gruppo, quindi ogni ospite sceglie la propria
   per sé, mai trasmessa e mai salvata oltre la sessione in memoria.

**9. `SongSheet.tsx`**:
   - `summarise()` (righe 242-268) usa `shapesFor` invece di `shapeFor`, guarda
     `song.chordShapes[key]`: se presente e corrisponde a una delle candidate usa
     quella, altrimenti la prima. `SummaryChord` (righe 219-226) guadagna un campo
     `overridden: boolean` per il puntino.
   - `ChordSummary` (righe 283-334) disegna il puntino accanto a `.chord-strip-name` e
     a `.chord-fingering-name` quando `overridden` è vero, e lo cita nell'`aria-label`
     del bottone ("forma non standard per questa canzone").
   - `SheetChord` (riga 613, `chordDisplay: 'shape'`) risolve tramite la stessa
     ricerca — non un puntino in più lì (fuori scope, vedi sotto), ma la forma disegnata
     dev'essere la stessa che il pannello e il popup mostrano per lo stesso accordo,
     altrimenti la canzone si contraddice da sola.

**10. `ChordPopup.tsx`**: riceve `chordShapes`/`onChangeShape` da `SongSheet` (che li ha
    da `usePrefs()`). Mostra `shapesFor(chord, instrument)`; se ce n'è più di una,
    un piccolo selettore sotto il diagramma principale (frecce o miniature — dettaglio
    di interfaccia, vedi *Domande aperte*) che al tocco chiama `onChangeShape` con la
    diteggiatura scelta e ridisegna subito. Un'azione "usa quella standard", visibile
    solo quando la selezione corrente differisce dalla prima candidata, chiama
    `onChangeShape(key, null)`.

## Fuori scope, dichiarato

- **Nessuna preferenza fra canzoni.** La forma scelta vale solo per la canzone in cui è
  stata scelta — richiesto esplicitamente due volte nel testo originale ("per quella
  canzone"). Non tocca `GlobalPrefs`.
- **Nessun puntino sul diagramma inline** (`chordDisplay: 'shape'`, sopra ogni
  sillaba). L'indicatore richiesto è solo per "il pannello con tutti gli accordi nella
  parte alta della canzone" — la forma scelta si applica comunque lì (punto 9 sopra),
  semplicemente senza ripetere il segno su ogni occorrenza della stessa canzone.
- **Nessun blocco per gli ospiti di Strum Together.** Vedi punto 8: si comporta come il
  capo, mai come la tonalità bloccata.
- **Nessuna limitazione di piano/entitlement.** La feature non tocca
  `src/lib/plans/resolve.ts`; resta disponibile a chiunque legga una canzone, come capo
  e trasposizione oggi.
- **Nessuna forma "impossibile" nuova inventata.** Le alternative vengono solo dalle
  candidate che `candidates()`/la ricerca ukulele già sanno produrre — nessuna nuova
  forma aggiunta alle tabelle `FORMS`/`OPEN` da questa feature.

## Decisioni

| # | Scelta | Perché |
|---|---|---|
| 1 | **Chitarra e ukulele insieme**, non solo chitarra | Scelto esplicitamente in intervista pur conoscendo il costo aggiuntivo: `ukuleleShape` va riscritta per tenere le prime N forme invece della sola vincitrice |
| 2 | Forma legata all'accordo **come appare ora** (radice+famiglia dopo lo shift), non all'accordo scritto nel sorgente | Non serve far scorrere una seconda identità "non trasportata" fino al popup; se cambia capo/tonalità la preferenza resta salvata ma inerte, senza rischio di applicare la forma sbagliata a un accordo diverso |
| 3 | Selezione **dentro il popup esistente** (`ChordPopup`), non un meccanismo separato | Un solo punto d'ingresso per ogni tocco su un accordo, da qualunque dei tre posti (testo, pannello riassuntivo, popup stesso) parta |
| 4 | Indicatore: **puntino accanto al nome**, stesso trattamento in entrambe le varianti del pannello (`diagrams`/`fingerings`) | Le due varianti condividono il nome dell'accordo ma non un riquadro comune su cui appoggiare un badge d'angolo; il nome è l'unico elemento comune |
| 5 | Si salva la **diteggiatura come testo**, non un indice nell'array delle candidate | Un indice si romperebbe silenziosamente se la tabella delle forme cambia ordine in futuro; il testo è autodescrittivo e degrada in sicurezza (torna al default) se la forma scelta smette di esistere |
| 6 | **Assenza della chiave = default**, mai un indice/valore esplicito per "prima candidata" | Un solo segnale ("la chiave c'è") serve sia per applicare l'override sia per decidere il puntino — nessuno stato che possa disallinearsi fra i due |
| 7 | Ospiti di Strum Together: **stesso comportamento del capo**, non bloccato come la tonalità | La forma è come *quel* lettore tiene le mani, non cosa sente il gruppo — non c'è nulla da tenere sincronizzato fra leader e ospiti |
| 8 | Piano tenuto in un **file a sé** (`PLAN-chord-forms.md`) | `PLAN.md` documenta solo lavoro consegnato; stesso precedente di `PLAN-booklet-personal-print.md` |

## Assunzioni prese senza chiedere

Da correggere se una è sbagliata — nessuna è irreversibile.

- **N per l'ukulele = 4** forme tenute dalla ricerca. Un numero piccolo basta: oltre le
  prime tre o quattro le forme rimanenti sono quasi sempre varianti marginali (una
  corda muta in più, un tasto più in alto) che non aggiungono scelte reali — va comunque
  verificato guardando l'output reale prima di considerarlo definitivo.
- **Nessun limite di posizione sul manico per le forme chitarra.** `candidates()`
  restituisce già solo la forma aperta più due forme mobili per famiglia: anche quella
  che finisce più in alto sul manico resta un'alternativa onesta, non serve scartarla.
- **Offline/non autenticato**: il nuovo campo segue lo stesso meccanismo di
  `store.ts` già in uso per capo e trasposizione, nessuna gestione speciale.
- **Deduplicazione delle candidate chitarra per diteggiatura identica**, nel caso raro
  in cui una forma aperta e una forma mobile spostata producano esattamente gli stessi
  tasti.

## Chiuso in fase di scrittura (non più aperto)

- **Interfaccia del selettore dentro `ChordPopup`**: miniature, non frecce. Ogni
  candidata di `shapesFor` è un `ChordDiagram` piccolo (`.chord-form-shape`, nuova
  classe) dentro un bottone; quella in uso ha `.is-on` (bordo e sfondo in accento), la
  prima porta sempre l'etichetta "Standard" sotto al diagramma. **Nessun controllo di
  reset separato**: la prima candidata è sempre il default, quindi toccarla di nuovo
  è già il reset — `onChangeShape(key, null)` invece di riscrivere la sua stessa
  diteggiatura, così "la chiave è assente" resta l'unico segnale sia per il default sia
  per il puntino (Decisione 6 sopra).
- **N per l'ukulele = 4**, confermato guardando l'output reale (`Am7`: `0000`, `0030`,
  `2030`, `2033` — quattro forme genuinamente diverse, non varianti marginali della
  stessa).
- **Copertura dei test**: `shapes.test.ts` guadagna una sezione `shapesFor` (7 casi):
  accordo con `shapeFor` sulla prima candidata per ogni strumento/famiglia/radice,
  l'ordine aperta-poi-mobili-per-tasto-crescente, l'assenza di diteggiature duplicate,
  che ogni forma ukulele resti una voce reale dell'accordo, e le quattro forme reali di
  `Am7` per nome.

## Trovato in fase di scrittura, non previsto dall'intervista

- **Bug scoperto e corretto prima di spedire**: le finestre di tasti della ricerca
  ukulele si sovrappongono di proposito (`base` scorre di un tasto alla volta su
  un'apertura di quattro), quindi la stessa diteggiatura viene ritentata più volte. Con
  una sola forma tenuta questo non contava — un pareggio di costo non sostituiva mai
  `best` — ma tenendo le prime 4 riempiva la lista di ripetizioni della più economica
  invece di quattro forme diverse (verificato: `Am7` dava solo `0000` finché non è
  stato corretto). Risolto con un `Set` delle diteggiature già tentate dentro
  `ukuleleShapes`, **non** come deduplicazione a valle in `shapesFor` — quella
  esisteva già ma avrebbe semplicemente lasciato la lista più corta invece che piena.
- **Costo misurato, non solo assunto**: quel `Set` all'inizio usava `fingeringText`
  (una stringa per tentativo) ed è stato cronometrato — `easeByFret` su una canzone
  ukulele da dieci accordi diversi, cache fredda, passava da ~85ms a ~141ms rispetto al
  branch prima di questa feature (confronto diretto via `git worktree`). Sostituito con
  `fretCode`, un intero a 4 bit per corda invece di una stringa: ~91ms, entro il rumore
  di misura. La chitarra non ha bisogno dello stesso controllo — 0,5ms per la stessa
  canzone, nessuna ricerca, solo 2-3 candidate già in tabella.
- **Contratto di `candidates()` cambiato per l'ukulele, e annotato nel codice**: prima
  restituiva 0 o 1 forma, sempre un array fresco; ora restituisce fino a 4 forme, e
  sull'ukulele **è lo stesso array tenuto in cache** (`searched`), non una copia — un
  chiamante che lo ordinasse o mutasse in place corromperebbe quello che ogni chiamata
  successiva per quella radice/famiglia vede. `shapesFor` lo tratta di conseguenza (mai
  in place); il commento sopra `candidates()` in `shapes.ts` ora lo dice esplicitamente
  per chi la toccherà dopo.
- **Verificato con una prova reale contro `songs-db-dev`, non solo per lettura**: un
  round-trip fuori dai test — `insert` e poi lo stesso `onConflictDoUpdate` che
  `saveSongPrefs` usa, seguiti da una lettura tramite `readChordShapes` — perché
  l'unico punto non coperto dai test puri o dal rendering statico era proprio il salto
  per `jsonb`/drizzle, e un doppio-encoding lì sarebbe stato silenzioso (la cache
  locale avrebbe comunque mostrato la scelta giusta sullo stesso dispositivo,
  nascondendo il problema fino a un secondo dispositivo o a una cache pulita). Riga di
  prova creata e poi cancellata, nessun dato reale toccato.

## Ancora da fare, non da questa sessione

- **Migrazione di produzione**: applicata a mano dall'utente dal console SQL di Neon
  (`BEGIN; ALTER TABLE … ADD COLUMN "chord_shapes" jsonb DEFAULT '{}' NOT NULL; INSERT
  INTO drizzle.__drizzle_migrations …; COMMIT;`, `when` `1788166988261`, hash
  `282d8c2d…`) — non verificabile da qui (nessuna credenziale CLI per Production, vedi
  `CLAUDE.md`), fidata sulla parola di chi l'ha eseguita.
- **Copy esatta** delle etichette (`"Other shapes for this song"`, `"Using a different
  shape for this song"`, `"Standard"`) è quella scritta durante l'implementazione, non
  rivista con l'utente — verificata solo visivamente via un rendering statico con la
  vera `globals.css` (screenshot in `~/songbook-shots/preview.png`), non nell'app vera:
  non è stato possibile accedere con una sessione autenticata in questa sessione.
