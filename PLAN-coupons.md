# Coupon di campagna, e il listino che li precede — piano

> Documento a sé, non una sezione di `PLAN.md`. **Consegnato il 4 settembre 2026** — vedi
> *Costruito* sotto per i cinque punti in cui la costruzione ha corretto questo piano, e per
> cosa è stato verificato in esecuzione anziché solo compilato. Va ripiegato in `PLAN.md`
> come sezione di versione quando si farà quel giro: verificare l'ordine di fold-in reale al
> momento, non assumere che il numero successivo sia libero — diversi altri
> `PLAN-<feature>.md` consegnati aspettano lo stesso trattamento. Precedente diretto per la
> forma del documento: `PLAN-account-admin.md`.

## Cos'è

Un sistema di coupon nativo di Strumfolio: campagne promozionali espresse in
percentuale di sconto, attivabili da querystring (`?coupon=CODE` per una campagna
precisa, `?promo=1` per quella flaggata come default — l'URL che va negli annunci
AdWords) o digitabili a mano, con i prezzi su `/pricing` e `/checkout` che si mostrano
barrati quando un coupon è attivo e pieni quando non lo è. Più il gestionale CRUD
nella parte amministrativa, il conteggio dei riscatti, e la riga su `/billing` che
dice al cliente quando torna a prezzo pieno.

L'intervista ha aggiunto un prerequisito che non era nella richiesta: **il re-pricing
del listino**, primo passo e commit separato. Vedi *Fase 0*.

## I due documenti di riferimento, e dove ce ne discostiamo

Nella cartella condivisa `/media/psf/Download/`:

- **`coupon-gestionale.md`** — modello mentale, campi dell'entity Paddle, campi del
  gestionale, schema SQL indicativo, validazioni, guardrail, riconciliazione.
- **`Strumfolio_Configurazione_Commerciale.pdf`** (8 pagine, v1.0 settembre 2026) —
  listino e promo al 30% per i cinque mercati anglofoni, override valuta, architettura
  della terna di discount, struttura del catalogo Paddle, punti aperti.

Sono scritti per un mondo che non esiste ancora in questo repo, e tre loro scelte non
sopravvivono al passaggio. Vanno dichiarate qui, perché rileggendo i documenti sembrano
requisiti disattesi e invece sono conseguenze:

**1. La terna di discount non si costruisce.** Il documento la introduce con una ragione
sola ed esplicita: `maximum_recurring_intervals` conta cicli di fatturazione, non mesi,
quindi un solo discount Paddle non può bloccare 3 mesi sul mensile e 1 anno
sull'annuale. Nativamente il problema non esiste — e la decisione sulla durata lo
risolve dal lato opposto: **un solo campo in mesi**, con il numero di cicli derivato per
ciclo. `ABC` / `ABC-Y` / `ABC-LT` non nascono. Lo schema resta però la riga di campagna
che quei tre discount avranno come input il giorno di Paddle: le tre colonne
`paddle_discount_id_*` esistono da subito, vuote, esattamente come `PlanPrice.paddleId`
— «un campo vuoto è un buco visibile in una tabella, un campo mancante no».

La traduzione, il giorno in cui la si scrive, è del tutto meccanica e senza scelte da
fare: entità mensile con `maximum_recurring_intervals = discount_months`, entità annuale
con `ceil(discount_months / 12)`, entità Lifetime (`recur: false`) soltanto se
`applies_to_lifetime` è attivo. Le prime due esistono sempre, perché ogni campagna copre
sempre entrambi i cicli; la terza è l'unica condizionale. `null` in `discount_months`
diventa `maximum_recurring_intervals: null`, che in Paddle significa già «per sempre».

**2. La riconciliazione (§8) non ha nulla da riconciliare.** Nessun client Paddle esiste
in questo repo, nessun `paddleId` è popolato, `/checkout` è il mock. `last_synced_at`
esiste nello schema e resta `null`. Il job periodico non si scrive: qui la fonte di
verità *è* Strumfolio, e lo sarà finché Paddle non arriva — momento in cui il verso si
inverte e quel job diventa necessario.

**3. Il divieto dei prezzi barrati (pag. 04) non si applica a questo disegno.** Il PDF
scrive: «Nessun prezzo barrato in pagina: questi importi si comunicano come prezzo di
lancio […]. Un prezzo di riferimento mai praticato è contestabile nei mercati UK e IE».
L'obiezione è giusta per ciò che descrive — un listino sempre scontato, in cui €34.99
non lo paga nessuno. Non è ciò che si costruisce: qui €34.99 è il prezzo che paga chi
arriva senza coupon, e il barrato compare **solo** quando un coupon è attivo. Vedi
*Il barrato, e il suo limite* per il guardrail che tiene vera quella frase.

**Il PDF descrive anche un catalogo multivaluta** (28 `unit_price_overrides` su 5
mercati) e lo classifica «Bloccante». È fuori dallo scope di questo piano: `prices.ts`
ha un commento che difende l'euro-solo per iscritto, e una feature multivaluta tocca
`euro()`, ogni copy sul prezzo, e il calcolo dello sconto in ogni valuta. Va nel suo
`PLAN-<feature>.md`. Il re-pricing di *Fase 0* prende **solo la colonna EUR**.

## Fase 0 — il re-pricing

Il PDF chiude il listino su valori che il repo non ha. `prices.ts` va portato lì
**prima** dei coupon, in un commit suo.

| | `PRICES` oggi | `PRICES` dopo |
|---|---|---|
| standard / mese | `2.49` | `3.49` |
| standard / anno | `19` | `34.99` |
| plus / mese | `4.99` | `6.99` |
| plus / anno | `39` | `69.99` |
| premium / mese | `8.99` | `9.99` |
| premium / anno | `69` | `99.99` |
| `LIFETIME.amount` | `189` | `199.99` |

Nello stesso commit **spariscono da `LIFETIME`** `originalAmount`, `closesOn` e
`closesOnLabel`: il Lifetime ha oggi un meccanismo promo tutto suo (€249 barrato → €189
più la pill «Promo price valid until 31 December 2026») che il sistema coupon
sostituisce interamente. €199.99 diventa il listino secco, e €139.99 — che è
esattamente il 30% del PDF — nasce solo da una campagna che copre il Lifetime, con la
scadenza letta da `expires_at` di quella campagna.

Togliendo `closesOn` sparisce anche `lifetimeOpen()`, che è ciò che oggi fa uscire il
Lifetime dal catalogo dopo il 31/12 — blocco, bottone, e la clausola condizionale nella
meta description. Al suo posto **una riga in `app_settings`**: `lifetime_on_sale`,
`'on'`/`'off'`, assente = `on`, letta a ogni richiesta come le quattro switch Telegram,
con una sezione sua su `/app-settings`. È la stessa lezione che il commento di
`lifetimeOpen()` racconta di aver già imparato una volta convertendo una `const` in
funzione: una data scritta nel codice chiude l'offerta al primo deploy dopo quel
giorno, non quel giorno.

**Cosa il re-pricing non tocca.** Nessun cliente esistente viene riprezzato, e non
serve grandfathering: `mockPurchase` scrive `planExpiresAt` e in questo repo **nulla si
rinnova mai** — non esiste un secondo addebito da sbagliare. Gli importi già pagati
sono congelati nel `payload` di `paddle_events` e `paymentHistoryFor` li rilegge da lì,
non da `PRICES`, quindi la cronologia di chi ha comprato a €19 continua a dire €19 dopo
il re-pricing. Il giorno di Paddle il rinnovo diventa reale e quella sarà la sua
decisione, non questa.

Da aggiornare nello stesso commit: `prices.test.ts`, ogni asserzione che nomini un
importo, e i due punti che stampano prezzi (`app/pricing/page.tsx` via `PricingPlans`,
`CheckoutScreen` via `PaidCheckoutFields`). `describe()` in `app/pricing/page.tsx`
interpola già ogni numero, quindi la meta description segue da sé — ma la sua clausola
`lifetimeOpen()` va riscritta sul nuovo interruttore.

## Impianto — dove si aggancia

### Le superfici che mostrano un prezzo sono due

Verificato: `PRICES`/`LIFETIME`/`euro()` sono importati da `app/pricing/page.tsx`,
`PricingPlans.tsx`, `CheckoutScreen.tsx`, `PaymentHistoryTable.tsx`, `history.ts`,
`subscriptionCopy.ts`, `email/templates.ts`, `email/preview.ts`. Di questi mostrano un
prezzo *da pagare* soltanto **`/pricing`** e **`/checkout`** — nessuna modale
(`PlanUpgradeModal`, `FeaturePaywallModal`) stampa una cifra. `PaymentHistoryTable`
mostra importi storici e li legge dal ledger. Resta **l'email di conferma**
(`purchaseEmail`), che riceve `amount` da `mockPurchase`: è la terza superficie, e
l'unica che parla dopo l'acquisto.

Non c'è quindi una scelta di scope da fare: la superficie è chiusa, e il coupon deve
raggiungere tutte e tre.

### `src/lib/coupons/` — il modulo nuovo

Diviso come `src/lib/plans/` è diviso, e per la stessa ragione: le funzioni pure stanno
in un file plain, testabile con `node:test`, separate dai `'use server'` che possono
esportare solo funzioni async.

- **`types.ts`** — `CouponChannel` (`'paid' | 'partner' | 'winback' | 'launch'`),
  `CampaignStatus` (`'draft' | 'scheduled' | 'active' | 'exhausted' | 'expired' |
  'archived'`), i parser `readChannel`/`readPercent`, `normalizeCode`, `CAMPAIGN_*`
  label. Tutto sincrono, tutto testato.
- **`discount.ts`** — il cuore aritmetico, puro:
  - `discountedAmount(amount, percent)` — in centesimi interi, mai in float.
    `percent` in punti base (`'30'` → `3000`), risultato
    `Math.floor((cents * (10000 - bp) + 5000) / 10000)`, cioè half-up sul centesimo.
    **Verificato contro la tabella promo del PDF: tutti e sette gli importi
    coincidono** (`3.49→2.44`, `6.99→4.89`, `9.99→6.99`, `34.99→24.49`, `69.99→48.99`,
    `99.99→69.99`, `199.99→139.99`). Quella tabella diventa la fixture di
    `discount.test.ts`: se un giorno l'arrotondamento cambia, il test dice esattamente
    quale riga del PDF non è più vera.
  - `discountCycles(months, cycle)` — la derivazione mesi → cicli:
    `month` → `months`; `year` → `Math.ceil(months / 12)`; `months === null` → `null`
    (per sempre). Con `discount_months: 3` il mensile ha 3 cicli e l'annuale 1;
    con `14`, il mensile 14 e l'annuale 2. **L'annuale arrotonda sempre per eccesso a
    anni interi, a favore del cliente** — è la decisione presa in intervista, e con un
    minimo di 1 mese significa che **ogni campagna copre entrambi i cicli**: anche
    `discount_months: 1` dà un anno intero scontato sull'annuale. È la cosa più
    sorprendente di tutto il disegno, ed è la ragione per cui `applies_to_monthly` e
    `applies_to_annual` non esistono in tabella e per cui il form deve dirlo forte a chi
    compila.
  - `discountedMonths(months, cycle)` — la durata *vera* in mesi
    (`year` → `discountCycles(...) * 12`), che è ciò da cui si calcola
    `discount_ends_at`. Con `3` mesi su annuale sono 12, non 3.
  - **Quale delle due alimenta cosa, perché i nomi sono adiacenti e sbagliarlo è
    silenzioso:** `discountCycles` alimenta la **copy** — è il numero che compare nella
    frase («the first year», «the first 2 years», «the first 3 months»);
    `discountedMonths` alimenta **`discount_ends_at`** e nient'altro. Un'unica campagna
    con `discount_months: 3` dice quindi «the first year» sull'annuale e scrive una data
    a +12 mesi, che sono la stessa durata detta nelle due unità che i due consumatori
    richiedono.
  - `firstYearTotal(full, discounted, months)` — il totale reale dei primi dodici mesi
    sul mensile: `n = min(months ?? 12, 12)`, `n * discounted + (12 - n) * full`.
    Standard con 3 mesi: `3 × 2.44 + 9 × 3.49 = 38.73`, contro `41.88` a listino. Il
    tetto a 12 è voluto: la riga parla del **primo anno** e non si estende oltre, quindi
    una campagna da 24 mesi mostra lo stesso totale di una da 12 — coerente con la riga
    di durata sopra, che dice comunque «for the first 24 months».
  - `liveDiscount(columns, now)` — le tre colonne di `accounts` risolte al momento della
    lettura: `null` quando `now > discount_ends_at`. **Serve perché `discount_ends_at` è
    una data che passa da sola**: nessuno scrive nulla il giorno in cui lo sconto
    finisce, quindi senza questa funzione `/billing` continuerebbe a stampare «ABC −30%
    until 4 December 2026, then €99.99» anche il 5 dicembre, e il gestionale
    risponderebbe «sconto attivo» per sempre. È lo stesso rapporto che
    `liveSubscription`/`resolveSubscription` hanno con `plan`/`planExpiresAt`, e per la
    stessa ragione: quelle colonne non si azzerano allo scadere, si leggono attraverso
    una funzione che sa che ora è. **Ogni lettura delle tre colonne passa da qui** —
    `/billing`, `/coupons`, `/accounts/[email]`; nessuna le legge in chiaro.
  - `campaignStatus(row, now, redeemed)` — **calcolato a ogni lettura, non memorizzato**.
    `archived_at` è l'unico fatto di ciclo di vita che sta in tabella. Il documento
    prevede una colonna `status` più un job di sincronizzazione; l'architettura di questo
    repo dice il contrario a voce alta — `resolveSubscription` collassa i cambi
    programmati «at every read site instead of a cron job — there is no background job
    anywhere in this repo», e `lifetimeOpen()` è stata convertita da `const` a funzione
    proprio perché non potesse congelarsi.
  - `couponCopy(...)` — le frasi sotto il prezzo, in un posto solo. UI in inglese, come
    tutta l'app:
    - mensile, durata finita: `€2.44/month for the first 3 months, then €3.49`
    - mensile, per sempre: `€2.44/month, for as long as you stay subscribed`
    - annuale, 1 anno: `€24.49 for the first year, then €34.99`
    - annuale, N anni: `€24.49 a year for the first 2 years, then €34.99`
    - annuale, per sempre: `€24.49 a year, for as long as you stay subscribed`
    - lifetime: `€139.99 once` — nessuna durata, non si applica
  - `bannerCopy(campaign, now, lifetimeOnSale)` — **la frase del banner è derivata,
    sempre**: codice, percentuale, scadenza, e la copertura del Lifetime. Nessuna
    colonna di copy libera in tabella, per una ragione più forte dell'estetica — un
    banner composto dai fatti non può promettere ciò che lo sconto non dà, e una stringa
    scritta a mano sì. **`lifetimeOnSale` arriva come argomento e non si legge qui
    dentro**: vive in `app_settings`, e questo modulo è puro e testato con `node:test`,
    quindi la lettura la fa il chiamante. Le forme:
    - `✓ FOUNDER30 — 30% off, until 3 December`
    - `✓ FOUNDER30 — 30% off subscriptions, until 3 December` quando
      `applies_to_lifetime` è spento **e** il Lifetime è in vendita: è l'unico caso
      residuo in cui una scheda della pagina resta a prezzo pieno mentre il banner parla
      di sconto, e la parola *subscriptions* è ciò che chiude il buco. Con
      `lifetime_on_sale` spento la parola sparisce, perché non c'è niente da escludere.
    - senza `expires_at` la clausola di scadenza non si scrive: `✓ FOUNDER30 — 30% off`.
      Vedi il guardrail su *Il barrato* per perché quel caso va tenuto d'occhio.
- **`read.ts`** — le letture: `campaignByCode`, `defaultCampaign`, `redemptionCount`,
  `hasRedeemed`, `activeCouponFor(request)`. È qui che vive la regola che il cookie non
  è mai creduto: ogni lettura ri-valida codice, stato, finestra temporale, tetti,
  `entry`, e — per il solo Lifetime — la copertura, contro la tabella.
- **`actions.ts`** (`'use server'`) — `applyCoupon(code)`, `clearCoupon()`, e il CRUD
  del gestionale (`createCampaign`, `updateCampaign`, `archiveCampaign`,
  `setDefaultCampaign`), ciascuno con `isOwner(session?.user?.email,
  process.env.ALLOWED_EMAILS)` in testa, come `forceExpireNow`.

### Schema — due tabelle e tre colonne

Ventuno colonne di campagna, non le venticinque dello schema indicativo del documento.
Le quattro che non ci sono sono decisioni, non omissioni, e sono spiegate sotto il
blocco.

`discount_percent` è **`text`**, non `numeric(5,2)` come lo schema indicativo del
documento: in questo schema non esiste una sola colonna `numeric`, e gli importi sono
stringhe per scelta dichiarata in `prices.ts`. Una percentuale è la stessa specie di
fatto, e un parser in un posto solo (`readPercent`) è il pattern che il repo usa già per
`readPlan`/`readPlanStatus`.

```sql
create table coupon_campaigns (
  id                            text primary key,
  name                          text not null,          -- interno: «Lancio T4 — Google Ads»
  code                          text not null unique,   -- già normalizzato uppercase
  channel                       text not null,          -- paid | partner | winback | launch
  notes                         text,

  discount_percent              text not null,          -- '0.01' … '100'
  discount_months               integer,                -- ≥ 1; null = per sempre
  applies_to_lifetime           boolean not null default false,

  starts_at                     timestamptz not null default now(),
  expires_at                    timestamptz,
  usage_limit_subscription      integer,
  usage_limit_lifetime          integer,
  entry                         text not null default 'both',  -- url | code | both
  is_default                    boolean not null default false,
  archived_at                   timestamptz,

  paddle_discount_id_monthly    text,
  paddle_discount_id_annual     text,
  paddle_discount_id_lifetime   text,
  last_synced_at                timestamptz,

  created_at                    timestamptz not null default now(),
  created_by                    text
);

create unique index coupon_campaigns_one_default
  on coupon_campaigns (is_default)
  where is_default and archived_at is null;
```

#### Le quattro colonne che il documento ha e questo schema no

**`applies_to_monthly` e `applies_to_annual` non esistono: una campagna copre entrambi i
cicli per costruzione.** È `discount_months` (minimo 1) a dire per quanto, e la
derivazione fa il resto — N cicli sul mensile, `ceil(N/12)` anni sull'annuale. Una
campagna «solo annuale» non è quindi una campagna che si possa creare, ed è giusto così:
i due booleani avrebbero permesso di scriverne una in cui il banner promette uno sconto
che metà delle schede non mostra, e la pagina prezzi avrebbe dovuto correggere il toggle
o nascondere delle schede per ripararla. Il caso peggiore che restava è ora sparito
insieme ai campi.

`applies_to_lifetime` sopravvive, ed è l'unico dei tre, perché è l'unico piano che
`discount_months` non descrive: un pagamento unico non ha rinnovo da bloccare, quindi la
sua copertura è un fatto a sé e non una durata. Spento per default, per la ragione del
documento — uno sconto su un abbonamento costa N mesi, quello sul Lifetime costa per
sempre — ed è ciò che dà senso a `usage_limit_lifetime` separato e più stretto. È anche
la leva che il PDF nomina espressamente: non coprire il Lifetime in una campagna riporta
il Lifetime a prezzo pieno senza toccare nient'altro.

**`publicly_enterable` e `url_applicable` diventano un solo `entry`**, enum
`'url' | 'code' | 'both'`. Due booleani hanno quattro stati e uno di quei quattro
(entrambi falsi) è una campagna che nessuno può usare in nessun modo; un enum rende
quello stato non rappresentabile invece che vietato da una validazione. `is_default`
richiede un `entry` che includa `url` — una campagna default raggiunta solo a codice non
è raggiungibile da un annuncio, che è la sua unica ragione di esistere.

**`partner_name` finisce in `notes`.** Una colonna nullable che si applica a un solo
valore di `channel` è una versione più debole del campo note che esiste già, e `notes` ha
per compito esattamente quello: dire perché la campagna esiste, a chi la leggerà a
distanza di mesi. `channel` resta, come dimensione di lettura per l'elenco e per il
giorno in cui si vorrà sapere quanto ricavo è arrivato dal canale a pagamento; non
precompila nulla, e il piano lo dice apertamente sotto *Domande aperte*.

**`applies_to_plans` non c'è, e resta reversibile a basso costo.** Una campagna sconta
tutti i piani; «solo Premium» o «Standard escluso» non si esprimono. Vale la pena
scriverlo perché lo schema è già asimmetrico su quell'asse — `applies_to_lifetime` *è*
una restrizione per piano — ma il ripensamento è una colonna nullable aggiunta dopo, con
`null` che significa «tutti i piani», e nessuna campagna esistente si rompe. Non è una
porta chiusa.

#### Indici e normalizzazione

Il `code` si normalizza in uppercase alla scrittura, come `normalizeEmail` fa per le
email, così l'unicità è un vincolo del database e non una `where upper(code) = ...`
ripetuta. L'indice unico parziale è ciò che rende «al massimo una campagna default» un
fatto imposto e non una convenzione — e la condizione `archived_at is null` è quello che
permette di archiviare la default e flaggarne un'altra.

> **Da verificare a mano dopo `npm run db:generate`, prima di applicare la migrazione:**
> che il predicato `where` dell'indice parziale sia davvero uscito nel `drizzle/*.sql`
> generato. Il supporto di `uniqueIndex().on(...).where(...)` in drizzle-kit non è stato
> uniforme fra le versioni, e un `WHERE` silenziosamente perso trasforma questo in un
> indice unico su `is_default` tout court — cioè in un vincolo che **vieta la seconda
> campagna non-default**, e non si manifesta finché non se ne creano due. Se manca, si
> scrive l'indice a mano nel file di migrazione. Leggere il SQL generato invece di
> fidarsi è la stessa disciplina della sezione sul journal in `CLAUDE.md`.

```sql
create table coupon_redemptions (
  id                    text primary key,
  campaign_id           text not null references coupon_campaigns(id),
  account_owner_email   text not null,
  code                  text not null,
  discount_percent      text not null,
  plan                  text not null,
  cycle                 text,                 -- null per lifetime
  full_amount           text not null,
  paid_amount           text not null,
  discount_ends_at      timestamptz,          -- null = per sempre, o lifetime
  redeemed_at           timestamptz not null default now()
);

create unique index coupon_redemptions_once
  on coupon_redemptions (campaign_id, account_owner_email);
```

`campaign_id` ha una foreign key perché una campagna non si cancella mai — solo si
archivia (guardrail §7 del documento). `account_owner_email` **non** ce l'ha, per la
ragione che `paddle_events.account_owner_email` non ce l'ha: `deleteAccount` deve restare
possibile, e un vincolo cascaderebbe via il registro di chi ha riscattato cosa o
renderebbe l'account non cancellabile. L'indice unico è ciò che rende
`usage_limit` verificabile invece che decorativo: `times_used` è un `count(*)`, non una
stima. Con `SONGBOOK_MOCK_CHECKOUT` attivo un riscatto non costa nulla, quindi senza
questo indice lo stesso account può bruciare 500 redemption da solo.

```sql
alter table accounts add column coupon_code      text;
alter table accounts add column coupon_percent   text;
alter table accounts add column discount_ends_at timestamptz;
```

Le tre colonne sono la risposta *viva* — cosa questo account pagherà — mentre
`coupon_redemptions` è il registro di *cosa è stato pagato*. Sono scritte nella stessa
transazione della riga di riscatto, da un solo punto (`mockPurchase`), così l'unico modo
di farle divergere è SQL a mano. Si azzerano quando l'account torna a `free`
(`mockCancel` immediato, e l'applicazione di un `pendingPlan: 'free'`).

**Non si azzerano allo scadere di `discount_ends_at`, e non devono**: quella è una data
che passa da sola, senza che nessuna richiesta la osservi. Si leggono sempre attraverso
`liveDiscount(columns, now)`, che le annulla quando la data è passata — lo stesso
rapporto che `liveSubscription` ha con `plan`/`planExpiresAt`.

### Il cookie

`songbook-coupon`, che segue la convenzione dei due cookie esistenti
(`songbook-account`, `songbook-device`). Contiene il solo codice — nessuna percentuale,
nessun importo: tutto ciò che decide il prezzo si rilegge dalla tabella a ogni
richiesta, così un cookie manomesso non sconta nulla.

`Max-Age = min(expires_at − now, 30 giorni)`. Trenta giorni è la finestra di
attribuzione che AdWords usa per default, quindi cookie e dato di conversione parlano
dello stesso periodo; il `min()` è ciò che impedisce a un cookie di sopravvivere
all'offerta che porta — altrimenti un lettore torna, vede il barrato, clicca «Choose» e
il checkout gli rifiuta il codice, che è il peggior modo di scoprire che una campagna è
finita. Campagna archiviata, scaduta, esaurita, o che non copre il piano scelto: il
coupon cade in silenzio, i prezzi tornano pieni, il banner scompare.

`httpOnly` sì — nessun codice client ha bisogno di leggerlo: `/pricing` è già dinamica
per via di `loadIdentity()`, quindi la lettura server è gratuita.

### Ingresso, e chi vince

Su `/pricing` e `/checkout`, in ordine:

1. `?coupon=CODE` — una campagna precisa, se il suo `entry` include `url`. Vince sempre.
2. `?promo=1` — la campagna con `is_default` attivo, qualunque essa sia. È l'URL che va
   negli annunci: `strumfolio.com/pricing?promo=1` non cambia mai quando la campagna
   ruota, e i creativi restano validi. `is_default` richiede un `entry` che includa
   `url`, quindi questo passo non può puntare a una campagna irraggiungibile.
3. Il cookie, se già presente.

Il campo di testo del banner accetta invece solo le campagne il cui `entry` include
`code`. Una campagna `entry: 'url'` esiste dunque senza che il suo codice sia digitabile
— utile per un annuncio in cui il codice non è comunicato affatto, e per non far
finire su un sito di coupon un codice che nessuno doveva conoscere.

Entrambi i parametri **applicano subito**: il prezzo è scontato nella stessa risposta
che serve la pagina, e il banner conferma con «Rimuovi». Il click resta l'atto di
incasso per il codice digitato a mano. La decisione è deliberata — chi paga un annuncio
non vuole spendere il click per mostrare il listino — e porta con sé il limite del
paragrafo che segue.

Un `?coupon=` che non risolve (codice inesistente, campagna scaduta, esaurita, `entry`
che non include `url`) non mostra un errore a chi arriva da un annuncio: la pagina si
serve a prezzo pieno, senza banner. Un codice digitato a mano che non risolve, invece,
dice perché — è una risposta a un'azione, non a un URL.

### Il barrato, e il suo limite

Senza coupon la pagina mostra il solo listino pieno, nessun barrato in vista. Con un
coupon attivo compare `€34.99` barrato accanto a `€24.49`, più la riga di durata e —
sul mensile — il totale reale del primo anno. Ogni campagna copre entrambi i cicli, per
la costruzione di `discount_months`, quindi non esiste una schermata in cui il banner
promette e le schede degli abbonamenti smentiscono; l'unica scheda che può restare a
prezzo pieno è il Lifetime, ed è `bannerCopy` a dirlo con la parola *subscriptions*.

Regge l'obiezione di pag. 04 su due gambe: €34.99 è davvero il prezzo praticato di
default, e uno sconto legato a un codice è una riduzione individualizzata, caso che la
regola Omnibus sul prezzo più basso dei trenta giorni esclude espressamente.

**Il guardrail che tiene vera quella difesa, e va scritto qui perché non è verificabile
dal codice:** chi arriva da un annuncio non vede mai €34.99 come prezzo pagabile, solo
barrato. Se una campagna resta flaggata `default` su tutto il traffico a pagamento per
mesi, €34.99 smette di essere il prezzo reale per quella platea e l'obiezione torna a
valere per intero. La difesa regge solo se il listino pieno è davvero vivo per il
traffico organico **e** la campagna ha una scadenza reale, non nominale — cioè
`expires_at` popolato e rispettato, con la rotazione trimestrale che il PDF descrive.

`expires_at` resta **nullable per scelta**, quindi il vincolo non è imposto dal
database: una campagna senza scadenza è legittima e finisce quando la si archivia. Il
guardrail vive perciò nella prosa, e la prosa non è sufficiente — il campo dimenticato
non rompe nulla di visibile, che è esattamente ciò che lo rende pericoloso. Sostituto:
**enforcement per visibilità nel gestionale**, non per vincolo. L'elenco marca in modo
esplicito ogni campagna attiva senza `expires_at`, e la riga della campagna default
porta il contatore dei giorni da cui è accesa. Il fatto è così sotto gli occhi di chi
decide a ogni apertura della pagina, invece di essere ricordato da un file markdown.

### L'elemento fisso

Un solo componente, `CouponBar`, su `/pricing` e `/checkout`. Due stati, e la frase
dello stato attivo viene interamente da `bannerCopy` — nessun testo scritto a mano in
tabella:

```
senza coupon                         con coupon attivo
┌────────────────────────────┐       ┌──────────────────────────────────────────────┐
│ Have a code? [______] [Use]│       │ ✓ ABC — 30% off, until 3 December  [Remove]  │
└────────────────────────────┘       └──────────────────────────────────────────────┘

                                     Lifetime non coperto, e in vendita:
                                     ┌──────────────────────────────────────────────┐
                                     │ ✓ ABC — 30% off subscriptions, until 3 Dec   │
                                     └──────────────────────────────────────────────┘
```

Un componente e non due perché `PaidCheckoutFields` stampa il prezzo per conto suo: un
coupon che si fermasse su `/pricing` svanirebbe proprio al click su «Choose», che è il
punto del funnel in cui il carrello è già pieno.

Il campo di testo **c'è sempre** quando nessun coupon è attivo, indipendentemente dalle
campagne esistenti. Il gate `entry` vive in `read.ts`, che rifiuta il codice, non nella
resa del componente: un input che appare e sparisce al ruotare delle campagne dice a chi
guarda se esiste una campagna digitabile, ed è un input assente proprio davanti a chi
ha un codice partner sul volantino mentre l'unica campagna viva è `entry: 'url'`. Un
codice che non risolve dice perché, che è già la regola due sezioni sopra.

**Il mockup grafico non è ancora arrivato** — questo piano fissa comportamento e stati,
non pixel. Quando arriva, si segue alla lettera come per gli handoff di Claude Design
(vedi la sezione in `CLAUDE.md`): valori esatti, struttura esatta, copy esatta, e si
chiede prima di conservare qualcosa che il mock ha rimosso.

### Il gestionale — `/coupons`

Nuova pagina, `notFound()` se chi guarda non è owner, `dynamic = 'force-dynamic'`,
voce in `AdminPanel` accanto a `/accounts`, `/emails`, `/app-settings`, `/pages`.

Elenco con stato calcolato, percentuale, durata, riscatti su tetto, finestra temporale,
il badge «default» col contatore dei giorni, e il marcatore delle campagne attive senza
scadenza. Form di creazione e modifica con gli undici campi che l'operatore compila —
`name`, `code`, `channel`, `notes`, `discount_percent`, `discount_months`,
`applies_to_lifetime`, `starts_at`, `expires_at`, i due `usage_limit_*`, `entry`,
`is_default` — mentre tutto il resto (`id`, `archived_at`, i tre `paddle_discount_id_*`,
`last_synced_at`, `created_at`, `created_by`) è calcolato o di sistema e non si digita.

Le validazioni, imposte nell'action e non solo nel form:

- `code` univoco (uppercase, alfanumerico, senza numeri di anno o trimestre)
- `expires_at` successivo a `starts_at`, quando presente
- `discount_percent` fra `0.01` e `100`
- `discount_months` **almeno 1** quando presente; assente significa «per sempre»
- se `applies_to_lifetime`, `usage_limit_lifetime` non nullo
- se `is_default`, `entry` deve includere `url` — una campagna default raggiungibile
  solo a codice non è raggiungibile da un annuncio
- se `is_default`, il `campaignStatus` deve essere `active` o `scheduled`, mai
  `archived`/`expired`/`exhausted`. L'indice unico parziale guarda solo
  `archived_at is null`, quindi da solo non lo impedisce: `setDefaultCampaign` su una
  riga scaduta o esaurita produrrebbe un `?promo=1` che non risolve nulla, in silenzio,
  su traffico pubblicitario già pagato — il modo più costoso di sbagliare in tutto
  questo piano

Due avvisi, non due divieti — sono i punti in cui il campo compilato fa più di quanto
sembri:

- **quando `discount_months` è basso**: «1 mese sconta l'annuale per 12». È
  l'arrotondamento per eccesso deciso in intervista, ed è la cosa più sorprendente del
  disegno: dal punto di vista di chi compila, il numero digitato vale per il mensile e
  l'annuale ne prende sempre di più. Va detto accanto al campo, non scoperto dal primo
  riscatto annuale.
- **quando `discount_months` supera 12**: «questo blocca il prezzo per N anni
  sull'annuale». Il documento chiede l'avviso sopra 2 anni; con un solo campo in mesi la
  soglia si sposta a dove il campo diventa sorprendente, cioè al primo anno intero
  superato.

Le due validazioni del documento §6 che non ci sono più: «almeno uno dei tre
`applies_to_*` attivo» non ha più senso — mensile e annuale sono coperti per
costruzione — e la «copertura dei price ID» è una verifica contro il catalogo Paddle,
che è fuori scope (vedi *Fuori scope*).

I guardrail del documento §7, adottati come sono:

| Azione | Perché no |
|---|---|
| Cambiare `discount_percent` di una campagna con riscatti | Chi ha già riscattato tiene le condizioni originali: atteso e reale divergono |
| Abbassare un `usage_limit` sotto i riscatti già avvenuti | Stato incoerente |
| Cancellare una campagna | Solo archiviazione — le righe di riscatto la referenziano |
| Riusare un `code` archiviato | Finisce sui siti di coupon: riattivarlo riapre un rubinetto che si credeva chiuso |

L'archiviazione **non** toglie lo sconto a chi lo sta già applicando: impedisce nuovi
riscatti, e le tre colonne su `accounts` continuano a valere fino a `discount_ends_at`.

### `mockPurchase` — dove il coupon entra nel ledger

Oggi `logMockEvent` scrive `amount: amountFor(input.plan, input.cycle)`, e `amountFor`
ricalcola da `PRICES`. **Va cambiato in un `amount` esplicito passato dal chiamante**,
più `couponCode`, `couponPercent` e `fullAmount` nel payload. Senza questa modifica la
cronologia pagamenti riporta il prezzo di listino per un acquisto scontato — e un
cambio di listino futuro riscriverebbe la storia già scritta.

Nella stessa transazione dell'`update` su `accounts`: la riga in `coupon_redemptions`, e
le tre colonne coupon. La verifica del tetto è un `count(*)` letto prima
dell'inserimento — corsa possibile e accettata, l'indice unico limita il danno a
qualche redemption oltre il tetto e non a un doppio riscatto dello stesso account.

`purchaseEmail` riceve l'importo scontato, il codice, e la frase di durata: è il momento
in cui la promessa fatta su `/pricing` va ripetuta per iscritto, e l'aumento da €2.44 a
€3.49 al quarto addebito è esattamente il tipo di cosa che si contesta se non è mai
stata scritta a chi paga.

### `/billing`

Sotto «This account's plan», una riga letta dalle tre colonne **attraverso
`liveDiscount`**, mai in chiaro: `ABC −30% until 4 December 2026, then €99.99`, e nulla
dal giorno dopo. È l'unico posto in cui un cliente può ricontrollare la promessa, e
serve anche al gestionale per rispondere «questo account ha uno sconto attivo?» senza
aprire il ledger.

### Chi può riscattare

Nuovi clienti **e** abbonati esistenti che passano a un piano superiore — lo sconto
lavora anche sull'upgrade, che è il ricavo più economico da ottenere. Una campagna per
account, una volta sola: `coupon_redemptions_once`. Altre campagne restano disponibili
per lo stesso account.

Il piano `free` non è mai scontato: non ha prezzo.

## Fuori scope, dichiarato

- **Catalogo multivaluta** (28 override su 5 mercati, «Bloccante» a pag. 08 del PDF).
  Tocca `euro()`, ogni copy sul prezzo, e lo sconto in ogni valuta. Piano suo.
- **Client Paddle, terna di discount, riconciliazione.** Le colonne
  `paddle_discount_id_*` e `last_synced_at` esistono vuote; il codice che le popola no.
- **Applicazione reale della durata al rinnovo.** Non esiste rinnovo in questo repo.
  `discount_months` decide oggi la copy e `discount_ends_at`; il giorno di Paddle decide
  anche l'addebito. Va nel `PLAN` del webhook di rinnovo, che il PDF elenca già come
  «Da costruire».
- **Grandfathering del listino.** Nessun secondo addebito esiste da sbagliare.

## Costruito — e i cinque punti in cui la costruzione ha corretto il piano

Consegnato il 4 settembre 2026. Migrazione `0037_coupons`, modulo `src/lib/coupons/`
(`types.ts`, `discount.ts` + 51 test, `read.ts`, `actions.ts`), `CouponBar`,
`CampaignForm`/`CampaignList`, `/coupons`, `LifetimeOnSaleForm`, e il re-pricing di *Fase 0*.

Cinque cose non sono andate come scritto qui, e vanno lette come correzioni:

**1. Il cookie non lo scrive il middleware, lo scrive un'azione da un effetto.** Il piano
non diceva chi scrivesse il cookie all'arrivo da un URL, e la risposta ovvia — durante il
render della pagina — **non esiste**: Next.js permette una scrittura di cookie solo da un
server action, un route handler o il middleware. Il middleware era il candidato e è stato
scartato per tre ragioni: ha sei punti di ritorno e un commento in testa che avverte di non
semplificarne i condizionali; gira sull'edge, dove il database è irraggiungibile, quindi
`?promo=1` non sarebbe risolvibile a una campagna; e non potrebbe calcolare il `Max-Age`
consapevole della campagna. `rememberUrlCoupon` viene quindi chiamata una volta da un
effetto in `CouponBar`. Nulla in pagina la aspetta — i prezzi sono già scontati nel primo
byte di HTML — e il cookie serve solo a far sopravvivere lo sconto al lettore che torna
domani su un `/pricing` nudo.

**2. Il link al checkout porta il coupon in querystring, e non è ridondanza.** Conseguenza
diretta del punto 1: il cookie arriva dopo un round trip, quindi chi clicca «Upgrade» prima
che atterri — o ha JavaScript spento — raggiungerebbe il checkout a prezzo pieno un click
dopo aver visto lo sconto. `PricingPlans` mette `&coupon=` in tutti e tre i suoi link.

**3. `bannerCopy` riceve `lifetimeOnSale` come argomento.** La clausola *subscriptions*
dipende da una riga di `app_settings`, e `discount.ts` è puro e testato con `node:test`: la
lettura la fa il chiamante. Verificato in esecuzione — «FOUNDER30 — 30% off subscriptions,
until 3 December 2026» col Lifetime in vendita e non coperto, e «— 30% off» in tutti gli
altri tre casi.

**4. `MockSubscriptionState` guadagna un campo `discount`, già risolto.** Il piano diceva
che ogni lettura delle tre colonne passa da `liveDiscount`; il modo di garantirlo è che le
colonne grezze non escano mai da `subscriptionColumnsOf`. Quella funzione ora restituisce
`{ subscription, discount }` e il `discount` è già passato per `liveDiscount` — quindi
nessuna schermata *può* leggerle in chiaro, invece di doversi ricordare di non farlo.

**5. Il form del gestionale mostra il prezzo risultante mentre si digita.** Non era nel
piano. Calcolato con la stessa `discountedAmount` della pagina prezzi, così l'anteprima non
può lusingare la cifra vera — ed è il modo più rapido di accorgersi di una percentuale con
la virgola nel posto sbagliato.

### Verificato in esecuzione, non solo compilato

Contro il database di sviluppo e la build di produzione servita in isolamento:

- **L'indice parziale ha conservato il predicato** — `WHERE (is_default AND (archived_at IS
  NULL))`, letto da `pg_indexes`. Era il rischio principale segnalato per questa migrazione.
  E si comporta come progettato: due campagne non-default convivono, una seconda default
  viva viene rifiutata, archiviare la default libera lo slot.
- **`coupon_redemptions_once` regge**: secondo riscatto dello stesso account rifiutato, un
  altro account passa.
- **Senza coupon la pagina non ha un solo `plan-price-was`.** Con `?promo=1` ne ha tre, e la
  scheda Standard mensile stampa `€3.49` barrato, `€2.44/mo`, «€2.44 for the first 3 months,
  then €3.49.» e «€38.73 over the first year, instead of €41.88.» — la cifra che questo
  piano aveva calcolato a mano.
- **Il Lifetime coperto dà `€199.99` barrato → `€139.99`**, che è esattamente la cifra del
  PDF.
- **Campagna scaduta, esaurita, o codice inesistente: zero barrati e nessun banner**, in
  silenzio.
- **La meta description tiene i prezzi pieni** anche con un coupon applicato.

## Decisioni

Prese in intervista, in ordine di dipendenza.

| Decisione | Scelta | Perché |
|---|---|---|
| Listino | Re-pricing al PDF **incluso, come primo passo** | «Il listino è chiuso» a pag. 08; con i prezzi vecchi il 30% dà €13.30 e nessuna tabella del PDF sarebbe verificabile |
| Prezzi barrati | **Solo quando c'è un coupon**; senza coupon solo il listino pieno | Il divieto di pag. 04 descrive un listino sempre scontato; qui €34.99 è il prezzo davvero praticato di default, e uno sconto legato a un codice è una riduzione individualizzata |
| Promo Lifetime | Il coupon **sostituisce** `originalAmount`/`closesOn`; €199.99 diventa il listino secco | Un solo meccanismo di sconto in tutta l'app, e la data di fine promo smette di essere una costante da ricordarsi di spostare |
| Fine della vendita Lifetime | Interruttore `lifetime_on_sale` in **`app_settings`** | Chiude il giorno che si decide, non al primo deploy dopo una data nel codice — lo stesso problema che `lifetimeOpen()` ha già risolto una volta |
| Durata dello sconto | **Un campo in mesi** (`discount_months`), cicli derivati: mensile → N, annuale → `ceil(N/12)` anni, sempre per eccesso | Collassa i due `lock_intervals_*` del documento in uno, e risolve dal lato giusto la ragione per cui esisteva la terna di discount |
| Incasso | `?coupon=` e `?promo=1` **applicano subito**, il banner conferma con «Rimuovi»; il click resta l'incasso del codice digitato | Chi paga un annuncio non vuole spendere il click per mostrare il listino. Limite noto nel guardrail su *Il barrato* |
| Parametro default | **`?promo=1`**, parametro a sé; una sola campagna default per volta, imposta da indice unico parziale | L'URL negli annunci non cambia quando la campagna ruota, e `?coupon=` non acquisisce valori magici che diventano codici proibiti |
| Input manuale | **Un solo elemento fisso su `/pricing` e `/checkout`** | `PaidCheckoutFields` stampa il prezzo per conto suo: un coupon fermo su `/pricing` svanirebbe al click su «Choose» |
| Chi riscatta | **Chiunque, upgrade compresi, una volta per campagna** — tabella `coupon_redemptions` | Lo sconto lavora anche sull'upgrade; il limite per account rende `usage_limit` verificabile invece che decorativo, che col mock checkout attivo è l'unica cosa che lo protegge |
| Dopo l'acquisto | **Tre colonne su `accounts`** (`coupon_code`, `coupon_percent`, `discount_ends_at`) più la riga su `/billing` | È l'unico posto in cui il cliente può ricontrollare la promessa, e risponde «ha uno sconto attivo?» senza parsare il ledger |
| Durata del cookie | **`min(expires_at − now, 30 giorni)`**, codice solo, ri-validato a ogni lettura | Un cookie non può sopravvivere all'offerta che porta; 30 giorni è la finestra di attribuzione di AdWords |
| Totale annuale sul mensile | **Il totale vero del primo anno** (`€38.73 il primo anno, invece di €41.88`) | `€2.44 × 12` sarebbe falso due centimetri sopra la riga che dice «poi €3.49» |

Seconda tornata, sui campi della campagna.

| Decisione | Scelta | Perché |
|---|---|---|
| Restrizione per piano | **No `applies_to_plans`**: una campagna sconta tutti i piani | Reversibile a basso costo — colonna nullable aggiunta dopo, `null` = tutti — e nessuna campagna reale la chiede ancora |
| Copertura dei cicli | **`applies_to_monthly`/`applies_to_annual` rimossi**: `discount_months` (≥ 1) copre entrambi per costruzione | Una campagna «solo annuale» era l'unico modo di creare una schermata in cui il banner promette e metà delle schede smentiscono; togliendo i campi si toglie il caso |
| Lifetime | **`applies_to_lifetime`, default off** — l'unico `applies_to_*` che resta | È l'unico piano che una durata in mesi non descrive; è la leva che il PDF nomina per riportarlo a prezzo pieno, e ciò che dà senso a `usage_limit_lifetime` |
| Copy del banner | **Sempre derivata** da codice, percentuale, scadenza e copertura Lifetime; nessuna colonna di testo libero | Un banner composto dai fatti non può promettere ciò che lo sconto non dà; una stringa scritta a mano sì |
| Gate d'ingresso | **`publicly_enterable` + `url_applicable` → un `entry` enum** (`url`/`code`/`both`) | Due booleani hanno quattro stati e uno è una campagna inutilizzabile: un enum rende quello stato non rappresentabile invece che vietato |
| `partner_name` | **Rimosso**, assorbito in `notes`; `channel` resta | Una colonna nullable che vale per un solo valore di enum è una versione più debole del campo note che esiste già |
| `expires_at` | **Resta nullable**, nessuna validazione; guardrail sostituito da visibilità nel gestionale | Scelta dichiarata: il vincolo non c'è, ma l'elenco marca le campagne attive senza scadenza e conta i giorni della default, così il fatto è visibile invece che ricordato |
| `starts_at` | **Mantenuto**, `default now()` | La programmazione è gratis con `campaignStatus` calcolato a ogni lettura, e `'scheduled'` è già nell'enum |

## Assunzioni prese senza chiedere

- **Stato della campagna calcolato a ogni lettura**, `archived_at` unico fatto di ciclo
  di vita memorizzato. Contro lo schema indicativo del documento, con l'architettura del
  repo: `resolveSubscription`, «no background job anywhere in this repo»,
  `lifetimeOpen()` convertita da `const` a funzione per non congelarsi.
- **Arrotondamento half-up al centesimo, in una funzione sola**, in centesimi interi e
  mai in float. Validato: riproduce tutti e sette gli importi promo del PDF.
- **La durata mostrata è quella vera per quel ciclo**, non i mesi nominali della
  campagna: «3 mesi» su una scheda annuale sarebbe falso, il cliente ne ottiene 12. Come
  effetto la scheda mensile e quella annuale mostrano durate diverse per la stessa
  campagna, e l'asimmetria è visibile senza copy aggiuntiva — spinge verso l'annuale,
  che è dove il PDF vuole portare il cliente per l'incidenza della fee fissa.
- **`generateMetadata()` continua a interpolare i prezzi pieni.** Non riceve
  `searchParams`, e va bene: un link condiviso non deve portarsi dietro il coupon di chi
  l'ha copiato. Scritto qui perché non si rilegga come una dimenticanza.
- **Copy in inglese**, come tutta la UI dell'app.
- **`?coupon=` batte `?promo=1`** quando entrambi sono presenti: il codice esplicito è
  più specifico del flag.
- **Nessun nuovo flag d'ambiente.** Nessuna campagna attiva = nessuno sconto, che è già
  la condizione di riposo. `mockCheckoutEnabled()` governa già se si può comprare.
- **`coupon_redemptions_once` sopravvive alla cancellazione dell'account** (nessuna FK
  sull'email, per la ragione di `paddle_events`). Un account cancellato e ricreato non
  può riscattare di nuovo la stessa campagna — accettato, e anzi corretto: chiude il
  giro del delete-and-retry.
- **Un riscatto non blocca il cambio di ciclo.** Chi ha comprato Standard mensile con
  ABC e passa all'annuale non riscatta due volte: la riga esiste già, e le colonne su
  `accounts` si riscrivono con la durata del nuovo ciclo. Il cambio di ciclo è anche il
  posto dove l'arrotondamento per eccesso si nota: tre mesi residui sul mensile
  diventano un anno intero passando all'annuale. È coerente con la regola («l'annuale
  arrotonda sempre a favore del cliente») e va lasciato così, non corretto pro-rata: un
  pro-rata su un sistema che non ha rinnovi sarebbe complessità inventata.
- **`discount_months` resta nullable con `null` = per sempre**, accanto al minimo di 1.
  Le due cose non si escludono — il minimo è un vincolo sul valore, non sulla presenza —
  e «per sempre» è ciò che una campagna winback vorrà.
- **I due tetti d'uso restano due** (`usage_limit_subscription`,
  `usage_limit_lifetime`). Sopravvivono perché `applies_to_lifetime` sopravvive: la
  ragione del documento — un impegno permanente va limitato più strettamente di un
  abbonamento — è intatta, e il secondo tetto ha ancora l'interruttore che lo giustifica.
- **`entry` è `text` con un parser**, non un enum Postgres: nessun tipo enum esiste in
  questo schema, e `readPlan`/`readPlanStatus`/`readChannel` sono il modo in cui questo
  repo tiene un vocabolario chiuso.

## Domande aperte

- **Il mockup dell'elemento fisso**, atteso. Stati e comportamento sono fissati qui;
  struttura, misure e copy esatta si prendono dal mock quando arriva. Un caso da
  segnalare invece di risolvere in silenzio: se il mock mostra uno spazio da titolo
  promozionale — una frase che nessuna combinazione di codice, percentuale e scadenza
  può produrre — allora il mock chiede una colonna di copy libera che è stata
  deliberatamente esclusa, e va chiesto prima di aggiungerla.
- **`applies_to_plans`, differito.** Nessuna campagna può oggi limitarsi a un piano.
  Quando servirà: colonna nullable, `null` = tutti i piani, e le campagne esistenti
  restano valide senza toccarle.
- **Il testo legale.** Le quattro pagine legali nominano Paddle mentre il mock è ancora
  attivo (già tracciato in memoria come decisione aperta). Una campagna con blocco di
  prezzo a termine aggiunge una condizione che probabilmente va nominata nei ToS — da
  valutare insieme a quel nodo, non separatamente.
- **`channel` determina dei default di durata**, dice il documento, senza dire quali.
  Per ora il campo è descrittivo e non precompila nulla: i default si scrivono quando
  esistono due campagne reali che li rendono osservabili.
