# I casi di cambio piano, e come si verifica che funzionino

**Questo file è un indice, non una descrizione.** Le decisioni e il perché stanno in
`src/lib/plans/CLAUDE.md` e nei commenti dei moduli, dove sono scritte una volta sola; qui c'è
una riga per caso che dice *cosa facciamo* in poche parole, *dove* sta, e soprattutto **come si
controlla che regga**. Serve a rispondere in dieci secondi a «questo caso è coperto?» senza
leggere quattro file, e a non poter più credere che lo sia quando non lo è.

La numerazione è quella del documento d'analisi (`strumfolio-upgrade-downgrade-paddle.md`), così
le due cose si leggono affiancate. Dove abbiamo deciso **diversamente** dalla proposta di quel
documento, la riga lo dice: è il punto in cui una tabella vale più di un discorso.

`cases.test.ts` tiene onesto questo file: gira dentro `npm test`, pretende che ci siano tutti e
41 i casi e che ogni test citato qui **esista davvero** con quel nome. Rinomina un test e la
build te lo dice, invece di lasciare qui una citazione morta. È lo stesso trucco di
`gatedRoutes.test.ts`, ed è la ragione per cui questo non diventa un file di PLAN.

**Come si legge la colonna «Dal vivo».** `npm test` copre solo la parte pura — le decisioni, le
letture dei payload, le frasi. Nessun test in questo repo tocca Paddle o un browser, quindi
«Dal vivo» è l'unica colonna che dice se qualcuno l'ha **visto succedere**. `mai` non è un
difetto da correggere subito; è il conto aperto, ed è lì che vanno le ore quando ce ne sono.

Vocabolario chiuso per le due colonne di verifica, così non si può scrivere una cella vaga:

| Valore | Significato |
|---|---|
| `file.test.ts › nome del test` | quel test, in `npm test` |
| `—` | non c'è niente da testare in modo puro, o il caso è impossibile per costruzione |
| `sandbox AAAA-MM-GG` | misurato contro il sandbox Paddle quel giorno |
| `browser AAAA-MM-GG` | guardato funzionare su una pagina vera quel giorno |
| `mai` | nessuno l'ha ancora visto succedere |
| `n/d` | non si applica |

## A. Partenza da Free

| # | Caso | Come lo gestiamo | Test | Dal vivo |
|---|---|---|---|---|
| A1 | Free → piano mensile | Subito, prezzo pieno. Nuova subscription, non un update — `paddleCheckout.ts` | `paddlePrices.test.ts › names a price for every row of the listino` | `browser 2026-09-14` |
| A2 | Free → piano annuale | Come A1, sull'altro prezzo | `catalogue.test.ts › covers every paid plan in both cycles, plus Lifetime, and nothing else` | `browser 2026-09-14` |
| A3 | Free → Lifetime | Subito, una tantum, `expiresAt` nullo. Transazione senza `subscription_id` | `webhook.test.ts › grants the Lifetime, with no expiry at all` | `mai` |
| A4 | Free → Free | Un percorso c'è, ed è il passo obbligato di scelta: «Continue with Free» timbra `planChosenAt` e porta a `/thanks?chose=free`, che dal 14/9/2026 distingue «ho appena scelto» da «sono capitato qui» — senza quel parametro un conto con un piano scaduto leggeva «This plan has ended» | `—` | `browser 2026-09-14` |

## B. Partenza da piano pagato attivo

La regola che copre B2, B4, B6, B7 e B8 è una sola: **un cambio che restituirebbe denaro aspetta
la fine del periodo pagato, e solo un cambio che incassa avviene subito.** Le righe qui sotto
sono quella frase applicata, non cinque decisioni separate.

| # | Caso | Come lo gestiamo | Test | Dal vivo |
|---|---|---|---|---|
| B1 | Tier ↑, stesso ciclo | Subito, `prorated_immediately`, prorata netta | `planChange.test.ts › agrees with PLAN_RANK on every pair of paid plans` | `browser 2026-09-14` |
| B2 | Tier ↓, stesso ciclo | Pending. `do_not_bill` + stamp in `custom_data`, periodo intatto | `webhook.test.ts › writes the plan that was paid for, with the cheaper one behind it` | `browser 2026-09-14` |
| B3 | Stesso tier, mensile → annuale | Subito. Il periodo riparte, ed è il punto | `planChange.test.ts › treats yearly as the upgrade when only the cycle moves` | `browser 2026-09-14` |
| B4 | Stesso tier, annuale → mensile | Pending, e una seconda chiamata rimette `next_billed_at` sulla data pagata | `planChange.test.ts › holds a year-to-month move to the end of the year, and pins the billing date` | `browser 2026-09-14` |
| B5 | Tier ↑ + mensile → annuale | Subito. Salgono entrambe le dimensioni, non c'è niente da restituire | `planChange.test.ts › waits for exactly the moves that would give money back, whatever the tier does` | `browser 2026-09-14` |
| B6 | Tier ↓ + annuale → mensile | Pending + pin, come B4 | `planChange.test.ts › makes a drop in tier and cycle together wait, and pins the date` | `browser 2026-09-14` |
| B7 | Tier ↑ + annuale → mensile | Pending + pin. **Deciso 2026-09-14 contro la proposta** del documento, che era Pending per la ragione giusta ma senza nominarla: il credito dell'anno non goduto | `planChange.test.ts › makes a rise in tier wait when it shortens a paid year` | `browser 2026-09-14` |
| B8 | Tier ↓ + mensile → annuale | Pending + pin all'indietro. **Deciso 2026-09-13 contro la proposta** del documento, che era Subito perché incassa prima | `planChange.test.ts › makes premium/month to standard/year wait, though it bills more per period` | `browser 2026-09-14` |
| B9 | Qualsiasi piano → Lifetime | Subito, come transazione a sé. La subscription si disdice dal webhook a `next_billing_period` dopo l'incasso. **Nessun credito per la sovrapposizione**, contro la domanda aperta del documento: i giorni non sono persi, sono scavalcati | `webhook.test.ts › lets no subscription event write over a Lifetime` | `mai` |
| B10 | Cancellazione | Pending → free, nessun rimborso. È l'unica cosa che Paddle sa programmare da sé | `webhook.test.ts › reads a scheduled cancellation as a pending downgrade to free` | `browser 2026-09-14` |
| B11 | Stesso identico piano | Rifiutato con `same`, così non nasce una ricevuta che non descrive niente | `planChange.test.ts › refuses a change that changes nothing` | `browser 2026-09-14` |

## C. Quando esiste già un cambio in sospeso

| # | Caso | Come lo gestiamo | Test | Dal vivo |
|---|---|---|---|---|
| C1 | Pending + arriva un upgrade | **Divergenza voluta.** Il documento dice «azzera il pending e applica subito»; noi rifiutiamo con `pending-downgrade` e chiediamo di annullare prima su /billing, perché Paddle quoterebbe la cifra sugli item già spostati e ne addebiterebbe un'altra | `planChange.test.ts › refuses the two priced moves until the arranged change is called off` | `browser 2026-09-14` |
| C2 | Pending + un secondo cambio gratuito | Sostituisce, ristampato sempre dal piano **pagato**, così niente si accumula | `planChange.test.ts › replaces one arranged downgrade with another` | `browser 2026-09-14` |
| C3 | Pending cancellazione + ripensamento | `keepPaddleSubscription` annulla sia lo `scheduled_change` di Paddle sia uno stamp nostro | `planChange.test.ts › reads a return to the paid plan as a revert, not as an upgrade` | `browser 2026-09-14` |
| C4 | Pending downgrade + cancellazione | La cancellazione vince e `pendingPlan` diventa `free`; il piano tenuto fino alla data non cambia | `webhook.test.ts › lets a cancellation take the place of the downgrade it sits on` | `browser 2026-09-14` |
| C5 | Arriva la scadenza con un pending | `resolveSubscription` lo collassa **leggendo**, a ogni lettura. Nessun cron, nessuna scrittura al rinnovo | `entitlements.test.ts › becomes the pending plan the instant its date passes, with nothing left pending` | `mai` |
| C6 | Pending attivo, l'utente guarda il piano | Una frase con la data e la destinazione su /billing, e sul checkout una riga del riepilogo prima della pressione e di nuovo nel modale di conferma | `subscriptionCopy.test.ts › names the plan and the cycle a scheduled change lands on` · `changeSummary.test.ts › carries a change already arranged into the summary — case C6` | `browser 2026-09-14` |

## D. Lifetime

| # | Caso | Come lo gestiamo | Test | Dal vivo |
|---|---|---|---|---|
| D1 | Lifetime → downgrade o cancellazione | Non offerto. `expiresAt` nullo non dà una data su cui far scattare niente, e `mayWritePlan` impedisce anche a un evento in ritardo di toglierlo, finché il Lifetime è in vigore: uno rimborsato (`expired`) non è più protetto, o bloccherebbe ogni abbonamento comprato dopo | `planChange.test.ts › refuses Lifetime on both sides, and says which side` | `n/d` |
| D2 | Lifetime → upgrade | Non esiste nulla sopra | `types.test.ts › ranks lifetime strictly above premium` | `n/d` |
| D3 | Rimborso su Lifetime | **La buca che nient'altro copriva**: niente subscription da disdire, quindi l'account teneva il Lifetime per sempre. Ora un rimborso pieno o un chargeback scrivono `expired`, e un `chargeback_reverse` lo ridà se Paddle vince la contestazione — `plan` non viene mai cancellato, ed è questo a rendere la revoca reversibile | `entitlements.test.ts › lets it revoke a lifetime too, because refunds exist` · `webhook.test.ts › gives the plan back when Paddle wins the dispute` | `mai` |

## E. Pagamenti, rinnovi e stati eccezionali

| # | Caso | Come lo gestiamo | Test | Dal vivo |
|---|---|---|---|---|
| E1 | Rinnovo riuscito, nessun pending | `expiresAt` = fine del periodo ora pagato, mai più in là | `webhook.test.ts › writes the end of the period being paid for as the expiry` | `mai` |
| E2 | Rinnovo riuscito, con un pending | Lo stamp si ritira da solo: il nuovo periodo comincia dove finiva quello pagato. **Il caso che nessuno eserciterà a mano prima di un mese**, e il più importante da guardare quando succederà | `webhook.test.ts › is spent once the period it named has begun` | `mai` |
| E3 | Rinnovo fallito | `grace`, che ignora le date apposta: chi ha la carta che non passa è quasi sempre già oltre la scadenza | `entitlements.test.ts › keeps the full plan on a failed renewal, past date and all` | `mai` |
| E4 | Pagamento recuperato nel grace | Torna `active` e il webhook scrive il periodo nuovo | `webhook.test.ts › reads an unknown status as active rather than revoking` | `mai` |
| E5 | Grace esaurito | **Non è una finestra nostra**, ed è una decisione: niente qui sposta un account fuori da `grace`. Finisce il dunning di Paddle, arriva `canceled`, e quello vale `expired`. **La seconda metà vista il 14/9**: una disdetta immediata forzata dalla API — cosa che l'app non fa mai — è arrivata come `subscription.canceled` e /billing ha detto «Premium, expired», col pulsante di disdetta sparito. Il dunning che ci porta resta non osservato | `webhook.test.ts › ends a canceled subscription` | `browser 2026-09-14` |
| E6 | Upgrade chiesto durante il grace | Di fatto non si offre nulla: `checkoutMode` risponde `stalled` per tutto ciò che potrebbe ancora fatturare. **Unica eccezione il Lifetime** (B9), che è proprio la via d'uscita di chi ha la carta che non passa. Come *politica* il documento lo lascia aperto e lo è ancora | `planChange.test.ts › offers nothing while anything may still be running` | `mai` |
| E7 | Rimborso emesso dal supporto. **Provato dal vivo il 14/9**: un rimborso pieno su una transazione di *abbonamento* nasce `pending_approval`, porta `items[].type: 'full'` — la forma che `adjustmentEffect` legge — e non tocca la subscription, che è esattamente il non-fare che ci aspettiamo | Un rimborso **pieno e approvato** revoca — `planStatus` a `expired`, `plan` intatto. Su una subscription non facciamo nulla: la disdice Paddle. Segue la decisione che il documento aveva già preso per E9, «rimborso pieno, accesso revocato». Il cliente lo vede nel proprio storico: prima «richiesto», poi «rimborsato» col segno meno | `webhook.test.ts › revokes on a fully approved refund, and on a chargeback` · `webhook.test.ts › waits for Paddle to approve a refund, and never acts on one it refused` · `history.test.ts › says a refund is only requested until Paddle has approved it` | `sandbox 2026-09-14` |
| E8 | Chargeback | Su una subscription **la disdice Paddle** — il suo log di history registra il motivo `chargeback` — e la disdetta arriva qui come `subscription.canceled`, che vale `expired`. **Documentato, mai osservato.** Sul Lifetime, che non ha nessuna subscription da disdire, revochiamo noi leggendo l'adjustment | `webhook.test.ts › leaves every adjustment that belongs to a subscription alone` · `webhook.test.ts › revokes on a fully approved refund, and on a chargeback` | `mai` |
| E9 | Recesso 14 giorni UE/UK | Pubblicato su `/` e nei Termini, che nominano il Lifetime. Paddle è merchant of record. Tecnicamente è E7: Paddle disdice la subscription col motivo `eu_withdrawal` (**documentato, mai osservato**) e rimborsa; sul Lifetime revoca l'adjustment. È la sola ragione per cui B9 disdice a `next_billing_period` invece che subito | `webhook.test.ts › revokes on a fully approved refund, and on a chargeback` | `mai` |
| E10 | Regalo sovrapposto a un abbonamento | La direzione di un cambio si decide sulla subscription **pagata**, letta da Paddle, non sul piano effettivo, così il regalo non falsa il verso | `entitlements.test.ts › never takes anything away from a better subscription` | `n/d` |
| E11 | Regalo che scade mentre l'abbonamento vive | Il piano effettivo scende a quello pagato, senza nessun evento di fatturazione | `entitlements.test.ts › stops contributing once its own date has passed` | `n/d` |

## F. Robustezza

| # | Caso | Come lo gestiamo | Test | Dal vivo |
|---|---|---|---|---|
| F1 | Webhook duplicato | `paddle_events.event_id` è la primary key: l'insert **è** il dedup, e sta nella stessa transazione della scrittura sull'account | `—` | `sandbox 2026-09-12` |
| F2 | Webhook fuori ordine | **Divergenza nota e accettata.** Niente confronta `occurred_at`: vince l'ultimo arrivato. Le due chiamate di un cambio di ciclo producono due eventi, e invertiti lascerebbero lo stato di prima. Il rimedio, se servirà, è un confronto con l'ultimo `occurred_at` applicato per quella subscription | `—` | `n/d` |
| F3 | Webhook mai arrivato | **Non implementato.** Nessuna riconciliazione periodica contro Paddle esiste da nessuna parte | `—` | `n/d` |
| F4 | Checkout chiuso a metà | Nessun cambio di stato: niente viene scritto finché non arriva il webhook, che è anche il motivo per cui il redirect di successo non concede nulla | `—` | `sandbox 2026-09-12` |
| F5 | Doppio click sul cambio piano | Il pulsante si disabilita su `busy` per tutta la durata della chiamata, e sull'acquisto il pulsante sparisce del tutto quando si apre il form inline, che porta lui l'azione: con l'overlay `busy` tornava falso all'apertura della modale e chi aveva appena pagato guardava un «Pay» ancora vivo. **Due schede aperte non sono un doppio click** e nessun pulsante può niente: l'azione di acquisto rilegge la subscription viva e rifiuta se ce n'è una (`wouldBeSecondSubscription`), che è la stessa regola di `changePaddlePlan`. Resta scoperta la finestra prima che il webhook scriva la colonna — **e soprattutto il form già aperto**: la transazione nasce al caricamento della pagina e il pagamento nel frame di Paddle non richiama l'app, quindi due schede con due form aperti pagati uno dopo l'altro sono due subscription. Dal 2026-09-22 una scheda che completa l'acquisto chiude i form delle altre (`BroadcastChannel`, solo stesso browser) e il webhook avvisa l'operatore su Telegram (`isSecondSubscription`) senza disdire niente da solo. **Rilevato, non impedito** | `planChange.test.ts › refuses a subscription plan while Paddle says one is running` · `planChange.test.ts › sells on every answer but a confirmed live subscription, unreadable ones included` | `mai` |
| F6 | Stato divergente fra noi e Paddle | Paddle è la fonte di verità per la fatturazione: piano e ciclo vivi si leggono da lì a ogni decisione, non dalle nostre colonne | `planChange.test.ts › changes the plan of a live subscription` | `n/d` |

## Il conto aperto, in ordine di quanto costa sbagliarlo

Non è una lista di cose da fare: è cosa si rompe per primo se si rompe, letto dalle colonne
qui sopra.

1. **E2, il rinnovo che applica un cambio in sospeso.** Tutto il meccanismo «si ripaga in tempo,
   non in denaro» finisce lì, e nessun rinnovo reale è ancora scaduto. Il primo che scade va
   guardato.
2. **Che Paddle disdica davvero su chargeback e su recesso è documentato e mai visto.** Quattro
   righe qui sopra ci si appoggiano (E7, E8, E9, e per differenza D3). Se quell'inferenza fosse
   sbagliata, il caso «qualcuno tiene un piano senza averlo pagato» sarebbe ancora aperto e lo
   crederemmo chiuso. Si prova nel sandbox rimborsando una transazione di subscription.
   **La destination deve essere iscritta a `adjustment.created` e `adjustment.updated`**, o
   niente di tutto questo parte: aggiunti a quella del preview il 14/09/2026 e a
   quella live il 19/09/2026.
3. **Le schermate, che non ha mai guardato nessuno.** La branch `subscribed` di
   `/checkout/[plan]` e la riga di C6 sono compilate e testate nella parte pura, mai viste
   funzionare: servono una sessione e un preview deployment.
4. **F3, nessuna riconciliazione.** Regge finché Paddle consegna, e Paddle consegna. Ma tre
   giorni di retry esauriti sono un evento perso per sempre e in silenzio.
5. **E7 e D3**, che sono la stessa domanda non decisa vista da due lati: cosa fa il supporto
   quando rimborsa.
