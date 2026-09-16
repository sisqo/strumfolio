# I test d'integrazione, e come si fanno

**`npm test` non è questo.** Quello è `node:test` sulle funzioni pure — decisioni, aritmetica,
copy — e gira in quindici secondi senza toccare niente. Questi comprano **davvero**: una carta,
una transazione su Paddle, un webhook che arriva, delle colonne che cambiano. Sono due cose
diverse, e la seconda è l'unica che può smentire la prima.

Vale la pena dirlo con l'esempio che l'ha dimostrato. Il 15/9/2026 `couponRefusedNotice` non
esisteva ancora e tutto quello che c'era era verde: type-check, 1706 test, build. Il difetto che
mostrava €139,99 e ne addebitava €199,99 l'ha trovato un giro dal vivo, perché nessun test puro
può accorgersi che *due strade diverse* rispondono a due domande diverse. Chi fa questi giri sta
cercando quello.

Le decisioni e il perché stanno in `CLAUDE.md` e nei commenti dei moduli. Qui c'è **come si
procede**: dove, con quali utenti, con quali coupon, come si verifica, e dove finiscono i
risultati.

## Dove si fanno, e perché non altrove

Su **`preview.strumfolio.com`**, che è l'alias del branch. È l'unico posto che ha tutti e tre i
pezzi insieme: le variabili `PADDLE_*`, un database proprio, e la notification destination del
sandbox che punta lì.

- **Non in locale.** Nessuna chiave Paddle, e soprattutto nessun webhook in ingresso: si
  comprerebbe senza che niente conceda il piano, cioè si proverebbe metà catena.
- **Mai in produzione.** `/qa` lì non esiste per costruzione, il catalogo live non esiste
  ancora, e i soldi sarebbero veri.
- **La preview è dietro l'SSO di Vercel**, custom domain compreso. Serve il browser già loggato
  (l'estensione Chrome), oppure il bypass token come *query parameter* — l'unica forma che
  funziona, vedi `CLAUDE.md`.

**Se il commit legge una colonna nuova, la migrazione va applicata alla preview *prima* del
deploy**, o la pagina che la legge sputa `column "…" does not exist` e non un difetto di
prodotto. Il database della preview è il terzo e nessuno step di deploy lo tocca:

```bash
DATABASE_URL_UNPOOLED="$(~/.config/strumfolio/preview-url)" npm run db:migrate
```

Provarla sempre prima in una transazione annullata — `BEGIN; \i drizzle/00xx.sql; …; ROLLBACK;`
— che gira il file vero sui dati veri e non lascia niente.

## Gli utenti: `/qa`

`/qa` crea un account **già verificato** e ci entra, senza mail di verifica e senza password
digitata. Perché è recintato così e cosa lo tiene fuori dalla produzione è in `CLAUDE.md`; qui
serve sapere come si usa.

- **«Create and sign in»** fa un indirizzo nuovo, `qa-<sei esadecimali>@strumfolio.test`, sul
  piano free e con il canzoniere d'esempio che ha ogni account nuovo. Il campo nome è
  facoltativo: serve solo a ritrovarsi nell'elenco.
- **Un account nuovo atterra su `/pricing`**, non sulla home. È `gate.ts` — chi non ha mai
  scelto un piano ci finisce — quindi è il comportamento vero di una registrazione, non un
  difetto del giro.
- **«Sign in» accanto a ogni account** ci riporta dentro: serve per guardare com'è finito un
  account dopo un acquisto, senza rifarlo.
- Ogni account ha la password **`QaPassword123`**, così si può provare a mano anche il form di
  `/login`. Entrare da `/qa` non manda nessuna mail di benvenuto e nessuna notifica Telegram —
  e nemmeno un accesso successivo dal form, perché `provisionAccount` trova la riga e risponde
  `false`.
- **`qa-owner@strumfolio.test`** è l'unico indirizzo che *può* diventare owner, e solo se
  qualcuno lo mette in `ALLOWED_EMAILS` dell'ambiente Preview su Vercel. Finché non c'è,
  `/coupons`, `/accounts` e `/leads` rispondono 404 anche a lui: `isOwner` legge l'ambiente e
  niente a runtime può scriverlo.

## I coupon

`/coupons` è owner-only, quindi crearne uno richiede il punto sopra. Una campagna salvata lì
crea **davvero** le entità Discount su Paddle — due, o tre se copre il Lifetime.

Per applicarne uno durante una prova basta l'URL: `?coupon=CODICE` su `/pricing` o direttamente
su `/checkout/<piano>`. Il cookie lo fa sopravvivere alle pagine successive, quindi si applica
una volta e vale per tutto il giro. `?promo=` è l'altro ingresso ed è equivalente.

Nel sandbox esiste già **`COUPON30`** — 30%, 12 mesi, copre anche il Lifetime — ed è quello che
i giri usano.

**Una campagna si riscatta una volta per account.** Per riprovare il percorso scontato serve un
account nuovo: è il motivo per cui `/qa` fa indirizzi usa-e-getta. Ed è esattamente il buco da
cui è uscito il difetto del 15/9 — un account che aveva già riscattato vedeva ancora il prezzo
scontato — quindi **provare due volte lo stesso coupon sullo stesso account è un caso da fare,
non da evitare**.

## Pagare

Carta di test di Paddle: **`4242 4242 4242 4242`**, scadenza qualunque futura (`12/30`), CVV
`100`, Paese Italia, CAP `20121`.

Il badge azzurro **«Test Mode»** dev'essere visibile in ogni scatto. È la prova, in ogni singola
immagine e senza doverci credere sulla parola, che non si sono mossi soldi veri.

## Verificare dal lato Paddle, che è chi decide

Con l'MCP **`paddle-sandbox`**, `execute`:

| Cosa | Chiamata | Cosa dice |
|---|---|---|
| L'addebito | `client.transactions.list({ per_page, order_by: 'created_at[DESC]' })` | `status`, `origin`, `discount_id`, `custom_data`, `details.totals` |
| L'abbonamento | `client.subscriptions.get(id)` | gli `items`, lo `discount` con `starts_at`/`ends_at`, il periodo in corso |
| Lo sconto | `client.discounts.get(id)` | `restrict_to`, `maximum_recurring_intervals`, `times_used` |

**La regola che conta: quando lo schermo e l'addebito sembrano in disaccordo, è la transazione
l'arbitro, non l'occhio.** E si può leggere **senza pagare**: aprire il form crea già una
transazione `draft` lato server, quindi `total` e `discount_id` dicono in anticipo cosa verrebbe
addebitato. È così che il difetto dei sessanta euro è stato provato invece che sospettato.

## Dove vanno i risultati

Nella cartella condivisa dei Parallels, una per giro:

```
/media/psf/Download/strumfolio-qa-<AAAA-MM-GG>/
├── LEGGIMI.md
├── 00-<caso-in-italiano>/
│   ├── 00-<cosa-mostra>.jpg
│   └── 01-<cosa-mostra>.png
└── 01-<caso-in-italiano>/
```

- **Una cartella per caso**, numerata, col nome in italiano che dice di cosa parla.
- **Dentro, gli scatti numerati nell'ordine in cui un lettore li incontra**, non nell'ordine in
  cui li ho fatti io.
- Se si rifà un giro nello stesso giorno, la cartella prende il commit invece della data
  (`strumfolio-qa-a01e582`).

Il **`LEGGIMI.md`** alla radice è la parte che rende la cartella leggibile fra sei mesi: la
data, l'ambiente, la carta usata, il commit degli scatti, una tabella che dice cosa c'è in ogni
cartella, e — la sezione che conta di più — **i difetti trovati e come sono finiti**.

Due abitudini che valgono:

- **Il piè di pagina di ogni schermata porta il commit**, quindi si sa sempre quale versione si
  sta guardando. Dirlo nel `LEGGIMI`, e dire quali scatti sono di un commit diverso se un caso
  è stato rifatto.
- **Gli scatti del *prima* di un difetto si tengono**, con un nome che lo dichiara. Sono la
  prova di cos'era, e sopravvivono alla correzione.

## Le trappole del browser, tutte misurate

Costano tempo ogni volta che si riscoprono.

- **Dopo aver interagito con l'iframe di Paddle** l'estensione può rispondere «Cannot access a
  chrome-extension:// URL of different extension» e non rispondere più. **Scheda nuova**, non
  insistere. Attenzione però: **il click spesso era comunque passato** — controllare da Paddle
  *prima* di rifarlo, o si compra due volte.
- **Il renderer a volte restituisce scatti duplicati o ingranditi.** Non fidarsi dello zoom del
  browser: fare uno screenshot intero e ritagliarlo in locale con `convert` (ImageMagick c'è).
- **Nella form di Paddle, `Tab` fra i campi funziona meglio dei click**, che mancano il bersaglio
  quando il layout si riassesta. Il campo della carta **non avanza da solo** dopo le 16 cifre:
  scadenza e CVV vogliono un `Tab` esplicito.
- **La rotella può ingrandire la pagina** invece di scorrerla. Scorrere con `window.scrollTo` da
  JavaScript.
- **Non giudicare colori e contrasto a occhio su uno screenshot compresso.** Il 15/9 ho detto
  due volte «le etichette sono bianche» quando erano grigio scuro, e l'ha visto l'utente. Se la
  domanda è un colore, va misurata — o va detto che non è verificata, che è sempre meglio di
  affermarla.

## Cosa non è ancora mai stato visto dal vivo

La colonna «Dal vivo» di `src/lib/plans/CASES.md` tiene il conto caso per caso. Restano fuori
famiglie intere: i rinnovi, il dunning, i chargeback, i regali e gli eventi del webhook che
nessuno ha mai fatto arrivare per davvero. Un giro che ne copre uno **aggiorna quella colonna**,
altrimenti la prossima persona lo rifà.
