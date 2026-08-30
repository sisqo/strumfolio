# Strumfolio — Piano di implementazione

> Il progetto si chiamava **songs** fino alla v2.4, quando è cambiato solo il nome
> mostrato; repo e dominio sono stati rinominati in blocco il 21 agosto 2026, in
> **Strumfolio**, con dominio proprio `strumfolio.com` (non più un sottodominio di
> `sisqo.dev`). Resta ferma in entrambi i casi la tabella `songs` nel database: è il nome
> di un brano, non del progetto — lo schema ha già una `songbooks` distinta per i
> contenitori — quindi il resto di questo piano la nomina ancora quando parla di quella,
> di proposito.

> **Stato:** da v1 a **v4.1 — i controlli sul brano** (l'ultima versione numerata qui) sono
> consegnate e in produzione su https://strumfolio.com. La
> v1.2 ha cambiato chi possiede un brano (il database, non i file — va letta prima di
> toccare il seed); la v1.3 ha aggiunto lo strato che mostra la versione del database
> sopra la pagina statica (va letta prima di toccare la lettura); la v1.4 ha portato
> l'editor in una pagina sua, con la regola che nessuna modifica può riscrivere il file
> (va letta prima di toccare il modello a blocchi).
>
> **Copertura del numero di versione, dichiarata e non completa.** Due versioni dopo la
> v3.3 — un redesign di `/login`/`/pricing` (v3.4) e una correzione di cascata sulle
> preferenze (v3.5), citate così nei commenti di `PricingPlans.tsx`, `app/pricing/page.tsx`,
> `db/schema.ts` — e tutto ciò che è stato spedito dopo la v3.9 (`/changelog`, notifiche
> Telegram, launch screen iOS, "Recently played", il redesign di `/thanks` e del menu in
> alto, `/pages`, e altro — vedi `git log`) non hanno mai avuto una voce qui: sono nate
> direttamente nel codice, senza passare da un piano scritto a parte. Colmare il buco per
> intero richiederebbe di ricostruire quella storia da commit e diff, cosa che v3.6–v3.9 non
> hanno mai richiesto, avendo già un documento da cui confluire.
>
> **Compattato il 26 agosto 2026**: la narrazione fase-per-fase che segue è stata sfoltita
> dove la stessa decisione, con il suo perché, vive già per esteso nella tabella
> corrispondente sotto *Decisioni* — quella resta la fonte del "perché", questa del "cosa
> e quando". Le domande rimaste aperte sono state tolte da qui: chi le tiene ora le traccia
> altrove, non in questo file. Due liste numerate restano intatte nella loro numerazione
> esatta (v3.1 *Niente più ospiti*, v3.2 *Si entra da soli*) perché decine di commenti nel
> codice citano un loro punto per numero (`PLAN.md point N`) — non rinumerarle né
> riordinarle senza aggiornare anche quei commenti.

## Cosa è

Un'applicazione web privata per leggere testi e accordi del proprio repertorio, pensata
prima per tablet e telefono e poi per il computer. Il compito dell'app è una sola cosa
fatta bene: **tenere il testo leggibile e le mani libere mentre si suona**. Da qui
derivano zoom, auto-scroll, cambio di tonalità e cambio di notazione — non come
impostazioni in un menù, ma come controlli a portata di pollice.

Il materiale è organizzato in **canzonieri**: ogni brano appartiene a un canzoniere, come un
file a una cartella, e la prima schermata è l'elenco dei canzonieri.

Non è un archivio pubblico né un social di accordi, ma da quando la registrazione è aperta
(v3.2) non è più a cerchia chiusa: chiunque crea da solo il proprio account e ha il proprio
repertorio privato, senza bisogno che nessuno lo ammetta. Restano, sopra, i proprietari
globali dall'ambiente (`ALLOWED_EMAILS`), con pieno controllo su ogni account
dell'installazione.

## Stato attuale

**Condizioni di partenza, prima della v1** — non lo stato di oggi. Il progetto era già in
piedi e in produzione: Next.js 15.5.19 (App Router, `src/`), TypeScript, Tailwind v3, deploy
automatico su push a `main`. Repo e dominio erano allora `sisqo/songbook` e
`songbook.sisqo.dev` — vedi la nota in testa a questo file per i due rinomini successivi;
oggi sono `sisqo/strumfolio` e `strumfolio.com`. Il contenuto era una sola pagina hello
world. Tutto ciò che segue si costruisce da qui.

## Architettura

### Stack

| Livello | Scelta |
|---|---|
| Framework | Next.js 15 App Router, React 19, TypeScript |
| Stili | Tailwind v3 (v4 impossibile in locale, vedi *Vincoli d'ambiente*) |
| Database | Postgres su **Neon via Vercel Marketplace** |
| Accesso dati | **Drizzle ORM** + `postgres.js` (vedi *Scostamenti*) |
| Auth | **Auth.js v5** (`next-auth@5`), Google + email/password, sessioni JWT |
| PWA | **Serwist** (successore mantenuto di `next-pwa`) |
| Lingua UI | Inglese (cambiata da italiano nel corso del progetto) |

### Flusso dei dati

Il DB non sta davanti alla lettura: la pagina si legge subito (statica, generata al build
da Neon), e la domanda al database — «questa canzone è cambiata?» — viene fatta dopo, e
conta solo se ha una risposta più recente (vedi *Pubblicazione*). Sono le scritture, non le
letture, a pagare l'autosuspend di Neon.

```
build      Neon ──SELECT──▶ generateStaticParams ──▶ pagine statiche + indice di ricerca
runtime    lettura  ──▶ pagina statica (o cache del service worker) ──▶ overlay dal server
           scrittura ──▶ server action ──▶ Neon
```

**Conseguenza:** le pagine statiche sono identiche per tutti e non possono contenere le
preferenze dell'utente, che si applicano lato client — gli accordi vivono nel markup come
dati strutturati e la trasposizione si applica in `useLayoutEffect` prima del paint, per
evitare un lampo nella tonalità sbagliata.

### Modello dati

Il modello di dominio (canzonieri/`songbooks`, sezioni, brani, preferenze) non è cambiato
nella sostanza dalla v2.3; `src/lib/db/schema.ts` è la fonte viva e aggiornata, con lo
stesso genere di commento di rationale che c'era qui. Punti che restano validi:

- Lo **slug** è la chiave naturale (non un id surrogato) ed è **immutabile** per un
  canzoniere: una rinomina tocca solo `name`, gratis (nessuna chiave esterna, URL o voce di
  precache da aggiornare).
- **`on delete restrict`** impedisce di cancellare un canzoniere non vuoto; la **chiave
  esterna composta** `(section_id, songbook_slug)` su `songs`, con `on update cascade`,
  rende impossibile un brano in una sezione di un altro canzoniere — misurato, non dedotto.
- **`songs.position`** è nullable: `null` = "nessuno ha ordinato ancora", e Postgres lo
  mette in fondo, quindi l'ordine alfabetico è il default senza codice apposito.
- Due tabelle rimosse nel tempo: `members` (v2.0→v3.1, l'elenco degli invitati) e `builds`
  (v1.2→v3.0, il timbro che diceva cosa era "in attesa di pubblicazione").

### Contenuti e seed

v1: i brani vivono in `content/*.chopro`, caricati da `scripts/seed.ts` (upsert per slug,
idempotente). Dalla v1.2 il regime cambia — il database diventa il padrone dei brani e il
seed diventa di solo inserimento (vedi *Import e modifica*). Il canzoniere resta
un'eccezione: la direttiva `{songbook: ...}` fissa solo il valore iniziale, poi comanda il
database; il seed non fa mai pruning dei canzonieri, perché possono esisterne creati
dall'app senza alcun file.

### Autenticazione

Auth.js v5, sessioni JWT, nessuna tabella di utenti per l'autenticazione. Due provider:
Google e email/password (v2.2, hash `scrypt`) — entrambi dimostrano solo *quale indirizzo*
sei, mai *cosa puoi fare*. Dalla v3.2 la registrazione è aperta a chiunque; l'unico ruolo
rimasto è `admin`, sul proprio account (v3.1) o su ogni account per i proprietari globali
in `ALLOWED_EMAILS` (`roleOf`, mai messo in cache — un «admin» ricordato disegnerebbe
pulsanti che poi rifiutano). Sessione **90 giorni**: un token scaduto senza rete lascerebbe
fuori dal repertorio nel momento peggiore. Middleware a protezione di tutto tranne
`/login`, gli asset statici e il manifest.

### Offline e PWA

Serwist precacha asset e pagine dei brani generate al build: installata sulla home,
l'app apre istantaneamente e a rete assente. **Punto fragile da verificare sempre**: il
precache fa richieste HTTP vere che passano dal middleware — se parte senza una sessione
valida, quelle richieste finiscono in cache sotto gli URL dei brani come redirect a
`/login`, e offline ogni brano mostrerebbe una schermata di login pur con la cache piena.
Le preferenze scritte offline finiscono in una coda in memoria svuotata online; il DB resta
l'unica fonte di verità, nessun mirror locale né logica di merge — il limite accettato è
che un reload mentre si è ancora offline perde la modifica in coda.

## Formato dei contenuti

ChordPro, con accordi inline tra parentesi quadre. Il parser produce un AST (sezioni →
righe → coppie accordo/testo) riusato da rendering, trasposizione e indice di ricerca; il
resto dello standard viene ignorato senza errori.

```
{title: Amazing Grace}
{artist: Traditional (John Newton, 1779)}
{songbook: Repertorio}       ← solo il valore iniziale, vedi Contenuti e seed
{start_of_chorus} … {end_of_chorus}

[G]Amazing [G7]grace, how [C]sweet the [G]sound
```

**Normalizzazione dei suffissi.** Il parser riduce le grafie equivalenti a una forma
canonica interna (`m`/`min`/`-` → `m`, `maj`/`ma`/`△` → `maj`, `dim`/`°` → `dim`,
`aug`/`+` → `aug`) prima di qualunque altra cosa; entrambe le tabelle di notazione
formattano da quella forma canonica, mai dal testo grezzo — altrimenti un `Cmin7` scritto a
mano non verrebbe mai mappato in `Do-7`.

## Motore musicale

### Trasposizione

Ogni accordo si scompone in `{ fondamentale, suffisso, basso }`; la trasposizione è
`(pc + n) mod 12` su una classe di altezza 0–11. Tre regole, nell'ordine in cui si
scavalcano: **senza trasposizione la grafia della sorgente si conserva** (un `Bb` in Do
resta `Bb`, mai riscritto `La#`); **trasponendo, la tonalità d'arrivo decide** l'enarmonia
secondo il circolo delle quinte (dieci semitoni sopra arriva in Sib, si legge `Ab` e mai
`Sol#`); **e la scelta ♯/♭ di chi legge (v4.1) scavalca entrambe**, a qualunque
trasposizione, zero compresa — è l'unico modo perché il controllo faccia qualcosa su un
brano che nessuno ha trasposto. La tonalità si stima dagli accordi del brano, non più un
campo salvato dalla v2.0. Il capotasto (v1.8) sottrae dalla distanza scritta prima di
sonare.

### Notazione

Il toggle IT/INT cambia insieme alfabeto delle note e stile delle sigle, due tabelle
separate coerenti ciascuna con la propria convenzione: `Cm7b5` ↔ `Do-7b5`, `Bb` ↔ `Sib`,
`Cmaj7` ↔ `Do△7`. In internazionale il display coincide col sorgente ChordPro; in italiano
no, di proposito.

### Diagrammi degli accordi

Ogni accordo sullo spartito è un bottone che apre la forma per chitarra in accordatura
standard (chitarra/ukulele, preferenza globale, v1.7). Le diteggiature stanno in
`src/lib/music/shapes.ts`, non vengono da un database esterno: una tabella corta di forme
in posizione aperta più due forme mobili (fondamentale sulla sesta o sulla quinta corda),
così le dodici tonalità sono coperte senza portarsi dietro una libreria. Ogni voce è
verificata dai test contro le note dell'accordo che dichiara di essere. Restano fuori: una
sola forma per accordo (nessuna alternativa), nessun capotasto nel diagramma, e le
alterazioni della quinta (`7b5`, `7#5`), che non si possono semplificare senza suonare una
nota sbagliata — per queste il popup mostra solo i nomi delle note.

## Interfaccia di lettura

- **Accordi sopra il testo**: ogni coppia accordo/sillaba è un `inline-block`, e le righe
  vanno a capo *fra* le unità, mai dentro — l'allineamento non si perde su schermo stretto.
- **Barra dei controlli**: fissa in fondo, ~56px. Play/pause, velocità e semitoni a un tap;
  notazione e il resto dietro `⋯`. L'header mostra la distanza da casa in semitoni, mai il
  nome della tonalità (rimosso in v2.0: è già su ogni accordo dello spartito).
- **Zoom**: stepper a 6 passi via custom property CSS, testo che rifluisce, pinch-zoom
  nativo mai disabilitato (via d'uscita di accessibilità).
- **Auto-scroll**: loop `requestAnimationFrame`, 8 velocità regolabili al volo, **Wake Lock
  API** attiva durante lo scroll (senza, lo schermo si spegne a metà brano) e rilasciata in
  pausa; un gesto manuale mette in pausa.

## Navigazione e ricerca

**Home**: elenco dei canzonieri con numero di brani, e la ricerca sopra — nessun brano
finché non si cerca, perché la prima domanda è quale canzoniere. **Pagina del canzoniere**
(`/canzonieri/<slug>`, v2.0): i brani nell'ordine in cui si suonano, e da qui si riordinano.
**Ricerca istantanea** lato client su titolo, artista, tag e testo, contro un indice
generato al build — lavora su tutti i brani, perché una ricerca non appartiene a un
canzoniere.

## Canzonieri

Un canzoniere è una **libreria**: ogni brano appartiene a uno e uno solo, come un file in
una cartella — diverso dai tag, che restano descrizioni libere e sovrapponibili. Si creano,
rinominano, spostano fra loro e rimuovono dall'app, non dai file.

Diviso in **sezioni** (v2.3): ogni brano sta in una sola, e una sezione è un oggetto del
canzoniere (nome, ordine proprio, può restare vuota), non un'etichetta sul brano — così ha
un ordine proprio e un refuso non le crea una gemella. Nella pagina partono chiuse, con due
eccezioni: una si apre da sé, e tornando da un brano si apre la sua (la piega vive in
`localStorage`, per canzoniere).

**Rotta propria** (`/canzonieri/<slug>`, v2.0): lo slug è immutabile, quindi una rinomina
non sposta la rotta — l'obiezione che l'aveva rimandata era falsa in questo schema.
`/canzonieri` resta la schermata di gestione (crea/rinomina/rimuovi); la rimozione rifiuta
un canzoniere non vuoto e chiede prima dove spostare i brani. Il riordino dei brani si fa
dalla card aperta in home (v1.6); niente coda offline per queste scritture, perché i
canzonieri sono struttura condivisa e un last-write-wins fra dispositivi non sarebbe
innocuo come su una preferenza personale.

**Guscio statico, dato mutabile**: le pagine restano statiche e precachate; nomi dei
canzonieri e assegnazione dei brani vivono in uno strato runtime letto dopo il mount e
tenuto in cache locale (poche centinaia di byte), lo stesso meccanismo delle preferenze —
`revalidatePath()` da solo non basterebbe, perché il service worker serve cache-first.

I canzonieri di partenza sono stati ricavati dai tag già in uso (`repertorio`, `da
imparare`), scritti come direttive nei file così un database ricreato da zero dà lo stesso
risultato.

## Import e modifica

Una schermata per incollare testo e farne un brano, più modifica e cancellazione — al posto
dell'editor `/admin` immaginato per la v2. Dalla v1.2 **il database è il padrone** dei
brani (non più i file): il seed diventa di solo inserimento, non può più aggiornare né fare
pruning, e la cancellazione deve esistere nell'app perché non c'è più un file da eliminare.

**Cosa si incolla**: prima il canzoniere di destinazione (vince su un `{songbook:}` nel
testo), poi un campo di testo che riconosce da sé il formato — ChordPro passa così com'è,
altrimenti si tenta la conversione da «accordi sopra il testo» (euristica: una riga conta
come accordi solo se *tutti* i suoi token lo sono). Sbaglierà su qualche sorgente, per
questo il salvataggio è sempre dietro una preview con il corpo ChordPro modificabile a
mano.

**Più brani in una pasta**: divisi solo su segni espliciti (`---`, `{new_song}`, un secondo
`{title:}`, mai una riga vuota) — trovati più brani, ognuno arriva come riga modificabile e
si salva in sequenza, con esito proprio per riga (salvato / già in archivio / errore).
**Duplicati** (stesso titolo e artista): sostituisci (conserva lo slug, quindi le
preferenze salvate), aggiungi comunque, o annulla.

**Pubblicazione** (v1.3, in risposta a un bug reale: salvare non cambiava nulla a schermo).
Le pagine restano statiche, con uno strato runtime sopra che confronta `songs.updated_at`
del database con la versione con cui la pagina è stata generata — niente timbri né orologi
del browser, e un salvataggio restituisce sempre la riga scritta, non l'input passato. Lo
stato «in attesa» è quel confronto, non una colonna: un deploy per altri motivi pubblica
comunque i brani in attesa.

**Export**: «Scarica tutto» produce un archivio `.chopro` (nessun token, copia a carico di
chi se ne ricorda); il ripristino è lo stesso seed di solo inserimento. Un secondo export
"organizzato" da sfogliare (per canzone o per sezione) non esiste ancora; se mai costruito
dovrà restare distinto da questo e non toccarlo, perché questo è anche il percorso di
ripristino.

Un effetto da conoscere: se cancelli un brano dall'app e il suo file è ancora in
`content/`, il prossimo `npm run seed` lo **reinserisce** — comportamento corretto per un
comando che significa «carica ciò che manca», ma i quattro file segnaposto andranno
rimossi dal repo quando entra il repertorio vero, o risorgeranno a ogni ripristino.

## Preferenze

| Preferenza | Granularità | Dove |
|---|---|---|
| Trasposizione (semitoni) | per brano | `user_song_prefs` |
| Velocità auto-scroll | per brano | `user_song_prefs` |
| Capotasto | per brano | `user_song_prefs` |
| Zoom | globale | `user_prefs` |
| Notazione IT/INT | globale | `user_prefs` |
| Strumento (chitarra/ukulele) | globale | `user_prefs` |
| Come si mostrano gli accordi | globale | `user_prefs` |
| Alterazioni ♯/♭ (v4.1) | globale | `user_prefs` |

Tutte sul DB, sincronizzate fra dispositivi, con la coda offline descritta sopra. Scritture
debounced (2s) via server action.

## Fasi

### v1 — lettura

Fondazione: Neon + Drizzle, Auth.js con Google e un'allowlist, parser ChordPro → AST,
pagine statiche (lista, brano, scaletta) con accordi renderizzati sopra il testo, barra
controlli (zoom, trasposizione, notazione), auto-scroll con wake lock, preferenze su DB con
coda offline, ricerca client-side, PWA con Serwist.

### v1.1 — canzonieri

La prima scrittura dall'app, su una superficie minima: nomi e appartenenza, non i brani.
Migrazione additiva (`canzonieri`, `songs.canzoniere_slug` nullable poi stretta a
`not null`), direttiva `{canzoniere:}` nel parser, gestione da `/canzonieri` con
spostamento obbligato prima di rimuovere. Rinomina e spostamento verificati sopravvivere a
un `npm run seed` che rileggeva ancora file col vecchio nome. Rationale in *Decisioni*.

### v1.2 — import e modifica

Il cambio di regime: il database diventa il padrone dei brani. Tabella `builds` (poi
rimossa in v3.0) per il timbro di "in attesa"; seed a solo inserimento; convertitore
«accordi sopra il testo» → ChordPro; `/importa` con preview e salvataggio; rilevamento
duplicati; modifica e cancellazione; export «Scarica tutto» col seed come via di ripristino.
Rationale in *Decisioni*.

### v1.3 — le modifiche si vedono subito

In risposta a un bug reale: salvare non cambiava nulla a schermo. Soluzione a una sola
regola, pura e testata: confrontare `songs.updated_at` con la versione con cui la pagina è
stata generata, mai un timbro o un orologio del browser — un salvataggio restituisce la
riga scritta, non l'input passato. Verificato **battendo il precache di produzione**, non
evitandolo: con il service worker installato, la pagina in cache mostra ancora la versione
vecchia mentre lo schermo già mostra la correzione.

### v1.4 — editor e icone

L'editor esce dalla pagina del brano e diventa una pagina sua (`/canzoni/<slug>/modifica`),
non statica e non precachata, con tre modalità sopra un'unica sorgente a blocchi (uno per
riga del file, con `toSource(fromSource(x)) === x` per garanzia di round-trip — nessuna
riga, come `{new_song}`, va persa al salvataggio): **Grafico**, **Sorgente**, **Anteprima**.

**La copia nascosta**, la soluzione più notevole: gli accordi devono stare sopra la
sillaba giusta dentro un `input` (che non ha nodi di testo su cui appendere niente), quindi
sotto la riga di accordi c'è una copia invisibile delle stesse parole nello stesso font, e
il browser stesso fa la misura — verificato con un righello indipendente, scarto **0,0 px**
su ogni accordo. La stessa idea vale al contrario (da un tocco alla lettera sotto il dito)
misurando con un canvas nello stesso font.

### v1.5 — l'header sempre uguale, e l'import di più brani

Il marchio torna a comparire sempre nell'header (spariva sulla pagina del brano, quella
usata più a lungo, in standalone senza cornice del browser). In `/importa`, il canzoniere
di destinazione diventa il primo campo, non l'ultimo dopo l'analisi; un testo con più brani
(divisi solo su segni espliciti: `---`, `{new_song}`, un secondo `{title:}`, mai una riga
vuota) diventa una riga per brano, modificabile e salvata in sequenza, ognuna col proprio
esito.

### v1.6 — una via sola per il brano accanto, e l'ordine in mano

Le due card "brano precedente/successivo" in fondo allo spartito spariscono (le frecce
nell'header portavano già agli stessi due posti). Nuova colonna `songs.position`,
nullable e senza default — Postgres mette i null in fondo, quindi la migrazione non sposta
nulla finché nessuno trascina — riordinabile dal canzoniere aperto in home, col dito
(eventi puntatore, l'unica API che funziona su un touchscreen) o da tastiera.

### v1.7 — i comandi fermi, l'ordine dell'import, l'ukulele

I comandi dell'editor diventano un blocco sticky invece di scorrere con la pagina; i brani
importati in una pasta restano nell'ordine in cui sono stati incollati; un nuovo strumento
(chitarra/ukulele, preferenza globale) cambia solo la *forma* del diagramma, mai l'accordo
sullo spartito — la tabella dell'ukulele è generata da una ricerca verificata contro le
note di ogni accordo, non scritta a mano.

### v1.8 — capotasto

`user_song_prefs.capo`: lo spartito mostra le forme da fare, non gli accordi che suonano
davvero (`letto = scritto + semitoni − capotasto`, `sonante = scritto + semitoni` — una
sottrazione testata a parte, perché sbagliata di segno resta plausibile a schermo). Un
suggerimento propone il tasto che rende aperti più accordi del brano, mai applicato da sé.

### v1.9 — la modifica ridisegnata

Da un handoff di Claude Design che completa il ridisegno già fatto per lettura, elenchi e
barra: testata dell'editor su una riga, le tre modalità e i comandi come icone (con
`title`/`aria-label` a portare il nome), *Elimina* come unico controllo scuro dell'app.

### v2.0 — utenti, e tre cose in meno

Cinque richieste, tre delle quali **rimozioni**: scalette (mai diventate scrivibili, due
gusci vuoti nel database), la colonna `original_key`, e le funzioni che le servivano.

**Chi può entrare, dall'app** (poi superato, v3.1/v3.2): nuova tabella `members` e
schermata `/utenti`, con i **proprietari** da `ALLOWED_EMAILS` (l'app non può scriverla,
quindi non ci si può mai chiudere fuori) e gli **invitati** dalla tabella, incontrati in
una funzione sola, `isAllowed`, per login e guardia di scrittura insieme.

**La tonalità non è più un campo** salvato: si stima dagli accordi, con lo stesso
estimatore già usato dall'import — misurato prima di far cadere la colonna, sui ventuno
brani con una tonalità salvata la stima ne ha indovinate **ventuno su ventuno**.

**La home diventa l'elenco dei canzonieri**, ciascuno con la propria pagina; dal brano si
torna al canzoniere con una pastiglia nell'header.

### v2.1 — ruoli

Tre ruoli, sulla linea di cosa possono **cambiare**: admin tutto, editor il repertorio,
viewer niente di condiviso (poi ridotti a un solo ruolo, v3.1). I proprietari sono admin
per definizione (`ALLOWED_EMAILS` non scrivibile dall'app, quindi non retrocedibili). Le
**preferenze non sono modifiche** — trasposizione, capotasto, velocità, notazione restano
aperte a ogni ruolo. Il ruolo **non entra nel token** di sessione (90 giorni: lo terrebbe
stantio) né va mai in cache — le guardie rileggono la tabella a ogni azione.

### v2.2 — email e password

Un secondo modo di entrare, accanto a Google. **`credentials` è una tabella a parte**, non
una colonna su `members`: risponde solo *come dimostri l'indirizzo*, mai *se puoi essere
qui*. **scrypt dalla libreria standard** (niente bcrypt): 34 ms per un hash, 30 ms per una
verifica. **Il login non distingue mai i suoi rifiuti** — password sbagliata, indirizzo
senza password, indirizzo fuori elenco danno la stessa frase, verifica a tempo costante
anche quando la riga non esiste.

### v2.3 — sezioni

Il canzoniere si divide, e ogni brano sta in una sezione sola. **La coerenza la garantisce
il database**: chiave esterna composta su `songs`, `on update cascade` — misurato su uno
schema di prova prima di scriverlo — rende impossibile un brano in una sezione di un altro
canzoniere. Una sola azione (`arrangeCanzoniere`) scrive ordine delle sezioni, ordine dei
brani e sezione di ogni brano in una transazione. Il ritorno da un brano usa un frammento
URL (`#brano-<slug>`), non un parametro, perché un frammento non passa dal service worker.

### v2.4 — Songbook

Un nome e un payoff, non una funzione: **songs** diventa **Songbook** («Where every fire
needs a melody», mai tradotto), fonte unica in `lib/brand.ts`. **`/login` diventa anche la
pagina pubblica del progetto**, perché lo era già per costruzione: sotto il modulo di
accesso, una vetrina di sei caratteristiche verificabili nel codice.

### v2 — il resto

Restava: scalette modificabili dall'app, allowlist su tabella, ordinamento manuale dei
canzonieri. La v2.0 ha chiuso le prime due — l'allowlist è diventata una tabella con la sua
schermata, le scalette sono state **rimosse** invece di essere finite. Resta l'ordinamento
dei canzonieri, oggi solo alfabetico.

### v3.0 — account

Finora un solo repertorio condiviso: canzonieri, sezioni e brani erano tabelle globali, e
`members`/`ALLOWED_EMAILS` decidevano solo chi poteva vederlo o modificarlo. Questa
versione rompe quel presupposto — **ogni persona ammessa nell'app ha un proprio spazio**,
con i propri canzonieri, e può essere invitata come collaboratrice nello spazio di
qualcun altro (i collaboratori spariranno di nuovo in v3.1). Il cancello d'ingresso non
cambia; cambia solo cosa trova chi entra. Rationale delle scelte sotto in *Decisioni*.

**Nuova tabella `accounts`** (`ownerEmail` chiave primaria). **Lo slug resta globale**, non
composto con l'account (perché, in dettaglio: *Decisioni* → *Account (v3.0)* → "Unicità di
slug e brani"). **`roleOf` accetta l'account bersaglio**: admin se
l'email è proprietaria globale *o* proprietaria di quello specifico account, altrimenti la
riga in `members` per quell'account (mai `admin`). La provisione (crea la riga, clona
l'Example) gira a ogni sign-in riuscita, idempotente. L'account corrente vive in un
**cookie separato dal token di sessione**, sempre riverificato lato server.

**Scoperta durante l'implementazione, non prevista dall'interview: slug globale + pagine
statiche è una fuga di privacy.** Con lo slug globale, `/songs/[slug]` e `/songbooks/[slug]`
generate a build time restavano raggiungibili da chiunque fosse autenticato, non solo da
chi aveva accesso all'account proprietario — e il precache d'installazione aggravava la
cosa scaricando ogni canzoniere su ogni dispositivo. Risolto nella stessa consegna: le
pagine diventano **dinamiche** (`force-dynamic`), ogni caricamento verifica l'accesso
*prima* di restituire qualunque dato, con `notFound()` indistinguibile fra "non esiste" ed
"esiste ma non è tuo". Da qui anche la fine di `builds` e del pannello "in attesa di
pubblicazione": con pagine dinamiche un salvataggio è live all'istante. L'offline si
ricostruisce senza un precache unico — warm-up per-lettore che copre solo gli account a
cui chi legge ha accesso.

**Migrazione**: il repertorio unico di oggi diventa l'account di f.limberti@gmail.com
(l'altro proprietario globale riceve il proprio account vuoto al prossimo login, come
chiunque altro).

### v3.1 — niente più ospiti

La v3.0 aveva introdotto, accanto all'account personale, la possibilità di invitare
collaboratori — editor o viewer — nell'account di qualcun altro. Questa versione la toglie:
**un account è un indirizzo email, e un indirizzo email è un account**, senza eccezioni.
L'unico ruolo sopra "il proprio account" resta il proprietario globale (`ALLOWED_EMAILS`):
crea ed elimina account per conto di altri indirizzi, entra in ognuno con pieno controllo,
ma non può più esistere una terza persona che vede un account senza esserne proprietaria.

**Non basta "restringere l'accesso alla pagina Accounts".** La pagina serve anche a un
secondo pubblico — chi collabora su più account passa dall'uno all'altro da lì — e quel
pubblico sparisce del tutto: la sezione "Yours" e `listMyAccounts` non si semplificano, si
tolgono.

**Il rischio nascosto, trovato mappando il codice prima di scrivere il piano.**
`isAdmitted()` ammetteva un indirizzo se proprietario globale *o se aveva una riga in
`members`* — che sparisce. Le due cose devono cambiare nello stesso rilascio, punti 1 e 4
sotto, o ogni indirizzo ammesso solo tramite invito perde l'accesso appena questa versione
va in produzione.

Numerazione **citata per punto da commenti nel codice** (`provision.ts`, `actions.ts`,
`DeleteAccountButton.tsx`, `migrate-guest-emails.ts`) — non rinumerare:

1. **`isAdmitted` guadagna una seconda condizione, al posto di `members`**: l'indirizzo ha
   già una riga in `accounts` (come proprietario).
2. **`provisionAccount(email)` non cambia nella sostanza** — resta la stessa funzione
   idempotente chiamata a ogni sign-in riuscito, ma diventa anche l'azione che gira quando
   un proprietario globale preme "crea" sulla pagina Accounts: stessa funzione, due modi di
   invocarla.
3. **`roleOf` si riduce a un solo ruolo concedibile.** O è la proprietaria dell'account (o
   una proprietaria globale), ed è `admin`, oppure `null`. `canEdit(role)` ora equivale a
   `role === 'admin'`.
4. **Tolto per intero**: la tabella `members`, `src/lib/members/*`, `MemberManager.tsx`, la
   pagina `/utenti`, i casi editor/viewer nei test, il testo su ruoli e inviti nella pagina
   di login.
5. **`accounts/current.ts`, `read.ts`, `actions.ts` perdono il parametro `memberships`**:
   un indirizzo può aprire un account solo se è il suo o se è proprietario globale.
6. **La pagina Accounts ha un solo pubblico**: i proprietari globali, un solo elenco, con
   *Entra*, *Crea* (riusa `provisionAccount`) ed *Elimina* per riga.
7. **Eliminare un account è una cascata immediata**, senza blocco se non è vuoto —
   canzoniere per canzoniere, poi le trasmissioni Strum Together aperte, poi la riga in
   `accounts` — tutto in una transazione. **L'unica rete di sicurezza è nell'interfaccia,
   non nel database**: va ridigitato l'indirizzo prima che il pulsante funzioni.
8. **Strum Together non cambia nel meccanismo**, ma avviare una trasmissione richiede ora
   "admin sull'account aperto" invece di "editor o admin".
9. **Migrazione dei quattro indirizzi ammessi solo tramite `members`**: ciascuno riceve un
   proprio account (stesso `provisionAccount`, eseguito da script prima del deploy) —
   nessuno vede più il repertorio condiviso, ripartono con un proprio Example.

Rationale completo per riga in *Decisioni*, tabella *Niente più ospiti (v3.1)*.

### v3.2 — si entra da soli

Finora ogni account nasceva per mano di qualcuno con potere di farlo: un proprietario
globale al primo login, o un altro proprietario globale che lo crea da Accounts (v3.1).
Questa versione apre la porta per davvero: **chiunque, con qualunque indirizzo email**,
può crearsi un proprio account da solo — con Google o con email e password — senza che
nessun admin debba fare nulla. Scelto esplicitamente, rischio discusso e mitigato nei
punti 8 e 9: non è più un'app per una cerchia chiusa, è un prodotto che chiunque trova.

`ALLOWED_EMAILS` non è più il cancello d'ingresso — non lo è mai stato per tutti dalla
v3.0, ma ora smette di esserlo anche per il caso base. Resta esattamente quello che è
sempre stato per il resto: la lista di chi è proprietario globale.

Numerazione **citata per punto da decine di commenti nel codice** (`auth.ts`, `verify/*`,
`register/*`, `forgotPassword/*`, `rateLimit.ts`, `captcha.ts`, e altri) — non rinumerare:

1. **Il cancello non serve più.** `admitted()`/`isAdmitted()` vengono ritirate, non
   semplificate: la callback `signIn` chiama `recordSignIn` e `provisionAccount` per
   chiunque un provider abbia già autenticato con successo. Un controllo resta: il profilo
   Google deve dichiarare `email_verified`.
2. **Registrarsi con Google è già registrarsi.** OAuth non distingue "entra" da
   "iscriviti": il pulsante "Sign in with Google" di `/login` è anche il modo per
   registrarsi, nessun secondo pulsante — alla prima riuscita, `provisionAccount` crea
   l'account.
3. **Registrarsi con email e password è in due tempi.** Una tabella
   `pendingRegistrations` tiene una richiesta finché non è verificata — **non è un
   account**: nessuna riga in `accounts`/`credentials`, nessun canzoniere clonato, finché
   il link di verifica non viene cliccato.
4. **La pagina `/register`.** Stesso impianto di `/login`: pulsante Google (punto 2) e un
   modulo email/password/conferma, col CAPTCHA del punto 9.
5. **Verifica: `/verify?token=...`.** Il token si confronta come una password, mai in
   chiaro. Se valido: dentro una transazione nasce la riga `accounts`, la riga
   `credentials`, parte la clonazione dell'Example e la mail di benvenuto; chi ha appena
   verificato entra subito, senza ridigitare la password.
6. **Recupero password: `/forgot-password` e `/reset-password?token=...`.** La prima
   chiede solo un indirizzo e risponde sempre allo stesso modo, esista o no. La seconda
   scrive la password con `writePasswordHash`, la stessa chiamata sia per impostarne una
   prima volta sia per cambiarla.
7. **Mail di benvenuto, una volta sola.** Parte dentro `provisionAccount`, solo quando crea
   la riga e non la trova già lì.
8. **Un fornitore di email: Resend**, con un modulo sottile sopra l'SDK e tre modelli
   semplici (verifica, benvenuto, reset). Richiede una verifica del dominio via DNS, fuori
   dall'app.
9. **Un CAPTCHA: Cloudflare Turnstile**, sulla registrazione e sul recupero password — le
   due superfici che mandano un'email a un indirizzo scelto da chi la chiede, il vettore
   più ovvio di email-bombing di qualcun altro.
10. **Un limite di frequenza, nel database, senza un servizio nuovo.** Tabella
    `rateLimitHits` condivisa da registrazione, reinvio, recupero password e login, chiave
    per IP o email a seconda dell'azione.

Nessuna migrazione dei dati esistenti. Rationale completo per riga in *Decisioni*, tabella
*Si entra da soli (v3.2)*.

### v3.3 — il menu utente

Nuovo pulsante in testata — un monogramma colorato in base all'indirizzo — che apre un
pannello con l'indirizzo per esteso, l'etichetta "Owner" (segue `isOwner`, non il ruolo
`admin`: dalla v3.1 `admin` è di chiunque abbia un account), e password/sign out riunite
lì (prima sparse fra Impostazioni e il menu hamburger). L'avatar legge l'indirizzo
(iniziali e colore derivati), mai il profilo Google. Nessuna migrazione.

### v3.6 — pagamenti

Piani, prezzi e un checkout finto (`SONGBOOK_MOCK_CHECKOUT`) esistevano già nel codice, nati
fuori da questo piano (v3.4 compresa). Quello che questa versione aggiunge è **cosa succede
dopo il primo acquisto**: uno storico dei pagamenti, e un modo per l'utente di cambiare
piano o disdire da solo con una semantica diversa da "tutto istantaneo".

1. **Un piano in sospeso, non solo un piano attivo.** Un downgrade verso un altro piano
   pagante deve diventare quel piano alla scadenza, non decadere subito: due colonne nuove,
   `pending_plan`/`pending_cycle` (migrazione `0026`) — `pending_plan = 'free'` **è** la
   disdetta, un downgrade come un altro, un solo meccanismo per entrambe.
2. **`resolveSubscription(stored, now)`**, pura come `liveSubscription`: nessuna
   risoluzione durante `grace`; sotto scadenza, `pendingPlan`/`pendingCycle` esposti tali e
   quali ("premium fino al 12/6, poi standard"); a scadenza raggiunta, un solo passo verso
   `{ plan: pendingPlan, status: 'active', expiresAt: null, ... }`.
3. **Casi limite decisi qui**: `lifetime` non si disdice né si declassa nel mock (nessuna
   scadenza su cui far scattare nulla, resta un caso di supporto). Il confronto di rango
   che decide upgrade/downgrade è sempre contro **l'abbonamento dal vivo**, mai contro il
   piano *effettivo* (che può includere un regalo). Rango pari (solo cambio di ciclo) è
   immediato e cancella un pending esistente.
4. **Scritture** (`lib/plans/checkout.ts`): `mockPurchase` applica subito se supera o
   pareggia il rango attuale, altrimenti scrive solo il pending. `mockCancel` scrive
   `pendingPlan: 'free'`. Nuove: `clearPendingChange()` (azzera il pending) e
   `forceExpireNow()` — di test, l'unico modo di esercitare un blocco senza aspettare una
   data vera.
5. **Storico pagamenti in `paddle_events`, non una tabella nuova** — `eventType` prefissato
   `mock.` per restare distinto dai nomi che userà davvero Paddle. `paymentHistoryFor()`
   condivisa fra `/billing` e l'admin.
6. **`/billing`** (Settings, sopra "Delete account"): stato risolto, "Resta su {piano}" se
   pending, link a `/pricing`, "Disdici", storico. **Admin (`/accounts`): solo lettura**
   sullo storico — nessuna leva di scrittura diretta sull'abbonamento.

Migrazione `0026`: `accounts.pending_plan text`, `accounts.pending_cycle text`. Rationale
completo in *Decisioni*, tabella *Pagamenti (v3.6)*.

### v3.7 — attivazione obbligatoria del piano

Un buco lasciato aperto dalla v3.6: **nessun account ha mai scelto esplicitamente un
piano**, nemmeno Free — `provisionAccount` inserisce la riga già su un Free implicito
(`default('free')` a livello di colonna) senza che nessuno lo confermi.

- **Dove vive il gate**: `(home)/page.tsx`, non middleware (edge runtime, niente query lì)
  né `RoleProvider` (coprirebbe anche `/checkout/[plan]` e resterebbe stantio dopo la
  scelta). È l'unico posto che già fa questo genere di redirect server-side, dinamico.
  **Corretto durante l'implementazione**: la prima stesura escludeva il global owner con
  `user.role !== 'admin'`, falso dalla v3.1 (`admin` è di chiunque abbia un account) — il
  controllo giusto è `isOwner()` diretto, sulla persona davvero collegata.
- **Schema — migrazione `0027`**: `accounts.plan_chosen_at`, nullable. Backfill una
  tantum: ogni account esistente conta come "già attivato" da `created_at`, non `now()`.
- **Le regole**: scatta solo con `plansEnforced()`; **non** dipende da
  `mockCheckoutEnabled()` (l'uscita gratuita resta percorribile a checkout spento);
  `SONGBOOK_FORCE_PLAN` scavalca il gate per intero; il global owner è esente.
- **Le due uscite**: Free — `activatePlanChoice()` scrive *solo* `plan_chosen_at = now()`,
  nessuna riga in `paddle_events` (non è un acquisto). A pagamento — `mockPurchase` scrive
  `plan_chosen_at` insieme al resto se ancora `null`.
- **`/accounts`**: il piano guadagna un badge pieno, colore diverso per piano più uno per
  "Not activated" — eccezione dichiarata alla *Chord-First Rule* di `DESIGN.md`, palette lì.
- **Non è una security boundary**: il gate agisce lato UX (redirect sulla rotta d'ingresso),
  non lato permessi — chi lo aggirasse resterebbe comunque sul Free implicito di oggi.

Migrazione `0027`: `accounts.plan_chosen_at`, nullable, col backfill sopra. Rationale
completo in *Decisioni*, tabella *Attivazione obbligatoria del piano (v3.7)*.

### v3.8 — da `/accounts` a ricerca paginata con pagina di dettaglio

Tre cambi sulla superficie admin. La sezione **Create sparisce del tutto**: dalla v3.2 la
registrazione self-service copre già ogni caso reale. Verificato con grep, non per
supposizione: `CreateAccountForm.tsx`/`createAccount` non avevano altri chiamanti, rimossi
come codice morto.

**"Every account" diventa una ricerca**, paginata (25/pagina), con `q`/`plan`
(confrontato contro il piano **risolto**, non la colonna grezza)/`unactivated`/`sort`/
`dir`/`page` tutti nell'URL, non in stato client. **Filtro/ordinamento/paginazione vivono
in memoria, non in SQL**: il piano risolto è una funzione pura TypeScript, duplicarla in un
`WHERE` sarebbe una seconda copia della stessa regola. Corretto alla scala attuale (poche
decine di account).

**La riga si riduce a quattro fatti e un pulsante** (email, badge piano, stato abbonamento,
sign-in come cifra nuda) verso **View** → `/accounts/[email]`. Sei funzioni di formattazione
prima sparse confluiscono in `src/lib/accounts/planText.ts`.

**`/accounts/[email]`, lezione su come si verifica una rotta dinamica.** Il link usa
`encodeURIComponent`; la pagina fa `decodeURIComponent` esplicito. La prima stesura
affermava, leggendo il sorgente Next.js, che i `params` dell'App Router arrivano già
decodificati — sbagliato: quel percorso è del Pages Router. Verificato con una richiesta
reale (`curl` su una rotta sonda): `/accounts/a%40b.com` arriva alla pagina come stringa
letterale, `%` compreso. Senza il decode, `getAccountDetail` non trovava mai la riga —
`notFound()` su **ogni** account in produzione, il bug come si è manifestato. **Lezione**:
leggere il sorgente di una libreria non è una verifica se non si è controllato di stare
leggendo il percorso di codice davvero in uso.

**La pagina di dettaglio: tutto visibile, un'unica eccezione.** Subscription, Payment
history, Password sono tutte aperte fin dall'arrivo. **`DeleteAccountButton` tiene invece
il proprio click-per-rivelare** — l'unico caso in cui nascondere qualcosa dietro un click è
una rete di sicurezza voluta (retype-per-confermare), non un risparmio di spazio.

Nessuna migrazione. Rationale completo in *Decisioni*, tabella *Da `/accounts` a ricerca
con dettaglio (v3.8)*.

### v3.9 — anteprima e invio di test dei modelli email

`/emails`, gate `isOwner` come `/accounts`, un tab per ciascuno dei tre modelli
(`lib/email/templates.ts`): verifica registrazione, benvenuto, reset password. Rotta piatta,
non `/accounts/emails` — i tre modelli non appartengono a un account.

- **Dati fittizi**: `url` costruito come nel flusso vero ma con token di comodo — il link
  non porta a nulla di funzionante, comportamento atteso, stesso spirito del checkout mock.
- **Invio di test, non solo anteprima statica**: il rendering nel browser non riproduce le
  stranezze dei client email reali. Un bottone per modello manda la vera email via lo
  stesso `sendEmail` della produzione, sempre a `session.user.email`, oggetto prefissato
  `[Anteprima] `. La server action verifica `isOwner` da sé, senza fidarsi del gate della
  pagina.
- **Oggetto + HTML + testo semplice con un interruttore**: il testo semplice è quello che
  arriva a chi ha immagini/HTML disattivati. Il corpo HTML va in un
  `<iframe srcDoc={html}>`, mai iniettato diretto nella pagina.

Nessuna migrazione. Rationale completo in *Decisioni*, tabella *Anteprima email (v3.9)*.

### v3.10 — ricontrollo generale dei piani

Nessuna funzionalità nuova: un giro esplicito su tutto ciò che v3.6/v3.7/v3.9 avevano
lasciato scollegato o incoerente, da un audit a più agenti (enforcement, cambio ciclo,
admin, email/notifiche). Rationale completo per riga in *Decisioni*.

- Cambio di ciclo senza cambio di piano: link `Change billing cycle` sulla card attiva di
  `/pricing`, la semantica (v3.6 §3) esisteva già ma mancava il pulsante.
- `subscriptionStatusLine`/`formatPlanDate` (`lib/plans/subscriptionCopy.ts`, nuovo modulo)
  sostituiscono tre implementazioni indipendenti della stessa frase.
- `/pricing` e `/login` allineati sul numero vero di dispositivi Premium (100, non
  "Unlimited").
- `/login` non dice più che i piani "non sono ancora in vendita" quando lo sono.
- Maiuscole dei nomi di piano coerenti sulle schermate admin (`planText.ts`, `GiftForm.tsx`).
- Le registrazioni email/password non mandavano l'avviso Telegram di nuova registrazione
  (solo quelle Google lo facevano) — corretto, più un evento `kept_current` nuovo.
- `SongForm.tsx` e `ImportBatch.tsx` non offrivano alcun collegamento a `/pricing` quando
  un limite di piano rifiutava un salvataggio — ora lo fanno.
- Un proprietario globale switchato in un altro account non vedeva scritto quale account
  fosse in vista — nuova `ViewingAsPill` nel `TopBar`.
- L'email di benvenuto non diceva che il prossimo accesso porta su una scelta di piano
  quando il gate v3.7 è davvero attivo.
- "Confirmation" ovunque su `/thanks`, non più "receipt".

Nessuna migrazione.

### v3.11 — secondo ricontrollo dei piani

Un secondo giro, cinque audit paralleli sul codice *dopo* la v3.10. Ha trovato cose più
grosse del primo giro, incluse due vive in produzione. Rationale completo per riga in
*Decisioni*.

- **`forceExpireNow` era raggiungibile da ogni cliente pagante.** Su `/billing` dietro
  nient'altro che le parole "test only" — nessun controllo `isOwner`, né sulla pagina né
  nella server action. **Rimosso del tutto** dall'interfaccia; resta esportato per script e
  test.
- **`/pricing` confrontava i ranghi col piano *effettivo*, non con l'abbonamento vivo.** Con
  un regalo Premium sopra uno Standard pagato, completare il checkout Premium **trasformava
  il regalo in un acquisto reale** non richiesto. Corretto separando `subscriptionPlan` da
  `plan` senza cambiare il significato di `plan` altrove.
- **Lifetime è ora uno stato terminale su `/pricing`** — ogni CTA era un no-op che a volte
  rispondeva col messaggio sbagliato («is already on Free» a chi aveva pagato €149).
- **Il gate di scelta piano si scavalcava con un bookmark** — controllato solo in
  `(home)/page.tsx`, non su un link salvato o una scorciatoia PWA. Estratto in
  `requirePlanChoice` (`lib/plans/gate.ts`), chiamato dalle pagine (mai da un layout, per
  non gatare `/pricing` dietro sé stesso). `/export`/`/password` restano fuori per scelta
  dichiarata (sono `○`, precacheate per l'offline).
- **`EditorScreen` era rimasto fuori dalla correzione della v3.10**: un account congelato
  vedeva errore inline senza strada verso `/pricing`.
- **`/thanks` non guardava mai `PlanStatus`** — congratulazioni mostrate anche a un piano
  già scaduto per data.
- **Un regalo ritirato era invisibile dalla lista** — `planChosenAt` restava timbrato dopo
  la revoca. Aggiunti `giftWithdrawn` e un filtro dedicato.
- **Due guardie sui regali admin**: `lifetime` con data di scadenza ora bloccato nel form
  **e** in `validateGrant`; un regalo di rango pari o inferiore all'abbonamento vivo avvisa
  senza rifiutare.
- **`grace` scartava il pending**, nascondendo l'unico modo di annullare un downgrade
  programmato proprio mentre una carta sta fallendo — ora lo riporta senza mai farlo
  scattare.

Non corretto di proposito: il cast non validato su `eventType` in `history.ts` (nessun
valore fuori posto esiste oggi; difensivo oltre lo scopo dell'audit).

Nessuna migrazione.

### v3.12 — terzo ricontrollo dei piani

Terzo giro, questa volta percorrendo i passaggi come li percorre un cliente —
registrazione, gate, `/pricing`, `/checkout`, `/thanks`, `/billing` — invece che file per
file. Il risultato più importante è un bug che *tutti* incontrano. Rationale completo per
riga in *Decisioni*.

- **Ogni piano acquistato finiva per leggersi «active until ‹data passata›».** Niente in
  questo repository rinnova alcunché: `planExpiresAt` non si sposta mai da sé e
  `planStatus` resta `'active'` per sempre. Le tre schermate cliente decidevano «è ancora
  vivo?» da `status` soltanto, mentre `liveSubscription` lo decide da `status` **e** data —
  quattro sintomi (`/billing`, `/thanks`, «Cancel my plan», la riga di stato), una causa.
  Corretto alla giuntura: `loadCheckoutStatus`/`loadPurchaseSummary` restituiscono ora anche
  `live`, e le schermate la ricevono invece di ricalcolarla.
- **`isCurrent` su `/pricing` era rimasto sul piano effettivo** — la metà che la v3.11 non
  aveva toccato. Con un regalo Premium sopra uno Standard pagato, «Change billing cycle»
  portava a comprare davvero il piano regalato: lo stesso bug che il giro precedente
  dichiarava chiuso, sull'altra metà della stessa funzione. Stessa correzione su
  `LifetimeCta`.
- **Un downgrade chiedeva la carta e diceva «Complete purchase»**, pur non incassando né
  cambiando nulla quel giorno — teatro che inganna. Ora `/checkout/[plan]` lo dice prima del
  pulsante, nasconde i campi carta, e il pulsante dice cosa fa davvero.
- **«Change billing cycle» poteva bruciare mesi già pagati senza dirlo** — un acquisto di
  rango pari è immediato, quindi può accorciare un periodo annuale già pagato. Ora il
  checkout nomina entrambe le date quando questo succede.
- **Un cambio programmato su una riga senza scadenza non scattava mai** — ciò che *lascia
  dietro* un cambio già avvenuto (`expiresAt: null`). Un secondo downgrade restava inerte;
  ora, senza periodo pagato da proteggere, applica subito. Una cancellazione immediata
  smette anche di registrarsi come «programmata» nel ledger (`cancelled_now`, voce nuova).
- **«Cancel my plan» spariva se c'era già un downgrade programmato** — bisognava prima
  premere «Keep ‹piano›» senza che nulla lo dicesse. Ora basta `pendingPlan !== 'free'`.

Non corretto di proposito: un downgrade programmato durante `grace` resta fermo finché lo
stato non cambia — regola dichiarata di `grace`, non un effetto collaterale.

Nessuna migrazione.

### v3.13 — quarto ricontrollo dei piani: la revisione UX

Quarto giro, taglio diverso dai tre precedenti — non file per file né percorrendo i
passaggi, ma **chi guarda e in quale stato**: non loggato, loggato-ma-fermato-dal-gate,
ancora in caricamento, caricamento fallito. Rationale completo per riga in *Decisioni*.

- **`/pricing` diceva le cose sbagliate proprio a chi il gate ci aveva mandato.** L'header
  offriva «Sign in» a chi era già dentro (fisso, non un lampo — `PublicHeader` non ha
  nozione di sessione); le card, statiche, dicevano a tutti «nessuno è loggato»; nessuna
  frase diceva *perché* si era lì. La correzione costa alla pagina il rendering statico:
  ora legge `loadIdentity()` server-side. Corretto anche un caso più fine: il gate esenta
  un proprietario globale *prima* di consultare `hasChosenPlan`, quindi la pagina deve
  chiedere `isOwner` e poi il dato — non solo il dato grezzo — o un owner con la riga mai
  timbrata legge un avviso falso e nessun bottone.
- **L'email d'acquisto era l'ultimo posto che promettava un rinnovo.** `renewsOn` era in
  realtà il giorno in cui il piano *finisce* — la v3.12 aveva corretto le tre schermate
  sulla stessa causa, l'email no. Ora `endsOn`, «It runs until ‹data›».
- **`/billing` non diceva mai quanto era stato pagato, né per quale periodo** — la risposta
  viveva già nel ledger. `lastPaymentLine` la scrive, e tace del tutto se non c'è una riga
  d'acquisto da citare.
- **Si disdiceva con un clic solo, in due posti** (`/billing` e la card Free su `/pricing`).
  Ora entrambi hanno il passo di conferma che questo codice già usa per un atto distruttivo,
  con la regola che `grace` non prende mai una data nella domanda (`cancelQuestion`).
- **Un successo non veniva annunciato, un errore sì** — `role="alert"` esisteva solo sul
  lato errore; ora anche `role="status"` sulla conferma.
- **`PlanUpgradeModal` non manteneva la promessa di `aria-modal`** — fuoco e Tab restavano
  fuori dal dialogo. Corretto (fuoco sulla card, Tab intrappolato, `role="dialog"` spostato
  dall'overlay alla card).
- **Uno storico che non si carica sembrava uno storico vuoto** — ora un `historyFailed`
  esplicito distingue le due cose.
- **Rifiniture**: scegliere Free dal gate passa ora da `/thanks` (il suo ramo Free non
  veniva mai raggiunto); niente più frase duplicata su `/thanks`; «Sign in to continue.» su
  `/checkout` ha un pulsante.

Non corretto, per scelta esplicita in sessione: il checkout finto continua a presentarsi
come un pagamento vero (prezzi reali, form carta, «Payment received»), senza dire da
nessuna parte che nulla è stato incassato — premessa "nessuno può fraintendere" più debole
di quanto dichiarata, dato che la registrazione è aperta, `/pricing` è pubblica e
condivisibile, e non esiste `noindex`. Rischio riconosciuto e accettato, non sfuggito.
Non corretto, stessa sessione: `/pricing` apre ancora su Monthly senza dire che l'annuale
conviene, e `/checkout` parte da `'year'` mentre `/pricing` parte da `'month'`.

Nessuna migrazione.

### v3.14 — canzoniere di esempio per i nuovi account

Un bottone nell'empty-state della home per riempire con un click il primo canzoniere di un
account con canzoni vere, libere da copyright — non il canzoniere Example della v3.0
(clonato automaticamente a ogni sign-in, poi rimosso quando sono arrivati i piani perché
sprecava l'unico canzoniere del piano free su contenuto non richiesto: il commento in
`provisionAccount`, `src/lib/accounts/provision.ts`, motiva così la rimozione). La
differenza che rende ragionevole riproporlo: qui è una scelta esplicita di chi ha un
account vuoto, non un'imposizione automatica su chiunque si registri.

1. **Sorgente del contenuto: costanti stringa in `lib/songbooks/sample.ts`, non file su
   `content/`.** `content/` si legge da disco solo quando non c'è database — condizione che
   su Vercel non si verifica mai — quindi nessuna build aveva mai avuto motivo di includere
   quella cartella nella funzione serverless. Un modulo con `import` statico è incluso nel
   bundle allo stesso modo in sviluppo e produzione.
2. **Split una volta sola, a mano, non a ogni click.** Il file fornito (un unico ChordPro
   con otto canzoni tradizionali, separate da `{new_song}`) è stato tagliato una volta in
   otto costanti stringa; l'azione chiama `parseChordPro` su ciascuna già pronta.
3. **`addSampleSongbook` è gated su "zero canzonieri", verificato lato server** — non solo
   nel bottone — con un nuovo motivo di rifiuto, `account-not-empty`. Zero canzonieri
   implica zero brani (foreign key `not null`), il che permette al taglio del punto 4 di
   usare direttamente il tetto del piano come "spazio residuo".
4. **Tutte le canzoni del file entrano, tagliate solo se superano il tetto brani del
   piano** (`slice(0, limits.songs ?? Infinity)`) — la sorgente è un asset fisso di otto
   canzoni, quindi troncarla al tetto vero costa pochissimo ed evita di congelare un
   account nuovo alla sua primissima azione.
5. **Il canzoniere creato conta come un canzoniere normale del piano** — arriva già
   popolato invece che vuoto, resta modificabile ed eliminabile. Non è uno slot "in più"
   come lo era il vecchio Example.
6. **Licenza: pubblico dominio / brani tradizionali** (Amazing Grace, House of the Rising
   Sun, Whiskey in the Jar, Danny Boy, When the Saints Go Marching In, Scarborough Fair,
   Waltzing Matilda, Auld Lang Syne). Attribuzione solo sulla Content & Copyright Notice
   (sezione 1), non nella UI di lettura — corretta nello stesso cambiamento insieme alle
   due frasi equivalenti su `/login` che dichiaravano ancora "no starter library".
7. **Punto d'accesso**: bottone nell'empty-state di `HomeScreen.tsx`, condizionato su
   `groups.length === 0` — ricompare da solo se l'account torna a zero canzonieri. Su
   successo naviga direttamente al nuovo canzoniere.

Nessuna migrazione.

### v3.15 — il canzoniere di esempio torna automatico alla creazione dell'account

Rovescia il punto centrale della v3.14 qui sopra, deliberatamente e sapendo cosa costa:
`provisionAccount` semina di nuovo il canzoniere di esempio in ogni account nuovo, invece
di aspettare che qualcuno prema un bottone. Terzo giro completo su questa decisione — la
v3.0 clonava in automatico, i piani l'hanno fatta togliere, la v3.14 l'ha riproposta come
scelta esplicita, e questa la rimette in automatico.

**Il costo è quello di sempre e non è sparito**: il piano free ha un solo canzoniere, quindi
un account free nasce con l'unico slot già speso in contenuto che non ha chiesto, e deve
cancellare l'esempio per farsi il suo. Accettato: atterrare su una schermata vuota è stato
giudicato la peggiore delle due prime impressioni.

1. **Cosa viene seminato**: le nove canzoni di pubblico dominio di `lib/songbooks/sample.ts`,
   non il canzoniere marcato `isExampleTemplate` della v3.0. Quel flag e il suo indice unico
   parziale restano dove sono, al servizio di `copySongbook`; il seeding non li legge.
2. **Conta come un canzoniere normale del piano**, come già stabiliva la v3.14 punto 5 — non
   uno slot extra come faceva il vecchio Example. Nulla sui piani diventa silenziosamente
   falso.
3. **Righe condivise, non duplicate**: l'inserimento vive in `lib/songbooks/seed.ts`
   (`insertSampleSongbook`, modulo semplice, non `'use server'`), chiamato sia da
   `addSampleSongbook` sia da `provisionAccount`, così i due non possono divergere.
4. **Il seeding non è nella stessa transazione della riga account, e si mangia il proprio
   errore.** Un account senza canzoniere di esempio funziona — l'empty-state offre ancora lo
   stesso canzoniere su un bottone; una riga account annullata perché è fallito l'insert di
   una canzone no: quell'indirizzo entrerebbe senza posto dove mettere niente, e non
   riceverebbe nemmeno la mail di benvenuto.
5. **Il tetto letto è quello del piano free**, non uno risolto da `entitlementsOf`: gira
   dentro la callback di sign-in, prima che esista una sessione, e la riga è stata inserita
   un'istruzione prima sul `default('free')` della colonna. Le due cose sono lo stesso fatto
   scritto due volte, ed è detto nel commento.
6. **`addSampleSongbook` resta**, con un mestiere più stretto: riprendere il canzoniere per
   un account che si è svuotato, o per uno il cui seeding è fallito.
7. **Testi corretti nello stesso cambiamento**: la Content & Copyright Notice diceva che
   nulla entra nella collezione senza un gesto deliberato — ora falso, ed è una pagina
   legale; più le due frasi su `/login` e la riga di PRODUCT.md.
8. **Una nota chiudibile sopra la lista** dice perché quelle canzoni ci sono: «We've added a
   few songs to get you started…». Un'app il cui patto è «qui c'è solo quello che ci metti
   tu» che accoglie uno sconosciuto con nove brani non suoi deve spiegarsi, e la metà che
   conta la dice per ultima — si possono cancellare. Sta sopra la lista, che è anche sopra
   il canzoniere di cui parla: quello seminato nasce in posizione 1 e i successivi si
   accodano, quindi è sempre la prima riga. Riconosciuto **dallo slug e non dal nome**
   (`isSampleSongbookSlug`): lo slug è coniato una volta e il rename non lo tocca, quindi la
   nota resta corretta per chi ribattezza il canzoniere il giorno dopo. La chiusura vive in
   `localStorage` per dispositivo, non in `user_prefs`: è un cartello letto una volta, e sul
   secondo dispositivo è la prima volta comunque. Chiave per slug, così chi cancella
   l'esempio e lo riprende dall'empty-state si rivede anche la nota.

Verificato end-to-end sul database di sviluppo con un account usa-e-getta: un canzoniere,
quattro sezioni nell'ordine giusto, nove canzoni ciascuna con la sua sezione, slug unici,
e pulizia completa dopo. Nessuna migrazione.

### v4.0 — commenti ancorati

Un **commento** è un appunto testuale privato che un lettore aggancia a un punto preciso di
una canzone: una sillaba della riga di testo, oppure un accordo della riga sopra. Un
interruttore a tre segmenti nell'header — nascosti, visibili, modalità aggiunta armata — e su
schermo largo un rail di 328px che li elenca tutti. Numero maggiore e non v3.16 perché è la
prima capacità nuova per chi legge dopo una lunga fila di ricontrolli: lo stesso numero è già
scritto in `db/schema.ts` accanto alla tabella.

Ha portato con sé l'**eliminazione della nota di canzone** (`user_song_prefs.note`,
migrazione 0030), che il piano prevedeva invece dovesse convivere: un appunto agganciato alla
parola di cui parla dice tutto quello che diceva la striscia sotto il titolo e in più dice
*dove*, e due posti dove scrivere un promemoria sulla stessa canzone erano due posti dove
cercarlo. Contate prima di toglierla: 48 righe di preferenze e **zero** note non vuote in
tutta l'installazione — nessuno ne aveva mai scritta una.

1. **L'ancora vive nelle coordinate dell'editor**, `(indice di blocco, offset nel testo)`,
   non in quelle dell'AST di lettura. `parseChordPro` scarta righe vuote e direttive ignote,
   quindi i suoi indici non risalgono al sorgente; `SongDocument.blocks` è 1:1 con le righe
   del file. Lo snap a inizio sillaba riusa `nearestSnap`, la stessa euristica già decisa per
   il tap sulla chord-row dell'editor.
2. **`anchorMap.ts` è il ponte fra i due sistemi**, e serve perché non sono derivabili l'uno
   dall'altro: `parseLyricLine` consuma gli spazi e non li conserva, quindi riunendo le parti
   si recuperano le lettere ma non la spaziatura, e un offset ricavato così slitterebbe su
   ogni riga scritta con due spazi. La mappa si costruisce dal sorgente, dove entrambe le
   verità coesistono. Verificata contro tutte le canzoni reali di `content/`.
3. **La regola dell'orfano è nuova, non ereditata.** `shiftChords` ha tre rami e il terzo
   *collassa* l'ancora dentro lo span riscritto — giusto per un accordo, che è un punto e si
   sposta di poco. Sbagliato per un commento, che è una frase *su* una parola: collassarlo
   lascerebbe l'etichetta «on grace» accanto a un testo che non è più grace. Dove un accordo
   collassa, un commento lascia la presa. `editedSpan` è stato estratto da `shiftChords` così
   i due condividono la misura e divergono solo nella politica.
4. **Quattro modi di perdere l'appiglio**, tutti decidibili senza euristiche: il blocco non
   sopravvive, il blocco non è più `lyrics`, il testo sotto l'ancora è stato riscritto, o —
   per una nota su un accordo — quell'accordo non c'è più. C'è anche un diff LCS a livello di
   blocchi, perché `blockIndex` è posizionale e inserire una riga in cima sposta ogni
   commento sotto: un caso che `shiftChords` non vede proprio, lavorando dentro una riga sola.
5. **Il ri-ancoraggio gira al salvataggio**, l'unico momento in cui esistono entrambe le
   versioni del sorgente, e **fuori dalla transazione**: portare le note attraverso una
   modifica è una cortesia verso chi le ha scritte, e un suo fallimento non deve annullare la
   modifica che il lettore ha chiesto.
6. **Si scrive anche offline**, con un outbox persistente su `localStorage` con chiave l'id
   del commento. Non riusa `prefsQueue`, che tiene una sola voce per canzone con
   last-write-wins — cancellerebbe la prima di due note modificate di seguito — e che vive in
   memoria, dove un reload offline perde ciò che attende. L'id è coniato dal client, perché
   una nota scritta senza rete ha bisogno di un'identità prima che un server la veda.
7. **`SongSheet` riceve le note come prop, mai da un contesto.** Ha quattro chiamanti e solo
   uno può mostrarle: `FollowSession` rende lo stesso componente per l'ospite di Strum
   Together, e «only you see these» è una promessa che si rompe nel momento in cui lo schermo
   di un ospite le raccoglie da un contesto in cui si trova per caso. Passarle rende i tre
   chiamanti muti per costruzione.
8. **Nessun gating di piano**, per la stessa ragione che `saveSongPrefs` dà per non
   controllare nulla: una nota su come questo lettore legge, sul proprio schermo, non è la
   modifica di qualcosa di condiviso.

Migrazioni 0029 (tabella) e 0030 (rimozione della nota). La 0030 è stata applicata in
produzione dal console SQL di Neon, journal incluso — vedi `CLAUDE.md`, «When there is no
terminal at all», per perché la riga di journal non è opzionale.

### v4.1 — i controlli sul brano

Chiave, capotasto, alterazioni e resa degli accordi escono dal pannello di lettura e vanno
**sotto al titolo**, come una riga di chip che va a capo da sola: i primi tre stanno su una
riga a 402px, «Chords» scende sulla seconda. Nel pannello dietro al bottone della barra
restano solo strumento e dimensione del testo.

1. **La regola vecchia era giusta e la classificazione no.** «Un controllo che si tocca a
   brano in corso sta fuori, uno che si imposta una volta sta dietro al bottone» reggeva
   finché tutti i controlli erano solo controlli. Quei quattro invece **dicono** qualcosa
   oltre a impostarla — in che tonalità sei, se c'è un capotasto — e un valore che vale la
   pena leggere non può passare la vita chiuso. La prova era già nel codice: esisteva una
   riga apposta sotto al titolo (`TransposeNote`) il cui unico compito era ripetere a parole
   capo e trasposizione, «perché il pannello è chiuso quasi sempre». Con i chip quella riga è
   sparita: i chip *sono* la nota.
2. **Le alterazioni ♯/♭ sono una funzione nuova**, non uno spostamento. Due segmenti, nessun
   «auto»: il valore salvato decide sempre, e scavalca sia la grafia della sorgente sia la
   tonalità d'arrivo (vedi *Motore musicale*). Costo accettato consapevolmente: il default è
   `sharp`, quindi un brano scritto con `Bb` si legge `A#` finché chi legge non tocca il
   secondo segmento. `respellChord` è una funzione pura con i suoi test — è la sola parte di
   questa versione che `npm test` può davvero coprire.
3. **`ChordDisplay` passa da due valori a quattro**: `name`, `shape` (diagrammi in linea),
   `diagrams` e `fingerings`. I primi due decidono cosa sta **sopra ogni sillaba**, gli altri
   due lasciano stare le sillabe e mettono **un riepilogo sopra al brano** — una striscia di
   riquadri senza contenitore, o due colonne di numeri (`320003`) dentro una card annidata.
   La colonna resta `text` senza CHECK, quindi nessuna migrazione: solo `readChordDisplay` ha
   imparato i due nomi nuovi. `shape` conserva il nome che aveva quando i valori erano due —
   rinominare un valore già scritto nel database si paga una migrazione per niente.
4. **La migrazione 0032 è scritta a mano**, come la 0024–0031: `drizzle-kit generate` ora si
   rifiuta di girare del tutto (0028/0029/0030 condividono `id` e `prevId`, vedi la nota in
   testa alla 0031 e *Domande aperte* #19). Una sola colonna, `accidentals text NOT NULL
   DEFAULT 'sharp'`.
5. **La riga vale anche per l'ospite di Strum Together e per l'anteprima dell'editor.** Al
   seguace la chiave è bloccata — legge quella di chi guida — ma capotasto, alterazioni e
   resa degli accordi restano suoi: riguardano le mani che tengono *quel* telefono, non la
   trasmissione. Nell'anteprima dell'editor la riga arriva insieme allo spartito, perché è
   quella modalità a promettere «il brano come si leggerà».
6. **La stima della tonalità esce dal percorso di lettura**, ed è la conseguenza meno
   ovvia della scelta al punto 2. `estimateKey` esisteva per una sola decisione — se un
   accordo trasposto si scrive `F#` o `Gb` — e con la risposta data dal lettore quella
   decisione non si prende più: `readChord` compita dalla preferenza e non consulta
   nessuna tonalità. Le due chiamate che c'erano (spartito e libretto) sono state tolte,
   non lasciate a calcolare qualcosa che veniva poi buttato. `key.ts` resta, con in testa
   la nota che dice che oggi non lo legge nessuno e che cosa lo rimetterebbe in servizio:
   un terzo segmento «auto» su quel chip.
7. **I due menu (capotasto, accordi) pendono dalla riga, non dal chip che li apre.** Un menu
   ancorato al chip «Chords» — che a 402px sta sulla seconda riga, spostato a destra — esce
   dal bordo del telefono. È la stessa cosa che `.control-panel` aveva già imparato per il
   pannello della barra. Il calcolo del capotasto suggerito resta dietro all'apertura del
   menu: su ukulele è una ricerca da 56 ms al primo giro, e senza quel cancello la pagherebbe
   ogni apertura di brano, dato che ora questa riga si monta con lo spartito e non con un
   pannello.

7. **Il menu del capotasto, corretto in una seconda passata**, dopo aver riletto per intero
   `Song Reader Mobile.dc.html` e trovato la sezione 5c che la prima lettura aveva saltato:
   ogni tasto disegna una fila di puntini, uno per accordo distinto del brano, pieni per
   quanti sono comodi a quel tasto — lo stesso conto che `suggestCapo` già faceva per
   proporre un solo tasto, ora mostrato per tutti insieme (`easeByFret`, che le due funzioni
   condividono perché non possano più raccontare due storie diverse). Il tasto scelto prende
   un anello, non un riempimento — il riempimento pieno è riservato al tasto *suggerito*, e
   se il tasto scelto lo condividesse le due informazioni si confonderebbero. Il colore del
   suggerimento è verde (`--success`/`--success-soft`), non il caldo dell'accento: l'accento
   è dei soli accordi, e `--plan-lifetime` — che nella palette condivide questa tinta — è
   un'eccezione dichiarata riservata ad `/accounts`, mai a uno schermo di lettura. La griglia
   del mock mostra sei tasti non consecutivi senza freccia (probabilmente un campione
   illustrativo): il capotasto reale arriva al tasto 7, quindi la finestra scorrevole a sei
   più freccia già in uso resta, solo con la nuova veste per cella.

8. **Il menu «Chords», rifatto sul mock invece che a parole.** La sezione 5d disegna
   quattro righe, ciascuna con un'anteprima reale invece di una sola frase — diagrammi
   in miniatura, una riga di diteggiatura, il nome degli accordi — e un ordine preciso
   (dal modo che occupa più spazio a quello che non ne occupa nessuno: diagrammi sopra
   il brano, diteggiature sopra il brano, diagrammi in linea, solo nomi), l'opposto
   dell'ordine con cui le avevo elencate la prima volta. L'anteprima di ogni riga pesca
   dai veri accordi del brano aperto — fino a tre, trasposti e compitati come li vede
   in quel momento chi legge (`previewChords`) — non dall'esempio fisso disegnato nel
   mock, che sarebbe stato lo stesso per ogni canzone. La riga «Fingerings» e quella
   «Diagrams» scrivono anche la propria frase con quei dati reali («Tutti i 3 accordi,
   in un pannello sopra al testo»); le altre due tengono la frase fissa del mock. Il
   conteggio «N in this song» condivide la stessa definizione di «accordo distinto» già
   usata dal menu del capotasto (`distinctChordCount`, spacchettato da `easeByFret` così
   il numero non possa mai dire due cose diverse a seconda del menu aperto.

9. **Tre difetti trovati usando il popup davvero, corretti insieme.**
   - La freccia per scorrere i tasti oltre il 5 non faceva nulla finché il capotasto era
     su 0 — che è lo stato di partenza di ogni canzone. Causa: `fretWindowStart` impone che
     il tasto *attualmente scelto* resti sempre visibile, giusto per un menu riaperto (deve
     mostrare subito il tasto 7 se il capotasto era già lì), sbagliato mentre il menu è
     aperto e si sta solo sfogliando — con capotasto a 0, ogni richiesta di pagina veniva
     ricacciata indietro perché 0 doveva restare in vista. Il capotasto con cui il menu si
     è aperto ora si congela in uno stato locale (`openedCapo`) e non insegue più il valore
     live: un tasto cliccato dalla pagina che si vede già non ha comunque bisogno di quella
     regola.
   - Un solo bottone a scorrimento cambiava icona e verso a seconda della pagina; ora sono
     due bottoni indipendenti, uno prima del tasto 0 e uno dopo l'ultimo, ciascuno presente
     solo quando c'è davvero dove andare — lo stesso disegno di `PrevNext`/`Step` già usato
     per canzone precedente/successiva.
   - Il colore del capotasto scelto — sia l'anello nel popup sia il badge del chip in
     pagina — è passato dal caldo dell'accento al verde del suggerimento, su richiesta
     esplicita: un solo colore per «il tasto su cui sono», raccontato allo stesso modo
     dentro e fuori dal popup. La distinzione fra scelto e suggerito resta di forma (anello
     contro riempimento), non più di tinta.
   - Le anteprime del menu «Chords» erano state dimensionate sul valore letterale delle
     icone minuscole del mock e risultavano illeggibili; diagrammi e testo sono stati
     ingranditi (diagrammi 17→30px e 13→24px, testo 8-9.5px→12-13px).
   - Il riquadro «fingerings» sopra il brano scriveva il nome dell'accordo in una colonna a
     `width: 2.4ch` fissa: un nome più lungo di due lettere (`F#m7`, `Bbmaj7`) sporgeva oltre
     quella larghezza e si sovrapponeva alla diteggiatura accanto, perché una `width` fissa
     non cresce per un contenuto più largo mentre un `min-width` sì — cambiato in quello.

10. **Il riepilogo «diagrams» diventa cliccabile, e un difetto vero trovato cercando
    quello segnalato.**
    - Ogni riquadro (`ChordSummary`, entrambe le modalità — `diagrams` prima,
      `fingerings` a richiesta separata subito dopo) era testo statico; ora è un
      bottone che apre lo stesso `ChordPopup` di un tap sull'accordo nel testo — stesso
      gestore (`setShown`), stesso elemento, mai due popup che potrebbero raccontare
      cose diverse. Serviva portare il `Chord` vero (non solo l'etichetta già formattata)
      dentro `SummaryChord`, dato che `ChordPopup` rifà da sé `shapeFor`/`formatChord`.
      Il nome dell'accordo in modalità `diagrams` ha anche cambiato colore, da `--ink` a
      `--accent`: è lo stesso accordo che sta nel testo, non una didascalia su di esso.
    - Cercando «il primo accordo tagliato» senza uno screenshot a disposizione, il
      render fedele del componente vero (non un'approssimazione disegnata a mano) ha
      trovato un difetto reale in `ChordDiagram`: il numero del tasto lontano dal
      capotasto è ancorato a `x = LEFT - 5` con `text-anchor: end`, che basta per una
      cifra sola ma per una doppia (raggiungibile con un `maj9` di chitarra, che può
      arrivare al tasto 11) manda la prima cifra sotto x=0 — fuori dal `viewBox`, dove
      un SVG taglia di default. Il numero spariva del tutto, non solo si stringeva.
      Verificato con un render diretto del componente (react-dom/server, fuori da
      Next): confermato sparito prima, visibile dopo aver allargato il `viewBox` di 8
      unità sul solo lato sinistro, e solo quando il numero è a due cifre — un accordo
      comune non cambia di un pixel. Non è escluso che sia un problema diverso da quello
      segnalato: non avendo un modo per riprodurre esattamente il caso del canzoniere
      reale, questo è il difetto concreto che la ricerca ha trovato.
11. **Due correzioni su richiesta diretta, non dal mock.**
    - I badge di Key e Capo in pagina restavano colorati anche a valore 0 (nessuna
      trasposizione, nessun capotasto) — ora sono neutri finché il valore non si
      allontana da 0, e lo stesso `--r-xs` che altrove nell'app legge come «angolo
      smussato» qui, su un badge alto 22px, si vedeva come un cerchio: il raggio è sceso
      a un valore fuori dalla scala dei token, il più piccolo che serve in tutta l'app.
    - Il font del riquadro «fingerings» sopra il brano è sceso da 14px a 13px.

12. **Cancellare un brano, anche dalla pagina di lettura.** Fino ad ora l'unico posto era
    l'editor (`deleteSong`, `src/lib/import/actions.ts`, con la sua conferma a due passi in
    `EditorScreen`); un lettore che vuole solo togliere un brano doveva aprirlo per modifica
    per farlo. `DeleteSongLink` accanto a `EditSongLink`, in fondo alla canzone, ripete la
    stessa domanda in chiaro invece di cancellare al primo tocco — la stessa che l'editor
    già fa, posta allo stesso modo. La riga con la regola sopra i due pulsanti si è spostata
    da `EditSongLink` (che la possedeva da sola) a un nuovo `SongActions`, componente client
    che decide se mostrare la riga in base al ruolo: `SongReader` è un componente server e
    non può saperlo, e una riga vuota per chi non può modificare — la maggioranza di chi
    legge — sarebbe stata una regressione. Dopo la cancellazione si torna al canzoniere di
    provenienza (`home.slug`, già calcolato da `placeOf` per il «torna indietro» dell'header)
    invece che alla radice dell'app come fa l'editor: qui quell'informazione era già a
    disposizione.

**Scostamenti dichiarati dalla board.** Il badge della chiave nel mock è verde e quello del
capotasto terracotta; qui sono due pesi dello stesso caldo (soffuso e pieno), perché un
secondo colore su una schermata di lettura è esattamente ciò che la Chord-First Rule di
`DESIGN.md` esiste per impedire. I chip sono 36px e non 26px: ogni controllo dell'header in
quest'app è già più grande di come lo disegna la board (la traccia delle note è 44px contro
30px), quindi il rapporto fra chip e traccia è quello che si è tenuto, non il pixel. La board
mobile è l'unica aggiornata — `Song Reader.dc.html` mostra ancora il pannello vecchio — ma i
chip valgono a ogni larghezza: due set di controlli divergenti costano più di una board
ferma.

## Vincoli d'ambiente

- **Node 18.20.8 in locale** (snap, nessun nvm), Node 24 su Vercel. Tailwind è fissato alla
  v3 perché il binding nativo `@tailwindcss/oxide` della v4 richiede Node ≥ 20. Ogni nuova
  dipendenza va verificata su Node 18 prima di entrare: **Serwist e drizzle-kit sono i due
  candidati a rompersi**, da provare per primi. Stesso motivo per cui `resend` è fissato a
  `6.4.2` (non un range con `^`): 6.5.0 e successive richiedono Node ≥ 20.
- Il build interroga Neon: se il database non è raggiungibile **il deploy fallisce**. È un
  compromesso accettato in cambio di pagine statiche, ma va saputo.
- **L'ordine di attivazione del database non è indifferente.** Il build genera le pagine dai
  dati che trova: se `DATABASE_URL` arriva su Vercel prima del seed, il build legge una
  tabella vuota e pubblica zero canzoni con una lista di precache vuota — un'app che sembra
  funzionante e non ha contenuti. La sequenza corretta, se il database va rifatto da zero:
  1) crea il database collegandolo **solo a development** (`vercel integration add neon -e
  development --name songs-db --scope sisqoz`, prima volta con i termini marketplace da
  accettare nel browser); 2) `npm run db:migrate`; 3) `npm run seed`; 4) verifica che il
  build dica `Precache routes (database)` e non `(files)`; 5) **solo adesso** aggiungi
  `DATABASE_URL` a Production e fai un redeploy. Due dettagli che costano tempo se non si
  sanno: `vercel env pull` sovrascrive `.env.local` e scarica un solo ambiente (le variabili
  di auth sono anche in `development` proprio per sopravvivere al pull); le migrazioni
  girano sulla connessione **diretta** (`DATABASE_URL_UNPOOLED`, che `scripts/migrate.ts`
  preferisce da sé quando esiste), non su quella con PgBouncer che il runtime usa invece con
  `prepare: false`.
- **Lo snapshot di `drizzle-kit` non è aggiornato dalla 0015 in poi.** Le migrazioni scritte
  a mano da v3.0 a v3.2 (0015/0016, 0017 che droppa `members`, 0018 che aggiunge
  `pendingRegistrations`/`passwordResetTokens`/`rateLimitHits`) usano
  `drizzle-kit generate --custom`, che crea il file SQL vuoto e la voce di journal senza mai
  ricalcolare lo snapshot dal vero `schema.ts`: ogni `NNNN_snapshot.json` da 0015 in poi è
  quindi una copia byte-per-byte di quello precedente (v2.4). Il database reale è corretto —
  ogni migrazione è stata verificata riga per riga contro di esso — ma il **prossimo**
  `npm run db:generate`, in un terminale vero, proporrà di ricreare da capo `accounts`, le
  colonne di `songbooks`, e persino di *ricreare* `members`: da scartare, rigenerando invece
  lo snapshot a mano prima di fidarsi del diff che propone.
- **Nessun browser reale in questo ambiente.** Tre cose restano verificate solo per
  ispezione, mai per uso reale: il comportamento offline dopo l'installazione della PWA, il
  round trip OAuth con Google, e la resa dei glifi `△`/`°` nel font scelto (Outfit).
- **La scala tenuta a mente**: il piano regge fino a qualche centinaio di brani per
  installazione. Oltre, l'indice di ricerca client-side e la generazione statica completa
  vanno riconsiderati (ricerca full-text su Postgres, paginazione).

## Scostamenti dal piano, emersi in implementazione

Ognuno è una scelta consapevole con un costo dichiarato, non una scorciatoia.

1. **Chiave naturale `slug` invece di un id surrogato.** Un file su disco ha uno slug e
   nient'altro: è questo che rende le due implementazioni del repository interscambiabili e
   permette di indicizzare le preferenze allo stesso modo in entrambe. Costo: rinominare uno
   slug orfana la trasposizione salvata di quel brano.
2. **`postgres.js` invece di `@neondatabase/serverless`.** Nulla tocca il database dall'edge:
   le sessioni sono JWT e il middleware non legge l'elenco degli ammessi — lo legge il
   callback di login, che gira in Node (v2.0). Quindi il driver HTTP non porta vantaggi, e la sua versione 1 richiede Node ≥ 19 mentre qui c'è 18.
3. **Cache di lettura locale per le preferenze.** Il piano diceva "solo DB". Ma una lettura di
   rete non può concludersi prima del primo paint, e offline non c'è alcun database da
   leggere: ogni brano si aprirebbe in tonalità originale senza memoria. Il DB resta l'unica
   fonte di verità e vince sempre in caso di conflitto; questa è una cache, e la coda di
   scrittura in memoria resta come deciso.
4. **Leggere dentro una scaletta è una rotta a sé** (`/scalette/[scaletta]/[brano]`) invece di
   un query param. Costo: una pagina statica per coppia. Vantaggi: precedente e successiva
   note al build, e URL di precache identiche a quelle richieste — un query param non farebbe
   parte della voce precachata. *(Rimossa in v2.0 insieme alle scalette. Lo stesso
   ragionamento vale ora per `/canzonieri/[slug]`.)*
5. **Toggle notazione inline nella barra** invece che dietro il menù `⋯`: un tap invece di
   due, e nessun popover da gestire.
6. **L'indice di ricerca viaggia nel payload della pagina** invece di essere un JSON separato:
   nessuna chiamata di rete e funziona offline per costruzione.
7. **Tema chiaro e scuro implementati subito**, chiudendo una domanda aperta: per un tablet
   letto in penombra non era rinviabile.
8. **Il precache deve includere a mano la scansione di `public/`**: `@serwist/next` la esegue
   solo se `additionalPrecacheEntries` è assente, e un array vuoto basta a saltarla. Passare
   le rotte delle pagine avrebbe silenziosamente smesso di precachare le icone.
9. **Gli script usano un `main()`**: `tsx` qui compila in CJS, dove il top-level await è un
   errore di build.
10. **Il pallino di un commento sta dentro `.sheet-lyric`, e consuma larghezza.** Le board del
   lettore lo disegnano inline dopo la parola; la prosa di `Comment Mode` §10 prometteva
   invece un segno sulla linea di base della riga degli accordi, che «non spinge mai una
   sillaba di lato». Vincono le board, più concrete — al prezzo dichiarato che con i commenti
   visibili una riga può andare a capo diversamente. È anche l'argomento più forte a favore
   dello stato «nascosti», che restituisce la riga esattamente com'era scritta.
11. **Gli orfani si parcheggiano a piè di foglio, non a fine della loro sezione**, come il
   piano chiedeva. Scrivendo il codice si è visto che è una domanda senza risposta: un orfano
   è per definizione una nota a cui è stato tolto il `blockIndex`, quindi la sezione di
   provenienza non è un fatto che i dati conservino ancora. Raccoglierli sotto un'unica
   intestazione è la versione onesta — dichiara che la posizione è persa invece di
   inventarne una che il pallino poi mentirebbe.
12. **La modalità aggiunta non dipinge nulla sulle parole.** La prima versione dava a ogni
   bersaglio una scatola tinta, e la pagina intera leggeva «è selezionato tutto» invece di
   «armato». Lo stato lo dice la traccia tinta nell'header; sul foglio bastano puntatore,
   hover e stato premuto. Conseguenza voluta: dopo aver salvato si torna a «visibili», perché
   senza più un segno sul foglio il tocco successivo avrebbe scritto una seconda nota invece
   di aprire la prima.
13. **Il breakpoint del rail (75rem) è una scelta, non una misura.** Nel progetto Design non
   esiste **una sola** `@media`: sono artboard a larghezza fissa. 48rem di foglio + 1rem di
   gap + 20.5rem di rail fanno le 69.5rem che le board mostrano come contenuto; 75rem lascia
   un margine di pagina alla larghezza in cui il rail entra per la prima volta.
14. **I controlli dell'intestazione vanno a capo sotto le 40rem**, mentre le board disegnano
   una riga sola a ogni larghezza. Sono artboard a larghezza fissa e quella del telefono è
   larga 402px con un titolo corto: a 390px una traccia da 44px più una matita da 44px
   lasciano al titolo una manciata di caratteri, e il titolo è ciò di cui la schermata parla.

## Decisioni

| Decisione | Scelta | Perché |
|---|---|---|
| Sorgente dati | Postgres su Neon, seed da file | Fondazione per l'editor v2 senza rifare la UI |
| Sezioni (v2.3) | Tabella `sections` per canzoniere, id seriale | Ordine proprio, sezioni vuote possibili, rinomina gratis |
| Coerenza sezione/canzoniere | Chiave esterna composta, `on update cascade` | Il database rende impossibile la riga sbagliata; misurato, non dedotto |
| Disposizione | Un'azione sola per tutto il canzoniere | Trascinare oltre un'intestazione cambia tre cose insieme |
| Piega delle sezioni | `localStorage`, chiuse per default | È un gesto della mano, e deve funzionare offline |
| Scope v1 | Sola lettura, editor in v2 | Le funzioni di valore sono tutte sul lato lettura |
| Formato | ChordPro, accordi sopra il testo | Standard di fatto; rende trasposizione e notazione banali |
| Sigle italiane | Stile jazz: `Do-`, `Do△7` | Scelta esplicita dell'utente |
| Sigle internazionali | Standard: `Cm`, `Cmaj7` | Ogni sistema con la propria convenzione; in INT il display coincide col sorgente |
| Trasposizione | Stepper a semitoni, con la distanza da casa | Il gesto più rapido dal vivo: si alza finché la voce sta comoda. Il nome della tonalità è già su ogni accordo (v2.0) |
| Enarmonia | Segue la tonalità d'arrivo | `Sib` e non `La#`: è come si legge uno spartito |
| Auto-scroll | Velocità costante su 8 passi, salvata per brano | Correggibile al volo se si va fuori sincrono |
| Wake lock | Sempre attivo durante lo scroll | Senza, la funzione non serve a nulla |
| Controlli | Barra inferiore fissa | Un tap per fermare o trasporre, mai un menù da cercare |
| Zoom | Stepper globale a 6 passi, testo che rifluisce | Dipende dagli occhi e dal dispositivo, non dal brano |
| Preferenze per brano | Solo trasposizione e velocità | La tonalità comoda dipende dal brano; zoom e notazione sono abitudini stabili |
| Persistenza | Solo DB, sincronizzato | Con un'identità, preferenze che divergono fra dispositivi sarebbero una stranezza |
| Scrittura offline | Applicata subito, coda in memoria | Dal vivo funziona e nulla si perde in silenzio, senza logica di merge |
| Navigazione | Elenco dei canzonieri + ricerca su tutto | La prima domanda è quale canzoniere; la ricerca non appartiene a nessuno (v2.0) |
| Offline | PWA con pagine statiche precache | Sala prove e palco spesso non hanno rete |
| Accesso | Google OAuth + elenco in due metà | Chiude la questione copyright e dà l'identità per la sincronizzazione. Proprietari nell'ambiente, invitati in tabella (v2.0) |
| Ruoli | admin, editor, viewer; i proprietari sono admin (v2.1) | Chi entra e cosa può fare sono due domande, e la seconda non deve poter chiudere fuori nessuno dalla prima |
| Modi di entrare | Google + email e password (v2.2) | Due prove dello stesso indirizzo, non due account; scrypt dalla libreria standard, nessuna dipendenza nuova |
| Preferenze e ruoli | Aperte a tutti, viewer compresi | Trasporre non è modificare: è come una persona legge sul proprio schermo |
| Sessione | 90 giorni | Un token scaduto senza rete chiuderebbe fuori dal repertorio |
| Database | Neon via Vercel Marketplace | Variabili iniettate, zero configurazione manuale |
| Lingua UI | Solo italiano (superata: l'interfaccia è passata all'inglese nel corso del progetto, vedi tabella Stack) | Un utente, nessun bisogno di i18n |

### Canzonieri (v1.1)

| Decisione | Scelta | Perché |
|---|---|---|
| Cardinalità | Contenitore: un brano, un canzoniere | Lettura letterale del requisito; appartenenza sempre certa e rimozione con un significato ovvio |
| Proprietà | Il file dà il valore iniziale, poi comanda il DB | Senza questa regola il primo seed cancellerebbe ogni rinomina fatta dall'app |
| Slug del canzoniere | Immutabile, generato una volta | Rinominare non tocca chiavi esterne, URL né voci di precache |
| Rimozione | Rifiutata se non vuoto, con spostamento obbligato | Nessuna perdita possibile; `on delete restrict` la impone nel database |
| Cascata | Esclusa | Si annullerebbe da sola: i file esistono ancora e il primo seed farebbe risorgere i brani |
| URL dei brani | Invariata, il canzoniere non ne fa parte | Rinomine e spostamenti non rompono segnalibri, precache né preferenze |
| Rotta per canzoniere | `/canzonieri/[slug]`, dalla v2.0 | La rinomina non sposta niente (lo slug è immutabile), e aspettare la ricostruzione è il patto di ogni brano importato |
| Freschezza | Guscio statico + strato mutabile a runtime | Con precache cache-first un `revalidatePath` non arriverebbe mai al dispositivo |
| Home | Elenco dei canzonieri, uno per riga | Un tocco, una destinazione: la piega che si apriva lasciava i brani dentro la schermata sbagliata (v2.0) |
| Gestione offline | Disabilitata | Struttura condivisa fra account: un last-write-wins non è innocuo come su una trasposizione personale |
| Stato iniziale | Ricavato dai tag esistenti | I tag contenevano già questa categorizzazione |
| Pruning dei canzonieri | Escluso dal seed | Esistono legittimamente canzonieri che nessun file ha mai dichiarato |

### Import e modifica (v1.2)

| Decisione | Scelta | Perché |
|---|---|---|
| Proprietà dei brani | Il database, non i file | Scelta esplicita dell'utente; l'import scrive una riga e non committa nulla |
| Seed | Solo inserimento | Non può più aggiornare senza sovrascrivere le correzioni, né fare pruning senza cancellare gli import |
| Ingresso | Solo testo incollato | È come si trovano gli accordi; upload e URL scartati come poco usati o fragili |
| Formato | Riconosciuto da sé | ChordPro passa, il resto si converte: nessun formato da conoscere |
| Conversione | Euristica con preview obbligatoria | Sbaglierà su qualche sorgente, e la preview più il corpo modificabile sono la via d'uscita |
| Metadati | Dedotti e correggibili | Nel caso comune non si tocca nulla. La tonalità non è più fra loro (v2.0): la sanno gli accordi |
| Scope | Import, modifica e cancellazione | La cancellazione è obbligata: senza file da eliminare un errore sarebbe permanente |
| Duplicati | Avviso con sostituisci / aggiungi / annulla | Sostituire conserva lo slug, quindi le preferenze del brano sopravvivono |
| Pubblicazione | Esplicita, un build per gruppo | Lista, ricerca e precache si generano al build: un solo modello, e cinque brani costano un deploy |
| Stato «in attesa» | Confronto con il timbro del build | Riflette ciò che il build ha visto, non ciò che l'app crede di aver pubblicato |
| Backup | Export manuale scaricabile | Scelta esplicita dell'utente, senza token; il rischio di dimenticarlo è accettato |
| Ripristino | Il seed di solo inserimento | Dà all'export una via di rientro senza toccare ciò che esiste |

### Account (v3.0)

| Decisione | Scelta | Perché |
|---|---|---|
| Account corrente | Cookie separato dal token di sessione, sempre riverificato lato server | Non è un fatto di sicurezza come il ruolo, ma una preferenza di navigazione; deve comunque non fidarsi di sé stesso |
| URL | Invariati, l'account non compare nella rotta | Coerente con l'architettura sottile attuale; il costo è che un link copiato dipende da quale account ha attivo chi lo apre — accettato, Strum Together resta a parte con i suoi token |
| Unicità di slug e brani | Globale, come prima della v3.0 — `accountOwnerEmail` resta una colonna su `songbooks`, non parte della chiave | Deciso in interview come chiave composta per account, poi rovesciato: `generateStaticParams` genera a build time, senza un account di richiesta con cui comporla. `uniqueSlug()` evita le collisioni alla clonazione dell'Example |
| Confine di privacy per slug globali | Pagine dinamiche (`force-dynamic`) con controllo d'accesso per-richiesta, non più la generazione statica | Uno slug globale raggiungibile da chiunque sia autenticato è una fuga; il controllo deve stare nel caricamento, non nel fatto che la pagina esista già pre-generata |
| Precache offline | Rimosso il precache d'installazione di tutti i brani; sostituito da caching di runtime autenticato (`sw.ts`) + warm-up per-lettore (`OfflineSync`) | Un unico precache per l'intera installazione scaricava ogni account su ogni dispositivo; con più account non c'è più un "tutti i brani" innocuo da precachizzare |
| Pannello "in attesa di pubblicazione" | Rimosso, con la tabella `builds` | Aveva senso quando un salvataggio aspettava una build; con le pagine dinamiche un salvataggio è live subito |
| Tabella `accounts` | Esplicita, non dedotta dai canzonieri | Un account deve poter esistere un istante prima che la clonazione gli scriva dentro qualcosa, e dà un bersaglio pulito alle chiavi esterne |
| Canzoniere Example | Nuovo, dedicato, distinto dai canzonieri segnaposto in `content/` | Il repertorio "vero" del primo account non deve fare anche da template per tutti gli altri |
| Come si segna l'Example | Flag booleano su `songbooks`, indice unico parziale | Spostarlo in futuro è un `UPDATE`, non un deploy |
| Cancello d'ingresso | Invariato: proprietario o già presente in `members` per qualunque account | Aprire l'accesso a chiunque non è stato chiesto; solo il repertorio si moltiplica, non chi può entrare |
| Creazione dell'account | Automatica al primo login riuscito, per chiunque superi il cancello | "Ogni utente ha il proprio account" è letto alla lettera, non solo per i proprietari |
| Ruolo nel proprio account | Sempre admin *di quell'account*, non rimovibile, ma senza il potere di vedere gli altri account | Un editor non gestisce la lista delle persone (regola già esistente, v2.1); chi possiede un account deve poterne gestire i collaboratori. Distinto dal bypass globale, altrimenti "admin" smetterebbe di voler dire "vede tutto" |
| `members.role` concedibile | Solo editor o viewer, mai admin | L'admin di un account non è un grado che si invita: o sei il proprietario, o sei un proprietario globale |
| Chi può trasmettere (Strum Together) | Editor o admin sull'account aperto in quel momento | Un viewer può seguire un canzoniere, non esporlo pubblicamente con un link |
| Preferenze globali (`userPrefs`) | Restano della persona, non dell'account | Zoom, notazione e strumento sono un'abitudine di lettura, non del repertorio guardato |
| Migrazione dei membri esistenti | Convertiti as-is sull'account del proprietario scelto | Nessuno deve essere re-invitato per non perdere l'accesso che ha già oggi |
| Account personale di chi c'era già | Creato al login successivo, stesso meccanismo dei nuovi utenti | Nessuna logica speciale in più solo per la migrazione |

### Niente più ospiti (v3.1)

| Decisione | Scelta | Perché |
|---|---|---|
| Scope della pagina Accounts | Tutta la pagina, solo proprietari globali — non più "Yours" condiviso con azioni riservate | La seconda platea della pagina di oggi (collaboratori multi-account) sparisce del tutto in questa versione: non resta nulla da condividere |
| Selettore per collaboratori multi-account | Tolto, non spostato | Non può più esistere nessuno con accesso a più di un account, a parte i proprietari globali, che hanno già Accounts |
| Creare un account | Nuovo canale di ammissione: l'indirizzo può accedere anche se non è in `ALLOWED_EMAILS` né mai stato invitato | È il modo in cui "un utente nuovo trova il proprio account già pronto" resta vero senza più poter passare da un invito come collaboratore |
| Invitare sconosciuti da altrove | Non esiste più: solo un proprietario globale ammette indirizzi nuovi, e solo da Accounts | Diretta conseguenza di "niente più ospiti": non c'era un secondo posto da cui farlo restare aperto |
| Eliminazione di un account | Cascata immediata, nessun blocco se non vuoto, nemmeno per l'account di un proprietario globale | Scelta esplicita dopo un confronto sul rischio: l'unica rete voluta è la ridigitazione dell'indirizzo, non un divieto strutturale |
| Poteri di un proprietario globale su un account altrui | Pieno controllo, invariato dalla v3.0 | Niente ruolo intermedio "in visita"; chi amministra l'installazione non perde potere perché i collaboratori spariscono |
| Ruoli concedibili | Uno solo: admin (proprietario dell'account, o proprietario globale). Nessun equivalente di editor/viewer | Non esiste più nessuno a cui concedere un accesso parziale |
| Migrazione dei quattro collaboratori esistenti | Un account proprio per ciascuno, vuoto a parte l'Example — non l'accesso a Cartoni animati | Coerente con "un account è un indirizzo": nessuno resta ospite di un account altrui dopo questa versione |
| Password di un account altrui | Un proprietario globale può impostarla o rimuoverla dalla pagina Accounts (`setPasswordFor`/`removePasswordFor`, autorizzate su `isOwner` diretto) | Corretto poco dopo aver spedito la v3.1: senza email d'invito, era l'unico modo per far entrare un indirizzo creato da Accounts ma senza un account Google corrispondente |
| Un indirizzo tolto da `ALLOWED_EMAILS` | Non elimina nulla da sé: nessun flusso di rimozione esiste, l'account e i suoi canzonieri restano raggiungibili finché un proprietario globale non li cancella esplicitamente | Coerente con come `accounts`/`isAdmitted` sono scritte: uscire dalla lista toglie i poteri di proprietario globale, non tocca l'account personale sottostante |

### Si entra da soli (v3.2)

| Decisione | Scelta | Perché |
|---|---|---|
| Apertura della registrazione | Completamente pubblica, nessuna restrizione di dominio o codice d'invito | Scelto esplicitamente dopo un confronto sul rischio di abuso, mitigato dalle due righe sotto |
| Mitigazione abusi | Rate limiting lato database (nuova tabella `rateLimitHits`) + CAPTCHA (Cloudflare Turnstile) su registrazione e recupero password | Sono le due superfici che, su richiesta di chiunque, mandano un'email a un indirizzo scelto da chi la chiede — il vettore più ovvio di email-bombing di qualcun altro |
| Account prima o dopo la verifica | Dopo: una tabella `pendingRegistrations` a parte, l'account vero (e l'Example clonato) nasce solo alla verifica | Coerente con "niente esiste finché non c'è un motivo vero" già seguito altrove nel progetto; nessun canzoniere vuoto per chi non completa mai la registrazione |
| Servizio email | Resend | Integrazione ufficiale Vercel, piano gratuito ampio, stessa categoria di provisioning già usata per Neon |
| Registrazione con Google | Lo stesso pulsante "Sign in with Google" di `/login` funge già da registrazione | OAuth non distingue login da signup a livello di protocollo: la creazione dell'account è un effetto collaterale di un'autenticazione riuscita, non un percorso separato |
| `isAdmitted`/`hasAccount` in `auth.ts` | Ritirate, non semplificate | Senza più nessuno da tenere fuori, il cancello non ha più lavoro da fare: un OAuth Google riuscito o una password corretta contro un account già verificato bastano da soli |
| Recupero password su un indirizzo senza password | Stessa risposta, stessa azione (`writePasswordHash`) di un vero reset | Equivale a "imposta la prima password"; nessuna distinzione visibile a chi la chiede |
| Enumerazione degli indirizzi | `/forgot-password` risponde sempre allo stesso modo, l'indirizzo esista o meno | Evita di rivelare quali indirizzi hanno un account, stesso principio della reiezione a tempo costante già in `authorize()` |
| `ALLOWED_EMAILS` dopo questa versione | Resta solo "chi è proprietario globale", smette di essere condizione per entrare | Le due cose erano già separate dalla v3.0; questa versione toglie solo la prima come requisito |
| Moderazione oltre la cancellazione | Non costruita: un proprietario globale può solo cancellare un account, non bloccarlo — lo stesso indirizzo può ri-registrarsi subito dopo | Nessun bisogno reale emerso finora con la registrazione aperta; se emerge, va deciso e costruito a parte |
| Sessioni dopo un reset password | Non invalidate: restano un JWT di 90 giorni senza stato lato server, la stessa scelta già presa per il ruolo (v2.1) | Un dispositivo già connesso resta connesso finché il token non scade da solo; invalidarlo davvero richiederebbe un'epoca/versione di sessione lato server, cambiamento più grande di questa versione |

### Il menu utente (v3.3)

| Decisione | Scelta | Perché |
|---|---|---|
| Significato dell'etichetta "Owner" | Proprietario globale (`isOwner`), non il ruolo `admin` | Dalla v3.1 `admin` è di chiunque abbia un account: mostrarlo per quel controllo non distinguerebbe nessuno |
| Cambia password e Sign out | Spostati dal menu hamburger al nuovo menu utente, non duplicati | Un solo posto per le azioni sul proprio account; l'hamburger resta solo navigazione |
| Sorgente dell'avatar | L'indirizzo email (iniziali + colore derivati), mai il profilo Google | Un account per email e password non ha nome né foto; due fonti diverse avrebbero fatto sembrare due funzionalità quella che è una sola |
| Colore dell'avatar nei due temi | Fisso, non ridefinito in dark mode | Un colore per persona non è parte della palette della pagina come `--accent`; non deve cambiare con il tema, come non cambierebbe una foto |

### Pagamenti (v3.6)

| Decisione | Scelta | Perché |
|---|---|---|
| Storico pagamenti | In `paddle_events`, non una tabella nuova | Stessa forma che scriverà un giorno il webhook vero; storico utente e admin leggono da un'unica fonte |
| Upgrade vs. downgrade/disdetta | Upgrade sempre immediato; downgrade e disdetta a fine periodo pagato | Chi paga di più vede il beneficio subito; chi scende o disdice mantiene ciò che ha già pagato fino alla scadenza |
| Admin sullo storico | Solo lettura, nessuna leva diretta | Un proprietario globale può già agire "come" qualsiasi account da Switch e usare il checkout lì; una seconda leva duplicherebbe quel percorso |
| Disdetta | Modellata come "downgrade verso `free`", una sola colonna (`pending_plan`) | Meno stato di un piano pendente più un booleano separato, stesso significato |
| Confronto di rango | Contro l'abbonamento dal vivo, mai contro il piano effettivo (che può includere un regalo) | Altrimenti un regalo più alto farebbe leggere come downgrade un upgrade reale dell'abbonamento sottostante |
| `lifetime` | Non si disdice né si declassa nel mock | Non ha una scadenza su cui far scattare nulla; un cambiamento per un cliente lifetime resta un caso di supporto |

### Attivazione obbligatoria del piano (v3.7)

| Decisione | Scelta | Perché |
|---|---|---|
| Scope | Solo il gate di attivazione, non upgrade/downgrade/disdetta (v3.6, già completi) | Una fase nuova dentro la voce della v3.6 avrebbe confuso "fatto" con "da fare" |
| Retroattività | Nessuna: ogni account esistente backfillato come "già attivato" (`plan_chosen_at = created_at`) | Zero interruzione per chi già usa l'app, zero sorpresa di supporto |
| Global owner | Esente dal gate | Non è un cliente, e può già agire "come" qualsiasi account tramite Switch |
| Dove vive il gate | `(home)/page.tsx`, non middleware né `RoleProvider` | L'unico posto che già fa una verifica server-side, dinamica, per-richiesta, con la stessa forma del redirect verso `/login` già presente lì |
| `/pricing` | Riusata, un solo pulsante cambia comportamento | Un solo posto per confrontare i piani, sia per chi deve registrarsi sia per chi deve attivarsi |
| Scegliere Free | Non è un acquisto: timbra solo `plan_chosen_at`, nessuna riga in `paddle_events` | Lo storico pagamenti resta una lista di transazioni vere |
| Dipendenza dai flag | Il gate dipende da `SONGBOOK_PLANS`, non da `SONGBOOK_MOCK_CHECKOUT`; `SONGBOOK_FORCE_PLAN` lo scavalca | L'uscita gratuita deve restare percorribile a checkout spento; l'override locale non deve finire contro il proprio stesso muro |
| Badge di piano in `/accounts` | Colori pieni e distinti per piano, solo in questa schermata | Eccezione dichiarata alla Chord-First Rule di `DESIGN.md`: una schermata operatore senza spartito non compete con un accordo |

### Da `/accounts` a ricerca con dettaglio (v3.8)

| Decisione | Scelta | Perché |
|---|---|---|
| "Create" | Rimosso del tutto, codice morto compreso | `/register` più il provisioning automatico coprono già ogni caso reale; verificato con grep che `createAccount` non aveva altri chiamanti |
| Filtro/ordinamento/paginazione | In memoria, non in SQL | Il piano risolto è una funzione pura TypeScript, non un'espressione SQL; duplicarla in un `WHERE` sarebbe una seconda copia della stessa regola |
| `listAccountPlans() === null` | Disabilita silenziosamente il filtro di piano | Stessa direzione fail-open del resto di questa parte del codice |
| Filtro piano e "Not activated" | Indipendenti, in AND | Un regalo non tocca mai `planChosenAt`: un account può essere Premium e non attivato insieme |
| Sign-in nella lista | Cifra nuda, non più la frase | `aria-label` porta la frase intera per chi usa uno screen reader |
| Formattazione del piano | Sei funzioni condivise in `lib/accounts/planText.ts` | L'alternativa (due copie fra lista e dettaglio) è il rischio esplicito che divergano |
| `/accounts/[email]` | `encodeURIComponent` sul link, `decodeURIComponent` nella pagina | L'App Router consegna il segmento ancora percent-encoded — verificato con una richiesta reale dopo un 404 in produzione, non leggendo il sorgente della libreria |
| Pagina di dettaglio | Tutto visibile; `DeleteAccountButton` tiene il proprio click-per-rivelare | L'unica eccezione è una rete di sicurezza deliberata (retype-per-confermare), non un risparmio di spazio |
| `AccountHistoryButton` | Rimosso | La sua ragione d'essere (non pagare la query per righe mai aperte) non si applica su una pagina che è già la scelta di guardare quell'account |

### Anteprima email (v3.9)

| Decisione | Scelta | Perché |
|---|---|---|
| Bottone "invia copia di test" | Incluso, non solo anteprima statica | Il rendering nel browser non riproduce le stranezze dei client email reali |
| Oggetto + HTML + testo semplice | Con un interruttore, non solo HTML | Il testo semplice è quello che arriva a chi ha immagini/HTML disattivati |
| Voce di menù | Propria (`/emails`), non una sezione in fondo a `/accounts` | I tre modelli non appartengono a un account specifico |
| Destinatario del test | Sempre `session.user.email`, mai l'account selezionato dal cambio-account | Nessuno dei tre modelli appartiene a un account |
| Rendering HTML | In `<iframe srcDoc>` isolato | Gli stili inline dell'email non devono convivere con quelli dell'app che li ospita |

### Ricontrollo generale dei piani (v3.10)

| Decisione | Scelta | Perché |
|---|---|---|
| Cambio di ciclo senza cambio di piano | Azione secondaria sulla card attiva (`Change billing cycle`) | Non un modale o una sezione a parte: la card del piano corrente è già dove si guarda |
| Devices Premium su `/pricing` | Numero reale (100), non "Unlimited" | `/login` diceva già "100" in chiaro nella FAQ; fatto vincere il numero vero invece di generalizzare a "Unlimited" ovunque |
| Avviso di limite-piano in `ImportBatch` | Un avviso unico per l'intero lotto | Un incolla multiplo può rifiutare molti brani insieme; un modale per riga sarebbe inutilizzabile |
| Wording dell'email di acquisto/`/thanks` | "Confirmation" ovunque | Non implica un documento fiscale come "receipt" |
| Prossimo passo dopo l'email di benvenuto | Una riga breve sul redirect a `/pricing` | Solo quando `SONGBOOK_PLANS=on` è davvero attivo, letto da `process.env` diretto per non portarsi dietro `lib/db/client` nel bundle di `EmailPreview.tsx` |
| Proprietario globale switchato su un altro account | Etichetta nel `TopBar` (`ViewingAsPill`) | Prima l'account in vista non era scritto da nessuna parte sullo schermo |
| Aggiornare questo piano ora o rimandarlo | Aggiornato subito | Accettato il rischio di collisione con un'eventuale riscrittura parallela di `PLAN.md` in un'altra sessione, piuttosto che lasciare il piano indietro rispetto al codice |

### Secondo ricontrollo dei piani (v3.11)

| Decisione | Scelta | Perché |
|---|---|---|
| `forceExpireNow` esposto ai clienti | Via da `/billing` del tutto | L'action resta per script e test; un'etichetta "test only" non è un permesso, e il pulsante era vivo in produzione per chiunque avesse pagato |
| Rango col piano effettivo invece dell'abbonamento | Rango sull'abbonamento vivo, **più** una riga che spiega il regalo | Corregge l'acquisto involontario *e* la contraddizione fra badge del menu e card marcata «Your plan»; `plan` non cambia significato, così il badge continua a dire quali limiti valgono |
| Lifetime su `/pricing` | Stato terminale esplicito, nessun CTA | Ogni azione era già un no-op rifiutato; «Switch to Free» indovinava male fra i tre casi di `not-applicable` e diceva a un Lifetime che era su Free |
| Dove estendere il gate di scelta piano | Helper condiviso sulle tre rotte di contenuto | Non middleware (`hasChosenPlan` legge Postgres, l'edge non regge) e non un layout (coprirebbe `/pricing`: loop di redirect) |
| `/export` e `/password` nel gate | Lasciate fuori, dichiaratamente | Sono `○`: un redirect dipendente dalla sessione le renderebbe dinamiche e romperebbe il precache offline |
| Regalo ritirato invisibile in lista | Filtro ed etichetta, nessuna semantica cambiata | Non timbrare `planChosenAt` sul regalo avrebbe rimandato al gate un account appena regalato |
| `lifetime` con data di scadenza | Bloccato nel form **e** in `validateGrant` | Un form è un suggerimento a un browser, non una promessa su una server action che chiunque abbia il cookie può chiamare |
| Regalo di rango ≤ abbonamento vivo | Avvisa ma permette | È inerte adesso, ma è un pavimento legittimo per quando l'abbonamento scadrà — a differenza di `free`, che non lo è mai |
| `grace` + pending | Espone il pending, senza mai farlo scattare | Nasconderlo toglieva al cliente con la carta che fallisce l'unico modo di annullare un downgrade, nel momento peggiore |
| Cast non validato in `history.ts` | Non corretto | Cade nel `default` come «Event», nessun valore fuori posto esiste, un solo produttore nello stesso file: difensivo oltre lo scopo |

### Terzo ricontrollo dei piani (v3.12)

| Decisione | Scelta | Perché |
|---|---|---|
| Piano scaduto per data, stato ancora `active` | `live` calcolato dal server e passato alle schermate | Le tre schermate del cliente decidevano da `status`, i gate da `status` **e** data: una sola risposta, letta dove ci sono già l'orologio e la regola, invece di tre copie del confronto |
| Dove correggerlo | Alla giuntura (`loadCheckoutStatus`/`loadPurchaseSummary`), non nelle schermate | Quattro sintomi (`/billing`, `/thanks`, la riga di stato, «Cancel my plan») venivano da una causa sola; `subscriptionCopy.ts` esiste proprio perché tre schermate non riscrivano la stessa frase |
| `grace` dentro la nuova regola | Resta vivo, con la sua frase | `liveSubscription` lo tiene non-null di proposito: una carta in ritentativo non è un cliente scaduto |
| `isCurrent` su `/pricing` | Sull'abbonamento, come già `currentRank` | Era la metà rimasta indietro nella v3.11: la card «Your plan» era il regalo, e l'unico controllo accanto vendeva davvero quel piano |
| Downgrade su `/checkout` | Detto prima del pulsante, campi carta via | Non incassa nulla e non cambia nulla quel giorno: chiedere una carta e rifiutarne una sbagliata è teatro che inganna |
| Cambio ciclo che accorcia il periodo | Avvisa con entrambe le date, semantica invariata | «Rango pari applica subito» resta la regola di `mockPurchase`; ciò che mancava era dirlo prima, non cambiarla |
| Cambio programmato senza `planExpiresAt` | Applicato subito, con `effect` nel risultato | Non c'è data su cui scattare: `resolveSubscription` lascia intatta una riga con `expiresAt: null`, quindi il cambio restava inerte mentre la schermata lo dava per programmato |
| Su quale riga decidere programmato/immediato | Sulla riga **risolta**, su entrambi i lati | La colonna grezza e la vista risolta divergono proprio dove serve (cambio già scattato): lo schermo prometteva un acquisto e otteneva un cambio programmato, che scattava comunque al caricamento dopo — senza ricevuta. `grace` tiene la sua data e resta programmato |

### Quarto ricontrollo dei piani (v3.13)

| Decisione | Scelta | Perché |
|---|---|---|
| `/pricing` statica o dinamica | Dinamica, `loadIdentity()` letto dal server | Il contenuto è una costante, *chi legge* no: una pagina statica dice a tutti «nessuno è loggato» al primo pixel, e il gate manda lì proprio chi è loggato. Costo accettato: un decode del cookie e due query per lettura |
| Come evitare il lampo, alternativa scartata | Non un segnaposto fino all'idratazione | Nasconde la risposta sbagliata senza produrne una giusta, e toglie i bottoni dall'HTML statico ai visitatori per cui la staticità esisteva |
| Chi decide il bottone dell'header | Il layout di `/pricing`, non `PublicHeader` | Sei altri layout lo montano davanti a una pagina senza sessione, dove «Sign in» è giusto; la decisione appartiene all'unica pagina che serve due pubblici |
| Header per chi è nel gate | Nessun bottone | Ogni destinazione è un rimbalzo: `/` lo rimanda indietro. Un bottone che riporta alla pagina in cui sei è peggio di nessun bottone, e ora la spiegazione la dà la pagina |
| Ciclo e importo su `/billing` | Derivati dal ledger, nessuna colonna nuova | La riga `purchase` porta già il ciclo, ed è la stessa che la tabella stampa poco sotto: non possono divergere, mentre una colonna aggiornata da una scrittura e non dall'altra sì |
| Frase su cosa succede dopo | Nessuna, né «si rinnova» né «non si rinnova» | Niente qui rinnova nulla, quindi «renews» promette un addebito che non arriva; «non si rinnova mai» sarebbe un'affermazione sul futuro che Paddle smentirebbe. «active until ‹data›» resta nuda di proposito |
| Conferma sulla disdetta | Due passi in linea, come la cancellazione in `SongForm` | Già il modo di questo codice per un atto distruttivo; un modale nuovo per la stessa domanda sarebbe un secondo modo di chiederla |
| Dove vive la frase della conferma | `cancelQuestion` in `subscriptionCopy.ts`, con test | Ha una regola dentro — `grace` senza data — e una regola va dove un test la tiene; scritta in linea chiedeva a una carta in ritentativo di confermare una disdetta su un giorno già passato |
| Chi decide se il gate ferma davvero | `isOwner` **e poi** il dato, su entrambe le metà | `requirePlanChoice` esenta un proprietario globale prima di consultare `hasChosenPlan`: il dato grezzo diceva «One step left» a chi non è fermato da nulla, e gli toglieva ogni bottone dall'header |
| Scelta di Free dal gate | Passa da `/thanks` | Il ramo Free di quella schermata era scritto per questo momento e non lo raggiungeva nessuno; era anche l'unico atto dell'app che si confermava atterrando altrove |
| `role="dialog"` nel modale | Sulla card, non sull'overlay | L'overlay contiene anche il backdrop: dichiarare modale un elemento che ha dentro un `aria-hidden` |
| Fuoco iniziale nel modale | Sulla card, non sul primo bottone | Il primo è «Close», l'ultima cosa che vuole chi ha appena incontrato un limite; sulla card viene letto il titolo |
| Trappola del Tab e ripristino del fuoco | Effetto separato, dipendenze vuote | L'handler di Escape dipende da `onClose`, che ogni chiamante passa come arrow nuova: uniti, un re-render del genitore avrebbe restituito il fuoco alla pagina dietro mentre il dialogo era ancora aperto |
| Lettura fallita dello storico | Flag su una pagina pronta, non un quarto stato | La metà abbonamento decide se la pagina si disegna affatto; solo lo storico può fallire da solo |
| Checkout finto che sembra reale | Lasciato com'è, deciso in sessione | Rischio riconosciuto: registrazione aperta, `/pricing` pubblica, nessun `noindex`, flag `on` in produzione. Accettato, non sfuggito |
| Default annuale e badge di risparmio su `/pricing` | Lasciati com'è, deciso in sessione | Resta Monthly di default e resta il disallineamento con `/checkout`, che parte da `'year'` |
| Cancellazione immediata nel ledger | Voce nuova `cancelled_now` | `scheduled_change` con `plan: 'free'` dice «a fine periodo»: era la riga sotto una conferma che diceva l'opposto |
| «Cancel my plan» con un downgrade pendente | Permesso (`pendingPlan !== 'free'`) | Uscire dal piano richiedeva prima «Keep ‹piano›», senza che nulla lo dicesse; una cancellazione già programmata invece non ha altro da cancellare |
| Copy del gate obbligatorio | «Choose ‹piano›», non «Upgrade to» | Chi non ha mai scelto non ha da cosa fare l'upgrade: la riga dice `free` solo perché è il default della colonna |
| Date nella tabella pagamenti | `plain` su `/billing`, ISO su `/accounts` | Sotto una frase che scrive «22 September 2026», una riga «2026-08-23» sono due formati a un centimetro di distanza; l'operatore invece le confronta e le copia |
| Downgrade programmato durante `grace` | Non corretto | È la regola dichiarata di `grace` (nessun confronto di data), e il webhook vero è ciò che tira fuori l'account da lì |

### Commenti ancorati (v4.0)

| Decisione | Scelta | Perché |
|---|---|---|
| Spazio di coordinate dell'ancora | Quelle del modello dell'editor, `(blockIndex, charOffset)` | `SongDocument.blocks` è 1:1 col sorgente; l'AST di lettura scarta righe vuote e direttive ignote e non sa più indirizzare una posizione nel file |
| Ponte fra i due AST | `anchorMap.ts`, costruito dal sorgente | Non sono derivabili l'uno dall'altro: `parseLyricLine` consuma gli spazi, quindi riunendo le parti si recuperano le lettere ma non la spaziatura |
| Un commento che perde l'appiglio | Diventa orfano ed è dichiarato tale | Non si perde prosa scritta a mano come effetto collaterale invisibile di una modifica, e l'etichetta «on ‹parola›» non mente mai |
| Da dove viene quella regola | Scritta, non ereditata da `shiftChords` | Quella funzione collassa e non orfanizza mai: `editedSpan` è estratto perché le due condividano la misura e divergano solo nella politica |
| Ri-ancoraggio: quando e dove | Al salvataggio, fuori dalla transazione | È l'unico momento in cui esistono entrambe le versioni del sorgente; e un suo fallimento non deve annullare la modifica che il lettore ha chiesto |
| Coda di scrittura | Outbox persistente per-commento, non `prefsQueue` | Quella tiene una voce per canzone con last-write-wins e vive in memoria: cancellerebbe la prima di due note modificate di seguito, e un reload offline perde ciò che attende |
| Chi conia l'id | Il client | Una nota scritta senza rete ha bisogno di un'identità prima che un server la veda — è ciò con cui l'outbox la indicizza |
| Come `SongSheet` riceve le note | Prop, mai contesto | Ha quattro chiamanti e solo uno può mostrarle: passarle rende muti per costruzione gli altri tre, ospite di Strum Together incluso |
| Gating di piano | Nessuno | Stessa categoria della trasposizione e del capotasto: non è la modifica di qualcosa di condiviso, è come questo lettore legge sul proprio schermo |
| Colore della nota | Blu `--note`, token proprio | L'accento appartiene agli accordi: una nota non può mai essere scambiata per musica. Token separato da `--plan-standard`, che oggi porta gli stessi valori, perché significano cose diverse e un cambio di prezzi non deve ricolorare le annotazioni |
| Numerazione dei pallini | Derivata al render, mai memorizzata | Un numero memorizzato andrebbe riscritto su ogni riga sotto un inserimento, e il numero che si vede è una proprietà della pagina, non della nota |
| Interruttore: forma e posto | Traccia a tre segmenti, nell'header della canzone | Solo l'attivo porta una parola, così resta largo quanto un'etichetta più due icone; e non è un controllo del dock di lettura, appartiene all'intestazione accanto a Edit |
| Card: dove si apre | Appuntata sotto il segno, a ogni larghezza | Il motivo per cui è appuntata lì è che le parole di cui parla restino visibili accanto: un pannello a piè di pagina è esattamente ciò che lo impedisce. Su schermo stretto si restringe la card, non si cambia strategia |
| Sfondo della card | Non oscura, a nessuna larghezza | Spegnere la canzone per due righe di nota toglie proprio ciò che l'ancoraggio serviva a garantire |
| Bottoni della card | `btn btn-primary` / `btn btn-quiet` veri | La prima versione se li disegnava e il Save usciva nel blu della nota, senza corrispondere a nessun'altra azione primaria dell'app: due set di stili erano due set da tenere in passo |
| Nota di canzone (`user_song_prefs.note`) | Eliminata, migrazione 0030 | I commenti dicono quello che diceva lei e in più dicono *dove*; contate prima di toglierla, zero note non vuote in tutta l'installazione |
