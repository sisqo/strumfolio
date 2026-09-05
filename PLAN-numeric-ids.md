# Chiavi surrogate numeriche (v4.7) — piano

> Documento a sé, non una sezione di `PLAN.md`: quella tabella è il registro delle decisioni
> già *consegnate e in produzione*. Precedente diretto per la forma: `PLAN-coupons.md`, che
> è restato un file suo per la stessa ragione.
>
> **La numerazione**: la v4.6 sono i brani preferiti, la v4.5 è riservata ai coupon, quindi
> questa è la v4.7. Detto perché i commenti nel codice la citano, ed è già capitato una volta
> di annotarla `v4.2` — un numero occupato da mesi.
>
> **Stato**: migrazione `0039` scritta, verificata con un giro completo `UP`+`DOWN` contro lo
> schema vero e **applicata allo sviluppo**; codice riscritto e provato (vedi «Costruito»).
> Sulla produzione **non ancora**: quella si applica a mano dal console SQL di Neon, e va
> fatta *prima* del push — vedi «Come si spedisce».

## Cos'è

Lo schema identifica le persone con la loro email (`accounts.owner_email` è la primary key) e i
contenuti con il loro slug (`songs.slug`, `songbooks.slug`). Sostituire entrambe con chiavi
surrogate numeriche, e far puntare le foreign key a quelle.

La richiesta è nata da un difetto reale: `coupon_redemptions` è person-scoped e senza foreign
key — come `paddle_events`, e per la stessa ragione — ma non era nell'elenco delle tabelle che
`changeAccountEmail` sposta a mano. Rinominare un account che aveva riscattato un coupon
lasciava la riga di riscatto sull'indirizzo vecchio, e quell'account poteva riscattare di nuovo
la stessa campagna: le due cose esatte che `coupon_redemptions_once` esiste per impedire.

Quel bug è una riga. La **classe** di bug non lo è: ogni tabella person-scoped che nascerà senza
foreign key va ricordata a mano in quel flusso, e non c'è nulla che lo imponga.

## Misura

| | |
|---|---|
| Riferimenti a `accountOwnerEmail` / `ownerEmail` / `userEmail` nel codice | **464** |
| File coinvolti | **51** |
| Tabelle | 19 |
| Foreign key verso `accounts.owner_email` | 6 |
| Foreign key verso `songs.slug` / `songbooks.slug` | 5 |
| Tabelle con l'email come primary key | 4 (`accounts`, `credentials`, `pending_registrations`, `password_reset_tokens`, più `sign_ins`) |
| Migrazioni già applicate | 39 |

I 464 riferimenti sono il conteggio grezzo, e da solo esagera: la maggior parte è
`user.accountOwnerEmail` letto e passato avanti, che non cambia. La misura che conta è quante
**firme** prendono un'identità come argomento dentro un modulo che poi interroga il database,
perché è lì che l'`id` deve arrivare:

| | |
|---|---|
| Firme che prendono `email`/`slug` come identità, in `src/lib` | 95 |
| Di queste, in moduli che importano `@/lib/db` | **53**, su **21** file |
| Segmenti di rotta che portano un'identità nell'URL | 5 (`songs/[slug]`, `songbooks/[slug]`, `accounts/[email]`, `follow/[token]`, `blog/[slug]`) |

Le 53 sono il lavoro. I 21 file sono la lista da percorrere.

## Verificato sui dati e nel codice, non assunto

Quattro cose che il piano dava per buone e che invece sono state controllate, perché una di esse
poteva invalidarne la forma anziché aggiungere lavoro.

**Lo slug è già globalmente unico, e non per fortuna: per costruzione.** `songs.slug` e
`songbooks.slug` *sono* le primary key di oggi, quindi due brani con lo stesso slug in due account
diversi sono già impossibili. Portare lo slug a `NOT NULL UNIQUE` conserva esattamente il vincolo
attuale, non ne impone uno più stretto — quindi la migrazione non può fallire lì, e
`/songs/[slug]` non ha bisogno dell'account nell'URL. Controllato anche sui dati (4 account, 4
canzonieri, 70 brani): zero slug duplicati, zero slug condivisi fra account.

**L'identità non passa dal token, quindi nessuno viene disconnesso.** Vedi il vincolo su
`currentUser()` qui sotto: le sessioni durano novanta giorni e portano solo un'email, che viene
risolta a ogni richiesta.

**`sing_along_devices` non è in pericolo.** La sua FK punta a `sing_along_sessions.token`, e
`token` ha un vincolo `UNIQUE` suo (`sing_along_sessions_token`, riga 819 di `schema.ts`)
indipendente dalla primary key. Cambiare quella PK da `owner_email` a `id` non lo sfiora. Quello
che va riespresso è un'altra cosa, ed è nelle domande aperte: la PK su `owner_email` imponeva
anche «una sessione per account», che diventa `UNIQUE (account_id)`.

**Il `DOWN` è reversibile per davvero**, e la direzione in cui ricostruisce è scritta sotto
«Rollback» invece di essere scoperta al momento.

## La forma: chiave surrogata **più** chiave naturale unica

Non «via l'email, dentro il numero». Le due chiavi convivono, con ruoli diversi:

- `accounts.id serial PRIMARY KEY`, e `accounts.owner_email text NOT NULL UNIQUE`. L'email non
  può sparire: **è come si accede**. Smette di essere la chiave e resta il campo di login.
- `songs.id`, `songbooks.id` come primary key; `slug` resta `NOT NULL UNIQUE`. Lo slug non può
  sparire: è nell'URL (`/songs/[slug]`), è quello che si condivide, ed è l'unica cosa che un
  brano possiede quando vive come file.

**Perché lo slug deve sopravvivere, e non è una preferenza.** `src/lib/data/files.ts` è un
repository su file scelto in `data/index.ts` a seconda che `DATABASE_URL` esista — è come si
lavora in locale, e `CLAUDE.md` lo descrive come «the normal way to work locally». Costruisce
`Song`/`Songbook`/`Section` leggendo i `.chopro` da `content/`, e un file su disco **ha solo il
suo slug**: non esiste un numero da inventargli che sia stabile fra due avvii. Se l'interfaccia
`SongRepository` passasse a identificare un brano con un intero, quella implementazione non
potrebbe più esistere — che è esattamente ciò che l'intestazione di `schema.ts` dice da sempre
(«a file on disk has a slug and nothing else»).

**E c'è un secondo vincolo, dello stesso peso, che vale per le persone come quello dei file
vale per i brani.** `currentUser()` in `src/lib/auth/session.ts` non tocca il database, e non per
caso: la sua intestazione lo dichiara — «Deliberately **not** null merely because there is no
database. Running from `content/` with no `DATABASE_URL` is the normal way to work locally, and
an owner is an owner there too». Ricava l'email dalla sessione, l'account richiesto dal cookie,
il ruolo da `ALLOWED_EMAILS` — tutto in memoria, niente query. Due conseguenze:

- **`CurrentUser` resta con `accountOwnerEmail`.** Se `currentUser()` dovesse risolvere
  email → `id`, in modalità senza database non ci sarebbe nessun `id` da risolvere e la
  funzione tornerebbe `null` proprio dove oggi risponde correttamente. La risoluzione scende di
  un livello, nei moduli che già interrogano il database — quei 21 — e non sale nel token.
- **Le sessioni già emesse continuano a valere.** Il cookie di sessione dura novanta giorni e
  contiene solo un'email; l'`id` non entra nel JWT (per la stessa ragione per cui il ruolo non
  c'è: `session.ts` lo spiega, «Access is re-decided on every call rather than trusted from the
  token»). Se l'identità dipendesse da un `id` dentro il token, il deploy firmerebbe fuori ogni
  utente collegato. Così invece non se ne accorge nessuno.

Vale anche il caso limite: un owner elencato in `ALLOWED_EMAILS` ha un ruolo **anche senza una
riga in `accounts`**. Quindi «email → id» non è una funzione totale, e nessun punto di ingresso
può assumere che lo sia.

**E c'è un terzo vincolo, che vive nel browser del lettore e sopravvive al deploy.** La coda
offline (`prefsQueue`, e l'outbox dei commenti) è già scritta nel `localStorage` di chi ha usato
l'app prima della migrazione, e le sue voci nominano **slug di brani e id di commenti coniati dal
client**. Quando quella coda si svuota, dopo il deploy, chiama le stesse server action di prima
con gli stessi argomenti. Quindi le firme di `saveSongPrefs` e delle azioni sui commenti
**restano a slug**, e la risoluzione a `id` avviene dentro: cambiarle a interi farebbe fallire in
silenzio ogni scrittura messa in coda prima del deploy — silenzio, perché una coda che si svuota
non ha nessuno che la guardi. È un motivo indipendente per lo stesso confine.

**Sui contenuti il guadagno non è quello che sembra, e va detto.** `renameSongbook` porta il
suo commento in testa: «Renames without touching the slug, so nothing that points at it moves».
Lo slug di un canzoniere o di un brano **non cambia mai** — il nome visibile è una colonna a
parte. Quindi «le rinomine diventano gratuite» è già vero, ottenuto congelando lo slug invece
che sostituendolo con un numero. Il guadagno che resta su `songs` e `songbooks` è l'integrità
referenziale e join più stretti, non le rinomine: minore di quello sugli account, e reale.

Dove invece l'identità cambia per davvero è `changeAccountEmail`, che sposta le righe a mano
tabella per tabella — e la lista scritta a mano ha già mancato `coupon_redemptions`, che è il
bug che questo lavoro chiude per costruzione anziché per attenzione. **Lì il guadagno è pieno.**

Quindi la divisione è netta, e va tenuta:

| Livello | Identifica con | Perché |
|---|---|---|
| **Dentro il database** | l'`id` numerico | integrità referenziale, rinomine gratuite, join stretti |
| **Ai bordi** (URL, `SongRepository`, login, cookie di sessione) | slug ed email | un link condiviso, un file su disco, un modulo di accesso |

L'`id` è una chiave surrogata nel senso proprio: **interna**. Il livello applicativo continua a
cercare per slug e per email, e risolve una volta all'ingresso.

## Cosa si guadagna, in concreto

- `changeAccountEmail` — oggi sessanta righe di transazione applicativa che ricopia la riga,
  ripunta sei tabelle con FK, porta a mano `credentials`/`sign_ins`/`paddle_events`, verifica che
  nulla riferisca più il vecchio indirizzo e solo allora cancella — diventa
  `UPDATE accounts SET owner_email = $1 WHERE id = $2`. Con essa spariscono `reownFkTables`,
  `anyRowStillReferences` e il difetto di `coupon_redemptions`, che non ha più modo di esistere.
- Rinominare lo slug di un brano smette di orfanare le sue preferenze e i suoi commenti — un
  difetto che l'intestazione di `schema.ts` documenta come prezzo accettato e che qui si smette
  di pagare.
- Le tabelle senza FK (`paddle_events`, `coupon_redemptions`) possono averne una vera:
  `ON DELETE SET NULL` conserva la traccia di cosa qualcuno ha pagato *e* lascia l'account
  cancellabile, che è precisamente il conflitto per cui la FK era stata omessa.

## Come si spedisce — deciso: big bang

Una migrazione, un deploy. **Il vincolo che questa scelta non elimina** e che va detto una volta
sola, chiaro: la produzione si migra a mano dal console SQL di Neon (il `DATABASE_URL` di
produzione è irraggiungibile da questa CLI — vedi `CLAUDE.md`), e Vercel deploya al push. Quindi
non è un atto atomico: sono due atti separati da quanto tempo serve a un umano per incollare
dello SQL.

**Ordine, e non è indifferente:**

1. **Prima la migrazione**, dal console Neon.
2. **Poi il push**, che avvia il deploy.

Migrare per primo lascia il codice vecchio a interrogare colonne che non esistono più per il
tempo della build Vercel — circa due o tre minuti, misurati in questa sessione. Pushare per
primo lascia il codice nuovo a interrogare colonne che non esistono ancora per **tutto** il tempo
che passa prima che qualcuno incolli lo SQL. La prima finestra è limitata da una build, la
seconda da un essere umano: la prima è l'unica delle due che si può stimare.

**Cosa si rompe in quella finestra**, per essere espliciti: login, `/songbooks`, il lettore,
`/billing`, `/checkout`. Cioè tutto tranne le pagine statiche. Da fare a un'ora in cui nessuno
sta suonando.

**Rollback.** La migrazione porta con sé il suo `DOWN` scritto e pronto da incollare, nella
stessa forma della `UP`. Senza quello, tornare indietro significa ricostruire a mano le colonne
e le chiavi di diciannove tabelle su un database con dati veri.

**In che direzione il `DOWN` ricostruisce**, perché è la cosa da sapere prima e non sotto
pressione: una volta che `DROP COLUMN user_email` ha fatto `COMMIT`, quell'email non è più nella
riga figlia. Il `DOWN` la ricrea e la **ripopola da `account_id`**, risalendo ad `accounts` —

```sql
ALTER TABLE x ADD COLUMN user_email text;
UPDATE x SET user_email = a.owner_email FROM accounts a WHERE a.id = x.account_id;
ALTER TABLE x ALTER COLUMN user_email SET NOT NULL;   -- solo dove lo era
```

— e funziona **perché `accounts` tiene entrambe le chiavi**. È esattamente la ragione per cui la
forma scelta è «surrogata più naturale» e non «surrogata al posto di naturale»: se l'email
sparisse da `accounts`, il `DOWN` non avrebbe da dove ricostruire e la migrazione sarebbe di
sola andata. Come è scritta, è reversibile per davvero.

**Il backup non è opzionale.** Neon ha il branching: un branch del database di produzione preso
subito prima della migrazione è il vero rollback, e costa un clic. Il `DOWN` è per il caso in cui
la migrazione sia andata a metà.

## Impianto

### Lo schema, tabella per tabella

`id serial PRIMARY KEY` dove la colonna «diventa», `NOT NULL UNIQUE` sulla chiave naturale che
resta.

| Tabella | Oggi | Dopo |
|---|---|---|
| `accounts` | PK `owner_email` | PK `id`; `owner_email` UNIQUE |
| `songbooks` | PK `slug`, FK `account_owner_email` | PK `id`; `slug` UNIQUE; FK `account_id` |
| `songs` | PK `slug`, FK `songbook_slug` | PK `id`; `slug` UNIQUE; FK `songbook_id` |
| `sections` | PK `id`, FK `songbook_slug` | PK `id`; FK `songbook_id` |
| `user_prefs` | PK/FK `user_email` | PK/FK `account_id` |
| `newsletter_prefs` | PK/FK `owner_email` | PK/FK `account_id` |
| `user_song_prefs` | PK (`user_email`, `song_slug`) | PK (`account_id`, `song_id`) |
| `user_song_comments` | PK `id`, FK email + slug | PK `id`; FK `account_id`, `song_id` |
| `sing_along_sessions` | PK `owner_email` | PK `id`; FK `account_id` UNIQUE, `song_id` |
| `coupon_redemptions` | FK campagna; email **senza FK** | FK `account_id` `ON DELETE SET NULL` |
| `paddle_events` | email **senza FK** | `account_id` `ON DELETE SET NULL`; l'email resta come copia storica |
| `credentials`, `sign_ins`, `password_reset_tokens`, `pending_registrations` | PK `email` | FK `account_id` dove un account esiste; `pending_registrations` resta a email (per definizione non ha ancora un account) |
| `rate_limit_hits`, `app_settings`, `coupon_campaigns`, `sing_along_devices` | invariate | invariate |

**`paddle_events` conserva anche l'email**, e non è una dimenticanza: quella tabella è un ledger
append-only firmato, e la sua colonna registra *a quale indirizzo l'evento è arrivato* — un fatto
storico che non deve cambiare quando l'account viene rinominato. L'`account_id` si aggiunge
accanto per il join; l'email resta come il dato che era.

**`pending_registrations` resta chiavata a email** per la ragione più semplice che ci sia: una
registrazione in attesa non ha ancora un account a cui puntare.

### Il codice

L'identità entra da un posto solo, e questo è ciò che rende 464 riferimenti trattabili:
`currentUser()` (`lib/auth/session.ts`) risolve la sessione NextAuth in
`{ email, accountOwnerEmail, role }`. Diventa `{ email, accountId, accountOwnerEmail, role }` —
con l'email **mantenuta**, perché una notifica, un log e un'email di conferma la vogliono ancora
— e ogni query passa da `accountId`.

Ordine di lavoro, che è anche l'ordine in cui il compilatore fa da guida:

1. `schema.ts` — le colonne nuove, le FK nuove. Da qui `tsc` elenca ogni punto rotto.
2. `lib/auth/session.ts`, `lib/accounts/current.ts` — la risoluzione email→id, una volta, e il
   cookie del cambio-account che oggi porta un'email.
3. `lib/data/*` — l'implementazione database di `SongRepository`; l'interfaccia e
   `files.ts` **non si toccano** (vedi la forma, sopra).
4. Tutto il resto, guidato da `tsc`: 51 file.
5. `changeAccountEmail` si accorcia a un `UPDATE`; `reownFkTables` e `anyRowStillReferences`
   si cancellano.
6. `scripts/seed.ts` e `scripts/migrate.ts` — il seed inserisce e rilegge gli id invece di
   assumere gli slug.

### La bonifica dei dati

La migrazione non aggiunge solo colonne: fa il backfill e poi impone i vincoli. Per ogni tabella
figlia, nello stesso `BEGIN`:

```sql
ALTER TABLE x ADD COLUMN account_id integer;
UPDATE x SET account_id = a.id FROM accounts a WHERE a.owner_email = x.user_email;
-- e solo dopo:
ALTER TABLE x ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE x ADD CONSTRAINT ... FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE x DROP COLUMN user_email;
```

**Il `SET NOT NULL` è la bonifica**: se una riga figlia riferisce un'email che non esiste in
`accounts` — e senza FK, `paddle_events` e `coupon_redemptions` possono averne — il backfill
lascia `NULL` e il vincolo fallisce, dentro la transazione, senza aver cambiato niente. Che è il
modo giusto di scoprirlo. Da qui la regola: **per le due tabelle senza FK il vincolo è
`ON DELETE SET NULL` e la colonna resta nullable** — ma vale per **una sola** delle due, e
appiattirle era un errore:

- **`paddle_events`**: `account_id` nullable, `ON DELETE SET NULL`. È un ledger append-only, e
  una riga orfana lì è legittima: un evento arrivato per un indirizzo il cui account è stato poi
  cancellato resta un fatto avvenuto. L'email rimane in colonna accanto, come fatto storico.
- **`coupon_redemptions`**: `account_id` **`NOT NULL`**, `ON DELETE CASCADE`. Non è un ledger, è
  un'affermazione su un account vivo — «questo account ha già usato questa campagna» —, e oggi
  `account_owner_email` è `notNull()`. Renderla nullable indebolirebbe una garanzia che c'è già e
  svuoterebbe `coupon_redemptions_once`, che con un `NULL` da un lato smette di impedire la
  seconda riscossione. Se l'account non c'è più, non c'è più nessuno di cui ricordare che ha
  riscosso.

Prima della migrazione vera, un conteggio da lanciare nel console per sapere cosa aspettarsi:

```sql
SELECT 'paddle_events' AS t, count(*) FROM paddle_events e
  LEFT JOIN accounts a ON a.owner_email = e.account_owner_email
  WHERE e.account_owner_email IS NOT NULL AND a.owner_email IS NULL
UNION ALL SELECT 'coupon_redemptions', count(*) FROM coupon_redemptions r
  LEFT JOIN accounts a ON a.owner_email = r.account_owner_email WHERE a.owner_email IS NULL;
```

## Fuori scope, dichiarato

**Due primary key restano di testo, e non per pigrizia: sono già la scelta giusta e una delle
due è impossibile da cambiare.**

- **`user_song_comments.id`** è coniato dal **client**, e `schema.ts` scrive perché: «what lets a
  note written with no signal have a stable identity before any server has seen it, which the
  offline outbox keys by; a server-assigned id would leave every queued note anonymous until it
  drained». Un `serial` è assegnato dal database, cioè dopo, cioè troppo tardi. Convertirlo
  romperebbe la scrittura offline — che è il motivo per cui questa app esiste su un palco.
- **`coupon_campaigns.id`** è un `randomUUID()` coniato dal server. Una chiave surrogata opaca
  *è* già una chiave surrogata: non porta significato, non cambia mai, non si indovina. Un
  `serial` al suo posto non aggiungerebbe niente e renderebbe enumerabili le campagne
  dall'esterno. Resta com'è.

Nessuna delle due era nel perimetro chiesto («ID numerici e foreign key basate sugli ID
numerici»): le foreign key verso di loro sono già su chiavi surrogate, che è il punto.

- **Gli URL non cambiano.** `/songs/[slug]`, `/songbooks/[slug]`, `/accounts/[email]` restano
  come sono: un link condiviso è un impegno, e nulla in questa richiesta lo scioglie.
- **`SongRepository` non cambia forma**, e `files.ts` non si tocca — vedi la forma, sopra.
- **Il service worker e il precache** non conoscono chiavi di database; niente da fare.

## Costruito — dove la realizzazione ha corretto il piano

Nove punti, e vale la pena leggerli prima del resto del documento: sono i posti dove scrivere
il codice ha detto qualcosa che progettarlo non aveva detto.

**1. Lo slug era già globalmente unico, quindi non c'era nessun rischio da correre.** Era il
solo punto che poteva invalidare la forma del piano, e si è chiuso in una riga di SQL: `slug`
*era* la primary key, quindi due brani omonimi in due account erano già impossibili. Verificato
anche sui dati. `NOT NULL UNIQUE` conserva il vincolo, non lo stringe.

**2. Il numero **non** è entrato in `currentUser()`, e questo ha salvato le sessioni.** Quella
funzione non tocca il database per scelta dichiarata, e `CurrentUser` è rimasta con
`accountOwnerEmail`. Se l'identità fosse passata per un id nel token, il deploy avrebbe
disconnesso tutti: il cookie dura novanta giorni e contiene solo un indirizzo. Un caso limite
che nessuna FK avrebbe tollerato: un global owner ha un ruolo **senza riga in `accounts`**.

**3. Le tabelle a email sono quattro e la ragione è una, non quattro.** Il piano nominava solo
`pending_registrations`. In realtà `credentials`, `password_reset_tokens`, `sign_ins` e
`pending_registrations` restano tutte a email per lo stesso motivo — un global owner non ha
riga in `accounts` — e `sign_ins` lo rende dimostrabile: la scrive `signIn` in `auth.ts`
*prima* che `provisionAccount` crei quella riga. Una FK lì romperebbe l'accesso. Stessa ragione
per cui `sing_along_sessions.owner_email` non ne prende una: chi trasmette può essere un global
owner. Chi *possiede il repertorio* trasmesso è sempre un account, e quella metà l'ha presa.

**4. `coupon_redemptions` conserva la sua email, e appiattirla con `paddle_events` era un
errore.** Il piano dava a entrambe le tabelle senza FK lo stesso trattamento. Ma il commento di
quella tabella documentava una proprietà anti-abuso deliberata — «an account deleted and
recreated cannot redeem the same campaign twice, which closes the delete-and-retry loop» — che
esisteva *proprio* perché non c'era la FK. Un `CASCADE` l'avrebbe revocata in silenzio. Quindi:
due colonne e **due** indici unici, che chiudono due giri diversi e nessuno dei due implica
l'altro (`account_id` parziale contro le rinomine, l'email contro cancella-e-rifai). E le
**letture** sono passate all'id: lasciarle sull'email avrebbe fatto ricomparire lo stesso
difetto con un'altra causa, perché chi cambia indirizzo si cercherebbe sotto quello nuovo.

**5. Sui contenuti il guadagno non era quello scritto.** `renameSongbook` non tocca lo slug per
progetto, quindi «le rinomine diventano gratuite» era già vero. Resta l'integrità referenziale.
Dove il guadagno è pieno è `changeAccountEmail` — vedi il punto 7.

**6. La coda offline vive nel browser e sopravvive al deploy**, quindi le firme di
`saveSongPrefs` e delle azioni sui commenti sono rimaste a slug, con la risoluzione dentro. Un
motivo indipendente per lo stesso confine, che il piano non aveva visto.

**7. `changeAccountEmail` è passata da una pagina a tre righe.** Prima: inserire una seconda
riga `accounts`, ripuntare sei tabelle a mano da una lista scritta da una persona, azzerare
`paddleSubscriptionId` perché per un istante esistevano due righe e il suo vincolo unico
avrebbe rifiutato la copia, verificare che nulla riferisse più il vecchio indirizzo, cancellare
la riga vecchia. Due funzioni ausiliarie vivevano solo per questo (`reownFkTables`, e
`anyRowStillReferences` che esisteva per intercettare il giorno in cui qualcuno avesse aggiunto
una settima tabella dimenticandola). Quel giorno era già arrivato: `coupon_redemptions` non era
in lista. Ora è **una `UPDATE`** e cinquantadue righe in meno; provato sul database di sviluppo,
lo storico pagamenti segue l'account senza che nessuna riga si sia spostata.

**8. Due primary key di testo sono rimaste tali**, ed è nel «fuori scope» con le ragioni: l'id
dei commenti lo conia il client per l'outbox offline, e quello delle campagne è un
`randomUUID()` che è già una chiave surrogata.

**9. Dettagli che il piano non poteva conoscere.** `0038` era già presa dall'altra sessione, così
questa è la `0039`. La `UP` ha bisogno dei `--> statement-breakpoint` o drizzle passa il file
intero come una query sola. E `paddle_events` aveva **una riga orfana** per davvero — un evento
di test per un indirizzo il cui account non esiste più: la conferma sul campo che quella colonna
doveva restare nullable, perché un `SET NOT NULL` avrebbe fatto fallire la migrazione.

### Come è stato verificato

- `UP` e `DOWN` eseguite nella stessa transazione contro lo schema vero, con l'impronta di
  `public` (colonne, vincoli, indici) confrontata riga per riga prima e dopo: **identica**,
  salvo il nome di due vincoli `NOT NULL` (annotato nel file della `DOWN`).
- `npx tsc --noEmit` pulito, **1201 test** verdi, `npm run lint` pulito, `npm run build`
  completo in una copia fuori dal repository (il server dev occupava `.next`).
- Ogni funzione del repository riscritta chiamata contro il database migrato: 70 brani, 4
  canzonieri, 11 sezioni, `getSong` coerente con `listSongs`, conteggi e permessi corretti.
- **Il cascade della FK composita provato spostando una sezione fra due canzonieri**: 31 brani
  su 31 hanno seguito, in transazione con rollback.
- Upsert di preferenze e commenti attraverso le subquery di `db/ids.ts`, riletti.
- Il rinominare provato su un account con uno storico pagamenti: una `UPDATE`, tutto segue.

## Decisioni

| Decisione | Scelta | Perché |
|---|---|---|
| Sequenza | **Big bang**, una migrazione e un deploy | Scelta esplicita, con la finestra di rottura accettata; l'ordine migrazione→push è ciò che la limita a una build |
| Perimetro | **Persone e contenuti**, entrambi | Scelta esplicita |
| Forma della chiave | Surrogata numerica **più** chiave naturale unica, non al posto di | L'email è il login e lo slug è l'URL; e un `.chopro` su disco non ha altro che lo slug |
| Confine | L'`id` vive dentro il database; slug ed email restano ai bordi | È ciò che tiene in piedi il repository su file e i link condivisi |
| `paddle_events` | Guadagna `account_id`, **conserva** l'email | Ledger append-only: l'indirizzo a cui l'evento è arrivato è un fatto storico |
| Tabelle senza FK | FK vera, `ON DELETE SET NULL`, colonna nullable | Risolve il conflitto per cui la FK era stata omessa: la traccia del pagamento sopravvive e l'account resta cancellabile |
| `pending_registrations` | Resta a email | Non ha ancora un account a cui puntare |
| Rollback | `DOWN` scritto insieme alla `UP`, più un branch Neon prima di applicare | Il branch è il rollback vero; il `DOWN` è per la migrazione andata a metà |

## Domande aperte

- **Quando applicarla.** Serve un'ora in cui nessuno sta leggendo un brano sul palco. È una
  decisione di calendario, non tecnica.
- **`sing_along_sessions.owner_email` è la primary key**, cioè una sessione per account. Con
  `id` come PK quel vincolo va riespresso come `UNIQUE (account_id)` per non perderlo per
  strada — segnalato perché è l'unico posto dove la PK stava anche imponendo una regola di
  dominio.
- **`accounts/[email]`** resta l'URL dell'amministrazione. Funziona, ma è l'unico posto dove un
  indirizzo email viaggia in un percorso; se un giorno diventasse `/accounts/[id]` sarebbe una
  decisione a sé.
