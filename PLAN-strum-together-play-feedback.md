# Tasto play: effetto di conferma broadcast in Strum Together — piano

> Documento a sé, non una sezione di `PLAN.md`: quella tabella è il registro delle
> decisioni già *consegnate e in produzione*, e questa feature non è ancora scritta.
> Quando è chiusa, va ripiegata lì come una nuova sezione di versione — verificare
> l'ordine di fold-in reale al momento (altri `PLAN-<feature>.md` potrebbero essere
> stati consegnati nel frattempo), non assumere che il numero di versione successivo
> sia libero.

## Cos'è

Oggi, quando chi trasmette una sessione Strum Together preme play, non c'è alcun
riscontro visivo del fatto che quel tocco ha appena spinto brano e tonalità a chi lo
sta seguendo — l'icona si limita a passare da play a pausa
(`ControlBar.tsx:166-184`), esattamente come farebbe per un lettore che non sta
trasmettendo nulla. Richiesta originale: un effetto grafico "carino" sul tasto play
che renda evidente, nel momento in cui succede, che quel tocco è stato trasmesso ai
dispositivi collegati.

## Cosa cambia, risolto nell'intervista

- **Effetto: anelli radar in espansione.** 2-3 cerchi concentrici color
  accent-soft/accent si espandono dal tasto play e svaniscono, come un ping
  radar/sonar — riprende la stessa metafora dell'icona broadcast già in uso nella
  pillola live di `StrumToggle` (`ControlBar.tsx:413-450`), invece di inventare un
  linguaggio visivo nuovo.
- **Estensione: oltre i confini del tasto**, non contenuti al suo cerchio. Scelto
  esplicitamente più drammatico della variante "contenuta", accettando che gli anelli
  si sovrappongano visivamente ai controlli vicini nella `.control-dock` (lo
  `StrumToggle` a sinistra, lo slider di velocità a destra su desktop) — innocuo
  perché puramente decorativo, vedi `pointer-events: none` più sotto.
- **Innesco: ottimista, al tocco.** Gli anelli partono nello stesso istante in cui
  l'icona passa da play a pausa, senza attendere la risposta del server —
  coerente con lo stile "fire and forget" già in uso per `broadcastPlay` stesso
  (`.catch(() => {})`, `ControlBar.tsx:177`). Rischio accettato, in due varianti
  distinte (dettaglio in "Impianto"): un fallimento di rete vero e proprio (raro), e
  un `broadcast` locale rimasto `live` oltre la finestra di inattività di 8 ore che
  il server usa per considerare una sessione ancora attiva (`IDLE_HOURS`,
  `session.ts:50,124-125`) — quest'ultimo non richiede una rete assente, solo una
  sessione lasciata aperta e inattiva a lungo, e `checkBroadcast()` non viene mai
  richiamato di nuovo dopo il mount (`StrumTogetherProvider.tsx:90-92`) per
  accorgersene da solo.
- **Ambito: solo il tasto play.** I cambi di tonalità/capotasto trasmessi durante la
  sessione (`broadcastTranspose`) restano come oggi, senza alcun effetto grafico —
  richiesta letterale, non estesa.
- **Contenuto: generico, nessun conteggio.** Solo gli anelli, senza incorporare il
  numero di dispositivi collegati in quel momento — evita di abbinare un'azione
  precisa a un numero che può essere fino a 10 secondi stantio (`AUDIENCE_MS`,
  `StrumTogetherProvider.tsx:49`).

## Impianto — dove si aggancia

- **Il segnale di gating corretto è `broadcast` da `useStrumTogether()`
  (`StrumTogetherProvider.tsx`), non la prop `broadcastEnabled`.** Quest'ultima dice
  solo "questo lettore non è un ospite" — resta vera anche per un lettore che non sta
  trasmettendo affatto in quel momento. `StrumToggle`, un sotto-componente dello
  stesso file, calcola già esattamente il booleano giusto:
  `const live = broadcast !== null && broadcast !== undefined`
  (`ControlBar.tsx:417-418`). Il componente principale `ControlBar` non chiama oggi
  `useStrumTogether()` per conto proprio — dovrà farlo, per gating gli anelli su
  `!running && broadcastEnabled && live`, mai su `broadcastEnabled` da solo: senza
  questa correzione, un lettore qualunque che preme play senza trasmettere nulla
  vedrebbe comunque gli anelli, il che sarebbe falso.
- **Stato locale transitorio**: una variabile tipo `justBroadcast` (nome da rifinire
  in implementazione), messa a `true` nello stesso ramo dell'`onClick`
  (`ControlBar.tsx:166-184`) che già chiama `broadcastPlay`, e ripulita con un
  `setTimeout` pari alla durata totale dell'animazione (o al tocco successivo).
- **Markup**: uno o più `<span aria-hidden>` decorativi accanto/dentro il bottone,
  la cui classe CSS è pilotata da `justBroadcast`.
- **CSS**: `.control-play` (`globals.css:6476`) non ha oggi `position: relative` —
  serve aggiungerla per poter posizionare gli anelli in `absolute`, centrati sul
  bottone. Colore derivato da `--accent`/`--accent-soft` esistenti (nessun nuovo
  token, rispetta la regola "un solo colore d'accento" di `DESIGN.md`). Animazione su
  `transform: scale()` + `opacity` (non su `width`/`height`), stagger tra i 2-3
  anelli, easing `cubic-bezier(0.3, 0.9, 0.3, 1)` — la stessa curva già usata da
  `rollUpIn`/`rollUpOut` (`globals.css:4049-4065`) — per restare nel linguaggio di
  movimento già presente nel codebase invece di introdurne uno nuovo.
- **Nessun problema di overflow da risolvere**: né `.control-bar`, né `.control-strip`,
  né `.control-dock` impostano `overflow: hidden` oggi (`globals.css:6303-6385`), quindi
  gli anelli che escono dal bottone (44px su desktop, il cerchio da 78px su phone,
  `globals.css:7325-7334`) non vengono tagliati da nulla già in vigore. Su phone
  questo include l'estensione **sopra** il bordo della barra, non solo lateralmente:
  `.control-play` sporge già `~19px` sopra `.control-bar` (`margin-top: -1.1875rem`,
  `globals.css:7336-7338`), quindi anelli che si espandono oltre il suo bordo finiscono
  in parte sopra il foglio della canzone, non solo dentro `.control-dock`. Coerente con
  la scelta esplicita in intervista ("espansione oltre il tasto"), ma va fissato un
  raggio massimo esplicito in implementazione — non lasciato implicito — proprio perché
  coprire il foglio va contro l'istinto di `DESIGN.md` ("niente superfici sopra il
  foglio") e qui è un'eccezione voluta, non una svista.
- **`prefers-reduced-motion: reduce`**: non basta `animation: none` — uno span
  posizionato in assoluto senza la sua keyframe si fermerebbe nello stato statico
  iniziale/finale e resterebbe un cerchio visibile, parcheggiato sul tasto per sempre.
  Il precedente citato sopra gestisce esattamente questo caso separando i due lati:
  `.hero-counter-digit-in { animation: none }` ma
  `.hero-counter-digit-out { display: none }` (`globals.css:4067-4074`). Gli anelli
  sono il caso "-out": vanno messi a `display: none` sotto reduced motion, non solo
  `animation: none` — il riscontro torna a essere il solo cambio d'icona.

## Fuori scope, dichiarato

- **Nessun effetto sul cambio tonalità/capotasto** durante la trasmissione
  (`broadcastTranspose`) — resta invariato, vedi "Ambito" sopra.
- **Nessun conteggio dispositivi** incorporato nell'animazione.
- **Nessuna conferma di ricezione lato follower** — il poll dei follower resta ogni
  4 secondi (`FollowSession.tsx`, `POLL_MS`); l'effetto rappresenta solo l'invio dal
  lato di chi trasmette, mai l'arrivo dall'altra parte.
- **Nessun cambiamento al fire-and-forget esistente di `broadcastPlay`** — resta
  `.catch(() => {})`; l'animazione non dipende dal suo esito.
- **Nessun testo/toast aggiuntivo** ("Trasmesso ai dispositivi collegati" o simile) —
  solo l'effetto grafico richiesto, coerente con la richiesta originale ("effetto
  grafico", non copy).
- **Nessun effetto lato ospite** (`FollowSession`) quando riceve un nuovo brano dal
  leader — la richiesta riguarda solo il tasto di chi trasmette.

## Decisioni

| # | Scelta | Perché |
|---|---|---|
| 1 | Effetto: anelli radar in espansione (2-3 cerchi accent-soft/accent che si aprono e svaniscono) | Riprende la metafora già in uso per l'icona broadcast, invece di un linguaggio visivo nuovo |
| 2 | Gli anelli si espandono oltre i confini del tasto, sovrapponendosi ai controlli vicini | Scelto esplicitamente più drammatico della variante contenuta; innocuo perché decorativo e non interattivo (`pointer-events: none`) |
| 3 | Innesco ottimista, al tocco — non attende la conferma del server | Risposta percepita istantanea; accettato il rischio residuo di un'animazione senza invio reale, sia per un fallimento di rete (raro) sia per un `broadcast` locale rimasto `live` oltre le 8 ore di inattività lato server (meno raro, vedi "Impianto") |
| 4 | Ambito limitato al tasto play, non esteso al cambio tonalità/capotasto | Corrisponde alla richiesta letterale ("tasto play"); `broadcastTranspose` resta fuori |
| 5 | Nessun conteggio dispositivi incorporato nell'animazione | L'audience è polled ogni 10s (`AUDIENCE_MS`), quindi un numero abbinato a un'azione precisa rischierebbe di essere stantio |
| 6 | Gating corretto su `broadcast` da `useStrumTogether()` (`live`), non sulla prop `broadcastEnabled` da sola | Emerso dalla ricerca tecnica, non dall'intervista: `broadcastEnabled` è vera per ogni lettore non-ospite anche quando non sta trasmettendo nulla in quel momento; usarla da sola mostrerebbe gli anelli a chi non sta trasmettendo — falso |

## Assunzioni prese senza chiedere

Da correggere se una è sbagliata — nessuna è irreversibile.

- **Implementazione via stato locale + CSS**, non una libreria di animazione esterna
  — coerente con il resto del codebase, che non ha oggi alcuna dipendenza di
  animazione.
- **Numero esatto di anelli, stagger in ms e durata totale** proposti come indicativi
  (2-3 anelli, stagger ~120-150ms, durata totale ~700-900ms, in linea con la preview
  scelta in intervista) ma regolabili a occhio in implementazione — "carino" non è
  un numero fissabile a priori.
- **`.control-play` guadagna `position: relative`** — verificato che nessun'altra
  regola in `globals.css` già la imposta o ne dipende diversamente.
- **Colore degli anelli derivato da `--accent`/`--accent-soft` esistenti**, nessun
  nuovo design token.
- **Nessuna interferenza funzionale con i controlli vicini**: gli anelli usano
  `pointer-events: none` e non alterano dimensioni o posizione di nessun altro
  elemento, anche quando lo sovrappongono visivamente durante l'animazione.

## Domande aperte

- **Se vale la pena far autocorreggere il `live` stantio** chiamando
  `checkBroadcast()` (già esposto dal context, `StrumTogetherProvider.tsx:32`)
  quando `broadcastPlay` fallisce o quando la pressione di play avviene dopo un
  periodo di inattività lunga, invece di limitarsi ad accettare il rischio residuo
  della finestra delle 8 ore com'è oggi — piccola aggiunta, non bloccante, da
  valutare in implementazione insieme al resto del timing.
- **Numero esatto di anelli (2 o 3) e timing preciso** (stagger, durata totale) — da
  rifinire a occhio in implementazione, non bloccante per il resto del piano.
- **Se il tasto play lato ospite** (`FollowSession`, `ControlBar` con
  `broadcastEnabled={false}`) debba un giorno guadagnare un effetto diverso quando
  riceve un nuovo brano dal leader — non discusso in intervista, la richiesta
  originale riguardava solo il lato di chi trasmette; segnalato come possibile
  estensione futura, non parte di questo piano.
