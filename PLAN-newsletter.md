# Newsletter — iscrizione, frequenza e disiscrizione — piano

> Documento a sé, non una sezione di `PLAN.md`: quella tabella è il registro delle
> decisioni già *consegnate e in produzione*, e questa feature non è ancora scritta.
> Quando è chiusa, va ripiegata lì come una nuova sezione di versione — verificare
> l'ordine di fold-in reale al momento (altri `PLAN-<feature>.md` potrebbero essere
> stati consegnati nel frattempo), non assumere che il numero di versione successivo
> sia libero. Precedente diretto per la forma del documento: `PLAN-account-name.md`,
> la feature più simile per forma (nuova colonna/tabella raccolta sia in registrazione
> sia via Google, poi resa visibile e modificabile in un secondo momento).

## Cos'è

Oggi non esiste alcun concetto di newsletter/marketing email nel repo — nessuna
tabella, nessuna checkbox, nessuna parola "newsletter" o "unsubscribe" in nessun file
(`src/` o documentazione). La richiesta: chiedere in fase di registrazione se
l'utente vuole iscriversi, salvare la scelta, e dare successivamente all'utente
già loggato un modo per cambiare la frequenza di ricezione o disiscriversi del
tutto. **Non** è richiesto costruire l'invio reale della newsletter — vedi sotto.

## Cosa cambia, risolto nell'intervista

- **Scope: solo cattura e gestione della preferenza**, non l'invio. Nel repo non
  esiste alcuna infrastruttura di job schedulati o batch ("no cron, no background
  job anywhere in this repo", `CLAUDE.md`) — costruirla è dichiarato esplicitamente
  fuori da questa sessione.
- **Storage: tabella dedicata `newsletterPrefs`**, non un'estensione di `userPrefs`
  (preferenze di lettura: zoom, notazione, accordi) né di `accounts` (piano, Paddle,
  nome). Il consenso alle comunicazioni è un concetto a sé, con margine per crescere
  (timestamp, in futuro un token di disiscrizione) senza sporcare le altre tabelle.
- **Form di registrazione: solo un controllo sì/no**, non pre-selezionato. La
  frequenza non si sceglie in quel momento — parte da un default e si cambia dopo,
  nelle impostazioni. Tiene il form (oggi solo nome/cognome/email/password) minimale.
  Implementato come un vero Toggle (`.toggle-switch`, DESIGN.md §5), non una checkbox
  spoglia — coerente con la convenzione già in uso per ogni altra preferenza booleana
  salvata sull'account (`AppSettingsForm`), non solo un dettaglio di copy come
  "checkbox" lasciava intendere.
- **Frequenze supportate: Weekly / Monthly.** Due sole cadenze.
- **Registrazione via Google: iscritto di default**, senza alcuna azione esplicita
  richiesta nel flusso OAuth. Deciso esplicitamente dall'utente anche dopo un
  contro-argomento sul rischio di consenso non valido sotto GDPR (il consenso al
  marketing dovrebbe derivare da un'azione affermativa, non da un default) — vedi
  *Domande aperte*.
- **Gestione da loggato: dentro la vista Settings annidata di `UserMenu`**, insieme a
  tema e notazione — non una pagina dedicata come `/profile`. Coerente con l'uso
  attuale di quella vista per preferenze "decise una volta per l'account".
- **Account già esistenti: iscritti di default anche loro**, non solo le nuove
  registrazioni Google. Stessa logica "iscritto senza azione esplicita" scelta per
  Google (vedi *Domande aperte* per il rischio GDPR, ora esteso a tutta la base
  utenti attuale, non solo ai nuovi arrivi) estesa via backfill nella migrazione
  stessa: ogni riga `accounts` esistente riceve una riga `newsletterPrefs` con
  `subscribed = true`, `frequency = 'monthly'`.

## Impianto — dove si aggancia

**1. Migrazione (prossimo numero libero dopo `0034`, quindi `0035`).**
   - `pending_registrations` guadagna `newsletter_opt_in boolean NOT NULL DEFAULT
     false` — a differenza di `first_name`/`last_name` (0034, nullable perché senza
     alcun default sensato), un booleano ha sempre un default sicuro, quindi qui
     `NOT NULL DEFAULT false` non rischia di rompere righe pendenti già in volo al
     momento del deploy.
   - Nuova tabella `newsletter_prefs`, **con backfill delle righe esistenti** nella
     stessa migrazione (deciso in intervista: gli account già esistenti vanno
     iscritti di default anche loro, non solo i nuovi arrivi via Google):
     ```sql
     CREATE TABLE "newsletter_prefs" (
       "owner_email" text PRIMARY KEY REFERENCES "accounts"("owner_email") ON DELETE CASCADE,
       "subscribed" boolean NOT NULL DEFAULT false,
       "frequency" text NOT NULL DEFAULT 'monthly',
       "subscribed_at" timestamptz,
       "unsubscribed_at" timestamptz,
       "updated_at" timestamptz NOT NULL DEFAULT now()
     );
     --> statement-breakpoint
     INSERT INTO "newsletter_prefs" ("owner_email", "subscribed", "frequency", "subscribed_at")
     SELECT "owner_email", true, 'monthly', now() FROM "accounts";
     ```
     Nessun account nuovo va perso o duplicato da questo backfill: chi si registra
     *dopo* questa migrazione riceve la propria riga da `provisionAccount` (punto 3),
     mai da qui — il `SELECT` gira una volta sola, al momento in cui la migrazione
     viene applicata.
   - Scritta a mano, stesso motivo già documentato da `0028` in poi (`drizzle-kit
     generate` rifiuta di girare, snapshot rotto — `PLAN.md`, *Domande aperte* #19) —
     **sia il file `.sql` sia la voce corrispondente in `drizzle/meta/_journal.json`**
     vanno aggiunti a mano, non solo l'SQL: `PLAN-account-name.md` lo richiama
     esplicitamente per `0034` ("SQL e voce di journal") ed è lo stesso motivo per cui
     `npm run db:migrate` funziona in locale — senza quella voce il migratore non sa
     che il file esiste e lo salta in silenzio. Applicata a `songs-db-dev` in locale
     (`npm run db:migrate`), poi a produzione via console SQL di Neon con la riga di
     journal di produzione scritta a mano nella stessa transazione, stessa procedura
     di `CLAUDE.md` — vedi *Domande aperte* sull'ordine.

**2. Schema — `src/lib/db/schema.ts`.**
   - `newsletterPrefs`, stile identico a `userPrefs` (righe 520-555): colonne
     `text`/`boolean`/`timestamp({ withTimezone: true })`. `frequency` resta `text`
     libero, non un `pgEnum`/`CHECK` — stessa convenzione già in uso per
     `notation`/`chordDisplay`/`accidentals` ("non un pgEnum e non un CHECK", commento
     di testa a `schema.ts`): solo due valori validi (`'weekly' | 'monthly'`),
     applicati lato TypeScript dove si scrive, non imposti dal DB.
   - `pendingRegistrations` guadagna `newsletterOptIn: boolean('newsletter_opt_in')
     .notNull().default(false)`.

**3. `provisionAccount` (`src/lib/accounts/provision.ts`) — terzo parametro,
   inserimento fuori transazione.**
   - Firma: `provisionAccount(email: string, name?: {firstName, lastName},
     newsletterOptIn?: boolean)`.
   - **Non** dentro la transazione che crea `accounts` (righe 77-90 oggi): stesso
     trattamento di `insertSampleSongbook` (righe 127-131), con la stessa
     motivazione — un fallimento nell'insert di `newsletterPrefs` (es. tabella non
     ancora esistente perché la migrazione non è stata applicata in produzione) non
     deve far fallire né arretrare l'intera creazione dell'account. Va quindi dopo
     `insertSampleSongbook`, nel ramo `created`, in un proprio try/catch che si limita
     a loggare, stesso stile.
   - Inserisce `{ ownerEmail, subscribed: newsletterOptIn ?? false, frequency:
     'monthly', subscribedAt: newsletterOptIn ? new Date() : null, unsubscribedAt:
     null }`.
   - **Nessun aggiornamento opportunistico** sul ramo "account già esistente"
     (`created === false`) — a differenza del nome, qui non c'è alcuna fonte esterna
     da cui riempire un buco: un account senza riga `newsletterPrefs` si legge
     semplicemente come "non iscritto", nessun backfill necessario né sensato.

**4. `auth.ts` — callback `signIn`.**
   - Ramo `'google'`: passa `newsletterOptIn: true` fisso, nessuna nuova UI nel
     flusso OAuth (deciso in intervista).
   - Ramo credenziali: continua a chiamare `provisionAccount(email)` senza il terzo
     parametro — non crea mai un account nuovo (lo crea già `verifyEmail`), quindi
     resta un no-op anche per la newsletter, stesso ragionamento già documentato per
     il nome in `PLAN-account-name.md` punto 3.

**5. Registrazione tradizionale — tre file.**
   - `src/components/RegisterForm.tsx`: un Toggle (`.toggle-switch`) non attivo di
     default, "Subscribe to the newsletter" (copy esatta da rifinire in
     implementazione), dopo Confirm password e prima del widget Turnstile. Stato React proprio
     (`newsletterOptIn`, default `false`); diventa un input `hidden` nella fase
     `'sent'` (`value={newsletterOptIn ? 'on' : ''}`), stesso trattamento degli altri
     campi (righe 167-173 di oggi).
   - `src/lib/register/actions.ts`, `register()`: legge
     `formData.get('newsletterOptIn') === 'on'` (una checkbox HTML non invia nulla se
     deselezionata). Va in **entrambe** le metà dell'`onConflictDoUpdate` upsert su
     `pendingRegistrations` (righe 87-93 di oggi) — sia in `values({ ...,
     newsletterOptIn })` sia in `set: { ..., newsletterOptIn }`: registrarsi di nuovo
     su un indirizzo ancora pendente è il percorso già documentato "l'email non è mai
     arrivata" (commento di testa al file), e se `newsletterOptIn` mancasse dal `set`
     una checkbox cambiata al secondo tentativo verrebbe scartata in silenzio, non
     aggiornata. Nessun nuovo motivo di fallimento: un booleano non ha bisogno di
     validazione.
   - `src/lib/verify/actions.ts`, `verifyEmail()`: la riga `pendingRegistrations`
     letta dentro la transazione porta già `newsletterOptIn` — va passato a
     `provisionAccount(normalized, name, row.newsletterOptIn)`.

**6. Superficie da loggato — dentro la vista Settings annidata di `UserMenu.tsx`.**
   - Nuovo componente client, `src/components/NewsletterPrefs.tsx`, tra
     `NotationPicker` e il divisore che precede "Delete account" (righe 242-245
     circa). **Non** passa dal canale `usePrefs()`/`prefsQueue` esistente (cablato
     specificamente sulle colonne di `userPrefs`, pensato per sincronizzazione
     ottimistica di preferenze cambiate spesso, es. lo zoom): iscriversi/disiscriversi
     è un'azione rara e deliberata, quindi legge/scrive con server action dirette,
     stesso pattern di `loadOwnName`/`updateOwnName`.
   - Nuovo file `src/lib/newsletter/actions.ts` (non dentro `accounts/actions.ts`,
     che porta già `SelfDeleteFailure`/`NameFailure` per altri concetti; una tabella
     propria giustifica un file proprio, stesso principio con cui `checkout.ts` sta a
     sé rispetto al resto di `plans/`):
     - `loadNewsletterPrefs()`: null se non loggato; riga assente letta come
       `{ subscribed: false, frequency: 'monthly' }` (mai un `null` che lascerebbe la
       UI senza nulla da mostrare — stesso principio di `loadOwnName`).
     - `updateNewsletterPrefs(subscribed: boolean, frequency: 'weekly' | 'monthly')`:
       chiavata su `session.user.email`, mai su un indirizzo passato dal client,
       stesso principio di `updateOwnName`. **Deve essere un upsert**
       (`insert(newsletterPrefs).values({...}).onConflictDoUpdate({...})`, stesso
       schema già in uso da `register()` su `pendingRegistrations` e da `verifyEmail`
       su `credentials`), **non una `UPDATE` semplice**: la riga può mancare (insert
       fallito silenziosamente al punto 3/7, o una finestra di deploy prima che il
       backfill del punto 1 sia applicato in produzione) — una `UPDATE` su una riga
       assente non tocca nulla e risponde comunque "ok", lasciando il toggle apparire
       funzionante senza che nulla sia stato salvato. Scrive anche `subscribedAt`/
       `unsubscribedAt` coerenti col nuovo stato (`subscribedAt: now()` quando si
       passa da non iscritto a iscritto, `unsubscribedAt: now()` quando si passa da
       iscritto a non iscritto — invariati se lo stato `subscribed` non cambia).
   - UI: un toggle "Subscribe to the newsletter" + un menù a tendina "Weekly /
     Monthly", visibile/attivo solo mentre iscritti. "Cancellazione totale" = toggle
     spento; "cambio frequenza" = lo stesso menù, sempre disponibile mentre iscritti.

**7. Copy.** Tutta in inglese, coerente con `Lingua UI: Inglese` (`PLAN.md`) — testo
   esatto da rifinire in implementazione.

## Fuori scope, dichiarato

- **Nessun invio effettivo di contenuti newsletter** (nessun cron, nessun job, nessuna
  composizione email periodica) — questa sessione costruisce solo cattura e
  gestione della preferenza (confermato in intervista).
- **Nessun link di disiscrizione "one-click" dentro un'email** (token pubblico,
  nessun login richiesto) — non necessario finché non esiste alcuna email di
  newsletter reale da cui cliccarlo; da riprendere quando l'invio verrà costruito.
- **Nessuna superficie admin dedicata** (lista iscritti, export) — nessuna richiesta
  esplicita; un global owner può comunque leggere `newsletter_prefs` via SQL diretto
  se necessario nel frattempo.
- **Nessuna schermata intermedia post-login per gli utenti Google** — l'iscrizione di
  default è silenziosa, nessun nuovo step nel flusso OAuth (deciso in intervista).
- **Nessuna personalizzazione delle email transazionali esistenti** (benvenuto,
  verifica) per menzionare la newsletter — non richiesto.

## Decisioni

| # | Scelta | Perché |
|---|---|---|
| 1 | Scope: solo cattura/gestione della preferenza, **non** l'invio reale | Nessuna infrastruttura di job schedulati esiste in questo repo; costruirla ora sarebbe un lavoro molto più ampio di quanto chiesto |
| 2 | Tabella dedicata `newsletterPrefs`, non un'estensione di `userPrefs`/`accounts` | Il consenso alle comunicazioni è concettualmente diverso dalle preferenze di lettura o dai dati del piano; una tabella propria lascia spazio a crescere senza sporcare le altre |
| 3 | Form di registrazione: solo checkbox sì/no, frequenza scelta dopo nelle impostazioni | Tiene il form di registrazione minimale; la frequenza è un dettaglio rifinibile una volta iscritti |
| 4 | Frequenze supportate: Weekly / Monthly | Due sole cadenze, sufficienti oggi e facili da estendere in futuro (colonna testo libero, stessa convenzione di notation/chordDisplay) |
| 5 | Google: **iscritto di default**, nessuna azione esplicita richiesta | Scelta esplicita dell'utente anche dopo un contro-argomento sul rischio di consenso non valido sotto GDPR — accettato consapevolmente, vedi *Domande aperte* |
| 6 | Superficie di gestione: dentro la vista Settings annidata di `UserMenu`, non una pagina dedicata | Coerente con l'uso attuale di quella vista per preferenze "decise una volta per l'account" (tema, notazione); nessuna nuova rotta |
| 7 | Insert di `newsletterPrefs` **fuori** dalla transazione che crea `accounts` | Stesso trattamento di `insertSampleSongbook`: una scrittura secondaria non deve poter far fallire la creazione dell'account, specialmente se la migrazione non è ancora applicata ovunque |
| 8 | Account già esistenti: **backfill a `subscribed = true`** nella stessa migrazione, non lasciati "non iscritti" | Stessa logica già scelta per Google estesa a tutta la base utenti attuale — deciso esplicitamente dall'utente, non un'assunzione |

## Assunzioni prese senza chiedere

Da correggere se una è sbagliata — nessuna è irreversibile.

- **`frequency` di default quando ci si iscrive senza sceglierla esplicitamente**
  (checkbox di registrazione, Google): `'monthly'` — cadenza più conservativa delle
  due, meno probabile che infastidisca chi non ha espresso una preferenza esplicita.
- **Righe `newsletterPrefs` mancanti per un motivo diverso dal backfill** (l'insert
  del punto 3/7 fallito silenziosamente per un account creato dopo questa migrazione)
  si leggono come "non iscritto, mensile" — stesso trattamento "nessuna riga =
  default" già in uso altrove nello schema. Il backfill del punto 1 copre solo gli
  account esistenti *al momento della migrazione*, non un caso limite come questo.
- **Nuova server action e nuovo componente in file propri**
  (`lib/newsletter/actions.ts`, `components/NewsletterPrefs.tsx`) invece di
  infilarsi in `accounts/actions.ts` o nel meccanismo `usePrefs()`/`prefsQueue` —
  coerente con la convenzione "una tabella propria, un file proprio" già seguita per
  `checkout.ts`/`plans/`.
- **Nessun numero di versione fissato** per il fold-in in `PLAN.md` — verificare
  l'ordine reale al momento della consegna.

## Domande aperte

- **Rischio di conformità GDPR sull'iscrizione di default**: confermato esplicitamente
  dall'utente due volte, dopo un contro-argomento in entrambi i casi — sia per chi si
  registra oggi con Google (nessuna azione affermativa separata) sia per il backfill
  di ogni account già esistente (nessuna azione di alcun tipo, passata o presente).
  L'esposizione copre quindi l'intera base utenti attuale più ogni futuro arrivo via
  Google, non solo i nuovi arrivi — resta un rischio reale se il prodotto dovesse mai
  trattare dati di utenti UE in modo più formale, da rivalutare se mai diventa un
  problema concreto, non bloccato ora.
- **Link di disiscrizione "one-click" da email (token, nessun login)**: dichiarato
  fuori scope perché non esiste ancora alcuna email di newsletter reale, ma sarà
  necessario quando l'invio verrà costruito — la tabella `newsletterPrefs` come
  disegnata qui non ha ancora una colonna token; da aggiungere in quella fase futura.
- **Superficie admin per vedere/esportare gli iscritti**: non richiesta ora; se
  emerge un bisogno reale (es. per un primo invio manuale), una query diretta su
  `newsletter_prefs` basta nel frattempo, prima di costruire qualunque UI.
- **Ordine di migrazione in produzione**: a differenza del caso nome (`0034`, che
  scrive le colonne nello stesso insert di `accounts` e può quindi bloccare l'intera
  creazione dell'account se la migrazione manca), qui l'insert di `newsletterPrefs`
  è deliberatamente fuori dalla transazione che crea `accounts` (punto 3/7 sopra) —
  se la migrazione non è ancora applicata in produzione, l'account viene comunque
  creato normalmente, solo senza riga `newsletterPrefs`, letta come "non iscritto"
  finché quella scrittura non torna a funzionare. Nessun percorso di registrazione
  realmente rotto, ma va comunque applicata a produzione (console SQL di Neon) prima
  del deploy di questo codice per evitare quella finestra, stessa procedura di
  `CLAUDE.md` — meno critico dell'ordine richiesto per `0034`, ma non da ignorare.
