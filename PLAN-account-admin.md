# Admin: fieldset e azioni sulla pagina account — piano

> Documento a sé, non una sezione di `PLAN.md`: quella tabella è il registro delle
> decisioni già *consegnate e in produzione*, e questa feature non è ancora scritta.
> Quando è chiusa, va ripiegata lì come una nuova sezione di versione — verificare
> l'ordine di fold-in reale al momento (altri `PLAN-<feature>.md` potrebbero essere
> stati consegnati nel frattempo), non assumere che il numero di versione successivo
> sia libero. Precedente diretto per la forma del documento: `PLAN-newsletter.md`.

## Cos'è

`/accounts/[email]` (v3.8) organizza già l'amministrazione di un account in quattro
sezioni aperte di default — Subscription (badge piano + `GiftForm`), Payment history
(`PaymentHistoryTable`), Password (`PasswordForm`), Danger zone (`DeleteAccountButton`)
— più un header con email/nome/sign-in count/data registrazione. La richiesta
originale: la pagina ha molti altri campi utili che oggi non compaiono da nessuna
parte per un admin (newsletter, contenuto dell'account) o compaiono solo come testo
statico nell'header (nome), e mancano alcune azioni operative concrete per il
supporto. Riorganizzare tutto in fieldset logici, decidendo per ciascun campo se è
sola lettura, editabile, o un'azione a bottone.

**Seconda revisione**: prima di implementare, un secondo passaggio pensando
esplicitamente ai casi d'uso del lancio reale — utenti sconosciuti che iniziano a
registrarsi, non solo i pochi account di test di oggi. Ha aggiunto: un campo note
interne, una leva per sospendere un account senza cancellarlo, uno sblocco per i
rate-limit, e un modo per cambiare l'email di un account. Non un redesign
strutturale della pagina in nessuno dei due passaggi — un'estensione del pattern già
in uso.

**Fuori da questo documento**: la pagina lista `/accounts` resta quella di oggi (
riconfermato nella seconda revisione, vedi Decisione #9), con una sola eccezione
mirata (vedi punto 11 sotto).

## Cosa cambia, risolto nell'intervista

- **Ambito: solo la pagina di dettaglio**, non la lista — con l'unica eccezione delle
  pending registration (vedi sotto), che non hanno affatto una riga `accounts` e
  quindi nessun posto dove vivere sulla pagina di dettaglio esistente. Riconfermato
  nella seconda revisione: la ricerca per email + l'ordinamento per data
  registrazione/ultimo accesso già esistenti bastano alla scala prevedibile nel
  breve termine; si riapre se e quando emerge un bisogno concreto.
- **Layout: pagina unica, tutto aperto**, nuove sezioni aggiunte nell'ordine logico
  di seguito — stesso stile di oggi, nessun accordion né tab.
- **Nuovo fieldset Internal note**: un campo di testo libero, visibile subito dopo
  l'header, **editabile dall'admin**, sovrascrivibile (non un log con storico —
  scelto per semplicità in intervista). Per appuntarsi contesto di supporto,
  eccezioni concesse, segnalazioni — non visibile all'utente.
- **Nuovo fieldset Identity**: nome e cognome, spostati fuori dall'header (che resta
  con email, sign-in count, data registrazione) in una propria sezione, **editabile
  dall'admin** — a differenza di oggi, dove sono self-service soltanto (`/profile`).
  Include anche, come blocco separato a comparsa, **Cambia email account** (vedi
  sotto).
- **Nuovo fieldset Newsletter**: `subscribed`, `frequency`, `subscribedAt`/
  `unsubscribedAt` — **sola visualizzazione**, nessun controllo per forzare
  iscrizione/disiscrizione o cambiare cadenza per conto dell'utente. Prima superficie
  admin in assoluto per questi dati (`PLAN-newsletter.md` la dichiarava esplicitamente
  fuori scope).
- **Nuovo fieldset Usage & content**: numero di songbook, numero di canzoni,
  `singAlongPeakDevices` (picco follower Strum Together) — sola visualizzazione,
  richiede nuove query di conteggio.
- **Sezione Subscription estesa**: nuovo bottone "Force expire now", che ripristina
  `forceExpireNow` (rimosso da ogni UI in v3.11 perché raggiungibile da ogni cliente
  pagante su `/billing`) qui, dove la pagina è già dietro `isOwner` — utile per
  testare grace period/scadenza su un account reale senza aspettare la data vera.
- **`GiftForm` esistente resa più guidata**: stesso form su un'unica pagina (non una
  vera sequenza a passaggi), ma piano e data guadagnano input più vincolati invece di
  inserimento libero — vedi punto 5 sotto. Nessun cambiamento a `validateGrant`/
  `setGrant`: è solo `GiftForm.tsx` a cambiare, la form continua a mandare esattamente
  la stessa forma di dati di oggi.
- **Sezione Password rinominata Access & Security, estesa con tre azioni**:
  - "Send password-reset email", alternativa a `PasswordForm` (che oggi imposta la
    password direttamente, senza email) per i casi in cui l'admin preferisce far
    scegliere all'utente la nuova password via link.
  - **Sospendi/riattiva account** — impedisce nuovi login senza cancellare nulla,
    leva intermedia tra "niente" e il delete distruttivo del Danger zone, per
    abuso/frode/spam una volta che chiunque può registrarsi liberamente.
  - **Sblocca rate-limit** — cancella i blocchi per tentativi ripetuti (login,
    registrazione, reset password) su quell'indirizzo, per chi resta bloccato per
    errore ("dice di riprovare più tardi").
- **Nuova sotto-sezione "Pending registrations" sulla lista `/accounts`**: righe con
  email, data richiesta/scadenza di ogni `pendingRegistrations` bloccata, e un bottone
  inline "Confirm now" che crea subito l'account **bypassando il click sul link**
  (il caso: link scaduto, finito in spam, mai arrivato). Nessun pannello dedicato su
  `/accounts/[email]` per questo — vedi Decisione #8.
- **Marketing attribution (`gclid`) e riferimenti tecnici billing** (Paddle
  customer/subscription ID, timestamp esatto di `planChosenAt`) restano **fuori**:
  nessuna richiesta esplicita, leggibili via SQL diretto se mai servisse — stessa
  logica già usata da `PLAN-newsletter.md` per la propria superficie admin.

## PLAN-newsletter.md — dipendenza risolta

Era una dipendenza aperta di questo piano: `newsletterPrefs` e `pendingRegistrations.
newsletterOptIn` esistevano solo nel working tree. **Da allora consegnato**: commit
`09a433d`, migrazione `0035` applicata e verificata sia su `songs-db-dev` sia in
produzione (`songs-db`) — journal row corretto, tabella e colonna presenti, ogni riga
`accounts` con la propria riga `newsletterPrefs` (un gap iniziale di una riga mancante
è stato trovato e corretto a mano; con ogni probabilità un account creato nella
finestra tra l'esecuzione della migrazione e il deploy del codice, ma l'indirizzo
specifico non è stato controllato quindi la causa non è confermata). Nessuna parte di
questo piano è più bloccata da questo.

## Fondamenta tecniche verificate per la seconda revisione

- **`accounts.ownerEmail` non ha `onUpdate: 'cascade'` su nessuna delle sei tabelle
  che lo referenziano** (`songbooks.accountOwnerEmail`, `userPrefs.userEmail`,
  `newsletterPrefs.ownerEmail`, `userSongPrefs.userEmail`, `userSongComments.
  userEmail`, `singAlongSessions.broadcastAccountEmail`) — solo `onDelete`, e due
  delle sei (`songbooks`, `singAlongSessions`) non hanno nemmeno quello, quindi oggi
  un `UPDATE accounts SET owner_email = …` verrebbe respinto dal database su
  qualunque account con contenuto. Questo è il motivo tecnico per cui "Cambia email"
  non riusa un semplice `UPDATE`, vedi punto 5 sotto.
- **`credentials.email`, `signIns.email`, `paddleEvents.accountOwnerEmail`,
  `passwordResetTokens.email` non hanno alcuna FK verso `accounts`** — confermato,
  scelta deliberata già documentata nei commenti dello schema stesso (`paddleEvents`
  esplicitamente per non perdere lo storico di pagamento alla cancellazione di un
  account, `signIns` perché un global owner accede anche senza avere una riga
  `accounts`).
- **I prefissi di rate-limit esistenti**: `login:ip:*`/`login:email:*` (`src/auth.ts`,
  tentativi di password falliti), `register:ip:*`/`register:email:*`
  (`src/lib/register/actions.ts`, sia `register()` sia `resendVerification()`),
  `reset:ip:*`/`reset:email:*` (`src/lib/forgotPassword/actions.ts`), `feedback:*`
  (`src/lib/feedback/actions.ts`, chiave `feedback:<email>` senza infisso `ip:`/
  `email:`), più `follow:ip:*` (solo IP, nessuna variante email). Ogni chiave email è
  costruita con `normalizeEmail(...)` (trim + lowercase, non hash) prima
  dell'interpolazione — nessuna normalizzazione sulle chiavi IP.

## Impianto — dove si aggancia

**1. Header (`src/app/accounts/[email]/page.tsx`, righe 122-145) — nome rimosso.**
   Resta solo email, sign-in count, data registrazione, current/"Enter as this
   account". Il nome si sposta nel fieldset Identity, sotto.

**2. Migrazione `0036` — due nuove colonne su `accounts`, nessun'altra modifica di
   schema.**
   - `suspended_at timestamptz` (nullable, default assente — `null` = non sospeso).
   - `internal_note text` (nullable).
   - Scritta a mano come `0035` e le precedenti (stesso motivo: `db:generate` rifiuta
     ancora di girare). Applicata prima a `songs-db-dev` via `npm run db:migrate`,
     poi in produzione via console SQL di Neon con la riga di journal, stessa
     procedura di `CLAUDE.md`.
   - **Nessun'altra migrazione serve per questo piano** — "Cambia email" (punto 5)
     non tocca lo schema, vedi il motivo lì.

**3. Nuovo fieldset Internal note, subito dopo l'header (prima di Identity).**
   - Nuova action `updateInternalNote(ownerEmail: string, note: string)` in
     `src/lib/accounts/actions.ts`, `isOwner` controllato dentro. Una stringa vuota
     cancella la nota. Ritorna `{ok:true} | {ok:false; reason:'not-allowed'|
     'no-database'|'failed'}`.
   - Un'unica `textarea` + submit, sempre visibile (non a comparsa: è la prima cosa
     che un operatore di supporto vuole leggere aprendo un account, coerente con
     collocarlo in cima).

**4. Fieldset Identity, dopo Internal note.**
   - Nome/cognome: nuova action `updateAccountName(ownerEmail: string, firstName:
     string, lastName: string)` in `src/lib/accounts/actions.ts`, accanto a
     `setGrant`/`deleteAccount`: **controllo `isOwner` dentro la action stessa**, non
     solo affidato al gate della pagina — stessa regola che il commento di
     `forceExpireNow` scrive già per sé ("checked here as well as wherever it is
     rendered"), estesa per coerenza a ogni nuova action che accetta un `ownerEmail`
     esplicito diverso da quello in sessione. Ritorna `{ok:true} | {ok:false; reason:
     'not-allowed' | 'no-database' | 'invalid' | 'failed'}`. Piccolo form (due input
     di testo + submit), stile identico a `GiftForm`/`PasswordForm`.
   - **Cambia email account** — blocco separato **a comparsa** (stesso trattamento di
     `DeleteAccountButton`, dato il profilo di rischio più alto delle altre azioni di
     questo fieldset): un input per il nuovo indirizzo, submit, nessun'altra conferma
     — digitare correttamente il nuovo indirizzo è già la conferma, stesso principio
     del retype-to-confirm del Danger zone ma sull'indirizzo *nuovo* invece che su
     quello attuale.
     - Nuova action `changeAccountEmail(oldOwnerEmail: string, newEmail: string)` in
       `src/lib/accounts/actions.ts`, `isOwner` controllato dentro.
     - **Nessuna migrazione necessaria** (vedi "Fondamenta tecniche" sopra): invece di
       aggiungere `onUpdate: 'cascade'` alle sei FK (una modifica permanente di
       schema che toglierebbe per sempre la rete di sicurezza che oggi respinge
       *qualunque* riscrittura accidentale di `owner_email` da qualsiasi altro punto
       del codice), l'azione fa tutto a livello applicativo dentro una singola
       transazione Drizzle:
       1. Controllo preliminare: se `newEmail` ha già una riga in `accounts`,
          `credentials`, o `signIns`, rifiuta con `{ok:false; reason:'target-exists'}`
          — questa azione **rinomina**, non fonde due account; unire due account
          esistenti è un problema diverso, esplicitamente fuori scope (vedi *Fuori
          scope*). Include anche `pendingRegistrations`: se il *nuovo* indirizzo ha
          una registrazione pendente (qualcuno ha iniziato a registrarsi lì e non ha
          mai verificato), quella riga va eliminata **dentro la stessa transazione**
          prima di procedere — non un motivo di rifiuto, perché bloccare un rename
          reale per una registrazione abbandonata e non verificata sarebbe il
          fallimento sbagliato; ma va rimossa, altrimenti il suo link di verifica,
          se mai cliccato in futuro, chiamerebbe `provisionAccount` su un indirizzo
          che nel frattempo appartiene a qualcun altro.
       2. Legge la riga `accounts` esistente con la select tipizzata di Drizzle, poi
          la reinserisce con `{...oldRow, ownerEmail: newEmail}` — lo spread
          dell'oggetto TypeScript porta ogni colonna automaticamente, senza dover
          mantenere a mano un elenco di colonne SQL che si disallineerebbe ad ogni
          nuova colonna aggiunta ad `accounts` in futuro.
       3. `UPDATE` di ognuna delle sei tabelle FK'd (punta al nuovo indirizzo).
       4. `UPDATE` di `credentials`, `signIns`, `paddleEvents` (le tre tabelle senza
          FK che la Decisione #10 ha scelto di far seguire al nuovo indirizzo, per
          continuità di storico pagamenti/accessi sulla pagina rinominata). `UPDATE`
          e non `INSERT`/`DELETE`: se una di queste righe non esiste per il vecchio
          indirizzo (es. `credentials` per un account solo-Google, mai una password),
          l'`UPDATE` è semplicemente un no-op innocuo, nessun errore da gestire.
       5. **Controllo di sicurezza prima del delete**: rilegge le sei tabelle FK'd
          contando eventuali righe ancora puntate al vecchio indirizzo — se il
          conteggio non è zero (un passo 3 incompleto, es. una nuova tabella per-
          account aggiunta in futuro e dimenticata qui), **abortisce la transazione**
          invece di procedere al delete, che altrimenti la cascade-delete di quelle
          righe orfane la nasconderebbe come effetto collaterale silenzioso invece di
          un errore visibile.
       6. `DELETE FROM accounts WHERE owner_email = oldOwnerEmail` — sicuro solo dopo
          che il controllo del passo 5 ha confermato che nessuna tabella punta più
          alla vecchia riga.
     - Dopo un rename riuscito, redirect a `/accounts/<newEmail>` (la vecchia URL
       risponderebbe 404, `getAccountDetail(oldOwnerEmail)` non troverebbe più nulla).
     - `passwordResetTokens` e `pendingRegistrations` **non vengono toccate** — un
       token di reset non consumato sotto il vecchio indirizzo smette semplicemente
       di corrispondere a nulla dopo il rename (fallimento silenzioso e innocuo, non
       un problema di sicurezza); una pending registration è un flusso indipendente
       che precede l'esistenza di un account.

**5. Sezione Subscription (righe 147-180) — bottone Force expire now aggiunto.**
   - `forceExpireNow` in `src/lib/plans/checkout.ts:716` oggi legge l'account da
     `currentUser()` (quello switchato via cookie), non da un parametro esplicito, e
     non ha alcun controllo `isOwner` al suo interno — la sua unica protezione oggi è
     "nessuna UI lo chiama". **Nuova firma**: `forceExpireNow(ownerEmail: string)`,
     con `isOwner` controllato dentro la funzione prima di qualunque lettura/scrittura,
     e `subscriptionColumnsOf(ownerEmail)` invece di `subscriptionColumnsOf(user.
     accountOwnerEmail)`. **Zero chiamanti oggi** (confermato via grep su tutto il
     repo: solo commenti e la definizione stessa) — il cambio di firma non rompe
     nulla di esistente.
   - Bottone visibile solo se il piano live non è già `free`/`lifetime` (stessa
     condizione `not-applicable` già scritta dentro la funzione), per non offrire
     un'azione che risponderebbe comunque un fallimento silenzioso.
   - Resta loggato su `paddle_events` via `logMockEvent` come già fa oggi (azione
     `force_expired`) — nessun cambiamento a quella parte.
   - **Il controllo `mockCheckoutEnabled()` in testa alla funzione (riga 717) resta**,
     non viene bypassato per il percorso admin: è la leva di un sistema di checkout
     ancora finto, non un controllo di accesso separato da quello di `isOwner`. Se
     `SONGBOOK_MOCK_CHECKOUT` viene mai spento in produzione (lo stato finale
     descritto da `CLAUDE.md` una volta arrivato Paddle vero), il bottone smette di
     funzionare insieme al resto del checkout finto — corretto, perché forzare
     `planStatus: 'expired'` in locale senza passare da un vero evento Paddle
     desincronizzerebbe l'account dallo stato reale della sottoscrizione.
   - **`GiftForm.tsx` (199 righe, invariato oggi) reso più guidato** — solo la UI,
     nessun cambiamento a `validateGrant`/`grant.ts`/`setGrant`/`GrantInput`: il form
     continua a costruire e mandare esattamente lo stesso `{plan, until, note}` di
     oggi, solo con un'esperienza di scelta più guidata invece di campi liberi.
     - **Piano**: da `&lt;select&gt;` (`GiftForm.tsx:122-132`) a card/bottoni per
       ognuno dei quattro piani regalabili (`GIVEABLE`, cioè `PLAN_VALUES` meno
       `free`), ciascuno con `PLAN_LABEL` e una riga di descrizione presa da
       `PLANS`/`PlanLimits` — così l'admin vede cosa sta effettivamente concedendo,
       non solo un nome. Lo stato `giving` che già esiste resta identico, cambia solo
       come viene impostato.
     - **Data di scadenza**: il campo raw `&lt;input type="date"&gt;` di oggi
       (`GiftForm.tsx:134-142`) resta **l'unica fonte di verità** del valore inviato
       — nessun cambiamento a come `until` viene letto/validato. Aggiunti bottoni di
       durata preimpostata (1 mese / 3 mesi / 6 mesi / 1 anno / nessuna scadenza) che
       si limitano a **scrivere una volta nel campo data esistente** quando premuti,
       calcolando da `now` — non un meccanismo separato che ricalcola ad ogni submit.
       **Visibili solo quando non esiste ancora un omaggio attivo su quell'account**
       (`plan.grantedPlan === null`, la stessa condizione che oggi disabilita già
       "Remove gift"): se un omaggio esiste già, il form mostra solo il campo data
       raw con il valore già concesso, niente bottoni — stesso comportamento
       protettivo che il commento di oggi (`GiftForm.tsx:38-43`) descrive per evitare
       di allungare per sbaglio un omaggio riaprendo il form solo per correggere il
       motivo (Decisione #14). Nascosti del tutto quando il piano scelto è
       `'lifetime'`, come già oggi (`endless`).
     - **Motivo**: l'`&lt;input&gt;` a riga singola resta il campo effettivo
       (obbligatorio, max 500 caratteri, invariato), ma guadagna alcuni chip veloci
       sopra il campo (es. "Refund", "Positive review", "Friend or family", "Beta
       tester") che, al click, scrivono nel campo se vuoto — il campo resta comunque
       liberamente modificabile a mano, i chip sono solo un punto di partenza più
       veloce del placeholder attuale.

**6. Nuova sezione Payment history** — invariata (righe 182-189).

**7. Nuovo fieldset Newsletter, dopo Payment history.**
   - Nuova funzione `loadNewsletterSummaryFor(ownerEmail: string)` in
     `src/lib/newsletter/actions.ts`, **non** `loadNewsletterPrefs()` esistente (quella
     è chiavata su `session.user.email`, mai su un indirizzo passato — riusarla
     esporrebbe i dati dell'operatore stesso, non del target). `isOwner` controllato
     dentro. Nessuna riga = `{subscribed:false, frequency:'monthly', subscribedAt:
     null, unsubscribedAt:null}`, stessa convenzione già stabilita da
     `loadNewsletterPrefs` per "riga assente".
   - Letta come **query separata** in `Promise.all` insieme a `loadAccountHistory`,
     avvolta nel proprio try/catch — resilienza già in uso da `/accounts` per
     `listAllAccounts()`/`listAccountPlans()` separati (ora meno rilevante dato che
     `0035` è già ovunque, ma tenuta per lo stesso principio).
   - Sola visualizzazione: badge iscritto/non iscritto, cadenza, le due date se
     presenti — nessun form, nessun controllo di modifica.

**8. Nuovo fieldset Usage & content, dopo Newsletter.**
   - Nuova funzione (es. `usageSummaryFor(ownerEmail: string)` in
     `src/lib/accounts/read.ts` o un file dedicato) — conta `songbooks` per
     `accountOwnerEmail`, conta `songs` via join su quelle `songbookSlug`, legge
     `accounts.singAlongPeakDevices`. `isOwner` controllato dentro. Stessa gestione
     di resilienza del punto 7 (query separata, try/catch proprio).
   - Sola visualizzazione: tre numeri, nessuna azione.

**9. Sezione Access & Security (era "Password", righe 191-194) — tre azioni nuove.**
   - **Send password-reset email**: nuova action, es. `sendPasswordResetFor(
     ownerEmail: string)` in `src/lib/auth/actions.ts`, accanto a `setPasswordFor`/
     `removePasswordFor`. Riusa la generazione token + invio email di
     `requestPasswordReset` (`src/lib/forgotPassword/actions.ts:41-90`) ma
     **bypassa** sia il rate limit (`checkRateLimit` su `reset:ip:*`/`reset:email:*`)
     sia il mascheramento anti-enumerazione che fa rispondere sempre `ok:true` anche
     per un indirizzo inesistente: l'admin è già su una pagina `isOwner`-gated per un
     indirizzo che sa esistere, quindi né l'uno né l'altro hanno senso qui — la
     action ritorna un fallimento reale (`{ok:false; reason:'no-database'|'failed'}`)
     invece di un falso successo. Non tocca `requestPasswordReset` stesso: la parte
     di generazione-token-e-invio andrebbe estratta in una funzione interna
     condivisa, non duplicata a mano.
   - **Sospendi/riattiva account**: nuova colonna `accounts.suspendedAt` (punto 2).
     Nuova action `setAccountSuspended(ownerEmail: string, suspended: boolean)` in
     `src/lib/accounts/actions.ts`, `isOwner` interno. Un solo bottone che alterna
     stato (non a comparsa: pienamente reversibile con un altro click). Blocca
     **solo nuovi login**, non una sessione già attiva (Decisione #11) — nuova
     funzione `isAccountSuspended(email: string): Promise<boolean>` in
     `src/lib/accounts/read.ts`, letta da `src/auth.ts`'s `signIn` callback subito
     dopo aver calcolato `email` (riga 114) e **prima** di `recordSignIn` (riga 115):
     se sospeso, `return false` — stesso pattern early-return del controllo
     `email_verified` di Google appena sopra. Nessuna registrazione di sign-in per un
     tentativo respinto, coerente con come il controllo `email_verified` si comporta
     già oggi. **"Enter as this account" non passa da `signIn()`** (scrive solo il
     cookie `songbook-account`) — un account sospeso resta comunque raggiungibile da
     un owner, corretto perché il supporto deve poter ispezionare cosa ha sospeso.
     Nessuna colonna dedicata per il motivo: si presume scritto nel fieldset
     Internal note appena sopra.
   - **Sblocca rate-limit**: nuova funzione `clearRateLimitFor(email: string)` in
     `src/lib/rateLimit.ts`, accanto a `checkRateLimit`/`requestIp`, `isOwner`
     interno. Cancella solo le chiavi **per email** (`login:email:<email>`,
     `register:email:<email>`, `reset:email:<email>`, `feedback:<email>`, dopo
     `normalizeEmail`) — **mai** le chiavi per IP (`login:ip:*` ecc.): sbloccare un
     IP sbloccherebbe chiunque altro condivida quell'indirizzo (NAT, wifi pubblico),
     non solo l'account che l'admin ha in mano.

**10. Sezione Danger zone** — invariata (righe 196-199).

**11. Nuova sotto-sezione "Pending registrations" su `/accounts` (`src/app/accounts/
   page.tsx`), posizionata **sopra** la lista account e i suoi filtri.**
   La lista è paginata (25 per pagina) e filtrata in memoria: una sezione aggiunta
   in coda finirebbe a un'altezza diversa su ogni pagina ed è lo scenario opposto a
   quello voluto — la ragione della sotto-sezione è proprio la scopribilità senza già
   conoscere l'indirizzo, quindi va in cima, prima dei filtri, di solito vuota.
   *(Superato dalla v4.4, `PLAN.md`: da `Accounts.dc.html` la scopribilità la dà una
   pillola rossa «N pending registrations» accanto al titolo, e la sezione con i bottoni
   "Confirm now" sta sotto la lista, raggiunta dalla pillola.)*
   - Nuova funzione `listPendingRegistrations()` (es. in `src/lib/register/actions.ts`
     o `src/lib/accounts/read.ts`): legge tutte le righe `pendingRegistrations`
     (email, nome se presente, `createdAt`, `expiresAt`) — nessun filtro per
     "scadute", mostrate comunque con un badge "expired" quando `expiresAt` è passata,
     dato che "Confirm now" bypassa comunque quel controllo.
   - Nuova action `confirmPendingRegistration(email: string)` in
     `src/lib/accounts/actions.ts` (non `register/actions.ts` o `verify/actions.ts`:
     è concettualmente un'azione admin, stesso file di `deleteAccount`/`switchAccount`).
     `isOwner` controllato dentro. Riusa la logica di `verifyEmail()`
     (`src/lib/verify/actions.ts`, righe 76-133: insert in `credentials`, delete della
     riga `pendingRegistrations`, `provisionAccount(email, name, newsletterOptIn)`,
     email di benvenuto, notifica Telegram) **saltando** i controlli di riga-esistente/
     hash-token/scadenza (righe 62-64) che esistono solo per il percorso self-service
     con link. Consigliato: fattorizzare quel blocco in una funzione interna condivisa
     dentro `verify/actions.ts`, esportata per questo riuso, invece di duplicarlo.
     **Non** chiama `issueSessionCookie`/`redirect` — crea l'account e basta,
     l'operatore non viene loggato come quell'utente (per entrarci userebbe "Enter as
     this account" separatamente dalla pagina di dettaglio). Ritorna `{ok:true} |
     {ok:false; reason:'not-found'|'no-database'|'failed'}`.
   - Bottone "Confirm now" inline nella riga della lista (non un pannello su
     `/accounts/[email]` — vedi Decisione #8), con una didascalia che avvisa
     esplicitamente del rischio accettato (vedi *Domande aperte*).

**12. Copy.** Tutta in inglese, coerente con `Lingua UI: Inglese` (`PLAN.md`) — testo
    esatto (etichette dei fieldset, testo dei bottoni "Confirm now"/"Change email"/
    "Suspend" e dei rispettivi avvisi) da rifinire in implementazione.

## Fuori scope, dichiarato

- **Nessuna modifica alla lista `/accounts`** oltre alla sotto-sezione "Pending
  registrations" — riconfermato nella seconda revisione: nessun nuovo filtro/colonna
  per gli account già esistenti (es. ricerca per nome, filtro "mai entrato"), non
  richiesto ora.
- **Marketing attribution (`gclid`) e riferimenti tecnici billing** (Paddle
  customer/subscription ID, `planChosenAt` esatto) non mostrati in nessun fieldset —
  leggibili via SQL diretto se mai servisse.
- **`bookletFooter`** non toccato da questo piano.
- **Nessuna azione "annulla cambio piano programmato"** (`clearPendingChange`) su
  questa pagina — non richiesta in intervista.
- **Nessuna azione "reinvia email di verifica"** per le pending registration — solo
  "Confirm now" è stata richiesta. Se mai servisse in futuro, andrebbe isolata dal
  rate limit condiviso `register:ip:*`/`register:email:*` che `register()` e
  `resendVerification()` già condividono: un uso admin ripetuto (es. reinvio a più
  utenti in rapida successione) potrebbe altrimenti auto-bloccarsi entro la finestra
  di 10 minuti.
- **Nessun repair automatico** per la data quirk pre-`02ac495` (account "shared"
  bloccati, `CLAUDE.md`) — resta il flusso documentato oggi (elimina e ricrea
  l'account), non affrontato in questa sessione.
- **Nessuna interruzione di sessioni già attive** — sospendere un account blocca solo
  i login futuri (Decisione #11); "logout forzato ovunque" richiederebbe un
  meccanismo di invalidazione di sessione che oggi non esiste (le sessioni sono JWT,
  non revocabili lato server per design) — lift architetturale più grande, non
  affrontato qui.
- **Nessun merge di account** — "Cambia email" rinomina un account esistente verso un
  indirizzo libero; se l'indirizzo target ha già un account, l'azione rifiuta
  (`target-exists`) invece di tentare una fusione. Unire due account con contenuto
  proprio è un problema diverso e più rischioso, non affrontato qui.
- **Nessuna colonna dedicata per il motivo della sospensione** — si presume scritto
  nel fieldset Internal note (singolo campo, condiviso con ogni altro appunto), non
  una colonna a parte.
- **Sblocco rate-limit limitato alle chiavi per email** — le chiavi per IP restano
  intoccate, vedi punto 9 e Decisione #12.
- **Esportazione del contenuto prima della cancellazione** — proposta in fase di
  brainstorming, non scelta dall'utente: non fa parte di questo piano.

## Decisioni

| # | Scelta | Perché |
|---|---|---|
| 1 | Ambito: solo pagina di dettaglio, con un'unica eccezione (sotto-sezione pending registration sulla lista) | La maggior parte dei campi/azioni riguarda un account già esistente; l'eccezione serve solo perché le pending registration non hanno affatto una riga `accounts` |
| 2 | Layout: pagina unica, tutto aperto, nuove sezioni in coda | Minimo cambiamento strutturale, coerente con lo stile attuale, ancora leggibile a più sezioni |
| 3 | Newsletter: sola visualizzazione, nessun controllo admin | La preferenza resta una scelta esclusivamente self-service; l'admin la legge per contesto di supporto ma non la forza |
| 4 | Nome (firstName/lastName): editabile dall'admin | Casi di supporto concreti (refuso, nome mancante) valgono la piccola superficie di rischio, diversamente dalla newsletter dove il consenso è la posta in gioco |
| 5 | Fieldset extra: solo Usage & content, non marketing attribution né riferimenti tecnici billing | Nessuna richiesta esplicita per gli altri due; restano interrogabili via SQL diretto, stessa logica di `PLAN-newsletter.md` |
| 6 | Nuove azioni (prima revisione): Force expire now, invio email reset password, Confirm now sulle pending registration | Tre esigenze di supporto concrete emerse in intervista; "annulla cambio pianificato" scartato perché non richiesto |
| 7 | `forceExpireNow` guadagna una firma esplicita `forceExpireNow(ownerEmail)` con `isOwner` interno, non riusa lo scope self-service via cookie | Operare sull'account switchato sarebbe un flusso a due passaggi e un rischio di agire sull'account sbagliato; zero chiamanti oggi (grep confermato), quindi il cambio di firma non rompe nulla |
| 8 | "Confirm now" vive come bottone inline nella sotto-sezione della lista, non come pannello dedicato su `/accounts/[email]` | Lettura letterale della risposta scelta in intervista (sotto-sezione nella lista era l'alternativa esplicita al pannello sulla stessa URL) — tiene la pagina di dettaglio interamente dedicata ad account già esistenti |
| 9 | Scope lista `/accounts` riconfermato invariato nella seconda revisione | Ricerca per email + ordinamento per data registrazione/ultimo accesso già coprono la triage prevedibile a breve termine |
| 10 | "Cambia email": storico (payment history, sign-in) segue il nuovo indirizzo | `credentials`/`signIns`/`paddleEvents` non hanno FK verso `accounts` quindi richiedono comunque UPDATE espliciti; farli seguire il nuovo indirizzo evita che la pagina rinominata sembri "senza storico" pur avendone |
| 11 | "Sospendi account" blocca solo i login futuri, non le sessioni già attive | Basta un controllo nel `signIn` callback di `auth.ts`; interrompere anche sessioni attive richiederebbe un meccanismo di invalidazione lato server che oggi non esiste (JWT) — lift più grande, rimandato |
| 12 | "Sblocca rate-limit" cancella solo le chiavi per email, mai quelle per IP | Un IP può essere condiviso (NAT, wifi pubblico) — sbloccarlo sbloccherebbe anche chi non c'entra con l'account in questione |
| 13 | "Cambia email" implementata come transazione applicativa (insert-reindirizza-delete), non aggiungendo `onUpdate: 'cascade'` alle FK esistenti | Evita una migrazione e mantiene per ogni altro punto del codice la rete di sicurezza che oggi respinge una riscrittura accidentale di `owner_email`; la lettura tipizzata di Drizzle evita di mantenere a mano un elenco di colonne |
| 14 | `GiftForm` più guidata: stesso form su una pagina, non una vera sequenza a passaggi | Coerente con lo stile minimale già scelto per il resto della pagina; meno codice/stato di navigazione per un form che oggi è già breve |
| 15 | Bottoni di durata preimpostata sulla data di scadenza visibili **solo quando non esiste ancora un omaggio attivo** | Preserva la ragione originale del campo data raw (`GiftForm.tsx:38-43`): riaprire il form su un omaggio esistente solo per correggere il motivo non deve poter ricalcolare/allungare la scadenza per sbaglio |

## Assunzioni prese senza chiedere

Da correggere se una è sbagliata — nessuna è irreversibile.

- **`isOwner` controllato dentro ogni nuova action** che accetta un `ownerEmail`
  esplicito (`updateAccountName`, `updateInternalNote`, `changeAccountEmail`,
  `setAccountSuspended`, `clearRateLimitFor`, `loadNewsletterSummaryFor`,
  `usageSummaryFor`, `sendPasswordResetFor`, `forceExpireNow`,
  `confirmPendingRegistration`), non solo a livello di pagina — un account può
  risolvere a `'admin'` anche per il proprio owner (`roles.ts`), quindi un gate più
  debole di `isOwner` diretto lascerebbe qualunque cliente agire sull'account di un
  altro se mai una di queste funzioni venisse richiamata da un contesto diverso da
  questa pagina. `isAccountSuspended`, che gira per *ogni* tentativo di login, fa
  eccezione di proposito: non è un'azione admin con un target scelto da un operatore,
  è un controllo di sistema sull'indirizzo che sta accedendo.
- **Password reset admin-triggered bypassa rate limit e mascheramento
  anti-enumerazione** del flusso self-service — altrimenti l'admin potrebbe vedere
  "ok" senza che nulla sia stato effettivamente inviato.
- **Newsletter e Usage & content lette come query separate**, ciascuna con il proprio
  try/catch in `Promise.all`, non innestate dentro `getAccountDetail`.
- **`confirmPendingRegistration` non firma l'operatore come l'utente appena creato**
  (nessun `issueSessionCookie`/redirect) — a differenza del percorso self-service,
  qui chi preme il bottone non è la persona che si sta registrando.
- **Nessuna nuova colonna di audit** ("confermato da", "sospeso da", "email cambiata
  da") aggiunta allo schema per queste azioni — `forceExpireNow` resta comunque
  tracciato indirettamente su `paddle_events`. `confirmPendingRegistration` **non è
  silenziosa**: riusando il blocco di `verifyEmail()` (punto 11), invia comunque
  l'email di benvenuto al nuovo account e la notifica Telegram di registrazione —
  l'operatore che preme "Confirm now" deve sapere che l'utente riceve quell'email
  nello stesso istante.
- **Nome modificabile da due punti indipendenti**: `updateOwnName` (self-service,
  `/profile`) e la nuova `updateAccountName` (admin) scrivono entrambe `firstName`/
  `lastName` senza alcun meccanismo di coordinamento tra loro — vince l'ultima
  scrittura, nessun conflitto segnalato. Rischio giudicato trascurabile.
- **Ordine dei fieldset**: Header → Internal note → Identity (+ Cambia email, a
  comparsa) → Subscription → Payment history → Newsletter → Usage & content →
  Access & Security → Danger zone — non esplicitamente chiesto in intervista, note
  in cima perché è il primo contesto utile a chi apre la pagina per supporto,
  distruttivo in fondo.
- **Pending registrations mostrate senza filtro di scadenza** (anche quelle già
  scadute compaiono, con un badge), dato che "Confirm now" bypassa comunque il
  controllo di scadenza.
- **`passwordResetTokens` non toccata da "Cambia email"** — un token di reset non
  consumato sotto il vecchio indirizzo smette semplicemente di corrispondere a nulla
  dopo il rename (fallimento silenzioso, non un problema di sicurezza né di dati).
  `pendingRegistrations`, invece, **va gestita**: non sul vecchio indirizzo (irrilevante,
  l'account esiste già), ma su quello *nuovo* — vedi il passo 1 della transazione al
  punto 4 sopra, dove un'eventuale registrazione pendente sul target viene eliminata
  invece di bloccare il rename.
- **Nessuna colonna per il motivo della sospensione** — si presume scritto nel
  fieldset Internal note.
- **Una volta che un omaggio esiste, estenderlo richiede la data raw, non un preset**
  — conseguenza diretta della Decisione #15: un admin che vuole davvero prolungare un
  omaggio esistente (non solo correggerne il motivo) deve calcolare/digitare la nuova
  data a mano, gli stessi bottoni di durata non ricompaiono finché l'omaggio non
  viene prima rimosso. Accettato consapevolmente: non c'è modo di distinguere "voglio
  prolungare" da "sto solo sistemando il motivo" guardando solo lo stato del form.
- **Etichette dei chip del motivo** ("Refund", "Positive review", "Friend or family",
  "Beta tester") — proposta, non un elenco chiuso; da rifinire/confermare in
  implementazione insieme al resto della copy.

## Domande aperte

- **Rischio accettato di "Confirm now"**: crea un account reale, con login
  immediato disponibile, per un indirizzo che non ha mai dimostrato di controllare
  quella casella email (nessun click sul link) — con una password scelta al momento
  della registrazione originale, non dall'admin. Stesso tipo di rischio consapevole
  già accettato in `PLAN-newsletter.md` per l'iscrizione di default via Google e per
  il backfill di tutta la base utenti. Va scritto come avviso visibile accanto al
  bottone, non solo qui.
- **Copy/UX esatta del rifiuto di login per un account sospeso**: `signIn()` che
  ritorna `false` porta oggi a un errore generico NextAuth (`AccessDenied`) — da
  verificare in implementazione se la pagina `/login` esistente mostra già qualcosa
  di sensato per questo caso o se serve un messaggio dedicato. Tensione aperta non
  risolta: un messaggio esplicito ("account sospeso") è più utile per chi ha
  legittimamente perso l'accesso, ma rivela a chiunque stia sondando un indirizzo che
  quell'account esiste ed è sospeso — diverso dal principio "mai rivelare se un
  indirizzo esiste" che `authorize()` segue oggi per credenziali sbagliate. Da
  decidere in implementazione, non bloccante per il resto del piano.
- **`singAlongDevices` non è nell'elenco delle sei tabelle da ripuntare** in "Fondamenta
  tecniche" — non per dimenticanza: la sua unica FK è verso `singAlongSessions.token`
  (`schema.ts:812-814`), non verso `accounts.ownerEmail` direttamente. Raggiunge un
  account solo transitivamente tramite `singAlongSessions.broadcastAccountEmail`, che
  è già nell'elenco — ripuntare quella riga basta, `singAlongDevices` non ha nulla da
  aggiornare.
- **Sessione già attiva dopo un "Cambia email"**: se l'utente ha una sessione JWT
  aperta con il vecchio indirizzo nel momento in cui l'admin lo rinomina, le sue
  azioni self-service (che leggono `session.user.email`) troveranno righe assenti
  finché non rifà login — nessun crash, ma un comportamento silenzioso e confuso per
  quell'utente fino al prossimo logout/login. Non risolto qui (richiederebbe lo
  stesso meccanismo di invalidazione di sessione lasciato fuori scope per la
  sospensione).
- **Fattorizzazione di `verifyEmail()`**: suggerita l'estrazione di un helper interno
  condiviso per evitare che `confirmPendingRegistration` duplichi a mano insert/
  delete/provisioning/email/notifica — da confermare in implementazione.
- **Copy esatta** di tutte le nuove etichette/bottoni/avvisi — da rifinire in
  implementazione, in inglese.
