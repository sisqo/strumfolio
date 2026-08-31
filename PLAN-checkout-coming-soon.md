# "Coming soon" quando il checkout è spento — piano

> Documento a sé, non una sezione di `PLAN.md`: quella tabella è il registro delle
> decisioni già *consegnate e in produzione*, e questa feature non è ancora scritta.
> Quando è chiusa, va ripiegata lì come una nuova sezione di versione — stesso
> avvertimento sul numero già fatto in `PLAN-account-name.md`: non assumere il
> prossimo libero senza verificare l'ordine di fold-in al momento.

## Cos'è, e cosa non è

**Il flag chiesto esiste già.** `SONGBOOK_MOCK_CHECKOUT` (`mockCheckoutEnabled()`,
`src/lib/plans/resolve.ts:88-90`) è una env var Vercel, letta fresca a ogni chiamata,
che governa già 5 azioni server (`loadCheckoutStatus`, `mockPurchase`, `mockCancel`,
`clearPendingChange`, `forceExpireNow` in `lib/plans/checkout.ts`) e la variabile
`CHECKOUT_LIVE` di `pricing/page.tsx`. È **già `on` in produzione** oggi — non c'è
nulla da costruire lì.

Il gap vero: oggi, a flag spento, una card a pagamento su `/pricing` finisce dopo la
frase di pubblico-target **senza bottone, senza scritta** — scelta deliberata del
redesign v3.4, rafforzata dal commit `67164e9` che ha tolto l'ultimo avviso rimasto
("The paid plans are not on sale yet") perché contraddiceva i bottoni già attivi in
produzione. Prima del redesign esisteva un'etichetta per-card "Not on sale yet" — la
richiesta di oggi la reintroduce, in forma diversa (bottone statico invece di frase
sopra la card).

Questa feature: uno stato "Coming soon" visibile ovunque il checkout scompare oggi
(card a pagamento, pannello Lifetime, `/checkout/[plan]` visitato direttamente), più lo
spegnimento vero e proprio del flag in produzione una volta verificato che
registrazione e scelta del piano Free restano intatte — requisito esplicito
dell'utente.

## Perché è già sicuro, per architettura — verificato, non solo letto

Il gate obbligatorio di scelta piano (v3.7, `(home)/page.tsx`) dipende da
`plansEnforced()` (`SONGBOOK_PLANS`), **mai** da `mockCheckoutEnabled()` — regola
dichiarata esplicitamente in `PLAN.md` (tabella *Decisioni*, v3.7): "L'uscita gratuita
deve restare percorribile a checkout spento." La registrazione (`/register`,
`provisionAccount`) non legge nessuno dei due flag. Questo rende la richiesta
dell'utente già garantita dal disegno esistente — ma va **verificato concretamente**
prima di toccare la produzione (`npm run build`/test con `SONGBOOK_MOCK_CHECKOUT`
assente in locale, che è già lo stato di default: `.env.local` non lo imposta), non
solo dedotto dai commenti.

## Cosa cambia, risolto nell'intervista

- **Il flag va spento davvero in produzione**, non solo preparato per dopo — deciso
  esplicitamente, con la condizione che registrazione e scelta Free restino
  verificate prima di farlo.
- **Bottone statico, non cliccabile.** "Coming soon" al posto del bottone di
  acquisto, stessa posizione, stesso ingombro, ma un `<button disabled>`: nessun link,
  nessuna azione, nessuna pagina nuova da costruire.
- **Il pannello Lifetime riceve lo stesso trattamento** invece di sparire del tutto
  come fa oggi — coerenza fra le quattro card e il pannello a sé.
- **`/checkout/[plan]` visitato direttamente (link vecchio/salvato) aggiorna la
  copy** per raccontare la stessa storia delle card, non più la riga d'errore generica
  di oggi.
- **`/login` non richiede nessuna modifica** — la sua FAQ (`PLAN_HOLD`,
  `login/page.tsx:174-184`) legge già `mockCheckoutEnabled()` dentro il ramo
  `plansEnforced()`, ed è già la frase corretta per la combinazione che si sta per
  produrre (`plansEnforced() === true, mockCheckoutEnabled() === false`): "They are
  not on sale yet, but the limits themselves are already live...". Verificato per
  lettura diretta del file, non assunto.

## Impianto — dove si aggancia

**1. `src/components/PricingPlans.tsx`, righe 394-458 — riordino, non solo
   aggiunta.** Oggi l'intero blocco (compreso il ramo `isCurrent` → "Your plan ·
   Manage" e il ramo `isLifetime` → "Included in Lifetime") è dentro
   `column.checkoutPlan !== undefined`, quindi **anche un account già davvero
   abbonato smetterebbe di vedere il proprio stato** se il flag fosse spento — bug
   nascosto finora perché il flag non è mai stato spento con account paganti reali.
   Va riordinato così che `isCurrent`/`isLifetime` si controllino **prima**,
   indipendentemente da `checkoutPlan`:
   - non firmato → resta **"Sign up"**, invariato, flag o non flag: "coming soon"
     vale solo per chi è già dentro e vede che *quel piano specifico* non è ancora
     acquistabile — un visitatore non loggato non deve leggere "coming soon" su ogni
     piano a pagamento e concludere che l'app non è ancora usabile. Registrazione
     mai tolta da nessuna delle quattro card né da `LifetimeCta`.
   - `isCurrent` → resta "Your plan · Manage" **sempre**, flag o non flag; il link
     "Change billing cycle" sotto resta invece condizionato a `checkoutPlan !==
     undefined` (nascosto a flag spento: `mockPurchase` è comunque disattivato, un
     link che porta a "Coming soon" sarebbe teatro, stesso principio già scritto in
     `PLAN.md` v3.12 per il downgrade che chiedeva la carta senza incassare).
   - `isLifetime` → resta "Included in Lifetime" sempre, stesso motivo.
   - altrimenti (nessuno dei precedenti): `checkoutPlan !== undefined` → bottone
     reale di oggi (`Choose`/`Switch`/`Upgrade`); altrimenti → nuovo bottone
     `&lt;button type="button" className="btn btn-sm plan-cta w-full" disabled
     aria-disabled="true"&gt;Coming soon&lt;/button&gt;`.

**2. `src/components/PricingPlans.tsx`, `LifetimeCta` (righe 634-664) — nuovo prop
   `checkoutLive: boolean`.** Ordine dei rami: non firmato → "Sign up" **per primo,
   invariato** (stesso motivo del punto 1: mai tolto); poi già su Lifetime → "Your
   plan" (sempre, come oggi); poi `!checkoutLive` → bottone statico "Coming soon";
   altrimenti → "Choose Lifetime" com'è oggi.

**3. `src/app/pricing/page.tsx`, riga 754 — il pannello si renderizza sempre.**
   `{CHECKOUT_LIVE && &lt;LifetimeCta .../&gt;}` diventa `&lt;LifetimeCta href="/checkout/lifetime"
   viewer={viewer} checkoutLive={CHECKOUT_LIVE} /&gt;` incondizionato — `paidColumn()`
   (riga 227, `checkoutPlan: CHECKOUT_LIVE ? plan : undefined`) non cambia, resta il
   segnale che `PricingPlans.tsx` già legge.

**4. `src/components/CheckoutScreen.tsx`, righe 122-133 e 240-260 — copy del ramo
   `'disabled'`.** Oggi tutti e tre i motivi di `unavailable` (`disabled`,
   `no-session`, `no-database`) condividono lo stesso stile `notice notice-error`
   `role="alert"`. Il ramo `disabled` (quello che risponde al flag) cambia solo il
   testo — da "Checkout is not available right now." a qualcosa nella stessa voce
   delle card, es. "These plans aren't on sale yet — check back soon." — e passa da
   `notice-error`/`role="alert"` a `notice-accent`/`role="status"`: non è un errore
   causato da chi legge, è la stessa informazione neutra delle card. I due motivi
   sign-in/no-database restano `notice-error`, invariati — sono gli unici due dove il
   commento esistente sul perché "un bottone implicherebbe che c'è qualcosa da fare"
   resta vero.

**5. Verifica pre-produzione — fatta solo in parte, un blocco reale trovato.**
   In produzione `SONGBOOK_PLANS` è **`on`** (verificato con `vercel env ls
   production`: la riga esiste, creata 10 giorni fa) — quindi `planNamesOf`
   (`resolve.ts:351-376`, gated solo su `plansEnforced()`, mai su
   `mockCheckoutEnabled()`) continua a risolvere `plan`/`subscriptionPlan` anche a
   checkout spento: la Decisione 5 sotto (`isCurrent` va preservato) non è
   un'ipotesi, è verificata contro il codice reale che gira in produzione. La verifica
   locale deve quindi esportare `SONGBOOK_PLANS=on` per la sessione di test — in
   locale oggi è assente insieme a `SONGBOOK_MOCK_CHECKOUT`, quindi un giro senza
   quell'export testerebbe una combinazione di flag che la produzione non ha mai
   avuto.
   - `npm run build` e un giro manuale/`curl` su `/register`, sul gate di scelta
     piano (`(home)/page.tsx` redirect quando l'account non ha ancora scelto), e
     sulla card Free di `/pricing` — tutti devono restare percorribili esattamente
     come oggi, con `SONGBOOK_PLANS=on` e `SONGBOOK_MOCK_CHECKOUT` assente insieme.
   - **Blocco reale, trovato con un tentativo vero, non solo temuto**: scrivere una
     env var di Production da qui è **rifiutato dal classificatore della modalità
     automatica di Claude Code** ("Blocked by classifier"), stesso trattamento già
     documentato in `CLAUDE.md` per `vercel integration resource disconnect`. Provato
     con una variabile usa-e-getta innocua (`CLAUDE_WRITE_TEST`), non con
     `SONGBOOK_MOCK_CHECKOUT` stesso — bloccato comunque. Diverso dal limite già noto
     sulla *lettura* dei secret (quello riguarda `vercel env pull`); qui il blocco è
     sulla scrittura, e viene dal classificatore, non da Vercel. **Lo spegnimento
     vero del flag in produzione non posso farlo da qui**: serve un permesso esplicito
     per quel singolo comando (`vercel env rm SONGBOOK_MOCK_CHECKOUT production`, o
     l'equivalente `add` per riscriverlo a un valore diverso da `on`), oppure lo fa
     l'utente stesso dalla dashboard Vercel — stesso genere di gate umano già visto
     per la console SQL di Neon in `PLAN-account-name.md`, meccanismo diverso.

## Fuori scope, dichiarato

- **Nessun avviso di pagina** (il vecchio `NO_CHECKOUT` sopra la griglia) —
  richiesto solo il bottone per-card/per-pannello, non un banner. Se in futuro serve
  spiegare *perché* è "coming soon", si riapre come sezione a sé.
- **Nessun "avvisami quando apre"** (raccolta email, waitlist) — il bottone è statico
  per scelta esplicita, non un modulo.
- **Nessun cambio al rischio accettato in v3.13** ("il checkout finto si presenta
  come un pagamento vero senza dire che nulla è incassato") — non toccato, non
  richiesto qui, resta un rischio riconosciuto e accettato a parte.
- **`SONGBOOK_PLANS` non cambia** — resta quello che è oggi in produzione; solo
  `SONGBOOK_MOCK_CHECKOUT` si spegne.
- **Un account a metà del gate obbligatorio (v3.7) potrà uscirne solo scegliendo
  Free**, finché il checkout resta spento — conseguenza diretta e voluta di quanto
  chiesto, non un difetto: chi avrebbe scelto un piano a pagamento durante quella
  finestra si ritrova comunque con `plan_chosen_at` timbrato su Free. Registrato qui
  perché è il genere di conseguenza che altrimenti si scopre da un ticket, non
  perché richieda una correzione.

## Decisioni

| # | Scelta | Perché |
|---|---|---|
| 1 | Spegnere `SONGBOOK_MOCK_CHECKOUT` **davvero** in produzione, non solo preparare lo stato | Richiesto esplicitamente, condizionato alla verifica che registrazione e scelta Free restino percorribili |
| 2 | Bottone **statico, non cliccabile** ("Coming soon") | Zero superficie nuova da mantenere; nessuna pagina/azione dietro al bottone |
| 3 | Il pannello Lifetime riceve lo **stesso trattamento**, non resta assente | Coerenza fra le quattro card e il pannello a sé |
| 4 | `/checkout/[plan]` visitato a flag spento **aggiorna la copy** per coerenza | Chi arriva da un link vecchio legge la stessa storia delle card |
| 5 | `isCurrent`/`isLifetime` restano **veri sempre**, indipendenti dal flag | `SONGBOOK_PLANS=on` in produzione (verificato) tiene `planNamesOf` attivo indipendentemente da `mockCheckoutEnabled()` — un account già davvero abbonato smetterebbe altrimenti di vedere il proprio stato: bug reale, verificato contro il codice, non solo temuto |
| 6 | "Change billing cycle" si nasconde a flag spento, anche per chi è già abbonato | Porterebbe a un checkout comunque disattivo — stesso principio già scritto in `PLAN.md` v3.12 contro il teatro di un'azione che non fa nulla |
| 7 | "Sign up" resta **sempre** per chi non è firmato, su ogni card e su `LifetimeCta` — "Coming soon" vale solo per chi è già dentro | Corretto in fase di stesura: la prima versione proponeva "Coming soon" anche per i non firmati "per coerenza", ma avrebbe tolto quattro percorsi di registrazione dall'unica pagina pubblica che vende il prodotto — in diretto contrasto con "le registrazioni devono restare possibili" |
| 8 | `/login` non si tocca | La sua FAQ legge già `mockCheckoutEnabled()` correttamente per questa combinazione esatta di flag, verificato per lettura diretta |

## Assunzioni prese senza chiedere

- **Copy esatta non rivista con l'utente** — "Coming soon" sul bottone (parole sue),
  "These plans aren't on sale yet — check back soon." su `/checkout`: da confermare o
  correggere in fase di implementazione.
- **`notice-accent`/`role="status"` per il ramo `disabled` di `CheckoutScreen`**,
  invece di `notice-error`/`role="alert"` — non è un errore, è la stessa informazione
  neutra delle card; i rami sign-in/no-database restano `notice-error`.
- **Rimuovere la env var in produzione, non impostarla a un valore vuoto** — `===
  'on'` la legge come spenta comunque; rimuoverla evita un valore fantasma da
  ricordare in futuro. Se `vercel env rm` risultasse più delicato di `vercel env add
  ... off`, si userà quest'ultimo — entrambi comunque dietro lo stesso blocco del
  classificatore (punto 5 sopra).
- **`.btn:disabled` esiste già** (`globals.css:2184-2187`: `opacity: 0.5; cursor:
  default;`) — verificato leggendo il CSS, non assunto: il bottone "Coming soon"
  (`className="btn btn-sm plan-cta w-full" disabled`) arriva già sbiadito e inerte
  senza CSS nuovo da scrivere.

## Domande aperte

- **Come spegnere davvero `SONGBOOK_MOCK_CHECKOUT` in produzione** — bloccato dal
  classificatore per una scrittura diretta da qui (punto 5). O l'utente concede il
  permesso per quel singolo comando `vercel env`, o lo fa da sé dalla dashboard
  Vercel una volta che il resto è pronto e verificato. Tutto il resto del piano
  procede comunque: si può costruire e verificare in locale (con `SONGBOOK_PLANS=on`
  esportato) senza aspettare questa risposta.

## Chiuso in fase di scrittura (non più aperto)

- **Ordine dei rami corretto per `!signedIn`** (Decisione 7): la prima stesura
  mostrava "Coming soon" anche a chi non è loggato, per coerenza col resto della
  card — scartata prima di scrivere il codice, non dopo, perché in diretto
  contrasto con "le registrazioni devono restare possibili". "Sign up" resta il
  primo ramo controllato, sia nelle quattro card sia in `LifetimeCta`.
- **`isCurrent`/`isLifetime` verificati raggiungibili a flag spento**, non solo
  presunti: `planNamesOf` (`resolve.ts:351-376`) dipende solo da `plansEnforced()`,
  mai da `mockCheckoutEnabled()`, e `SONGBOOK_PLANS` è `on` in produzione
  (`vercel env ls production`, riga presente). Il riordino del blocco
  394-458 di `PricingPlans.tsx` era quindi una correzione a un bug reale, non solo
  un'ipotesi difensiva.
- **`.btn:disabled` esiste già** (`globals.css:2184-2187`) — il bottone "Coming
  soon" non ha bisogno di CSS nuovo.

## Trovato in fase di scrittura, non previsto dall'intervista

- **Scrivere una env var di Production è bloccato dal classificatore della
  modalità automatica di Claude Code** — provato con un tentativo vero
  (`vercel env add CLAUDE_WRITE_TEST production`), non solo temuto: rifiutato con
  "Blocked by classifier", stesso trattamento riservato in `CLAUDE.md` a
  `vercel integration resource disconnect`. Diverso dal limite già noto sulla
  *lettura* dei secret (`vercel env pull`): qui il blocco è sulla scrittura, e non
  è Vercel a rifiutarla.

- **Due bug reali sulla card Free, trovati solo dopo aver forzato `signedIn` a
  vero in una copia isolata** (non dalla sola lettura né da `tsc`, che non vedono
  questa classe di errore — due rami JSX fratelli che finiscono per rendere
  entrambi). Il blocco principale riordinato al punto 1 (`column.cta === undefined
  &&` mancava ancora quando è stato scritto la prima volta) copriva ogni colonna,
  Free inclusa — ma Free ha già le sue cinque frasi dedicate più sotto
  (`column.cta !== undefined`), pensate apposta per non passare mai da
  `checkoutPlan`. Risultato prima della correzione: da disconnessi, la card Free
  mostrava **due** bottoni "Sign up" (uno dal blocco principale, uno dal blocco
  `cta`); da firmati e non già su Free, mostrava un "Coming soon" disabilitato
  incollato sopra il vero link "Switch to Free" — contraddizione diretta, Free non
  è mai "in arrivo". Corretto avvolgendo l'intero blocco principale in
  `column.cta === undefined &&`, che lo esclude strutturalmente dalla card Free
  in ogni stato, lasciando a quella card solo le sue cinque frasi dedicate — la
  stessa invariante che il codice originale (`column.checkoutPlan !== undefined`
  come guardia unica, prima del riordino del punto 1) rispettava per coincidenza.

## Verificato, e cosa no — onestamente

- **Verificato dal vivo, da disconnessi, contro una build reale** (non solo letto):
  copia isolata con `SONGBOOK_MOCK_CHECKOUT` assente e `SONGBOOK_PLANS=on`
  esportato — la stessa combinazione di produzione dopo lo spegnimento — `npm run
  build`, poi `npm start` su una porta libera. `/register` risponde 200; `/pricing`
  da disconnessi mostra esattamente **un** "Sign up" per card e uno sul pannello
  Lifetime (5 in tutto), **zero** bottoni "Coming soon" (cercato per
  `aria-disabled="true"`, non per il solo testo: la tabella di confronto sotto le
  card usa già "Coming soon" per righe di funzionalità non ancora costruite —
  stessa parola, contesto diverso, verificato che non si confondano); `/` e
  `/checkout/standard` da disconnessi rispondono 307 (redirect a login,
  invariato); `/login` mostra esattamente la frase attesa ("...not on sale yet,
  but the limits themselves are already live...").
- **Verificato dal vivo anche il percorso da *firmati*, forzando `signedIn` a
  vero** nella sola copia isolata (mai nel repo reale): nessun modo di ottenere
  una sessione autenticata vera in questo ambiente (niente browser, e creare un
  account passa da un CAPTCHA Cloudflare che curl non può risolvere), quindi
  `const signedIn = true || email !== null` temporaneo, solo nello scratch,
  ricompilato e servito su una porta reale. Con `currentPlan` rimasto `null`
  (nessuna identità reale dietro la richiesta), ogni colonna prende il ramo più
  esposto al bug appena descritto — proprio per questo lo ha trovato. Dopo la
  correzione: Free mostra un solo "Switch to Free" (zero "Sign up" duplicati,
  zero "Coming soon"); Standard/Plus/Premium mostrano un "Coming soon"
  disabilitato ciascuno; il pannello Lifetime mostra "Coming soon" disabilitato
  — quattro `aria-disabled="true"` in tutto, contati.
- **Chiuso anche l'ultimo buco**: forzando, sempre nella sola copia isolata,
  anche `currentPlan` (oltre a `signedIn`) a `'standard'` e poi a `'lifetime'`
  — i due valori che il riordino del punto 1 doveva far sopravvivere a
  checkout spento. Con `'standard'`: Standard mostra "Your plan · Manage"
  **senza** il link "Change billing cycle" (nascosto correttamente, dato che
  `checkoutPlan` resta assente), Free mostra "Switch to Free" (un abbonato
  pagante che può ancora scendere a Free), Plus e Premium mostrano "Coming
  soon". Con `'lifetime'`: tutte e quattro le card mostrano "Included in
  Lifetime", zero "Coming soon" residui. Il pannello `LifetimeCta` legge
  `viewer.plan`/`viewer.subscriptionPlan` per conto proprio, non la variabile
  locale forzata qui, quindi in questo giro resta su "Coming soon" anche col
  secondo valore — non un problema: la sua stessa logica "già su Lifetime" è
  un semplice if/return mai toccato dal riordino che ha causato i due bug,
  già verificata a parte nel giro `signedIn`-forzato sopra.
- **Ancora non verificato dal vivo**: nessuna combinazione con un account reale
  autenticato — resta il limite d'ambiente già dichiarato (niente browser,
  CAPTCHA sulla registrazione). Ogni ramo del blocco riordinato in
  `PricingPlans.tsx`, però, è ormai stato osservato rendersi almeno una volta
  in una build reale: `!signedIn`, `isCurrent` (con e senza link di cambio
  ciclo), `isLifetime`, il bottone "Coming soon" nuovo, e le cinque frasi
  dedicate a Free.
- **Una svista propria da correggere qui**: durante la correzione dei due bug
  sopra, un `npx prettier --write` lanciato senza le opzioni del progetto (che
  non usa Prettier — solo ESLint, nessuna config Prettier nel repo) ha
  riscritto l'intero file in stile virgolette-doppie/punto-e-virgola,
  incoerente con ogni altro file del repo. Annullato subito ripartendo da `git
  show HEAD:...` e riapplicando a mano le tre modifiche di questa feature più
  la correzione dei due bug, verificato con `tsc`/`lint`/`test` e una nuova
  build/rendering dal vivo dopo il ripristino — nessuna traccia rimasta nel
  file finale, ma vale la pena annotarlo: questo repo non ha una config
  Prettier propria, quindi va evitato in futuro senza `--single-quote --no-semi`
  o equivalente.
