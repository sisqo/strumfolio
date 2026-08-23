# Strumfolio — Piano di implementazione

> Il progetto si chiamava **songs** fino alla v2.4, quando è cambiato solo il nome
> mostrato. Repo (`sisqo/songbook`) e dominio (`songbook.sisqo.dev`) sono stati spostati
> in seguito, per allinearli. Il 21 agosto 2026 il nome mostrato è cambiato di nuovo, in
> **Strumfolio**, con repo (`sisqo/strumfolio`) e progetto Vercel rinominati in blocco
> stavolta; il dominio è passato per una tappa intermedia (`strumfolio.sisqo.dev`) prima
> di arrivare, lo stesso giorno, a `strumfolio.com` — dominio proprio, non più un
> sottodominio di `sisqo.dev`. Resta ferma in entrambi i casi la tabella `songs` nel
> database: è il nome di un brano, non del progetto — lo schema ha già una `songbooks`
> distinta per i contenitori — quindi il resto di questo piano la nomina ancora quando
> parla di quella, di proposito.

> **Stato:** da v1 a **v3.12 — terzo ricontrollo dei piani** (l'ultima versione numerata in
> questo documento) sono consegnate e in produzione su https://strumfolio.com. La v1.2 ha cambiato
> chi possiede un brano: il database, non i file — va letta prima di toccare il seed. La
> v1.3 ha aggiunto lo strato che mostra la versione del database sopra la pagina statica: va
> letta prima di toccare la lettura. La v1.4 ha portato l'editor in una pagina sua, con la
> regola che nessuna modifica può riscrivere il file: va letta prima di toccare il modello a
> blocchi.
>
> **Questo numero di versione non è più completo.** Due versioni successive alla v3.3 — un
> redesign di `/login`/`/pricing` e una correzione di cascata sulle preferenze — sono già in
> produzione con la propria etichetta (`v3.4`, `v3.5`, citate nei commenti di
> `PricingPlans.tsx`, `app/pricing/page.tsx`, `db/schema.ts`) ma non hanno mai avuto una voce
> qui: sono nate direttamente nel codice, senza un documento di piano a parte da cui
> confluire. Lo stesso vale per il lavoro spedito dopo la v3.9 (`/changelog`, le notifiche
> Telegram, le launch screen iOS, "Recently played", il redesign di `/thanks` e del menu in
> alto, `/pages`, e altro ancora — vedi `git log`) — nessuna di quelle versioni ha oggi un
> numero né una voce in questo file. Il buco è dichiarato, non un errore di questa modifica:
> colmarlo per intero richiederebbe di ricostruire da zero, leggendo commit e diff, una
> storia che a differenza di v3.6–v3.9 non parte da nessun documento già scritto.

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
{title: Certe notti}
{artist: Ligabue}
{songbook: Repertorio}       ← solo il valore iniziale, vedi Contenuti e seed
{start_of_chorus} … {end_of_chorus}

[Am]Certe [F]notti la [C]macchina sembra una [G]donna
```

**Normalizzazione dei suffissi.** Il parser riduce le grafie equivalenti a una forma
canonica interna (`m`/`min`/`-` → `m`, `maj`/`ma`/`△` → `maj`, `dim`/`°` → `dim`,
`aug`/`+` → `aug`) prima di qualunque altra cosa; entrambe le tabelle di notazione
formattano da quella forma canonica, mai dal testo grezzo — altrimenti un `Cmin7` scritto a
mano non verrebbe mai mappato in `Do-7`.

## Motore musicale

### Trasposizione

Ogni accordo si scompone in `{ fondamentale, suffisso, basso }`; la trasposizione è
`(pc + n) mod 12` su una classe di altezza 0–11. Due regole: **senza trasposizione la
grafia della sorgente si conserva** (un `Bb` in Do resta `Bb`, mai riscritto `La#`);
**trasponendo, la tonalità d'arrivo decide** l'enarmonia secondo il circolo delle quinte
(dieci semitoni sopra arriva in Sib, si legge `Ab` e mai `Sol#`). La tonalità si stima
dagli accordi del brano, non più un campo salvato dalla v2.0. Il capotasto (v1.8) sottrae
dalla distanza scritta prima di sonare.

### Notazione

Il toggle IT/INT cambia insieme alfabeto delle note e stile delle sigle, due tabelle
separate coerenti ciascuna con la propria convenzione: `Cm7b5` ↔ `Do-7b5`, `Bb` ↔ `Sib`,
`Cmaj7` ↔ `Do△7`. In internazionale il display coincide col sorgente ChordPro; in italiano
no, di proposito.

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
"organizzato" — per canzone o per sezione, cartelle numerate — resta distinto e non tocca
il primo, perché quello è anche il percorso di ripristino (vedi *Export organizzato* in
Decisioni; non ancora costruito).

Un effetto da conoscere: se cancelli un brano dall'app e il suo file è ancora in
`content/`, il prossimo `npm run seed` lo **reinserisce** — comportamento corretto per un
comando che significa «carica ciò che manca», ma i quattro file segnaposto andranno
rimossi dal repo quando entra il repertorio vero, o risorgeranno a ogni ripristino.

## Preferenze

| Preferenza | Granularità | Dove |
|---|---|---|
| Trasposizione (semitoni) | per brano | `user_song_prefs` |
| Velocità auto-scroll | per brano | `user_song_prefs` |
| Zoom | globale | `user_prefs` |
| Notazione IT/INT | globale | `user_prefs` |

Tutte sul DB, sincronizzate fra dispositivi, con la coda offline descritta sopra. Scritture
debounced (2s) via server action.

## Fasi

### v1 — lettura

Fondazione: Neon + Drizzle, Auth.js con Google e un'allowlist, parser ChordPro → AST,
pagine statiche (lista, brano, scaletta) con accordi renderizzati sopra il testo, barra
controlli (zoom, trasposizione, notazione), auto-scroll con wake lock, preferenze su DB con
coda offline, ricerca client-side, PWA con Serwist. Consegnata e in produzione.

### v1.1 — canzonieri

Consegnata. La prima scrittura dall'app, su una superficie minima: nomi e appartenenza, non
i brani. Migrazione additiva (`canzonieri`, `songs.canzoniere_slug` nullable poi stretta a
`not null`), direttiva `{canzoniere:}` nel parser, seed che non fa mai pruning dei
canzonieri, gestione da `/canzonieri` con spostamento obbligato prima di rimuovere. Una
rinomina e uno spostamento applicati al database sono verificati sopravvivere a un
`npm run seed` che rileggeva ancora file col vecchio nome.

### v1.2 — import e modifica

Consegnata. Il cambio di regime: il database diventa il padrone dei brani. Tabella `builds`
per il timbro di "in attesa"; seed a solo inserimento; convertitore «accordi sopra il
testo» → ChordPro; `/importa` con preview e salvataggio; rilevamento duplicati; modifica e
cancellazione; export «Scarica tutto» col seed come via di ripristino.

### v1.3 — le modifiche si vedono subito

Consegnata, in risposta a un bug reale: salvare non cambiava nulla a schermo, e riaprire la
modifica mostrava ancora le parole vecchie. Soluzione a una sola regola, pura e testata:
confrontare `songs.updated_at` con la versione con cui la pagina è stata generata, mai un
timbro o un orologio del browser — un salvataggio restituisce la riga scritta, non l'input
passato. Verificato **battendo il precache di produzione**, non evitandolo: con il service
worker installato, la pagina in cache mostra ancora la versione vecchia mentre lo schermo
già mostra la correzione.

### v1.4 — editor e icone

Consegnata. L'editor esce dalla pagina del brano e diventa una pagina sua
(`/canzoni/<slug>/modifica`), non statica e non precachata, con tre modalità sopra
un'unica sorgente a blocchi (uno per riga del file, con `toSource(fromSource(x)) === x` per
garanzia di round-trip — nessuna riga ignorata dal lettore, come `{new_song}`, va persa al
salvataggio): **Grafico**, **Sorgente**, **Anteprima**.

**La copia nascosta**, la soluzione più notevole: gli accordi devono stare sopra la
sillaba giusta dentro un `input` (che non ha nodi di testo su cui appendere niente), quindi
sotto la riga di accordi c'è una copia invisibile delle stesse parole nello stesso font, e
il browser stesso fa la misura — verificato con un righello indipendente, scarto **0,0 px**
su ogni accordo. La stessa idea vale al contrario (da un tocco alla lettera sotto il dito)
misurando con un canvas nello stesso font.

### v1.5 — l'header sempre uguale, e l'import di più brani

Consegnata. Il marchio torna a comparire sempre nell'header (spariva proprio sulla pagina
del brano, quella usata più a lungo, in standalone senza cornice del browser). In
`/importa`, il canzoniere di destinazione diventa il primo campo — non l'ultimo dopo
l'analisi — e vale per tutta la pasta incollata; un testo con più brani (divisi solo su
segni espliciti: `---`, `{new_song}`, un secondo `{title:}`, mai una riga vuota) diventa una
riga per brano, modificabile e salvata in sequenza, ognuna col proprio esito.

### v1.6 — una via sola per il brano accanto, e l'ordine in mano

Consegnata. Le due card "brano precedente/successivo" in fondo allo spartito spariscono (le
frecce nell'header portavano già agli stessi due posti, senza il costo di due query in più
per pagina). Nuova colonna `songs.position`, nullable e senza default — Postgres mette i
null in fondo a un ordinamento crescente, quindi la migrazione non sposta nulla finché
nessuno trascina — riordinabile dal canzoniere aperto in home, col dito (eventi puntatore,
l'unica API che funziona su un touchscreen) o da tastiera.

### v1.7 — i comandi fermi, l'ordine dell'import, l'ukulele

Consegnata. I comandi dell'editor diventano un blocco sticky invece di scorrere con la
pagina; i brani importati in una pasta restano nell'ordine in cui sono stati incollati
invece di alfabetizzarsi; un nuovo strumento (chitarra/ukulele, preferenza globale) cambia
solo la *forma* del diagramma, mai l'accordo sullo spartito — la tabella dell'ukulele è
generata da una ricerca verificata contro le note di ogni accordo, non scritta a mano.

### v1.8 — capotasto

Consegnata. `user_song_prefs.capo`: lo spartito mostra le forme da fare, non gli accordi
che suonano davvero (`letto = scritto + semitoni − capotasto`, `sonante = scritto +
semitoni` — una sottrazione testata a parte, perché sbagliata di segno resta plausibile a
schermo). Un suggerimento propone il tasto che rende aperti più accordi del brano, mai
applicato da sé.

### v1.9 — la modifica ridisegnata

Consegnata, da un handoff di Claude Design che completa il ridisegno già fatto per lettura,
elenchi e barra: testata dell'editor su una riga, le tre modalità e i comandi come icone
(con `title`/`aria-label` a portare il nome), *Elimina* come unico controllo scuro dell'app.

### v2.0 — utenti, e tre cose in meno

Cinque richieste, e tre sono **rimozioni**: la maggior parte di questa versione è codice
che non c'è più (scalette, la colonna `original_key`, le funzioni che le servivano).

**Chi può entrare, dall'app** (poi superato, v3.1/v3.2): nuova tabella `members` e
schermata `/utenti`, con i **proprietari** da `ALLOWED_EMAILS` (l'app non può scriverla,
quindi non ci si può mai chiudere fuori) e gli **invitati** dalla tabella. Le due metà si
incontrano in una funzione sola, `isAllowed`, che risponde sia al login sia alla guardia
davanti a ogni scrittura — una guardia che avesse letto solo la tabella avrebbe lasciato i
proprietari dentro l'app e incapaci di salvare qualunque cosa, perché non sono righe.
**Le scalette sono rimosse** (mai diventate scrivibili, due gusci vuoti nel database).

**La tonalità non è più un campo** salvato: si stima dagli accordi, con lo stesso
estimatore già usato dall'import. Misurato prima di far cadere la colonna: sui ventuno
brani con una tonalità salvata, la stima ne ha indovinate **ventuno su ventuno**.

**La home diventa l'elenco dei canzonieri**, ciascuno con la propria pagina; dal brano si
torna al canzoniere con una pastiglia nell'header. Trentatré controlli attraverso
l'interfaccia hanno verificato il tutto end-to-end, non solo per lettura di codice.

### v2.1 — ruoli

Tre ruoli, e la linea fra loro è cosa possono **cambiare**: admin tutto, editor il
repertorio, viewer niente di condiviso (poi ridotti a un solo ruolo, v3.1). I proprietari
sono admin per definizione (non una riga: `ALLOWED_EMAILS` non è scrivibile dall'app, quindi
non retrocedibili). Le **preferenze non sono modifiche** — trasposizione, capotasto,
velocità, notazione restano aperte a ogni ruolo, perché non toccano il repertorio, sono
come una persona legge sul proprio schermo. Il ruolo **non entra nel token** di sessione
(90 giorni: lo terrebbe stantio) né va mai in cache — le guardie rileggono la tabella a
ogni azione, quindi un downgrade toglie i controlli dalla mossa successiva, non dal
prossimo accesso.

### v2.2 — email e password

Un secondo modo di entrare, accanto a Google. **`credentials` è una tabella a parte**, non
una colonna su `members`: un proprietario non ha riga lì, quindi una colonna sulla tabella
degli invitati non potrebbe mai contenere la sua password — la tabella nuova risponde solo
*come dimostri l'indirizzo*, mai *se puoi essere qui*. **scrypt dalla libreria standard**
(niente bcrypt in una dipendenza in più): 34 ms per un hash, 30 ms per una verifica,
parametri incorporati nella stringa salvata. **Il login non distingue mai i suoi rifiuti**
— password sbagliata, indirizzo senza password, indirizzo fuori elenco danno la stessa
frase, con verifica a tempo costante anche quando la riga non esiste. La password di un
proprietario non si può impostare da un'altra persona, sempre la propria sì — da qui anche
`/password`, dove ognuno la cambia da sé.

### v2.3 — sezioni

Il canzoniere si divide, e ogni brano sta in una sezione sola. **La coerenza la garantisce
il database**: una chiave esterna composta su `songs`, con `on update cascade` — misurato
su uno schema di prova prima di scriverlo, perché senza quel vincolo far traslocare una
sezione è rifiutato in entrambi gli ordini di update — rende impossibile un brano in una
sezione di un altro canzoniere. Una sola azione (`arrangeCanzoniere`) scrive ordine delle
sezioni, ordine dei brani e sezione di ogni brano in una transazione, mai in due chiamate
separate. Il ritorno da un brano usa un frammento URL (`#brano-<slug>`), non un parametro,
perché un frammento non arriva al service worker e non romperebbe il precache. Sessantasette
controlli attraverso l'interfaccia, in quattro passate, compreso il trasloco di sezioni fra
canzonieri diversi — l'SQL più delicato della versione.

### v2.4 — Songbook

Un nome e un payoff, non una funzione: **songs** diventa **Songbook** («Where every fire
needs a melody», mai tradotto). Una sola fonte per nome e payoff (`lib/brand.ts`), dove
prima erano scritti a mano in quattro punti diversi. **`/login` diventa anche la pagina
pubblica del progetto**, perché lo era già per costruzione (`middleware.ts` manda lì chi
non ha sessione): sotto il modulo di accesso invariato, una vetrina di sei caratteristiche
verificabili nel codice.

### v2 — il resto

Restava: scalette modificabili dall'app, allowlist su tabella, ordinamento manuale dei
canzonieri. La v2.0 ha chiuso le prime due in due modi opposti — l'allowlist è diventata
una tabella con la sua schermata, le scalette sono state **rimosse** invece di essere
finite, perché non servivano. Resta l'ordinamento dei canzonieri (vedi *Domande aperte*).

### v3.0 — account

Finora un solo repertorio condiviso: canzonieri, sezioni e brani sono tabelle globali, e
`members`/`ALLOWED_EMAILS` decidono soltanto chi, fra un insieme fisso di persone, può
vederlo o modificarlo. Questa versione rompe quel presupposto — **ogni persona ammessa
nell'app ha un proprio spazio**, con i propri canzonieri, e può essere invitata, in più,
come collaboratrice nello spazio di qualcun altro (i collaboratori spariranno di nuovo in
v3.1). Il cancello d'ingresso non cambia; cambia solo cosa trova chi entra.

**Nuova tabella `accounts`** (`ownerEmail` chiave primaria): un account è sempre di una
persona sola, identificato dal proprietario, e deve poter esistere un istante prima che la
clonazione del canzoniere Example gli scriva dentro qualcosa. **Lo slug resta globale**, non
composto con l'account: l'idea originale (chiave `(accountOwnerEmail, slug)`) si è rivelata
incompatibile con `generateStaticParams`, che genera le pagine a build time senza un account
di richiesta con cui comporre la chiave — la clonazione dell'Example evita le collisioni
riusando `uniqueSlug()`. `songbooks` guadagna anche `isExampleTemplate` (indice unico
parziale: al più un canzoniere in tutta l'installazione lo porta) e `members` diventa
per-account (`(accountOwnerEmail, memberEmail)` invece di `email` da sola).

**`roleOf` accetta l'account bersaglio**: admin se l'email è proprietaria globale *o*
proprietaria di quello specifico account (due casi distinti — il primo vede tutti gli
account, il secondo solo il proprio), altrimenti la riga in `members` per quell'account, che
non contiene mai `admin` — un grado che nessun account può concedere a un collaboratore.
La provisione (crea la riga, clona l'Example) gira a ogni sign-in riuscita, idempotente per
costruzione. L'account corrente vive in un **cookie separato dal token di sessione**,
sempre riverificato lato server, mai fidato da solo.

**Scoperta durante l'implementazione, non prevista dall'interview: slug globale + pagine
statiche è una fuga di privacy.** Con lo slug globale, `/songs/[slug]` e `/songbooks/[slug]`
generate a build time restano raggiungibili da chiunque sia autenticato, non solo da chi ha
accesso all'account proprietario — indovinare uno slug altrui bastava, e il precache
d'installazione aggravava la cosa scaricando ogni canzoniere di ogni account su ogni
dispositivo. Risolto ricostruendo il confine per davvero, nella stessa consegna: le pagine
diventano **dinamiche** (`force-dynamic`), ogni caricamento verifica l'accesso *prima* di
restituire qualunque dato, con `notFound()` indistinguibile fra "non esiste" ed "esiste ma
non è tuo". Da qui anche la fine di `builds` e del pannello "in attesa di pubblicazione": con
pagine dinamiche un salvataggio è live all'istante. L'offline si ricostruisce senza un
precache unico — il service worker applica lo stesso controllo di sessione alla cache di
runtime, e un warm-up in background copre solo gli account a cui chi legge ha accesso.

**Migrazione**: il repertorio unico di oggi diventa l'account di f.limberti@gmail.com (l'altro
proprietario globale riceve il proprio account vuoto al prossimo login, come chiunque
altro). Il canzoniere Example, creato per l'occasione e poi riscritto in v3.2 per mostrare,
con commenti visibili nel testo, ogni direttiva che il visualizzatore riconosce, è stato
usato per verificare la clonazione end-to-end contro il database reale prima di dichiarare
la versione conclusa.

### v3.1 — niente più ospiti

La v3.0 aveva introdotto, accanto all'account personale, la possibilità di invitare
collaboratori — editor o viewer — nell'account di qualcun altro. Questa versione la toglie:
**un account è un indirizzo email, e un indirizzo email è un account**, senza eccezioni.
Nessuno è più ospite di nessun altro. L'unico ruolo che resta sopra "il proprio account" è
quello, già esistente, di proprietario globale (`ALLOWED_EMAILS`): può creare ed eliminare
account per conto di altri indirizzi, vedere ed entrare in ognuno con pieno controllo — non
in sola lettura, esattamente come già può fare oggi — ma non può più esistere una terza
persona che vede un account senza esserne né la proprietaria né un proprietario globale.

**Perché non è solo "restringere l'accesso alla pagina Accounts".** La prima idea era di
lasciare tutto com'è e limitare la nuova pagina Accounts (con crea/elimina) ai soli
proprietari globali. Ma la pagina di oggi serve anche a un secondo pubblico — chi
collabora su più account può passare dall'uno all'altro da lì — e quel secondo pubblico
sparisce del tutto in questa versione: se nessuno può più essere collaboratore altrove,
nessuno ha mai più di un account, e non serve più alcun selettore per chi non è
proprietario globale. La sezione "Yours" della pagina, e la funzione che la alimentava
(`listMyAccounts`), non si semplificano: si tolgono.

**Il rischio nascosto, trovato mappando il codice prima di scrivere questo piano.**
`isAdmitted()` oggi ammette un indirizzo se è proprietario globale *o se ha una riga in
`members`* — che sta per sparire. Senza cambiarla insieme alla rimozione, ogni indirizzo
ammesso solo tramite un invito perderebbe l'accesso all'app appena questa versione va in
produzione. Le due cose devono cambiare nello stesso rilascio:

1. **`isAdmitted` guadagna una seconda condizione, al posto di `members`**: l'indirizzo ha
   già una riga in `accounts` (come proprietario).
2. **`provisionAccount(email)` non cambia nella sostanza** — resta la stessa funzione
   idempotente chiamata a ogni sign-in riuscito, ma diventa anche l'azione che gira quando
   un proprietario globale preme "crea" sulla pagina Accounts: stessa funzione, due modi di
   invocarla, così un account creato da lì esiste già, con l'Example dentro, prima che
   quell'indirizzo faccia il primo login.
3. **`roleOf` si riduce a un solo ruolo concedibile.** O è la proprietaria dell'account (o
   una proprietaria globale), ed è `admin`, oppure `null`. `canEdit(role)` resta come unica
   domanda di permesso, anche se ora equivale a `role === 'admin'`.
4. **Tolto per intero**: la tabella `members`, `src/lib/members/*`, `MemberManager.tsx`, la
   pagina `/utenti`, i casi editor/viewer nei test, il testo su ruoli e inviti nella pagina
   di login.
5. **`accounts/current.ts`, `read.ts`, `actions.ts` perdono il parametro `memberships`**:
   un indirizzo può aprire un account solo se è il suo o se è proprietario globale.
   `mayShowAccountSwitcher` si riduce a "sei un proprietario globale?".
6. **La pagina Accounts ha un solo pubblico**: i proprietari globali, un solo elenco (non
   più "Yours" ed "Every account"), con *Entra*, *Crea* (riusa `provisionAccount`) ed
   *Elimina* per riga.
7. **Eliminare un account è una cascata immediata**, senza blocco se non è vuoto — canzoniere
   per canzoniere, poi le trasmissioni Sing Together aperte, poi la riga in `accounts` —
   tutto in una transazione. Le credenziali si cancellano in più, solo se l'indirizzo non
   risulta più ammesso in nessun altro modo. **L'unica rete di sicurezza è nell'interfaccia,
   non nel database**: va ridigitato l'indirizzo prima che il pulsante funzioni — scelta
   esplicita di non bloccare la cancellazione di un account non vuoto.
8. **Sing Together non cambia nel meccanismo** (`broadcastAccountEmail` resta distinto da
   `ownerEmail`), ma poter avviare una trasmissione richiede ora "admin sull'account
   aperto" invece di "editor o admin" — nessun codice cambia in `session.ts`, solo il
   significato di `canEdit` a monte.
9. **Migrazione dei quattro indirizzi ammessi solo tramite `members`**: ciascuno riceve un
   proprio account (stesso `provisionAccount`, eseguito da script prima del deploy).
   Nessuno dei quattro vedrà più il repertorio condiviso: ripartono con un proprio Example,
   scelta esplicita e confermata.

### v3.2 — si entra da soli

Finora ogni account nasceva per mano di qualcuno con potere di farlo: un proprietario
globale al primo login, o un altro proprietario globale che lo crea da Accounts (v3.1).
Questa versione apre la porta per davvero: **chiunque, con qualunque indirizzo email**,
può crearsi un proprio account da solo — con Google o con email e password — senza che
nessun admin debba fare nulla. Scelto esplicitamente, con il rischio che comporta discusso
e mitigato nei punti 8 e 9: non è più un'app per una cerchia chiusa di persone reali, è un
prodotto che chiunque su internet può trovare e usare.

`ALLOWED_EMAILS` non è più il cancello d'ingresso — non lo è mai stato per tutti, dalla
v3.0, ma ora smette di esserlo anche per il caso base. Resta esattamente quello che è
sempre stato per il resto: la lista di chi è proprietario globale, con pieno controllo su
ogni account dell'installazione. Le due cose — poter entrare, e poter amministrare tutto —
erano già separate; questa versione toglie solo la prima come condizione per la seconda.

1. **Il cancello non serve più.** `admitted()`/`isAdmitted()` vengono ritirate, non
   semplificate: la callback `signIn` chiama `recordSignIn` e `provisionAccount` per
   chiunque un provider abbia già autenticato con successo, senza più chiedere il permesso
   a una funzione a parte. Un controllo aggiuntivo resta: il profilo Google deve dichiarare
   `email_verified`.
2. **Registrarsi con Google è già registrarsi.** Il protocollo OAuth non distingue "entra"
   da "iscriviti": il pulsante "Sign in with Google" già su `/login` diventa anche il modo
   per registrarsi, nessun secondo pulsante — alla prima riuscita, `provisionAccount` crea
   l'account.
3. **Registrarsi con email e password è in due tempi.** Una nuova tabella
   `pendingRegistrations` tiene una richiesta finché non è verificata — **non è un
   account**: nessuna riga in `accounts`/`credentials`, nessun canzoniere clonato, finché
   il link di verifica non viene cliccato. Un indirizzo già registrato viene rifiutato con
   un messaggio chiaro; registrarsi di nuovo con un indirizzo in sospeso rinnova il token e
   rimanda la mail, senza errore.
4. **La pagina `/register`.** Stesso impianto di `/login`: pulsante Google (punto 2) e un
   modulo email/password/conferma, col CAPTCHA del punto 9. Il successo porta a "controlla
   la posta", con un pulsante per rispedire.
5. **Verifica: `/verify?token=...`.** Il token si confronta come una password, mai in
   chiaro. Se valido: dentro una transazione nasce la riga `accounts`, la riga
   `credentials`, parte la clonazione dell'Example e la mail di benvenuto; chi ha appena
   verificato entra subito, senza ridigitare la password. Un token scaduto o già usato
   invita a rispedire, non è un vicolo cieco.
6. **Recupero password: `/forgot-password` e `/reset-password?token=...`.** La prima
   chiede solo un indirizzo e risponde sempre allo stesso modo, esista o no — stesso
   principio della reiezione a tempo costante del login. La seconda scrive la password con
   `writePasswordHash`, la stessa chiamata che serve sia per impostarne una prima volta sia
   per cambiarla: un indirizzo senza password ne riceve una prima proprio da qui.
7. **Mail di benvenuto, una volta sola.** Parte dentro `provisionAccount`, solo quando crea
   la riga e non la trova già lì — mai sulle chiamate successive, no-op idempotenti per
   costruzione.
8. **Un fornitore di email: Resend**, con un modulo sottile sopra l'SDK e tre modelli
   semplici (verifica, benvenuto, reset). Richiede una verifica del dominio via DNS, fuori
   dall'app.
9. **Un CAPTCHA: Cloudflare Turnstile**, sulla registrazione e sul recupero password — le
   due superfici che mandano un'email a un indirizzo scelto da chi la chiede, il vettore
   più ovvio di email-bombing di qualcun altro. Verificato lato server prima di scrivere
   qualunque riga in `pendingRegistrations` o `passwordResetTokens`.
10. **Un limite di frequenza, nel database, senza un servizio nuovo.** Tabella
    `rateLimitHits` condivisa da registrazione, reinvio, recupero password e login, chiave
    per IP o email a seconda dell'azione. I numeri esatti restano da tarare quando ci sarà
    traffico reale da osservare.

Nessuna migrazione dei dati esistenti: questa versione è puramente additiva sulla porta
d'ingresso, non tocca un solo account, canzoniere o membro già presente.

### v3.3 — il menu utente

Fino ad ora chi era loggato non aveva un modo per vedersi: password e sign out vivevano
sparse (Impostazioni, fondo del menu hamburger), mai accanto a un'identità visibile.
Nuovo pulsante in testata — un monogramma colorato in base all'indirizzo — che apre un
pannello con l'indirizzo per esteso, l'etichetta "Owner" (segue `isOwner`, non il ruolo
`admin`: dalla v3.1 `admin` è di chiunque abbia un account, non distinguerebbe nessuno), e
le due azioni ora riunite lì. L'avatar legge l'indirizzo (iniziali e colore derivati,
deterministici), mai il profilo Google — un account per email e password non ha né nome
né foto. Nessuna migrazione.

### v3.6 — pagamenti

Fino a qui, piani, prezzi e un checkout finto (`SONGBOOK_MOCK_CHECKOUT`) esistevano già nel
codice — `accounts.plan`/`planStatus`/`planExpiresAt`, `mockPurchase`/`mockCancel`,
`entitlements.ts`, `/pricing`, `/checkout/[plan]` — ma erano nati direttamente lì, senza mai
passare da una voce di questo piano: la v3.4 (redesign di `/pricing`) e tutto ciò che li
regge risalgono a prima di questa versione. Quello che manca, e che questa versione
aggiunge, è **cosa succede dopo il primo acquisto**: uno storico dei pagamenti, un modo per
l'utente di cambiare piano o disdire da solo, e una semantica per farlo che non sia "tutto
istantaneo" come oggi.

1. **Un piano in sospeso, non solo un piano attivo.** `liveSubscription` (`entitlements.ts`)
   fa già decadere da sola una sottoscrizione scaduta senza bisogno di alcuna scrittura —
   basta per una disdetta verso `free`. Ma un downgrade verso un *altro* piano pagante deve
   diventare quel piano alla scadenza, non semplicemente decadere: servono due colonne
   nuove — `pending_plan`, `pending_cycle` (migrazione `0026`) — non un booleano
   `cancelAtPeriodEnd` accanto a un piano pendente: `pending_plan = 'free'` **è** la
   disdetta, un downgrade come un altro, un solo meccanismo per entrambe.
2. **`pending_plan` non si legge con `readPlan`.** `readPlan` degrada un valore non
   riconosciuto a `'free'` — e qui `'free'` in `pending_plan` significa "disdici a fine
   periodo". Un valore corrotto letto così diventerebbe una disdetta silenziosa, il
   rovescio esatto dell'asimmetria che `types.ts` dichiara ("un piano illeggibile non deve
   mai concedere, uno stato illeggibile non deve mai revocare"). Si legge quindi con lo
   stesso confronto diretto contro `PLAN_VALUES` che già usa `validateGrant`, e un valore
   non riconosciuto conta come **nessun pending**, la direzione generosa.
3. **`resolveSubscription(stored, now)`**, pura come `liveSubscription`, accanto ad essa:
   se lo stato è `grace` o `expiresAt` è `null`, nessuna risoluzione (un pending non scatta
   mai durante un tentativo di rinnovo in corso, deliberatamente); se `now < expiresAt`,
   stato grezzo con `pendingPlan`/`pendingCycle` esposti tali e quali (è quello che fa
   leggere "premium fino al 12/6, poi standard" prima che scatti); se `now >= expiresAt` e
   c'è un pending, un solo passo — mai una ricorsione — verso `{ plan: pendingPlan, status:
   'active', expiresAt: null, pendingPlan: null, pendingCycle: null }`. `pendingPlan`/
   `pendingCycle` diventano campi **obbligatori** su `StoredPlan` stesso, non facoltativi su
   un parametro: un sito dimenticato smette di compilare invece di divergere solo a
   runtime. `storedPlanOf` (`resolve.ts`) è l'unico costruttore dietro `entitlementsOf`,
   `deviceCapOf` **e** `effectivePlanOf` — aggiornare la sua `SELECT` una volta sistema
   tutt'e tre le chiamanti in un colpo; `listAccountPlans` e `rawSubscriptionOf`
   (`checkout.ts`) restano letture a parte e vanno aggiornate ciascuna per conto proprio.
4. **Tre casi limite decisi qui, non lasciati all'implementazione.** `lifetime` non si
   disdice né si declassa nel mock — non ha una scadenza su cui far scattare nulla, e un
   cambiamento per un cliente lifetime resta un caso di supporto (`not-applicable`). Il
   confronto di rango che decide upgrade/downgrade è sempre contro **l'abbonamento dal
   vivo** (`liveSubscription`), mai contro il piano *effettivo* — un regalo più alto non
   deve far leggere come downgrade un upgrade reale dell'abbonamento sottostante, per lo
   stesso motivo per cui `grantedPlan`/`plan` restano due colonne separate. Rango pari
   (stesso piano, solo cambio di ciclo) è immediato come un piccolo upgrade, e cancella un
   pending esistente — un ripensamento si esprime comprando di nuovo il piano attuale, non
   con un pulsante a parte.
5. **Le funzioni di scrittura** (`lib/plans/checkout.ts`): `mockPurchase` applica subito se
   il piano è `lifetime`, se non c'è un abbonamento vivo, o se supera o pareggia quello
   attuale in `PLAN_RANK` — altrimenti scrive solo `pendingPlan`/`pendingCycle`, senza
   toccare le colonne attive. `mockCancel` scrive `pendingPlan: 'free'` invece di
   `planStatus: 'expired'` subito. Due funzioni nuove: `clearPendingChange()` ("resta dove
   sono", azzera il pending), e `forceExpireNow()` — esplicitamente di test, il
   comportamento che `mockCancel` aveva prima di questa versione — l'unico modo rimasto di
   esercitare il blocco/freeze senza aspettare una data vera.
6. **Storico pagamenti in `paddle_events`, non una tabella nuova.** Ogni scrittura di
   successo logga una riga: `eventId` generato lì (`mock_${randomUUID()}`), `eventType`
   prefissato `mock.` per restare distinto dai nomi che userà davvero Paddle
   (`mock.purchase`, `mock.scheduled_change`, `mock.force_expired`), `paddleSubscriptionId`
   sempre `null` (riservato al webhook vero), `payload` con `{ mock: true, action, plan,
   cycle, amount }`. Una lettura condivisa, `paymentHistoryFor(accountOwnerEmail)`, usata
   sia da `/billing` sia dall'admin — non due funzioni sulla stessa tabella.
7. **`/billing`**, stessa impalcatura di `/checkout/[plan]`: una riga di stato dalla tripla
   risolta, un pulsante "Resta su {piano}" se c'è un pending, link a `/pricing` per
   cambiare piano (nessuna seconda copia della tabella di confronto), "Disdici", una
   sezione di test separata per `forceExpireNow`, e la tabella storico. Punto d'ingresso:
   `/billing` in Settings (`UserMenu.tsx`), sopra "Delete account" — stesso trattamento
   riservato alle conseguenze sull'account.
8. **Admin (`/accounts`): solo lettura sullo storico**, un pulsante "History" in più per
   riga, nessuna nuova leva di scrittura sull'abbonamento. Chi deve provare un blocco lo fa
   passando dall'account stesso (Switch, già esistente) e usando `forceExpireNow` nel
   checkout — una seconda leva diretta duplicherebbe quel percorso.

Migrazione `0026`: `accounts.pending_plan text`, `accounts.pending_cycle text`, entrambe
nullable, nessun default, nessun backfill.

### v3.7 — attivazione obbligatoria del piano

Un buco lasciato aperto dalla v3.6 e da tutto ciò che viene prima: **nessun account ha mai
scelto esplicitamente un piano**, nemmeno Free. `accounts.plan` ha `default('free')` a
livello di colonna, e `provisionAccount` inserisce la riga senza che nessuno lo confermi;
`/pricing` e `/checkout/[plan]` restano entrambe facoltative, e la seconda non vende
nemmeno Free (`CHECKOUT_PLANS` è solo `PAID_PLANS + lifetime`). Il risultato: un account
appena nato è già pienamente operativo su un Free implicito che nessuno ha scelto.

1. **Non nel middleware.** `middleware.ts` gira sull'edge runtime per scelta esplicita
   (`auth.config.ts`: "must stay free of anything Node-only"); una query lì pagherebbe ogni
   richiesta che passa dal matcher, non solo la prima dopo il login. Il gate non vive lì.
2. **Non un redirect generico in `RoleProvider`**, prima ipotesi scartata: sta nel root
   layout, quindi scatterebbe anche su `/checkout/[plan]` stesso (chi tocca "Choose
   Standard" verrebbe rimbalzato indietro prima che il checkout possa girare), e il suo
   contesto resta stantio dopo l'azione che completa la scelta (si aggiorna solo al mount e
   sull'evento `online`), rilanciando il gate alla navigazione successiva.
3. **`(home)/page.tsx`, che fa già esattamente questo genere di redirect** — già
   `force-dynamic`, già chiama `currentUser()`, già ha `if (hasDatabase && user === null)
   redirect('/login')` con la stessa identica logica. Un secondo controllo, con la stessa
   forma, dopo quello: se il piano non è ancora stato scelto, `redirect('/pricing')`.
   Nessuna allowlist di rotte serve (nessun'altra rotta d'ingresso passa da qui), nessuno
   stato stantio (ogni navigazione verso `/` rilegge il database da zero). **Corretto
   durante l'implementazione**: la prima stesura escludeva il global owner con
   `user.role !== 'admin'` — falso dalla v3.1, dove `roleOf` ritorna `admin` per *chiunque*
   abbia un account, non solo per un proprietario globale. Il controllo giusto è
   `isOwner(user.email, process.env.ALLOWED_EMAILS)` diretto, sulla persona davvero
   collegata — così un proprietario globale passato "come" un cliente tramite Switch non
   viene mai rimbalzato dall'onboarding incompleto di quel cliente.
4. **Schema — migrazione `0027`**: `accounts.plan_chosen_at timestamp with time zone`,
   nullable, nessun default. Backfill una tantum: ogni account esistente conta come "già
   attivato" da `created_at` (non `now()`, che marcherebbe ogni account vecchio come
   attivato "oggi") — zero interruzione per chi già usa l'app.
5. **Le regole del gate**: scatta solo se `plansEnforced()` (`SONGBOOK_PLANS=on`); **non**
   dipende da `mockCheckoutEnabled()` — l'uscita gratuita deve restare percorribile anche a
   checkout spento, o un account nuovo resterebbe bloccato senza via d'uscita;
   `SONGBOOK_FORCE_PLAN` scavalca il gate per intero (il suo contratto — "questo account è
   esattamente questo piano" — sarebbe altrimenti contraddetto dal proprio muro
   d'attivazione); il global owner è esente, backfillato come ogni account esistente.
6. **Le due uscite**: Free — `activatePlanChoice()` scrive *solo* `plan_chosen_at = now()`,
   senza toccare `plan`/`planStatus`/`planExpiresAt` (già corretti dal default) e senza
   loggare in `paddle_events` — scegliere Free non è un acquisto. A pagamento o Lifetime —
   `mockPurchase` esteso di una riga: se `plan_chosen_at` è `null`, lo scrive insieme al
   resto della transazione, così la primissima scelta soddisfa il gate anche se salta Free.
7. **`/pricing`, un solo pulsante consapevole di chi guarda.** `PricingPlans` legge la
   stessa identità di `RoleProvider`, estesa con `planChosen: boolean`. Tre stati per
   "Start free": sconosciuto o sloggato → link a `/register`, invariato; loggato e già
   attivato → link innocuo, un ri-timbro idempotente; loggato e in attesa → bottone che
   invoca `activatePlanChoice()`. Nessuna frase aggiunta per spiegare perché la pagina è
   comparsa dopo la registrazione — il contesto (arrivo diretto dopo il login) parla da
   solo; il vero cancello resta unicamente in `(home)/page.tsx`, questo è pura cosmetica.
8. **`/accounts`: il piano guadagna un badge pieno**, spostato fuori dal testo minuto, con
   **un colore diverso per ciascuno dei cinque piani** più un sesto per "Not activated" —
   un'eccezione dichiarata alla *Chord-First Rule* di `DESIGN.md` (una schermata operatore
   senza spartito non compete con un accordo), non una deriva; vedi `DESIGN.md` per la
   palette e il perché. "Not activated" appare solo quando `planChosen === false` **su una
   riga che `listAccountPlans` è riuscita a leggere** — le due `null` (lettura fallita vs.
   non ancora attivato) restano separate: "non sono riuscito a leggere" non deve mai
   apparire come "non attivato" sulla schermata il cui scopo è essere creduta.
9. **Non è una security boundary.** L'utente ha chiesto che l'accesso richieda "per forza"
   un piano; il gate lo ottiene lato UX (un redirect server-side sulla rotta d'ingresso),
   non lato permessi — chi lo aggirasse a mano continuerebbe a usare l'app sul Free
   implicito già di oggi, nessun accesso in più. Ogni scrittura reale resta protetta dalle
   proprie regole indipendentemente da questo gate, coerente con `RoleProvider` ("this is
   not the permission... every action re-reads the table on the server").

Migrazione `0027`: `accounts.plan_chosen_at`, nullable, nessun default, col backfill sopra.

### v3.8 — da `/accounts` a ricerca paginata con pagina di dettaglio

Tre cambi sulla superficie admin. La sezione **Create sparisce del tutto**: esisteva per
dare un account a un indirizzo prima del suo primo login (v3.1, *niente più ospiti* — allora
l'unico canale di ammissione), ma dalla v3.2 la registrazione self-service copre già ogni
caso reale, e ogni account nasce comunque al primo accesso riuscito con Google o password.
Verificato con grep prima di deciderlo, non per supposizione: `CreateAccountForm.tsx` e
`createAccount` non avevano altri chiamanti, e vengono rimossi come codice morto, non solo
nascosti — insieme ai due casi `AccountFailure` (`'invalid-email'`, `'already-exists'`) che
il commento del file già documentava come esclusivi della creazione.

**"Every account" diventa una ricerca**, paginata (25 per pagina), con `q` (email,
sottostringa case-insensitive), `plan` (confrontato contro il piano **risolto**,
`effectivePlan`, non contro la colonna grezza), `unactivated` (in AND col filtro piano, non
in alternativa: un regalo non tocca mai `planChosenAt`, un account può essere Premium e
"Not activated" insieme), `sort`/`dir`, `page` — tutto nell'URL, non in stato client:
condivisibile, sopravvive al Back, coerente con `force-dynamic`. **Filtro/ordinamento/
paginazione vivono in memoria, non in SQL**: il piano risolto è una funzione pura
TypeScript, non un'espressione SQL, e duplicarne la logica in un `WHERE` sarebbe una
seconda copia della stessa regola di generosità che il resto di questo lavoro ha sempre
evitato. Corretto alla scala attuale (poche decine di account); da rivedere solo se
l'installazione crescesse di ordini di grandezza. Se `listAccountPlans()` torna `null`
(migrazione non ancora applicata), il filtro di piano si disabilita silenziosamente — ogni
account lo passa, come oggi — invece di segnalarsi come errore.

**La riga si riduce a quattro fatti e un pulsante**: email, badge del piano, stato
dell'abbonamento, il conteggio sign-in come **cifra nuda** invece della frase (con
`aria-label`/`title` che porta la frase intera, per chi usa uno screen reader), e un solo
pulsante — **View**, non più Enter — verso `/accounts/[email]`. `PLAN_BADGE_CLASS`,
`planDetail()`, `subscriptionLine`, `giftLine`, `auditLine`, `inForceLine` — sei funzioni
prima sparse fra la pagina e `AccountPlanButton.tsx` — confluiscono in un unico modulo
condiviso, `src/lib/accounts/planText.ts`, senza direttiva `'use server'`/`'use client'`,
per non finire con due copie della stessa frase che possono divergere.

**`/accounts/[email]`, con una lezione su come si verifica una rotta dinamica.** Il link
usa `encodeURIComponent(ownerEmail)`; la pagina fa un `decodeURIComponent` esplicito. La
prima stesura di questo lavoro affermava che i `params` dell'App Router arrivano già
decodificati, "verificato leggendo il sorgente di Next.js" — sbagliato: quel percorso di
codice è del Pages Router, non dei server component dell'App Router. Verificato invece con
una richiesta reale (una rotta sonda temporanea, interrogata con `curl`):
`/accounts/a%40b.com` arriva alla pagina come la stringa letterale `a%40b.com`, `%`
compreso. Senza il decode, `getAccountDetail` non trovava mai la riga e la pagina rispondeva
`notFound()` su **ogni** account — il bug come si è manifestato in produzione, corretto con
questo singolo decode (inverso dell'unico encode, e ciò che preserva un indirizzo con un `%`
letterale). **Lezione da tenere**: leggere il sorgente di una libreria non è una verifica se
non si è controllato di stare leggendo il percorso di codice davvero in uso — una richiesta
reale lo è. Stessa guardia della lista (`isOwner` altrimenti `notFound()`), stessa
indistinguibilità fra "non esiste" e "non è tuo". `getAccountDetail(ownerEmail)`
(`accounts/read.ts`) legge **una sola riga**, non l'intera lista filtrata a un elemento.

**La pagina di dettaglio: tutto visibile, un'unica eccezione.** Enter, Subscription
(`GiftForm.tsx`, quel che resta di `AccountPlanButton.tsx` coi form sempre aperti),
Payment history (caricata subito lato server, `AccountHistoryButton.tsx` rimosso — la sua
ragione d'essere, non pagare la query per righe mai aperte, non si applica più su una
pagina che è già la scelta esplicita di guardare quell'account), Password
(`PasswordForm.tsx`, sempre visibile) sono tutte aperte fin dall'arrivo — aprire un altro
livello sotto sarebbe un click in più senza motivo. **`DeleteAccountButton` tiene invece il
proprio click-per-rivelare**: è l'unico caso in cui nascondere qualcosa dietro un click è
una rete di sicurezza voluta (retype-per-confermare), non un pannello-per-risparmiare-
spazio come gli altri tre. Cambia una riga: `router.refresh()` diventerebbe qui un
ricaricare il dettaglio di un account appena cancellato, quindi diventa
`redirect('/accounts')`.

Nessuna migrazione.

### v3.9 — anteprima e invio di test dei modelli email

Uno strumento per il global owner, non un'appendice a un account specifico: `/emails`,
visibile solo con lo stesso gate `isOwner` di `/accounts`, con un tab per ciascuno dei tre
modelli in `lib/email/templates.ts` (verifica registrazione, benvenuto, reset password).

1. **Non una sezione dentro `/accounts`**, perché i tre modelli non si personalizzano su
   dati di un account (`welcomeEmail()` non prende nemmeno un parametro): è una verifica
   del "prodotto email" nel suo complesso, con la propria voce di menù (`IconEye`, già
   esistente, non usata altrove) invece di essere sepolta in fondo a una pagina che parla
   d'altro.
2. **Dati fittizi**: `verificationEmail(url)`/`passwordResetEmail(url)` con un `url`
   costruito come farebbe il flusso vero ma con token di comodo — il link non porta a nulla
   di funzionante se cliccato, risponde come farebbe un link scaduto, comportamento atteso,
   stesso spirito del checkout mock.
3. **Invio di test, non solo anteprima statica** — deciso perché il rendering nel browser
   non riproduce le stranezze dei client email reali (Gmail in primis): un bottone per
   modello manda la vera email via lo stesso `sendEmail` della produzione, sempre a
   `session.user.email` (mai un campo destinatario libero, mai l'account eventualmente
   selezionato dal cambio-account — nessuno dei tre modelli appartiene a un account),
   oggetto prefissato `[Anteprima] ` per non confondersi con una reale nella stessa inbox.
   La server action che spedisce verifica `isOwner` da sé, senza fidarsi del gate della
   pagina — stessa disciplina di ogni scrittura in `checkout.ts`.
4. **Oggetto + HTML + testo semplice con un interruttore**, non solo HTML: il testo
   semplice è quello che arriva a chi ha immagini/HTML disattivati, e merita di essere
   controllato senza leggere il codice. Il corpo HTML va in un `<iframe srcDoc={html}>`,
   mai iniettato diretto nella pagina — quegli stili inline sono pensati per un client di
   posta, non per convivere con Tailwind.
5. **Rotta piatta `/emails`**, non `/accounts/emails` — coerente con ogni altra rotta
   dell'app, nessun prefisso "admin" condiviso da inventare apposta.

Nessuna migrazione.

### v3.10 — ricontrollo generale dei piani

Nessuna funzionalità nuova: un giro esplicito su tutto ciò che la v3.6/v3.7/v3.9 avevano
lasciato scollegato o incoerente, dopo un audit a più agenti sull'intera esperienza dei
piani (enforcement, cambio ciclo, admin, email/notifiche). Deciso per intero via domande a
scelta multipla, riportate in "Decisioni" più sotto.

1. **Cambio di ciclo senza cambio di piano, finalmente raggiungibile.** La v3.6 (punto 4)
   aveva già scritto la semantica — rango pari è un piccolo upgrade immediato, si esprime
   comprando di nuovo lo stesso piano — ma non esisteva alcun pulsante per farlo: la card
   del piano attivo su `/pricing` (`PricingPlans.tsx`) mostrava solo "Your plan · Manage"
   verso `/billing`. Aggiunto un link secondario sulla card stessa, `Change billing cycle`,
   verso `/checkout/[plan]?cycle=...` — un'azione minore sulla card attiva, non un modale
   o una sezione a parte.
2. **`subscriptionStatusLine`/`formatPlanDate`** (`lib/plans/subscriptionCopy.ts`, nuovo
   modulo) sostituiscono tre implementazioni indipendenti della stessa frase — "come sta
   questo abbonamento in una riga" — che avevano preso strade diverse: `BillingScreen` non
   gestiva affatto lo stato `grace`, `CheckoutScreen` aveva una terza formulazione, e le
   date non erano formattate allo stesso modo nei tre punti (`/billing`, `/checkout/[plan]`,
   `/thanks`). Una sola funzione pura, condivisa, invece di tre frasi da tenere in sync a
   mano.
3. **`/pricing` e `/login` allineati sul numero vero di dispositivi Premium.** La tabella
   "«Sing Together» devices" su `/pricing` diceva "Unlimited" per Premium; la FAQ "Is
   Strumfolio free to use?" su `/login` diceva già "100" in chiaro. Deciso di far vincere il
   numero reale ovunque (non "Unlimited" ovunque): `deviceCell(PLANS.premium.devices)`
   invece di un valore scritto a mano.
4. **`/login` non dice più che i piani "non sono ancora in vendita"** quando lo sono
   davvero: `PLAN_HOLD` ora controlla anche `mockCheckoutEnabled()`, non solo
   `plansEnforced()`, e con entrambi accesi (lo stato reale di produzione oggi) dice che i
   piani sono acquistabili da `/pricing`, non che arriveranno.
5. **Maiuscole dei nomi di piano coerenti sulle schermate admin.** `lib/accounts/planText.ts`
   (`planDetail`, `subscriptionLine`, `giftLine`, `inForceLine`) interpolava il valore
   grezzo minuscolo (`'plus'`) invece di `PLAN_LABEL['plus']` ("Plus") — disallineato dal
   badge colorato sulla stessa riga, che è sempre stato maiuscolo. Stessa correzione sul
   `<select>` di `GiftForm.tsx`, che elencava i piani con lo stesso valore grezzo.
6. **Le registrazioni email/password non mandavano l'avviso Telegram "nuova registrazione"**
   — solo quelle Google lo facevano, perché passano dal callback `signIn` di NextAuth,
   mentre l'altra strada (`verify/actions.ts`, `issueSessionCookie`) lo scavalca del tutto.
   Aggiunta la stessa chiamata `notifyTelegram('registration', ...)`, stessa formulazione di
   `auth.ts`. Aggiunto anche un evento nuovo, `kept_current` (`NOTIFY_EVENTS`, quinto valore):
   avvisa quando qualcuno annulla un downgrade/disdetta programmati restando sul piano
   attuale (`clearPendingChange`) — prima quell'azione non generava alcun segnale, a
   differenza di ogni altra scrittura di `checkout.ts`.
7. **Un piano che rifiuta un salvataggio ora offre sempre un passo successivo.**
   `SongForm.tsx` (modifica di un brano singolo) non intercettava affatto un `SaveRefusal`
   di tipo limite-piano: l'utente vedeva un messaggio d'errore generico, senza collegamento
   a `/pricing`. Aggiunto lo stesso `PlanUpgradeModal` che `SongbookSongs.tsx` già apriva.
   `ImportBatch.tsx` (incolla multiplo) non diceva nulla affatto quando alcuni brani
   venivano rifiutati per limite di piano — contati insieme ai successi senza distinzione.
   Aggiunto un avviso unico a fine lotto ("N songs weren't allowed by your plan · See
   plans"), non un modale per riga: un incolla multiplo può rifiutarne molti insieme, e un
   modale per ciascuno sarebbe stato inutilizzabile.
8. **Un proprietario globale "switchato" dentro un altro account ora lo vede scritto.**
   Prima, `UserMenu` mostrava la propria email accanto al piano e al repertorio di un
   account che non era il proprio, senza alcuna indicazione di quale account fosse
   davvero in vista. Aggiunta `ViewingAsPill` (nuovo componente, `'use client'`) nel
   `TopBar`, che legge `accountOwnerEmail` da `useRole()` — esteso fino a `loadIdentity()`
   — e mostra "Viewing: ‹email›" solo quando differisce dalla propria. Deliberatamente non
   un `auth()`/`cookies()` letto dentro `TopBar` stesso: l'avrebbe reso dinamico, portando
   con sé `/billing`, `/help`, `/thanks`, `/export` — tutte ancora `○` oggi apposta.
9. **L'email di benvenuto non diceva che il prossimo accesso porta su una scelta di
   piano** (`(home)/page.tsx`, il redirect obbligatorio della v3.7) quando quel redirect è
   davvero attivo. Aggiunta una riga breve, condizionata su `SONGBOOK_PLANS=on` letto
   direttamente da `process.env` in `templates.ts` — non importando `plansEnforced` da
   `lib/plans/resolve`, che value-importa `lib/db/client`: quel modulo è raggiungibile dal
   bundle client di `EmailPreview.tsx` (`'use client'`, via `lib/email/preview.ts`), e
   portarsi dietro il driver Postgres lì avrebbe rotto la build (scoperto da una build
   isolata di verifica, non da `tsc`, che non vede l'errore di bundling lato client).
10. **"Confirmation" ovunque, non più "receipt" su `/thanks`** — la stessa email di
    acquisto era già descritta come "confirmation" altrove; unificato sul termine che non
    implica un documento fiscale.

Nessuna migrazione.

### v3.11 — secondo ricontrollo dei piani

Un secondo giro sull'esperienza piani, con cinque audit paralleli (schermate/copy, enforcement,
admin, email/notifiche/gate, macchina a stati) sul codice *dopo* la v3.10. Ha trovato cose più
grosse del primo giro, incluse due che erano vive in produzione.

1. **`forceExpireNow` era raggiungibile da ogni cliente pagante.** Stava su `/billing` dietro
   nient'altro che le parole "test only": `canForceExpire` non controllava `isOwner`, e nemmeno
   la server action. Con `SONGBOOK_MOCK_CHECKOUT` acceso in produzione, questo metteva «fai
   scadere il mio piano adesso» davanti a chiunque avesse pagato, sulla schermata che si apre
   per gestire ciò che si è pagato. **Il pulsante è stato rimosso del tutto** (scelta esplicita
   fra tre opzioni): l'action resta esportata per script e test, e se un giorno servisse di
   nuovo un pulsante va dietro `isOwner`, controllato sia dove si rende sia dentro l'action.
   Un'etichetta non è un permesso.
2. **`/pricing` confrontava i ranghi col piano *effettivo*, non con l'abbonamento vivo** —
   violando l'invariante che `mockPurchase` dichiara per il proprio confronto. Con un regalo
   Premium sopra un abbonamento Standard pagato, la card Premium diceva «Your plan · Manage», e
   completare quel checkout **trasformava il regalo gratuito in un acquisto reale** che il
   cliente non aveva chiesto. `effectivePlanOf` diventa `planNamesOf`, che restituisce entrambi
   i nomi da una sola lettura; `loadIdentity`/`RoleProvider` portano il nuovo
   `subscriptionPlan` accanto a `plan`, **senza cambiare il significato di `plan`** — il badge
   in `UserMenu` continua a leggere quello effettivo, perché «quali limiti ho adesso» è la
   domanda a cui un regalo *deve* rispondere. Aggiunta anche una riga che spiega la differenza
   quando un regalo sopravanza l'abbonamento, altrimenti le due schermate si contraddicono
   senza motivo apparente.
3. **Lifetime è ora uno stato terminale su `/pricing`.** Ogni CTA era un no-op per un Lifetime
   (`mockPurchase` e `mockCancel` rifiutano entrambi `not-applicable`), e «Switch to Free»
   rispondeva col messaggio sbagliato fra i tre che quel codice di rifiuto copre: diceva a chi
   aveva pagato €149 che il suo account «is already on Free». Ora le altre card dicono
   «Included in Lifetime» e il messaggio d'errore non indovina più quale dei tre casi sia.
   `BillingScreen` escludeva `lifetime` da sempre; questa è la stessa esclusione, applicata
   finalmente sulla pagina che *offre* le azioni e non solo su quella che le gestisce.
4. **Il gate di scelta piano viveva in un solo posto e si scavalcava con un bookmark.**
   `hasChosenPlan` era controllato solo in `(home)/page.tsx`: un link salvato a un brano o a un
   canzoniere, o una scorciatoia PWA, entravano nell'app senza vedere la scelta. Nessuna
   escalation di diritti (una riga nuova è `free`/`active` e `entitlementsOf` non legge mai
   `planChosenAt`) — il gate semplicemente non chiedeva. Estratto in `requirePlanChoice`
   (`lib/plans/gate.ts`) e chiamato dalle tre rotte di contenuto. **Chiamato dalle pagine, mai
   da un layout**: un layout abbastanza ampio coprirebbe anche `/pricing` e `/checkout/[plan]`,
   e gatare la schermata di scelta dietro la scelta è un loop di redirect. `/export` e
   `/password` restano fuori **per scelta dichiarata**: sono `○` (prerese e precacheate per
   l'offline) e un redirect dipendente dalla sessione le renderebbe dinamiche — la stessa
   invariante che protegge il commento di `TopBar`. Verificato col build: la ripartizione
   `○`/`ƒ` è identica a prima, pagina per pagina.
5. **`EditorScreen` (`/songs/[slug]/edit`) era rimasto fuori dalla correzione della v3.10** —
   `SongForm` e `ImportBatch` avevano ricevuto il `PlanUpgradeModal`, l'editor grafico/sorgente
   che raggiunge la *stessa* server action no. Un account congelato vedeva testo rosso inline
   senza alcuna strada verso `/pricing`.
6. **`/thanks` non guardava mai `PlanStatus`.** `loadPurchaseSummary` può restituire
   `plan: 'premium', status: 'expired'` (la colonna grezza non torna indietro alla scadenza), e
   la pagina mostrava «You're in. Welcome to Premium.» sopra una data di rinnovo già passata,
   con «Payment received» sotto. Il controllo è su `status` e **prima** del ramo pagante, non
   intrecciato nelle sue frasi: è l'intestazione la parte che inganna per prima, quindi
   sistemare solo la riga della data avrebbe comunque fatto le congratulazioni a chi era
   scaduto.
7. **Un regalo ritirato era invisibile dalla lista.** `setGrant` timbra `planChosenAt` quando
   regala e non lo togliere mai quando revoca, così la riga resta `free`/`planChosen: true` —
   byte per byte un account che ha scelto Free davvero. Né il filtro piano né «Without a plan
   only» potevano trovarla; solo la pagina di dettaglio diceva la verità, cioè l'unica schermata
   fatta per *cercare* account era l'unica che non li trovava. Aggiunti `giftWithdrawn`, un
   filtro «Gift withdrawn only» e un marcatore in riga — **nessuna semantica cambiata**, la
   scelta alternativa (non timbrare `planChosenAt` sul regalo) avrebbe fatto ricomparire il gate
   a un account appena regalato.
8. **Due guardie sui regali admin.** `lifetime` con una data di scadenza era scrivibile e
   `liveGrant` la faceva scadere puntualmente — che è la trappola, non la salvaguardia: la
   parola significa «non finisce mai» su ogni schermata, quindi la riga si autocontraddiceva
   («Gift — Lifetime until 31 December 2026»). Ora il campo data spariste per Lifetime **e**
   `validateGrant` rifiuta la combinazione (`lifetime-with-date`), perché un form è un
   suggerimento a un browser, non una promessa su una server action. E un regalo di rango pari o
   inferiore all'abbonamento vivo **avvisa senza rifiutare**: è inerte adesso, ma è un pavimento
   legittimo per quando l'abbonamento scadrà.
9. **`grace` scartava il pending, nascondendo l'unico modo di annullarlo.**
   `resolveSubscription` azzerava `pendingPlan` per ogni stato non-`active`, e `/billing` mostra
   «Keep ‹piano›» solo quando il pending *risolto* è non-null: un cliente con la carta che
   fallisce e un downgrade programmato perdeva sia la notizia sia il pulsante, nel momento in
   cui è più probabile che stia ripensandoci. Ora `grace` continua a non farlo **scattare** mai
   (l'early return è ciò che lo garantisce, dato che ogni confronto di data sta sotto) ma lo
   **riporta**; solo `expired` lo scarta. Irraggiungibile oggi — nulla scrive `grace` — quindi è
   lavoro di preparazione per il webhook vero, non una correzione di qualcosa di visibile.
10. **Rifiniture**: punteggiatura uniforme fra le quattro righe di `planText.ts` che si rendono
    come paragrafi fratelli (`giftLine` era incoerente perfino con sé stessa, col punto sul ramo
    «No gift.» e senza sugli altri); «even with no signal» anche nell'email di benvenuto, la
    formulazione già usata in `/help`, nel changelog e nell'email d'acquisto; e il commento di
    `/emails` che diceva ancora «tre email» invece di quattro.

Non corretto di proposito: il cast non validato su `eventType` in `history.ts`. Cade nel
`default` di `describeEvent` come «Event», nessun `mock.refund` esiste, e aggiungere un array di
valori per un tipo con un solo produttore nello stesso file è lavoro difensivo oltre quello che
l'audit chiedeva.

Nessuna migrazione.

### v3.12 — terzo ricontrollo dei piani

Terzo giro, questa volta percorrendo i passaggi come li percorre un cliente — registrazione,
gate di scelta, `/pricing`, `/checkout`, `/thanks`, `/billing` — invece che file per file. Il
risultato più importante è un bug che *tutti* incontrano, non un caso limite.

1. **Ogni piano acquistato finiva per leggersi «active until ‹data passata›».** Niente in questo
   repository rinnova alcunché: `mockPurchase` scrive `planExpiresAt = adesso + un periodo` e
   nessun webhook arriva mai a spostarlo. `planStatus` invece resta `'active'` per sempre — solo
   `forceExpireNow` scrive `'expired'`, e nessuna UI lo chiama più (v3.11). Le tre schermate del
   cliente decidevano «è ancora vivo?» da `status`, mentre `liveSubscription` lo decide da
   `status` **e** dalla data. Quindi, passato il periodo: `/billing` diceva «Standard, active
   until 3 May 2026», `/thanks` faceva «You're in. Welcome to Premium.» sopra la stessa data
   passata, e «Cancel my plan» offriva un'azione che `mockCancel` poi rifiutava con «Nothing to
   do here right now.» — mentre i gate avevano già riportato l'account a `free`. Quattro sintomi,
   una causa. La correzione sta **alla giuntura, non nelle schermate**: `loadCheckoutStatus` e
   `loadPurchaseSummary` restituiscono ora anche `live` (la risposta di `liveSubscription`, allo
   stesso istante che leggono già), e `subscriptionStatusLine`, il ramo di `/thanks` e `canCancel`
   la ricevono invece di ricalcolarla. `grace` resta vivo per definizione, quindi una carta in
   ritentativo continua ad avere la sua frase e non viene compianta come un piano morto.
2. **`isCurrent` su `/pricing` era rimasto sul piano effettivo** — la metà che la v3.11 non aveva
   toccato mentre correggeva `currentRank` nella stessa funzione. Con un regalo Premium sopra uno
   Standard pagato, la card Premium diceva ancora «Your plan · Manage», e l'unico controllo
   accanto («Change billing cycle») portava a comprare davvero il piano che era stato regalato —
   cioè esattamente il bug che il commit precedente dichiarava chiuso. In più rendeva **falsa la
   riga d'avviso** appena sopra la griglia, che promette che la card marcata è l'abbonamento
   sotto il regalo. Stessa correzione su `LifetimeCta`, che sbagliava in entrambe le direzioni: a
   un Lifetime *regalato* diceva «Your plan» mentre le quattro card accanto gli vendevano un
   upgrade.
3. **Un downgrade chiedeva la carta e diceva «Complete purchase».** Non si paga nulla quel
   giorno e non cambia nulla quel giorno: `/checkout/[plan]` ora lo dice *prima* del pulsante,
   con la data in cui il cambio scatta, nasconde i campi carta (chiederla, e rifiutare un numero
   sbagliato, per un'operazione che non incassa niente è teatro che inganna) e il pulsante dice
   cosa fa davvero. `willSchedule` rispecchia il ramo di `mockPurchase` invece di indovinarlo.
4. **«Change billing cycle» poteva bruciare mesi già pagati senza dirlo.** Dieci mesi dentro un
   annuale, ricomprare mensile è un acquisto di rango pari — quindi immediato — e `planExpiresAt`
   diventa fra un mese. Ora, quando la nuova scadenza cadrebbe **prima** di quella già pagata, il
   checkout la nomina: entrambe le date, e che la differenza non viene riportata. Nessun cambio
   di semantica: la regola «rango pari applica subito» resta quella di `mockPurchase`.
5. **Un cambio programmato su una riga senza scadenza non scattava mai.** Riga raggiungibile e
   non ipotetica: è ciò che *lascia dietro* un cambio già scattato (il piano nuovo viene scritto
   con `expiresAt: null`, perché qui nessun rinnovo è modellato). Il secondo downgrade era quindi
   inerte — schermata «scheduled», riga nel ledger, e nessuna data ad aspettarlo. Senza periodo
   pagato da proteggere, `mockPurchase` e `mockCancel` applicano subito; `mockCancel` restituisce
   `effect` così `/billing` non promette una fine periodo che non esiste.

   La condizione è **sulla riga risolta, mai sulla colonna grezza**, e la differenza è tutta la
   correttezza della frase che `/checkout/[plan]` stampa prima del pulsante: quella schermata
   rispecchia questo ramo a partire da `current`, che è risolto. Proprio sulla riga qui sopra le
   due letture divergono — la colonna grezza tiene ancora la vecchia data, ormai passata, dove
   la vista risolta ha già collassato a `null` — quindi lo schermo prometteva «Complete
   purchase» e si vedeva tornare un cambio programmato, che poi scattava comunque al caricamento
   successivo: riga `scheduled_change` nel ledger, nessuna riga d'acquisto, nessuna ricevuta.
   `grace` conserva la sua data attraverso l'early return di `resolveSubscription`, quindi resta
   dal lato programmato senza bisogno di nominarlo di nuovo.

   E una cancellazione immediata **non si registra più come programmata**: `cancelled_now` è una
   voce nuova di `MockEventAction`, perché `scheduled_change` con `plan: 'free'` dice «a fine
   periodo» e metteva quella riga nello storico esattamente sotto una conferma che diceva che
   l'account era già tornato su Free.
6. **«Cancel my plan» spariva se c'era già un downgrade programmato.** `canCancel` pretendeva
   `pendingPlan === null`: per uscire davvero bisognava prima premere «Keep Premium», senza che
   nulla lo dicesse. Ora basta `pendingPlan !== 'free'` — una cancellazione già programmata non
   ha altro da cancellare, un downgrade sì.
7. **Rifiniture**: durante il gate obbligatorio le card dicevano «Upgrade to Standard» a chi non
   ha mai avuto un piano (la riga dice `free` perché è il default della colonna — la stessa
   lettura che `noPlanYet` rifiuta dal lato operatore), ora dicono «Choose ‹piano›»; `/thanks`
   non scrive più «Renews ‹data›» quando su quella data il piano *finisce* per un cambio già
   programmato; e la tabella dei pagamenti su `/billing` usa le date come le scrive la frase un
   centimetro sopra, tenendo l'ISO per `/accounts`, dove un operatore le confronta e le copia.

Non corretto di proposito: un downgrade programmato durante `grace` resta fermo finché lo stato
non cambia (`resolveSubscription` esce prima di ogni confronto di data). È la regola dichiarata di
`grace`, non un effetto collaterale, e il webhook vero è ciò che tira fuori l'account da lì.

Nessuna migrazione.

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
| URL | Invariati, l'account non compare nella rotta | Coerente con l'architettura sottile attuale; il costo è che un link copiato dipende da quale account ha attivo chi lo apre — accettato, Sing Together resta a parte con i suoi token |
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
| Chi può trasmettere (Sing Together) | Editor o admin sull'account aperto in quel momento | Un viewer può seguire un canzoniere, non esporlo pubblicamente con un link |
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
| Password di un account altrui | Un proprietario globale può impostarla o rimuoverla dalla pagina Accounts (`setPasswordFor`/`removePasswordFor`, autorizzate su `isOwner` diretto) | Corretto poco dopo aver spedito la v3.1: senza email d'invito, era l'unico modo per far entrare un indirizzo creato da Accounts ma senza un account Google corrispondente — la domanda 21 lo aveva previsto come bivio possibile, la prima consegna aveva scelto il ramo sbagliato (cancellarle) |

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
| Cancellazione immediata nel ledger | Voce nuova `cancelled_now` | `scheduled_change` con `plan: 'free'` dice «a fine periodo»: era la riga sotto una conferma che diceva l'opposto |
| «Cancel my plan» con un downgrade pendente | Permesso (`pendingPlan !== 'free'`) | Uscire dal piano richiedeva prima «Keep ‹piano›», senza che nulla lo dicesse; una cancellazione già programmata invece non ha altro da cancellare |
| Copy del gate obbligatorio | «Choose ‹piano›», non «Upgrade to» | Chi non ha mai scelto non ha da cosa fare l'upgrade: la riga dice `free` solo perché è il default della colonna |
| Date nella tabella pagamenti | `plain` su `/billing`, ISO su `/accounts` | Sotto una frase che scrive «22 September 2026», una riga «2026-08-23» sono due formati a un centimetro di distanza; l'operatore invece le confronta e le copia |
| Downgrade programmato durante `grace` | Non corretto | È la regola dichiarata di `grace` (nessun confronto di data), e il webhook vero è ciò che tira fuori l'account da lì |

### Export organizzato (pianificato, non ancora costruito)

| Decisione | Scelta | Perché |
|---|---|---|
| Rapporto con l'export-backup esistente | Nuovo e separato; «Scarica tutto» resta piatto e invariato | Quello è anche il percorso di ripristino (`npm run seed` legge `content/` con `readdir` non ricorsivo, slug ricavato dal nome del file): cartelle o nomi numerati lì dentro lo romperebbero |
| Granularità | Due modalità, non tre: per canzone e per sezione | «Oppure ogni canzoniere» del messaggio originale si riferiva alle cartelle, non a un terzo formato — confermato esplicitamente |
| Struttura cartelle (modalità per canzone) | Sottocartella per sezione dentro la cartella del canzoniere | Rispecchia il modello a tre livelli già in app; facile da sfogliare a mano |
| Formato numero | `NN - Nome`, due cifre, zero iniziale | Ordina bene in qualunque file manager fino a 99 elementi per contenitore; leggibile |
| Cartelle canzoniere | Solo il nome, mai numerate | L'utente ha specificato esplicitamente che a numerare sono canzoni e sezioni, non i canzonieri |
| Formato file | `.chopro`, non PDF | L'unico formato che l'app sa già scrivere; un PDF impaginato è un motore da costruire da zero, non esiste ancora nulla del genere |
| Base del nome file | Il titolo leggibile, ripulito dei soli caratteri illegali per un filesystem | Pensato per essere sfogliato da una persona, non per un URL; distinto di proposito dallo slug dell'export-backup |
| Separatore fra canzoni nel file di sezione | `{new_song}`, la direttiva ChordPro standard | Già usata in lettura dall'import per dividere un incolla-multiplo; lo stesso file, se mai re-incollato, si taglierebbe di nuovo correttamente |
| Numerazione e riordino | Accettato che i numeri di un export invecchino a ogni trascinamento | È una fotografia dell'ordine attuale, non un archivio da confrontare nel tempo — stesso spirito del backup senza token |
| Punto d'accesso | Due pulsanti distinti nel pannello Export, non un selettore | Chiaro a colpo d'occhio, zero scelte da fare prima di scaricare |

## Domande aperte

1. **Capotasto** — escluso dalla v1 (lo stepper a semitoni copre il bisogno principale).
   Da riprendere se suonando emerge la necessità delle forme aperte.
2. **Diagrammi degli accordi** — fatti: ogni accordo sullo spartito è un bottone che apre la
   forma per chitarra in accordatura standard. Le diteggiature stanno in
   `src/lib/music/shapes.ts` e non vengono da `@tombatossals/chords-db`: sono una tabella
   corta di forme in posizione aperta più due forme mobili con la fondamentale sulla sesta o
   sulla quinta corda, così le dodici tonalità sono coperte senza portarsi dietro un
   database. Ogni voce è verificata dai test contro le note dell'accordo che dichiara di
   essere — nessuna nota estranea, e presenti quelle che fanno l'accordo. Restano fuori: una
   sola forma per accordo (nessuna alternativa), nessun capotasto, e le alterazioni della
   quinta (`7b5`, `7#5`) che non si possono semplificare senza suonare una nota sbagliata,
   per cui il popup mostra solo i nomi delle note.
3. **Quanti brani** — il piano regge fino a qualche centinaio: oltre, l'indice di ricerca
   client-side e la generazione statica completa vanno riconsiderati (ricerca full-text su
   Postgres, paginazione).
4. **Protezione Vercel** — con Google OAuth applicativo la Deployment Protection non serve;
   resta da decidere se tenere comunque `noindex` come cintura di sicurezza.
5. **Font di lettura** — non ancora scelto, e la scelta interagisce con due cose: la
   disponibilità dei glifi `△` e `°` e la leggibilità a distanza di leggìo. Da definire in
   `DESIGN.md`.
6. **Verifiche che richiedono un dispositivo reale** — in questo ambiente non c'è browser,
   quindi tre cose restano confermate solo per ispezione e non per uso: il comportamento
   offline effettivo dopo l'installazione della PWA, il round trip OAuth con Google, e la resa
   visiva dei glifi `△` e `°` nel font scelto. Sono le prime cose da provare su tablet.
7. **Toggle manuale del tema** — chiaro e scuro seguono `prefers-color-scheme`; resta da
   decidere se serve anche un interruttore in-app, utile se la penombra non coincide con
   l'orario di sistema.
8. **Direttive ChordPro estese** (`{capo}`, tablature, ritornelli ripetuti per riferimento)
   — ignorate in v1, da valutare quando emergono su brani reali.
9. **Ordinamento dei canzonieri** — alfabetico. Se in pratica serve un ordine tuo (il
   repertorio attivo per primo, l'archivio in fondo) va aggiunta una colonna `position` e un
   riordino a trascinamento, come già hanno i brani dentro un canzoniere. Ora che la home è
   l'elenco dei canzonieri, la domanda pesa più di prima.
10. ~~**Canzonieri condivisi o per utente**~~ — risolta dalla v3.0: ogni account ha i propri
    canzonieri, non più struttura condivisa fra tutti gli ammessi.
11. **Rinominare uno slug di brano** — non previsto nemmeno dall'import: lo slug si genera
    dal titolo alla creazione e poi resta. Cambiarlo orfanerebbe le preferenze salvate di
    quel brano, quindi servirebbe una tabella di alias.
12. ~~**Come si produce l'archivio dell'export**~~ — risolta: `fflate`, un `.chopro` per
    brano, zip piatto, senza cartelle né numeri (è anche il percorso di ripristino).
    L'export "organizzato" per sfogliare è risolto a parte in *Export organizzato*
    (Decisioni), non ancora costruito.
13. **Qualità della conversione** — l'euristica «accordi sopra il testo» fallirà su sorgenti
    con tabulazioni, etichette di sezione in mezzo, o accordi e testo sulla stessa riga. La
    preview e il corpo modificabile sono la mitigazione; se in pratica sbaglia troppo spesso
    su un sito che usi davvero, conviene aggiungere casi di test presi da lì.
14. **Brani in attesa non leggibili** — prima della pubblicazione un brano si vede solo nella
    preview dell'import. Se capiterà di volerlo provare a suonare subito, l'alternativa è una
    pagina di lettura dinamica per i soli brani in attesa, fuori dal precache.
15. ~~**Chi prende in carico il repertorio esistente (v3.0)**~~ — risolta:
    f.limberti@gmail.com; l'altro proprietario globale riceve il proprio account vuoto al
    prossimo login, come chiunque altro.
16. ~~**Contenuto del canzoniere Example (v3.0)**~~ — risolta in due tempi: un brano
    segnaposto per verificare la clonazione end-to-end, poi (v3.2) riscritto perché mostri,
    con commenti visibili nel testo, ogni direttiva che `chordpro.ts` riconosce. Un account
    già provisionato prima di questa modifica tiene la propria copia col vecchio testo: la
    clonazione avviene una volta sola alla creazione, non si ripete quando il template
    cambia.
17. ~~**Precache offline per account multipli (v3.0)**~~ — risolta: nessun precache
    d'installazione per i brani; la copertura offline arriva da un warm-up per-lettore che
    copre solo gli account a cui chi legge ha accesso.
18. **Cosa succede a un account se il suo proprietario esce da `ALLOWED_EMAILS` (v3.0)** —
    oggi non esiste alcun flusso di rimozione per un proprietario (è impossibile per
    costruzione, v2.0/v2.1). Se in futuro ne comparisse uno, resterebbe da decidere se il suo
    account e i suoi canzonieri restano raggiungibili da chi vi era stato invitato come
    collaboratore, o se anche quell'accesso decade con lui. Diventa in gran parte superata
    dalla v3.1: senza collaboratori, l'unica domanda che resta è se l'account in sé (i suoi
    canzonieri) debba sparire insieme al proprietario o restare, orfano ma intatto, finché
    un proprietario globale non decide di eliminarlo esplicitamente — quest'ultima è già la
    risposta implicita di come `accounts`/`isAdmitted` sono scritte in v3.1: uscire da
    `ALLOWED_EMAILS` non elimina nulla da sé.
19. **Snapshot di `drizzle-kit` non aggiornato (v3.0, v3.1, v3.2)** — le migrazioni scritte
    a mano di tutte e tre le versioni (0015/0016, 0017 che droppa `members`, e ora 0018 che
    aggiunge `pendingRegistrations`/`passwordResetTokens`/`rateLimitHits`) usano
    `drizzle-kit generate --custom`, che crea il file SQL vuoto e la voce di journal senza
    mai ricalcolare lo snapshot dal vero `schema.ts`: ogni `NNNN_snapshot.json` da 0015 in
    poi è quindi una copia byte-per-byte di quello precedente (v2.4), cambiano solo
    `id`/`prevId`. Il database reale è corretto — ogni migrazione è stata verificata riga
    per riga contro di esso — ma il **prossimo** `npm run db:generate`, in un terminale
    vero, proporrà di ricreare da capo `accounts`, le colonne di `songbooks`, le tre tabelle
    del v3.2, e persino di *ricreare* `members` (lo snapshot non sa ancora che è stata
    droppata): da scartare, rigenerando invece lo snapshot a mano o rispondendo ai prompt
    interattivi per farlo combaciare con la realtà, prima di fidarsi del diff che propone.
20. **Comunicare ai quattro collaboratori esistenti che perdono Cartoni animati (v3.1)** —
    l'app non ha un sistema di notifiche o invio email; lo scopriranno aprendola. Se serve
    avvisarli prima, è un messaggio da mandare fuori dall'app, non una funzionalità da
    costruire per questo.
21. ~~**`setPasswordFor`/`removePasswordFor` autorizzano su `asAdmin()`, non su
    `isOwner` (v3.1)**~~ — risolta due volte: cancellate come codice morto nella prima
    consegna, poi reintrodotte (creare un account da Accounts non basta a farci entrare chi
    non ha un account Google corrispondente) autorizzate su `isOwner` diretto, richiamate
    da `AccountPasswordButton`.
22. **Nessuna moderazione oltre la cancellazione (v3.2)** — un proprietario globale può solo
    cancellare un account (v3.1), non bloccarlo in modo permanente: lo stesso indirizzo può
    ri-registrarsi subito dopo. Se con la registrazione aperta emerge un bisogno reale di
    tenere fuori un indirizzo specifico, va deciso e costruito a parte — non è nello scope
    di questa versione.
23. **Nessuna invalidazione delle sessioni dopo un reset password (v3.2)** — la sessione
    resta un JWT di 90 giorni senza stato lato server, la stessa scelta deliberata già presa
    per il ruolo (v2.1). Un dispositivo già connesso con la vecchia password resta connesso
    finché il token non scade da solo; invalidarlo davvero richiederebbe un concetto di
    epoca/versione di sessione controllato lato server, che è un cambiamento più grande di
    "il giro di registrazione".
24. **Numeri esatti del rate limiting (v3.2)** — la tabella e il meccanismo sono nello
    scope, la soglia (proposta: 5 tentativi ogni 10 minuti per chiave) resta da tarare
    quando ci sarà traffico reale da osservare.
25. **Testo delle email di verifica, benvenuto e reset (v3.2)** — l'impianto (Resend, tre
    modelli semplici nella stessa tavolozza dell'app) è deciso, il testo esatto no: resta
    da scrivere e rivedere quando i modelli sono pronti da vedere.
26. ~~**Verifica DNS del dominio d'invio su Resend (v3.2)**~~ — risolta, e poi spostata due
    volte col dominio: il dominio verificato su Resend è ora `strumfolio.com`, con
    DKIM/SPF sul sottodominio dedicato `send.strumfolio.com` (non la radice), e
    `RESEND_FROM` punta a `no-reply@strumfolio.com`. Dettagli e il resto dei sei sistemi da
    toccare a ogni cambio di dominio sono in `CLAUDE.md`, non ripetuti qui.
27. **Simulare un pagamento fallito, `grace`, end-to-end (v3.6)** — rimandato: nessuna
    schermata lato lettore mostra oggi quello stato per nessun account, reale o finto (solo
    la riga admin lo nomina). Da riprendere se emerge il bisogno di provare anche quel
    percorso.
28. **Le colonne grezze di un abbonamento restano "superate ma corrette solo attraverso
    `resolveSubscription`" indefinitamente (v3.6)** — non serve per la correttezza (ogni
    lettura passa dalla funzione pura), ma è un'igiene rimasta aperta: una scrittura pigra
    al prossimo tocco dell'account (`mockPurchase`, un futuro webhook) potrebbe riallineare
    `plan`/`planExpiresAt` col risultato risolto invece di lasciarli indietro a tempo
    indefinito.
29. ~~**Nome esatto delle funzioni server (v3.6)**~~ — risolta: `clearPendingChange`,
    `forceExpireNow`, `paymentHistoryFor`, costruite con questi nomi esatti.
30. ~~**Palette esatta dei sei colori di piano (v3.7)**~~ — risolta: `DESIGN.md` porta la
    palette completa sotto "Plan Badges — a declared exception to the Chord-First Rule".
31. ~~**Copy esatta della schermata di attesa dopo la registrazione (v3.7)**~~ — risolta
    lasciando che il contesto parli da solo: solo l'etichetta del pulsante cambia
    ("Continue with Free" invece di "Start free").
