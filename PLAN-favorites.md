# Brani preferiti — piano

> **Consegnato e in produzione dal 5 settembre 2026** (commit `93bdd74` e `173e8df`), e
> ripiegato in `PLAN.md` come **v4.6 — i brani preferiti**. La v4.5 è rimasta riservata ai
> coupon (`PLAN-coupons.md`), usciti prima e non ancora ripiegati: vedi la nota in testa a
> `PLAN.md`.
>
> Questo file resta, come restano `PLAN-account-name.md` e gli altri già consegnati: la
> sezione in `PLAN.md` dice che cosa e quando, questo dice il perché per esteso — in
> particolare gli otto *Scostamenti* più sotto, che sono il valore vero del documento e non
> stanno nella sezione di versione. Precedente diretto per la meccanica: `lastOpenedAt` e il
> capotasto, entrambi in `user_song_prefs` con la stessa coda offline che questa feature
> riusa invariata.

## Cos'è

Oggi non esiste alcun concetto di «preferito»: un brano ha titolo, artista, tag, tre link
e un posto in una sezione, e basta. Ciò che è *del lettore* su un brano — tonalità,
capotasto, velocità di scorrimento, forme degli accordi, «aperto l'ultima volta il…» — vive
in `user_song_prefs` (chiave `(user_email, song_slug)`), scritto da `saveSongPrefs`
attraverso `prefsQueue` (una scrittura pendente per brano, debounce 2 s, retry 15 s, in
memoria) con una cache di lettura in `localStorage` (`songs:song:<slug>`) letta in un
layout effect prima del primo paint. Le liste — home (ricerca su tutto + elenco
canzonieri + «Recently played»), pagina del canzoniere (sezioni apribili), salto rapido
nella barra di lettura — disegnano tutte la stessa `SongRow` su `SongIndexRow`. Nella
pagina di lettura il titolo ha già uno slot azioni accanto (`song-heading-actions`: la
traccia a tre segmenti delle Note e la matita), che su telefono scende sotto al titolo. Le
frecce precedente/successivo nella barra vengono da `seriesOf` (server), calcolate
sull'intero canzoniere.

La richiesta: **una stella accanto al nome del brano in modalità lettura**, che si accende
e si spegne con un tap; **la stella visibile nelle liste**; **un filtro «solo preferiti»**.

## Cosa cambia, risolto nell'intervista

- **La stella è del lettore, non del brano.** Colonna `favorite boolean NOT NULL DEFAULT
  false` su `user_song_prefs`, non su `songs`. Stesso precedente di `lastOpenedAt`: coda
  offline, cache locale e `saveSongPrefs` esistono già e la stella vi si aggiunge come
  campo di `SongPrefs`. Conseguenza voluta: un global owner entrato nell'account di un
  cliente vede e scrive le *proprie* stelle, mai quelle del cliente — la stessa
  separazione che «Recently played» già fa (`listRecentlyOpened` filtra per `userEmail`
  *e* `accountOwnerEmail`). Costo accettato: le liste devono leggere l'insieme dei
  preferiti *di questo lettore* accanto alle righe, non trovarlo dentro `songs`.
- **Nessun gate di piano.** Come le note ancorate e come `saveSongPrefs` argomenta di sé:
  è come questo lettore legge, non una modifica di qualcosa di condiviso. Nessuna riga in
  `PLANS`, nessuna cella su `/pricing`, nessun `FeaturePaywallModal`.
- **Il bottone sta nel gruppo azioni accanto al titolo**, terzo controllo prima della
  traccia Note e della matita: `[☆] [Note] [✎]`. Stessa misura del bottone matita
  (`.btn.is-inset`, 44px quadrato). Su telefono l'intero gruppo scende sotto al titolo,
  come oggi — «accanto al nome» vale sul desktop alla lettera e sul telefono come «nella
  riga del titolo». Scartati: un bottone in linea col testo dell'h1 (target piccolo, posto
  che si sposta con la lunghezza del titolo) e un quinto chip nella riga Key/Capo/♯♭/Chords
  (quella riga va già a capo a 402px, e la stella non è un'impostazione di lettura).
- **Colore: l'accento caldo** (`--accent`: terracotta chiaro / ambra scuro) per la stella
  piena, `--muted` per il contorno quando il brano non è preferito. Scelta consapevole
  contro la lettura stretta della Chord-First Rule di `DESIGN.md`, e per questo **va
  dichiarata lì**, con l'argomento che la regge: il badge Key sulla stessa schermata già
  si accende in accento quando la trasposizione ≠ 0, quindi «stato non di default =
  accento» ha un precedente; la stella è un glifo solo di 17px, mai un'area colorata, e
  resta «visibilmente più quieta di un accordo sul foglio» come la regola chiede. Il
  controargomento (è il primo segno caldo che l'occhio incontra prima del foglio) è stato
  posto e respinto.
- **Nelle liste la stella si vede soltanto**: stella piena in accento accanto al titolo dei
  soli preferiti, nessun contorno sugli altri (rumore su liste lunghe). La riga resta un
  unico `<Link>` come oggi; il cambio di stato avviene solo dal brano. Vale ovunque
  `SongRow` viene disegnata: sezioni del canzoniere, risultati della ricerca in home,
  «Recently played», salto rapido dentro il brano. Non nelle righe di Arrange, che sono
  compatte per scelta e servono a spostare, non a leggere.
- **Il filtro vive in due posti**: la home (un toggle stella di fianco al campo di ricerca)
  e la pagina del canzoniere (nell'header, visibile a ogni lettore, non solo a chi può
  modificare). Esclusi, per decisione: il pannello di salto rapido dentro il brano e il
  libretto/export.
- **In home, filtro acceso senza ricerca = la lista piatta dei preferiti di tutti i
  canzonieri**, ognuno con «dove vive» sotto al titolo, in ordine alfabetico — lo stesso
  che i risultati di ricerca danno e per la stessa ragione scritta in `HomeScreen`: fra
  canzonieri diversi non esiste un ordine. Sostituisce elenco canzonieri e «Recently
  played», come già fa la ricerca. Filtro acceso *e* ricerca: si cerca fra i soli
  preferiti.
- **Nel canzoniere, filtro acceso = le sezioni restano, dentro solo i preferiti**, e le
  sezioni senza preferiti si nascondono. Il conteggio nell'header dice «N favorites».
- **Un solo interruttore, ricordato sul dispositivo**: una chiave `localStorage` condivisa
  da home e canzonieri, come le sezioni aperte/chiuse (`readFolds`). Acceso in home, è
  acceso anche nel canzoniere e sopravvive al ritorno da un brano — il gesto tipico sul
  palco. Non sincronizzato fra dispositivi: è uno stato della serata, non un dato.
- **Le frecce della barra, con il filtro acceso, scorrono i soli preferiti dello stesso
  canzoniere, nel suo ordine**, e il contatore conta quelli («2 of 5»). Non tutti i
  preferiti dell'account: quella sequenza avrebbe richiesto un ordine trasversale che non
  esiste e un «torna indietro» che non coincide più con le frecce. Regola di fallback: se
  il brano aperto non è fra i preferiti (raggiunto da URL, da «Recently played», o appena
  tolto dai preferiti con la stella), le frecce tornano all'intero canzoniere.

## Impianto — dove si aggancia

1. **Schema e migrazione.** `src/lib/db/schema.ts`, `userSongPrefs`: `favorite:
   boolean('favorite').notNull().default(false)` con commento che dice perché è del
   lettore. Migrazione **scritta a mano** `drizzle/0038_favorites.sql` (una sola riga:
   `ALTER TABLE "user_song_prefs" ADD COLUMN "favorite" boolean DEFAULT false NOT NULL;`)
   più la voce in `drizzle/meta/_journal.json` con `idx: 38` e un `when` maggiore di
   `1788510304700` (la `0037`): `drizzle-kit generate` non gira su questo schema dalla
   `0028` in poi. Additiva e senza backfill: ogni riga esistente risponde già «no». In
   produzione si applica dal console SQL di Neon **con la riga del journal nella stessa
   transazione** (vedi `CLAUDE.md`, «Migrating the production database»); `sha256` dei
   byte grezzi del file e il `when` del journal sono i due valori da portare.
2. **`src/lib/prefs/types.ts`**: `SongPrefs.favorite: boolean`, `DEFAULT_SONG_PREFS.favorite
   = false`. `store.ts`: `readSongPrefs` legge `favorite` come boolean (qualunque altra
   cosa → `false`), `writeSongPrefs` invariata. Nuova `readCachedFavorites():
   Record<string, boolean>` che scorre le chiavi `songs:song:*` — serve al punto 6.
   `actions.ts`: `loadPrefs` e `saveSongPrefs` portano il campo; `recordSongOpened` e
   `clearRecentlyOpened` restano com'erano (l'insert del primo lascia il default, l'update
   del secondo tocca una sola colonna) — aggiornare il commento di `clearRecentlyOpened`
   che elenca cosa condivide la riga (oggi dice «capo» due volte; aggiungere `favorite`).
   `PrefsProvider.tsx`: `favorite` entra nel confronto di `updateSong` (altrimenti un tap
   che non cambia nulla accende il puntino «non salvato»), nuovo `toggleFavorite()` nel
   contesto. La coda non cambia: ultima scrittura vince per brano, come per il capotasto.
   Nota da lasciare in un commento: `saveSongPrefs` scrive la riga intera, quindi un
   dispositivo con cache vecchia che cambia il capotasto riscrive anche la stella con il
   proprio valore — mitigato da `loadPrefs` che vince all'apertura del brano se nulla è
   pendente, stessa esposizione che oggi hanno già tutti gli altri campi.
3. **Icona.** `IconStar` in `src/components/icons.tsx`, tratto come le altre; variante
   piena via prop `filled` (`fill="currentColor"`). Non esiste oggi nessuna stella.
4. **Il bottone nella pagina di lettura.** Nuovo `FavoriteButton.tsx` (`'use client'`):
   legge `usePrefs().song.favorite`, chiama `toggleFavorite`, `aria-pressed`, `aria-label`/
   `title` «Add to favorites» / «Remove from favorites». Classe `btn is-inset
   song-heading-star` sulle stesse misure di `.btn.song-heading-edit` (44px, `--r-sm`);
   icona 17px, `text-accent` quando piena, `text-muted` quando contorno. **Non dipende da
   `useOnline`**, a differenza della matita: è una preferenza con coda offline, e
   spegnerla senza rete tradirebbe la promessa che quella coda esiste per fare. Reso in
   `SongHeading` (`LiveSong.tsx`) come primo figlio di `.song-heading-actions`.
   `FollowSession` disegna il proprio `<h1>` e non monta `SongHeading`: l'ospite di Strum
   Together, senza account, non vede nessuna stella senza bisogno di un gate.
5. **L'insieme dei preferiti accanto alle liste.** `SongIndexRow`, `Song` e `toIndexRow`
   **non cambiano**: la stella è un fatto del lettore e viaggia come `Set<string>` di slug
   accanto alle righe, non dentro. Nuova `listFavoriteSlugs(accountOwnerEmail,
   userEmail): Promise<string[]>` in `src/lib/data/db.ts`, stessa forma e stessi due
   filtri di `listRecentlyOpened` (join `songs`→`songbooks`, `favorite = true`). La leggono
   `app/(home)/page.tsx`, `app/songbooks/[slug]/page.tsx` e `SongReader.tsx` (dentro
   `placeOf`), tutti già `force-dynamic` e già in possesso di `currentUser()`; vuoto senza
   database o senza utente. Passata come prop `favorites: string[]` a `HomeScreen`,
   `SongbookSongs`, `SongReaderSearch` e `LiveControlBar`.
6. **Lo strato vivo, tre livelli come `PrefsProvider`.** Nuovo hook `useFavorites(baked:
   string[]): Set<string>` in `src/lib/favorites/useFavorites.ts`: (1) l'insieme reso
   dal server; (2) al mount, `loadFavoriteSlugs()` (`src/lib/favorites/actions.ts`, `'use
   server'`, stesso cancello `currentUser()` di `loadSongIndex`) che, se risponde, vince;
   (3) la cache locale per brano vince **per uno slug con scrittura pendente in
   `prefsQueue`**, e — quando il livello 2 non ha potuto rispondere, cioè offline — **per
   ogni slug che la cache conosce**, perché la pagina viene allora dal precache ed è più
   vecchia di qualunque cosa la cache tenga. La fusione è una funzione pura
   `resolveFavorites(baked, live, cached, isPending)` in `src/lib/favorites/resolve.ts`,
   con test `node:test` che coprono i tre casi (online, offline, pendente). L'hook si
   iscrive a `prefsQueue.subscribe` per ricalcolare quando una scrittura si svuota.
7. **`SongRow`**: prop `favorite?: boolean`; quando vera, `IconStar filled size={14}
   className="text-accent"` subito dopo il testo del titolo (prima dell'artista nella riga
   indicizzata, sulla prima riga in quella con «dove vive»), con `<span className="sr-only">
   Favorite</span>` per lo screen reader. Nessun contorno quando falsa.
8. **Il filtro e la sua memoria.** `src/lib/favorites/filter.ts` (`'use client'`):
   `readFavoritesOnly(): boolean` / `writeFavoritesOnly(on)` su chiave `songs:favorites-only`,
   stesso stile difensivo di `folds.ts`; letta in un `useLayoutEffect`, mai in render (la
   regola di idratazione già scritta in `SongbookSongs`). Componente
   `FavoritesFilterToggle.tsx`: `<button aria-pressed>` con `IconStar` (piena e in accento
   quando acceso), `aria-label` «Show only favorites», classe `icon-pill` con stato
   `is-on`. Nascosto in modalità `organizing`, come la ricerca in home.
9. **Home (`HomeScreen.tsx`).** Il toggle va nella riga del campo di ricerca (campo
   `flex-1`, pill accanto). Con il filtro acceso e nessuna ricerca: header «Favorites» con
   sottotitolo «N favorites», poi una `row-list card` di `SongRow` con `under` = nome del
   canzoniere (`nameOf(homeOf(slug))`), alfabetica (`localeCompare(..., 'it')`); elenco
   canzonieri, note e «Recently played» non si disegnano, come già durante una ricerca.
   Vuoto: «No favorites yet. Open a song and tap the star next to its title.» Con
   ricerca: `results` filtrati ai preferiti, contatore «X of N favorites».
10. **Canzoniere (`SongbookSongs.tsx`).** Il toggle nell'header, fuori dal blocco
    `mayEdit`. Con il filtro acceso `groups` tiene solo i brani preferiti e scarta le
    sezioni rimaste vuote; il sottotitolo dice «N favorites»; vuoto: «No favorites in this
    songbook yet.» Il fragment `#song-<slug>` del ritorno indietro continua a funzionare:
    la sezione del brano preferito è fra quelle mostrate; se il brano è stato tolto dai
    preferiti nel frattempo, `scrollIntoView` non trova nulla ed è innocuo. Arrange opera
    sempre su tutte le righe: è una modalità che nasconde il toggle.
11. **Le frecce.** `seriesOf` (`src/lib/songbooks/series.ts`) resta com'è per il server;
    accanto nasce `favoritesSeries(siblings: string[], favorites: Set<string>, current:
    string): Series | null`, pura e coperta da `series.test.ts`: filtra `siblings` ai
    preferiti, `null` sotto i due elementi (stessa soglia di `seriesOf`), `null` anche
    quando `current` non è fra i filtrati — il chiamante allora usa la serie intera.
    `placeOf` in `SongReader.tsx` restituisce anche `siblings: string[]` (gli slug del
    canzoniere nell'ordine di `listSongs`, lo stesso conto che `seriesOf` fa già
    internamente — estrarlo in `siblingsOf`). `LiveControlBar` diventa il punto in cui si
    decide: legge `readFavoritesOnly()` in un layout effect, `useFavorites(favorites)`,
    e passa a `ControlBar` la serie filtrata quando il filtro è acceso e la funzione
    non risponde `null`, altrimenti `steps` del server. Il contatore segue la serie che
    si sta usando. I commenti attuali sulla «stalezza voluta» delle frecce vanno rivisti:
    da v3.0 le pagine sono `force-dynamic`, quell'argomento non regge più e non deve
    restare a contraddire una serie calcolata nel client.
12. **CSS (`globals.css`).** `.btn.song-heading-star` (stesse misure di `.song-heading-edit`,
    da unificare in un selettore comune se conviene), `.icon-pill.is-on` (sfondo
    `--accent-soft`, colore `--accent`), stella nelle righe senza regole nuove
    (`text-accent` inline). Nessun token nuovo.
13. **`DESIGN.md`.** Sotto *Named Rules*, dopo la Chord-First Rule, una frase che iscrive la
    stella: accento su un glifo solo, mai su un'area, «stato non di default» come il badge
    Key, dichiarata e non deriva. Tokens invariati.
14. **Test.** `series.test.ts` (`favoritesSeries`: filtro, soglia, `current` assente,
    ordine conservato), `favorites/resolve.test.ts` (i tre livelli), `prefs/types.test.ts`
    (default `favorite: false`). Niente test di componenti: non esiste un runner React in
    questo repo.
15. **Intatti, per decisione**: libretto e export, Strum Together (palco e ospite), il
    filtro nel salto rapido dentro il brano, `Song`/`SongIndexRow`, `recordSongOpened`,
    la coda `prefsQueue`.

## Scostamenti dal piano, emersi in implementazione

Il piano sopra descrive ciò che è stato costruito; questi otto punti sono i posti in cui
l'implementazione ha dovuto discostarsene, ciascuno con il motivo.

1. **La stella non viaggia con la riga: ha una sua azione e una sua chiave in coda.**
   *(Riprodotto in browser il 5 settembre 2026: rimettendo la stella dentro la riga e
   rallentando `loadPrefs` perché il tap arrivi prima, un `semitones: 3` salvato è tornato
   `0` sul server per il solo tocco della stella. Con le colonne separate la stessa sequenza
   lascia la riga intatta.)* Il
   punto 2 del piano la faceva passare da `saveSongPrefs` come un campo qualsiasi di
   `SongPrefs`. Non regge, e il difetto è una perdita di dati vera: `PrefsProvider` rifiuta
   di applicare la riga che arriva dal server finché una scrittura per quel brano è in coda
   — giustamente, altrimenti sovrascriverebbe ciò che chi legge ha appena cambiato. Ma la
   stella si tocca *nell'istante in cui la pagina si apre*, prima che quella riga sia
   arrivata: su un dispositivo senza copia locale del brano, il tap accoda i **valori di
   default** (capotasto 0, nessuna trasposizione), la riga vera viene poi scartata perché
   una scrittura è pendente, e due secondi dopo la coda scrive quei default sopra un
   capotasto messo mesi prima. Quindi: `saveFavorite` scrive **una sola colonna** (stessa
   forma di `recordSongOpened`), `prefsQueue` ha una terza voce con chiave
   `favorite:<slug>`, e `saveSongPrefs` legge `prefs.favorite` e lo butta via.
   `queue.test.ts` copre entrambe le cose: che le due chiavi non collidano e che cinque tap
   restino una scrittura sola.
2. **Un contatore di modifiche per scopo (`lib/prefs/adopt.ts`), a fianco di `hasPending`.**
   Le due domande sono diverse: `hasPending` chiede «c'è una scrittura in volo», il
   contatore chiede «il lettore ha cambiato qualcosa *da quando questa lettura è partita*».
   La seconda copre il caso in cui la coda si è già svuotata e il `loadPrefs` partito al
   mount risponde dopo, riportando il valore di prima del tap.

   **Misurato, e il risultato ha smentito la mia previsione: quella finestra oggi non è
   raggiungibile.** Con un `loadPrefs` rallentato a posta (15 s, con la query eseguita
   subito e la risposta ritardata) il valore non è mai tornato indietro nemmeno
   disattivando il guardiano — perché Next esegue le server action di un client **una alla
   volta**: la POST lenta dura 15,5 s nel log e le scritture partono solo dopo, quindi al
   momento in cui la lettura atterra `hasPending` è ancora vero. Il contatore resta
   comunque, e la ragione è quella: così la regola non poggia su una proprietà del
   framework che nessuno ha scritto da nessuna parte e che smetterebbe di valere se
   `prefsQueue.flush` non aspettasse più una scrittura alla volta. È una rete, non una
   correzione — detto anche in testa a `adopt.ts`, per non lasciare un commento che
   rivendica più di quanto sia stato osservato.

   `adoptStoredSong` decide **campo per campo**, non tutto-o-niente: chi tocca la stella non
   ha detto nulla sul proprio capotasto, e il capotasto sul server resta la risposta più
   fresca che esista per quel campo.
3. **La cache locale si consulta solo quando il server non ha risposto**, e le scritture di
   questa visita arrivano dalla coda con il loro valore, non dalla cache. Il punto 6 del
   piano diceva «la cache vince per uno slug con scrittura pendente»: sbagliato in due modi.
   Se la cache vincesse sempre, una stella messa dal tablet non comparirebbe sul telefono
   che quel brano l'aveva aperto mesi fa (la cache direbbe «no» e sarebbe la risposta più
   vecchia). E se l'override durasse solo quanto la pendenza, la stella si spegnerebbe nel
   momento esatto in cui la scrittura riesce, perché l'unica lista `live` in mano è quella
   scaricata *prima*. Quindi `resolveFavorites` prende quattro argomenti — `baked`, `live`,
   `cached`, `writes` — dove `writes` sopravvive alla propria scrittura per sempre.
4. **`FavoritesProvider`, un contesto, non un hook chiamato a mano.** Tre consumatori sulla
   sola pagina di lettura (il contatore sotto al titolo, le frecce, il salto rapido): un
   hook per ciascuno avrebbe fatto tre volte la stessa fetch. Regge anche lo stato del
   filtro, così `FavoritesFilterToggle` non ha props.
5. **Un solo calcolo della sequenza, letto in due posti — la lacuna che il piano non
   vedeva.** Il punto 11 collegava la serie filtrata alla sola barra. Ma il contatore sotto
   al titolo veniva dal server: con il filtro acceso la barra avrebbe detto «2/5» e il
   titolo «3 of 12» sulla stessa schermata. Peggio su telefono, dove la barra nasconde il
   proprio conteggio sotto `sm` e l'unico numero visibile sarebbe stato quello sbagliato.
   `useSequence` (in `LiveSong.tsx`) è l'unico posto dove si decide; `SongHeading` e
   `LiveControlBar` lo chiamano entrambi. `SongHeading` di conseguenza non prende più
   `place` ma `within` + `sequence`.
6. **I numeri di riga tengono il posto reale nella sezione**, quindi con il filtro acceso
   corrono 2, 4, 5 e non 1, 2, 3: l'etichetta dice «posto nella sezione» e rinumerare un
   sottoinsieme la renderebbe falsa e in disaccordo con lo stesso brano a filtro spento.
7. **La conferma di cancellazione di una sezione conta la sezione, non ciò che il filtro
   mostra.** `shown` porta un `held` preso dalla lista non filtrata: senza, «Contiene 2
   brani. Spostali in:» avrebbe cancellato i 5 veri.
8. **Il conteggio in testa dice «N di M brani», non «N preferiti»**, sia in home sia nel
   canzoniere: dice quanto è stretto il filtro, che è l'informazione che manca, invece di
   ripetere il numero di righe subito sotto.

## Aggiunte dopo la consegna

**5 settembre 2026 — una conferma visibile al tocco della stella.** Il cambio di colore e
riempimento del bottone è facile da perdere su un controllo che il pollice ha appena
coperto, quindi ora accanto alla stella compare per un attimo «Added to favorites» /
«Removed from favorites». Sovrapposta e non impaginata: i due controlli a fianco sono cose
che chi legge potrebbe stare per toccare, e una conferma che occupasse spazio li
sposterebbe di lato proprio mentre una mano ci va sopra. Inchiostro su pagina
(`.btn-ink`), non l'accento — la stella è già la cosa colorata lì.

**E un difetto trovato provandola, che vale oltre questa feature.** La prima versione
faceva tutto con una sola animazione `forwards`: entra, resta, esce. Con «riduci
movimento» attivo non si vedeva niente. In fondo a `globals.css` c'è una regola generale
che porta ogni `animation-duration` a `0.01ms !important`, quindi l'animazione non
rallenta: non parte, e `forwards` inchioda l'elemento all'**ultimo** fotogramma, che era
`opacity: 0`. Su un'impostazione comune su telefono la parola non compariva mai. Ora la
pillola è opaca a riposo, l'animazione la porta solo *dentro*, e l'uscita è una classe che
il componente aggiunge: con quell'impostazione compare e sparisce di colpo, che è esatto.
Misurato in browser, opacità campionata dentro la pagina: visibile ~1,5 s in entrambe le
modalità. La regola generale è ora scritta anche in `DESIGN.md`, fra i *Don't*.

## Decisioni

| Scelta | Perché, in una riga |
|---|---|
| Stella in `user_song_prefs`, per lettore | Stesso precedente di `lastOpenedAt`/capo: coda offline e cache già pronte; l'admin in un account altrui non tocca le stelle del cliente. |
| Nessun gate di piano | È come il lettore legge, non una modifica del repertorio — lo stesso argomento delle note ancorate. |
| Bottone nel gruppo azioni, prima di Note e Matita | Slot che esiste già, misura della matita, su telefono scende con il gruppo; le alternative erano un target piccolo o una riga di chip già piena. |
| Stella piena in `--accent`, contorno `--muted` | Voluta come la stella «dorata» classica; dichiarata in `DESIGN.md` con il precedente del badge Key e la garanzia «un glifo, mai un'area». |
| In lista solo visibile, non toccabile | La riga resta un unico link; niente tap accidentali cercando un brano; si cambia dal brano. |
| Filtro in home e nel canzoniere, non nel salto rapido né nel libretto | I due posti dove si sceglie cosa suonare; il resto è scope non richiesto. |
| Home filtrata = lista piatta alfabetica con «dove vive» | Fra canzonieri non esiste un ordine, come i risultati di ricerca già argomentano. |
| Un solo interruttore in `localStorage` | Acceso in home, acceso nel canzoniere, sopravvive al ritorno dal brano; stato della serata, non dato da sincronizzare. |
| Frecce sui soli preferiti dello stesso canzoniere | Più comodo sul palco; lo stesso canzoniere tiene le frecce coerenti col «torna indietro»; fallback alla serie intera quando il brano aperto non è preferito. |
| `SongIndexRow` invariato, preferiti come `Set` accanto | La stella è un fatto del lettore: metterla nella riga del brano avrebbe reso `toIndexRow`/`loadSongIndex` dipendenti da chi guarda. |
| Migrazione `0038` a mano, additiva, senza backfill | `drizzle-kit generate` non gira; `DEFAULT false` fa rispondere ogni riga esistente. |

## Domande aperte

- **Stella sul palco di Strum Together** (`StrumTogetherStage`, che disegna il proprio
  titolo): non richiesta, non prevista. Se un giorno il leader vuole segnare da lì, il
  bottone del punto 4 è riusabile tal quale.
- **«Solo preferiti» nel libretto PDF**: il generatore è lato server e dovrebbe leggere
  la stella *di quel lettore* — fattibile con `listFavoriteSlugs`, ma fuori scope qui.
- **Filtro nel salto rapido dentro il brano**: escluso per decisione; se il fallback delle
  frecce (serie intera quando il brano non è preferito) si rivelasse fastidioso a metà
  serata, questo sarebbe il primo posto dove rimetterlo in discussione.
- **Stalezza della cache offline fra dispositivi**: offline la lista mostra la stella come
  la cache di *questo* dispositivo la ricorda; una stella messa dal tablet e mai rivista
  dal telefono non appare sul telefono finché non torna la rete. Accettato: è lo stesso
  limite che oggi ha la tonalità.
- **Rimozione in blocco** («togli tutte le stelle», come «Clear» su Recently played): non
  richiesta; se servisse, è un `UPDATE` di una colonna scopato come `clearRecentlyOpened`,
  mai un `DELETE`.
- **La serializzazione delle server action non è verificata da nessun test.** È ciò che
  oggi rende `hasPending` da solo sufficiente (vedi scostamento 2), e `adopt.ts` esiste
  proprio per non dipenderne — ma se un domani si volesse *togliere* il contatore, servirebbe
  prima un modo di accorgersi che quella proprietà è cambiata, e non c'è.
- **Applicare la `0038` in produzione è un passo a mano.** La CLI non raggiunge il database
  di produzione (vedi `CLAUDE.md`): la migrazione va data dal console SQL di Neon sul
  progetto `songs-db`, **riga di journal compresa e nella stessa transazione**, *prima* che
  questo codice sia in produzione — `select` di drizzle nomina le colonne una per una,
  quindi il codice nuovo su uno schema vecchio rompe ogni lettura di `user_song_prefs`.
