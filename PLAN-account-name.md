# Nome e cognome dell'account — piano

> Documento a sé, non una sezione di `PLAN.md`: quella tabella è il registro delle
> decisioni già *consegnate e in produzione*, e questa feature non è ancora scritta.
> Quando è chiusa, va ripiegata lì come una nuova sezione di versione — il numero esatto
> non è fissato qui apposta: a oggi (31 agosto 2026) v4.1 è l'ultima versione ripiegata,
> ma "Forme alternative degli accordi" (`PLAN-chord-forms.md`) è già in produzione
> (`6601116`) senza essere ancora stata ripiegata — verificare l'ordine di fold-in al
> momento, non assumere v4.2 libero. Precedente diretto per la forma del documento:
> `PLAN-chord-forms.md`/`PLAN-booklet-personal-print.md`.

## Cos'è

Oggi **non esiste alcun campo nome da nessuna parte**: né in `accounts`, né in
`pending_registrations`, né in `credentials`, né nel token NextAuth, né in nessuna UI.
Ogni concetto di identità nell'app è chiavato solo sull'indirizzo email — scelta
esplicita e motivata nei commenti di `avatar.ts`/`UserMenu.tsx` (v3.3: "l'avatar legge
l'indirizzo, mai il profilo Google... l'email è l'unico dato d'identità che ogni
lettore ha, comunque si sia registrato").

La richiesta: nome e cognome devono poter essere raccolti **sia via Google (dal
profilo OAuth) sia via registrazione tradizionale (email/password)**, così che ogni
account nuovo li abbia nella grande maggioranza dei casi; devono anche potersi vedere
e modificare, non restare un dato sepolto in tabella. Non è una garanzia assoluta —
vedi la nota sul buco residuo in *Domande aperte*.

## Cosa cambia, risolto nell'intervista

- **Schema: `firstName`/`lastName` separati**, non un unico campo `name`. Rispecchia
  esattamente `given_name`/`family_name` del profilo Google, senza bisogno di alcuno
  split euristico lato lettura — lo split euristico serve solo nel caso raro in cui
  Google non fornisca quei due campi (vedi sotto).
- **Scope pieno**: raccolta dati **+ visualizzazione + modifica**, non solo un dato in
  tabella. Tre superfici nuove: i due form di registrazione, un saluto in `UserMenu`, e
  una pagina di modifica.
- **Account già esistenti**: colonna nullable, **mai un gate obbligatorio**. Per chi
  rientra con Google il nome si riempie da solo dal profilo, ma **solo quando manca**
  (mai una sovrascrittura silenziosa di un nome già impostato — altrimenti un
  riaccesso Google cancellerebbe una correzione fatta a mano su `/profile`, vedi
  *Decisioni* riga 3). Per chi usa email/password non c'è alcuna fonte: resta vuoto
  finché non lo scrive da sé. Stesso pattern già usato per il gate del piano in v3.7
  (righe esistenti mai forzate a rifare una scelta).
- **Fallback Google**: se il profilo non espone `given_name`/`family_name` separati
  (raro — il campo `name` unico c'è quasi sempre), si fa uno split euristico su
  `profile.name`: prima parola come `firstName`, resto come `lastName`. Se manca anche
  `name`, entrambi restano vuoti — non blocca mai l'accesso.
- **Dove si modifica**: una pagina dedicata, `/profile`, stessa collocazione di "Change
  password" e "Billing" nel pannello principale di `UserMenu` — non annidata dentro
  Settings insieme a tema/notazione, perché quel nido è per preferenze di lettura, non
  per azioni a livello di account.
- **Stato vuoto**: nessun cambiamento visibile finché il nome non c'è. `UserMenu`
  mostra esattamente quello che mostra oggi (email + iniziali derivate dall'email);
  nessun invito "Aggiungi il tuo nome". Nella lista/dettaglio admin, vuoto o trattino.
- **Prominenza una volta noto**: minima. `UserMenu` guadagna una riga di saluto in
  inglese (es. "Hi, {firstName}" — copy esatta da definire in implementazione, coerente
  con `Lingua UI: Inglese` in `PLAN.md`, mai in italiano) **sopra** l'email esistente,
  che resta com'è oggi; l'avatar continua a
  derivare le iniziali dall'indirizzo, invariato — la motivazione di v3.3 (un lettore
  con Google e uno con email/password devono vedere la stessa "specie" di avatar) resta
  intatta, questa feature non la tocca. Nella lista admin l'email resta il campo
  primario/ordinabile/ricercabile; il nome compare solo nel dettaglio
  `/accounts/[email]`, senza colonna né ricerca dedicata.

## Impianto — dove si aggancia

**1. Migrazione (prossimo numero libero dopo `0033`).** `src/lib/db/schema.ts`:
   - `accounts` guadagna `first_name text` e `last_name text`, **nullable, nessun
     default, nessun backfill**: a differenza di `plan_chosen_at` (v3.7) non c'è alcun
     valore retrodatabile per le righe esistenti, quindi non serve neanche
     un'`UPDATE` di backfill — restano `null` finché qualcosa (Google al prossimo
     accesso, o `/profile`) non le scrive.
   - `pending_registrations` guadagna `first_name text` e `last_name text`, **anche
     qui nullable a livello di colonna** — non `NOT NULL`: un `ALTER TABLE ... ADD
     COLUMN ... NOT NULL` senza default fallirebbe su righe pendenti già in volo al
     momento del deploy (finestra di 24h). L'obbligatorietà reale la applica
     `register()` prima dell'insert, stesso principio già in uso in questo schema per
     ogni valore vincolato (`instrument`, `notation`, `chordDisplay`: "non un pgEnum e
     non un CHECK", commento di testa a `schema.ts`) — qui lo stesso ragionamento vale
     per "must be present" quanto per "deve essere uno di questi valori".
   - `npm run db:generate`, poi `npm run db:migrate` contro `songs-db-dev` in locale;
     la messa in produzione segue la strada già in `CLAUDE.md` ("Migrating the
     production database"): console SQL di Neon, riga di journal scritta a mano nella
     stessa transazione.

**2. Split euristico — modulo puro a sé, con test.** `profile.name` → `{ firstName,
   lastName }` è l'unica funzione pura nuova di questo piano, ed è anche il punto più
   pieno di casi limite (stringa vuota, una sola parola, spazi multipli/ai bordi,
   cognomi doppi). Va in un modulo semplice testabile con `node:test`, non dentro
   `auth.ts` (che non lo è) — stesso principio già in uso per `checkout.ts`/
   `testCard.ts`: un file `'use server'` non può esportare altro che funzioni async,
   quindi la logica sincrona vive in un sorgente sorella con il suo `.test.ts` (es.
   `src/lib/auth/nameSplit.ts` + `nameSplit.test.ts`).

**3. Google — `src/auth.ts`, callback `signIn`.** Quando `account?.provider ===
   'google'`, leggere `profile.given_name`/`profile.family_name` (tipizzati da
   `next-auth/providers/google`'s `GoogleProfile`, già disponibili senza bisogno di un
   `profile()` custom sul provider); se uno dei due manca, usare il modulo del punto 2
   su `profile.name`. Il risultato va passato a `provisionAccount`, che guadagna un
   terzo parametro opzionale:
   `provisionAccount(email: string, name?: { firstName: string; lastName: string })`.
   - Ramo **nuovo account**: scrive `firstName`/`lastName` insieme a `ownerEmail`
     nello stesso insert che oggi scrive solo `{ ownerEmail }`, dentro la stessa
     transazione.
   - Ramo **account già esistente**: oggi la transazione trova la riga e
     `provisionAccount` esce subito dopo (`if (!created) return false`, prima del
     blocco `insertSampleSongbook`) — quel primo `return false` va **prima** di
     qualunque scrittura opportunistica, quindi l'`UPDATE` condizionale
     (`WHERE first_name IS NULL`, mai una sovrascrittura incondizionata) deve stare
     **fra** la chiusura della transazione di controllo-esistenza e quel `return
     false`, non insieme a `insertSampleSongbook` (che gira solo sul ramo "appena
     creato" e non verrebbe mai eseguito per un account preesistente). Fallimento
     silenzioso, stesso stile di `insertSampleSongbook`: un account esistente resta
     funzionante anche se questa scrittura specifica fallisse.
   - Il ramo credenziali del callback `signIn` (che gira per *ogni* provider,
     Google e Credentials) continua a chiamare `provisionAccount(email)` senza nome:
     per un login email/password l'account esiste già (creato da `verifyEmail`, punto
     4), quindi qui è comunque un no-op — nessun cambiamento necessario su quel ramo.

**4. Registrazione tradizionale — tre file.**
   - `src/components/RegisterForm.tsx`: due nuovi input testo, "First name"/"Last
     name", `required`, prima del campo email (o subito dopo — dettaglio di layout),
     nascosti dietro campi `hidden` nella fase `'sent'` come già fanno
     email/password/confirmPassword.
   - `src/lib/register/actions.ts`, `register()`: legge `firstName`/`lastName` da
     `FormData`, valida non vuoti dopo `trim()` — nuovo motivo di fallimento
     `'invalid-name'` in `RegisterFailure`/`REGISTER_MESSAGE`
     (`src/lib/register/types.ts`, es. "Enter your first and last name."). Scritti
     nell'upsert su `pendingRegistrations` insieme agli altri campi.
   - `src/lib/verify/actions.ts`, `verifyEmail()`: la riga `pendingRegistrations` letta
     dentro la transazione porta già `firstName`/`lastName` — vanno passati a
     `provisionAccount(normalized, { firstName: row.firstName, lastName:
     row.lastName })` invece della chiamata attuale senza nome. Nessun altro cambio: la
     riga `credentials` non ha e non deve avere un campo nome, resta solo la password.

**5. Pagina di modifica — `/profile`, nuova.** Verificato con `ls src/app`: nessuna
   collisione — l'app non indirizza canzonieri da uno slug a livello di root, quindi
   `/profile` come route statica non entra mai in conflitto con un canzoniere che si
   chiamasse "profile". Stesso impianto di `src/app/password/page.tsx`/
   `PasswordScreen`: legge la sessione lato server, un form con i due campi
   precompilati dai valori correnti (stringa vuota se `null`), un bottone Save,
   `required` su entrambi (non si può salvare un nome vuoto una volta che il flusso lo
   ha reso disponibile — non si torna a "vuoto" da qui). Le due server action
   (`loadOwnName`/`updateOwnName`) sono finite in `src/lib/accounts/actions.ts` —
   **non** in un nuovo file sorella di `provision.ts` come questo punto diceva prima
   di essere scritto: `actions.ts` porta già `deleteMyAccount`, la stessa forma
   esatta di azione ("ogni lettore, sul proprio account, senza controllo di ruolo"),
   e i suoi tipi (`NameFailure`/`NameResult`/`NAME_MESSAGE`) sono finiti nel già
   esistente `accounts/types.ts` accanto a `SelfDeleteFailure`, non in un file nuovo.
   `updateOwnName` fa un `UPDATE accounts SET first_name = $1, last_name = $2 WHERE
   owner_email = $3` sull'email della sessione corrente — mai su un email passato dal
   client. Link aggiunto in `UserMenu.tsx`, pannello principale, accanto a "Change
   password" e "Billing" (stessa lista, stesso trattamento — nuova `IconUser` in
   `icons.tsx`, testa e spalle, per distinguerla dalla `IconUsers` plurale già in uso
   altrove).

**6. `UserMenu` — saluto.** `RoleProvider`/`loadIdentity()`
   (`src/lib/auth/actions.ts`) guadagnano `firstName`/`lastName` (o un `displayName`
   già derivato) nella forma che il client legge — oggi `RoleContextValue` porta solo
   `email`/`accountOwnerEmail`/`role`/`plan`/... senza nome. `UserMenu.tsx` mostra un
   saluto in inglese, es. "Hi, {firstName}" (copy esatta da definire in
   implementazione — la UI è in inglese, `PLAN.md`) sopra la riga email **solo se
   `firstName` non è vuoto**; altrimenti nessuna riga in più, esattamente come oggi.
   L'avatar (`avatar.ts`, `avatarInitials`) **non cambia**: continua a derivare
   dall'email, come deciso.

**7. Admin `/accounts/[email]`.** La pagina di dettaglio (non la lista) mostra
   `firstName`/`lastName` letti dalla riga `accounts`, con un trattino quando assenti.
   `src/app/accounts/page.tsx` (la lista/ricerca) **non cambia**: `SortKey` resta
   `'email' | 'createdAt' | 'lastSignInAt'`, nessuna colonna o filtro per nome.

**8. Un punto verificato e lasciato intatto, non da toccare.**
   `issueSessionCookie` (`src/lib/auth/session.ts`) scrive oggi `token.name =
   normalized` (l'email) nel JWT NextAuth per il ramo credenziali — deliberato,
   commentato: "non c'è alcun callback `jwt` custom in questo progetto che ne abbia
   bisogno". Questo piano non tocca né `session.user.name` né quel token: l'identità
   mostrata (punto 5) viaggia tutta attraverso `RoleProvider`/`loadIdentity()`, un
   canale separato che legge `accounts` a ogni richiesta — non NextAuth. Nessun
   conflitto, nessun cambiamento necessario lì.

## Fuori scope, dichiarato

- **Nessuna colonna/ricerca/ordinamento per nome nella lista admin** — solo nel
  dettaglio (deciso in intervista).
- **Nessun gate obbligatorio "completa il tuo nome"** per account esistenti — niente
  interruzione per chi non l'ha mai avuto (deciso in intervista, stesso spirito di
  v3.7).
- **Nessuna personalizzazione delle email transazionali** (benvenuto, verifica, reset)
  con il nome — restano come sono oggi, indirizzate genericamente. Non richiesto, non
  toccato.
- **Nessun cambio all'avatar/monogramma** — resta derivato dall'email in ogni caso,
  come deciso, non solo come assunzione.
- **Nessuna possibilità per un admin di modificare il nome di un altro account** da
  `/accounts/[email]` — solo lettura lì; la scrittura resta un'azione self-service su
  `/profile`, stesso principio già in uso per la password (un global owner può
  impostarne una da Accounts, ma qui non è stato chiesto un equivalente).

## Decisioni

| # | Scelta | Perché |
|---|---|---|
| 1 | `firstName`/`lastName` **separati**, non un unico `name` | Rispecchia `given_name`/`family_name` di Google uno a uno, nessuno split euristico lato lettura salvo il caso raro in cui Google stesso non li fornisca |
| 2 | Scope pieno: raccolta **+ visualizzazione + modifica** | Un dato che si può solo scrivere e mai correggere sarebbe incompleto — soprattutto per chi lo riceve `null` da account preesistenti |
| 3 | Account esistenti: **nullable, riempiti solo quando mancanti**, mai un gate | Stesso pattern di v3.7 (righe esistenti mai forzate); "solo quando mancanti" evita che un riaccesso Google sovrascriva silenziosamente una correzione fatta a mano su `/profile` |
| 4 | Fallback Google: **split euristico su `profile.name`** se `given_name`/`family_name` mancano | Copre il caso raro senza mai bloccare l'accesso; degrada a "vuoto" se anche `name` manca |
| 5 | Modifica su **pagina dedicata `/profile`**, non annidata in Settings | Stessa collocazione logica di "Change password"/"Billing" in `UserMenu` — azioni a livello di account, non preferenze di lettura |
| 6 | Stato vuoto: **nessun cambiamento visibile**, nessun invito a completare | Zero attrito per chi non ha mai avuto bisogno di questo dato finora |
| 7 | Prominenza: **solo un saluto in inglese sopra l'email** (es. "Hi, {firstName}"), avatar e lista admin invariati | Cambio minimo che non tocca le motivazioni già scritte in v3.3 (`avatar.ts`/`UserMenu.tsx`) — l'email resta l'unico dato d'identità garantito per ogni account; copy in inglese per coerenza con `Lingua UI: Inglese` |
| 8 | Piano tenuto in un **file a sé** (`PLAN-account-name.md`) | `PLAN.md` documenta solo lavoro consegnato; stesso precedente di `PLAN-chord-forms.md`/`PLAN-booklet-personal-print.md` |

## Assunzioni prese senza chiedere

Da correggere se una è sbagliata — nessuna è irreversibile.

- **`pending_registrations.first_name`/`last_name` nullable a livello di colonna**,
  obbligatorietà solo lato applicazione (`register()`) — evita il rischio di
  migrazione su righe pendenti già in volo al deploy, coerente con come questo schema
  già tratta ogni altro valore vincolato.
- **`/profile` richiede entrambi i campi non vuoti per salvare** — una volta che il
  flusso ha reso il nome disponibile, non si torna a "vuoto" da quella pagina (si può
  però restare vuoti se non lo si è mai toccato).
- **Nessun numero di versione fissato** per il fold-in in `PLAN.md` — verificare
  l'ordine reale con `PLAN-chord-forms.md` al momento della consegna.
- **Aggiornamento opportunistico da Google implementato come `UPDATE ... WHERE
  first_name IS NULL`** fuori dalla transazione di `provisionAccount`, fallimento
  silenzioso come già `insertSampleSongbook` — un account esistente resta comunque
  funzionante anche se questa scrittura specifica fallisse.

## Domande aperte

- **Il buco residuo su Google**: se un profilo Google non espone né
  `given_name`/`family_name` né `name` (di fatto quasi mai, con lo scope `profile`
  richiesto da NextAuth), un account nuovo può nascere con entrambi i campi vuoti e
  restarci per sempre, visto che non c'è alcun gate. "Ogni account nuovo li ha" non è
  quindi una garanzia assoluta, solo l'esito nella grande maggioranza dei casi — non è
  stato chiesto di irrigidirlo con un gate, quindi resta così finché non emerge un
  caso reale che lo richieda.
- **Personalizzare le email transazionali con il nome** ("Ciao Francesco" nella mail
  di benvenuto) — dichiarato fuori scope qui, ma è un'estensione naturale e a basso
  costo una volta che il dato esiste; da valutare in una versione successiva, non in
  questa.
- **Un global owner potrà mai correggere il nome di un altro account** da
  `/accounts/[email]`, come già può fare per la password? Non richiesto, lasciato
  fuori scope; da riaprire se emerge un caso reale (es. un nome impostato male e
  l'utente non riesce a modificarlo da sé).

## Chiuso in fase di scrittura (non più aperto)

- **`provisionAccount`'s update opportunistico** vive dentro il ramo `if (!created)`,
  **prima** del suo `return false` — non insieme al blocco `insertSampleSongbook`, che
  gira solo sul ramo "appena creato" e non sarebbe mai stato raggiunto per un account
  preesistente (correzione dell'advisor, applicata prima di consegnare).
- **Nome Google preso per intero solo se *entrambi* `given_name` e `family_name` sono
  presenti** — se anche uno solo dei due manca, si cade sempre sullo split euristico
  su `profile.name` (punto 3 sopra), mai un misto "un campo vero, uno vuoto".
- **`verifyEmail` porta `firstName`/`lastName` fuori dalla transazione** in un
  risultato tipato (`{ ok: true; firstName; lastName } | { ok: false }`) invece del
  semplice booleano `verified` di prima — la riga `pendingRegistrations` viene
  cancellata dentro la stessa transazione, quindi il nome andava catturato lì o mai
  più.
- **Migrazione `0034` scritta a mano**, SQL e voce di journal, senza rigenerare lo
  snapshot — non una scelta di questa sessione ma il proseguimento di un problema già
  noto e documentato (`PLAN.md`, *Domande aperte* #19; i commenti di 0031-0033):
  `drizzle-kit generate` rifiuta di girare perché 0028/0029/0030 condividono lo stesso
  `id`/`prevId` nello snapshot. Applicata anche a `songs-db-dev` in locale
  (`npm run db:migrate`), verificata a occhio più sotto in *Ancora da fare*.
- **`getAccountDetail` legge `firstName`/`lastName` in una seconda query protetta**,
  non nella select di base — stesso trattamento già riservato a `PLAN_COLUMNS` in
  quel file, e per lo stesso motivo: un deploy che precede l'applicazione della
  migrazione in produzione non deve far sparire l'intera pagina di dettaglio, solo il
  nome.

## Trovato in fase di scrittura, non previsto dall'intervista

- **Lo snapshot di `drizzle-kit` era già rotto** (vedi sopra) — non causato da questa
  feature, ma ha impedito `npm run db:generate` di girare normalmente. Nessun
  tentativo di ripararlo: avrebbe voluto dire ricostruire a mano la catena di
  snapshot dalla 0029 in poi, un lavoro a sé, rischioso da fare come effetto
  collaterale, e già proseguito così da tre migrazioni precedenti senza problemi.

## Ancora da fare, non da questa sessione

- **Ordine di migrazione in produzione — l'unico punto davvero delicato.** Il codice
  di questa feature presuppone che `first_name`/`last_name` esistano già su `accounts`
  e `pending_registrations`: appena `signIn` incontra un profilo Google con un nome
  disponibile, `provisionAccount` scrive quelle colonne nello stesso insert
  dell'account. **Se il codice va in produzione prima che la migrazione `0034` sia
  applicata lì** (console SQL di Neon, `CLAUDE.md`), quell'insert fallisce, l'errore
  viene solo loggato (`provisionAccount`'s own try/catch) e **nessun account viene
  creato per quella registrazione Google** — non un degrado silenzioso come per
  `getAccountDetail`, un percorso di registrazione realmente rotto finché la
  migrazione non è applicata. `0034` va quindi applicata a produzione **prima** di
  quel deploy, non dopo — l'utente deve farlo a mano dal console SQL di Neon, la
  stessa procedura già documentata in `CLAUDE.md`, con la riga di journal scritta
  nella stessa transazione (`hash` di `0034_account_name.sql`, `when` `1788177820808`,
  tag `0034_account_name`).
- **Nessun browser reale in questo ambiente** (stessa nota già in `PLAN.md`): il round
  trip OAuth vero con Google — che `given_name`/`family_name` arrivino davvero nella
  forma attesa — è verificato solo contro il tipo `Profile` di `@auth/core`, mai con un
  accesso reale. Lo stesso vale per il saluto in `UserMenu` e per `/profile`
  compilato: entrambi richiedono una sessione vera, e qui si è potuto verificare solo
  che `/profile` risponde con lo stesso redirect 307 di `/password` da disconnessi, e
  che i campi `firstName`/`lastName` compaiono nell'HTML servito di `/register`.
- **Copy esatta del saluto** ("Hi, {firstName}") non rivista con l'utente, solo scelta
  in fase di implementazione per coerenza con `Lingua UI: Inglese`.
