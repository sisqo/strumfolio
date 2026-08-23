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

> **Stato:** da v1 a **v3.9 — anteprima email** (l'ultima versione numerata in questo
> documento) sono consegnate e in produzione su https://strumfolio.com. La v1.2 ha cambiato
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
come collaboratrice nello spazio di qualcun altro.

Il cancello d'ingresso **non cambia**: resta chiuso a chi non è né un proprietario
(`ALLOWED_EMAILS`) né già invitato da qualcuno che c'è. Cambia solo cosa trova, chi entra:
non più l'unico repertorio dell'installazione, ma il proprio.

Passi, nell'ordine in cui una migrazione reale li richiede:

1. **Nuova tabella `accounts`** — `ownerEmail` (chiave primaria), `createdAt`. Un account è
   sempre di una persona sola e non si rinomina: è identificato dal proprietario, non da un
   nome scelto. Serve come tabella a sé — non basta dedurre "gli account esistenti"
   dall'elenco dei canzonieri — perché un account deve poter esistere anche un istante
   prima che la clonazione del canzoniere Example gli scriva dentro qualcosa, e perché dà
   un bersaglio pulito alle chiavi esterne che seguono.
2. **`songbooks` guadagna `accountOwnerEmail`**, come colonna semplice — non come parte
   della chiave primaria. L'idea originale era una chiave composta `(accountOwnerEmail,
   slug)`, per permettere a due account di clonare lo stesso Example senza scontrarsi sullo
   slug; si è rivelata incompatibile con `generateStaticParams`, che genera le pagine di
   `/songs/[slug]` e `/songbooks/[slug]` **a build time**, senza alcun account di richiesta
   con cui comporre la chiave. Lo slug resta quindi **globale** come oggi — `songbooks.slug`
   e `songs.slug` restano chiavi primarie semplici, `sections` e `songs` non guadagnano
   alcuna colonna — e la clonazione dell'Example evita le collisioni riusando `uniqueSlug()`
   (già esistente) al momento della provisione, mintando uno slug nuovo per il canzoniere
   clonato e per ciascun brano che contiene. La conseguenza più grande è altrove: uno slug
   globale raggiungibile da chiunque sia autenticato è un confine di privacy che non regge
   più da solo, il che è il motivo dei punti 12–14 più sotto.
3. **`songbooks` guadagna `isExampleTemplate`** (booleano, default `false`), con un indice
   unico parziale (`UNIQUE (isExampleTemplate) WHERE isExampleTemplate`) che garantisce che
   al più un canzoniere in tutta l'installazione porti il flag. È quello che la
   provisione clona per ogni nuovo account; spostarlo su un altro canzoniere in futuro è un
   `UPDATE`, non un deploy.
4. **`members` diventa per-account.** Chiave primaria `(accountOwnerEmail, memberEmail)`
   invece di `email` da sola: la stessa persona può comparire più volte, una riga per ogni
   account di cui è collaboratrice, con un ruolo — editor o viewer — indipendente in
   ciascuno. `addedBy`, `role`, `createdAt` restano come sono oggi, solo scope diverso.
5. **`userSongPrefs` non cambia**, di conseguenza al punto 2: restando `songs.slug` una
   chiave globale, la chiave esterna verso `songs` e la chiave primaria
   `(userEmail, songSlug)` restano quelle di oggi, senza bisogno di una colonna
   `accountOwnerEmail` in più. `userPrefs` (zoom, notazione, strumento) resta comunque
   **della persona**, non del repertorio che sta leggendo — quello non era mai stato in
   discussione.
6. **`singAlongSessions` guadagna `broadcastAccountEmail`.** `ownerEmail` continua a dire
   *chi* sta trasmettendo (una trasmissione attiva a testa, come oggi); la nuova colonna
   dice *il repertorio di quale account* sta mostrando — quasi sempre il proprio, ma non
   necessariamente, se chi trasmette è anche collaboratore altrove (vedi punto 11).
7. **`roleOf` accetta l'account bersaglio.** Restano tre ruoli — admin, editor, viewer — ma
   editor/viewer smettono di essere un fatto globale sulla persona e diventano relativi
   a un account: `roleOf(email, ALLOWED_EMAILS, accountOwnerEmail, members)` risponde
   `admin` in due casi — l'email è un proprietario globale (ovunque, come oggi: il bypass
   non cambia), **oppure** l'email è la proprietaria *di quello specifico account*. Il
   secondo caso non è il primo travestito: un proprietario d'account ha pieno controllo
   solo lì, non su nessun altro account — vedere ed entrare in *tutti* gli account resta
   un potere del solo bypass globale, controllato a parte da chi mostra l'elenco (punto
   10), non da `roleOf`. Solo se nessuno dei due si applica si cerca la riga
   `(accountOwnerEmail, email)` in `members`, che non contiene mai `admin`: è un grado che
   nessun account può concedere a un collaboratore, per costruzione — vedi *Account
   (v3.0)* nella tabella delle Decisioni. `admitted()`, la guardia del login, resta invece
   un controllo **senza** account di destinazione: esiste se l'email è proprietaria
   globale **o compare in `members` per almeno un account qualsiasi** — è così che il
   cancello resta chiuso a chi nessuno ha mai invitato da nessuna parte, senza dover già
   sapere quale sarà il primo account che vedrà.
8. **Provisione automatica alla prima sign-in riuscita**, dentro `signIn` in `auth.ts`,
   accanto a `recordSignIn`: se l'email non ha ancora una riga in `accounts`, se ne crea
   una e si clona il canzoniere con `isExampleTemplate`, con le sue sezioni e i suoi brani,
   dentro il nuovo account. Idempotente per costruzione — controlla l'esistenza, non
   l'occasione — quindi può girare a ogni login senza bisogno di distinguere "il primo".
   Questo vale per **chiunque** superi `admitted()`, non solo per chi entra come
   proprietario: un invitato come semplice collaboratore in un account altrui riceve
   comunque il proprio, come richiesto.
9. **Account corrente: un cookie, non il token di sessione.** A differenza del ruolo — che
   resta fuori dal JWT per motivi di sicurezza (v2.1) — quale account si sta guardando è
   solo una preferenza di navigazione, e può vivere in un cookie semplice, riletto e
   **sempre riverificato** a ogni richiesta lato server: mai fidarsi del suo contenuto senza
   ricontrollare che l'email in sessione abbia davvero accesso (admin, proprietà, o riga in
   `members`) all'account che dice. Un cookie assente, invalido o che punta a un account non
   più accessibile ricade sempre sul proprio account — che è anche, così, il comportamento
   di default dopo il login, senza bisogno di un'azione dedicata a "apri il tuo account".
   Cambiare account è una server action che valida l'accesso e riscrive solo il cookie.
10. **`/utenti` diventa la gestione collaboratori dell'account corrente**; una nuova
    schermata (solo per chi ha ruolo admin) elenca tutti gli account dell'installazione,
    con un'azione "entra" per ciascuno che equivale a cambiare account. Nel menù, chi ha
    accesso a un solo account (il proprio, il caso comune) non vede alcun selettore — chi
    ne ha più di uno, perché è collaboratore altrove o perché è admin, sì.
11. **Sing Together trasmette l'account corrente**, non "il" repertorio: chi avvia una
    trasmissione deve avere editor o admin sull'account che ha aperto in quel momento — un
    viewer può seguire un canzoniere, non esporlo pubblicamente con un link. Le letture
    lato ospite (`guestReads.ts`) si filtrano per `broadcastAccountEmail` invece di leggere
    tutte le tabelle senza condizione.
12. **Slug globale + pagine statiche = una fuga di privacy**, scoperta durante
    l'implementazione e non prevista dall'interview: con lo slug tornato globale (punto 2),
    `/songs/[slug]` e `/songbooks/[slug]` restano generate a build time da
    `generateStaticParams`, il che le rende raggiungibili da **chiunque sia autenticato**,
    non solo da chi ha accesso all'account proprietario — indovinare uno slug altrui bastava.
    Il precache d'installazione (`scripts/precache-routes.ts`) aggravava la cosa scaricando
    ogni canzoniere di ogni account su ogni dispositivo, a prescindere da chi lo usa. Due
    strade erano possibili — accettare la fuga com'è (nessun altro account esiste ancora),
    o ricostruire il confine di privacy per davvero; la seconda è quella scelta, tutta in
    un'unica consegna piuttosto che in due tempi.
13. **Le pagine diventano dinamiche, il confine di privacy si sposta nel controllo
    d'accesso.** `generateStaticParams` viene rimosso da `/songs/[slug]` e
    `/songbooks/[slug]` (`export const dynamic = 'force-dynamic'` al suo posto); ogni
    caricamento risolve l'account proprietario della risorsa (`songAccountOf`/
    `songbookAccountOf`) e verifica `accessTo(accountOwnerEmail)` **prima** di leggere o
    restituire qualunque dato, con `notFound()` sia per "non esiste" sia per "esiste ma non
    è tuo" — indistinguibili di proposito, per non confermare a un estraneo che uno slug
    indovinato esiste davvero. La stessa distinzione vale ovunque una risorsa si raggiunga
    per slug/token invece che navigando l'account corrente: pagina di modifica, azioni di
    salvataggio/spostamento/cancellazione, letture lato ospite di Sing Together. Da qui
    anche la fine della tabella `builds` e del pannello "in attesa di pubblicazione": con
    ogni pagina dinamica, un salvataggio è live all'istante, non c'è più una build da
    aspettare.
14. **L'offline si ricostruisce senza un precache unico.** Il precache d'installazione si
    riduce a quattro rotte generiche (`/`, `/utenti`, `/password`, il manifest); la copertura
    offline per lettore arriva invece da due meccanismi nuovi — il service worker applica lo
    stesso controllo di sessione già usato per il precache anche alla cache di runtime delle
    pagine (`authenticatedPageCaching` in `sw.ts`, prima limitato all'installazione), e un
    warm-up in background (`OfflineSync`) che, una volta online, richiede da sé le pagine dei
    soli account a cui chi legge ha accesso — mai quelle di un account altrui.

**Migrazione dei dati esistenti, in ordine.** Il repertorio unico di oggi e i suoi
`members` diventano l'account di **f.limberti@gmail.com** — scelto perché l'altro indirizzo
di `ALLOWED_EMAILS`, f.limberti@3nd.it, riceve il proprio account personale vuoto al
prossimo login, come chiunque altro (punto 8), pur restando proprietario globale nel
frattempo. Concretamente: si crea la sua riga in `accounts`; si scrive `accountOwnerEmail`
su ogni riga esistente di `songbooks` con quel valore (`sections` e `songs` non hanno
bisogno di nulla, seguono `songbookSlug`); ogni riga attuale di `members` diventa una riga
`(accountOwnerEmail: f.limberti@gmail.com, email, role, addedBy, createdAt)` invariata nel
resto, cosa che preserva l'accesso di chi è già invitato senza bisogno di re-invitarlo;
`userSongPrefs` non richiede backfill (punto 5). Le eventuali trasmissioni Sing Together
già aperte al momento della migrazione, se presenti, si scartano piuttosto che collegarle a
un account: sono trasmissioni interrotte, non repertorio.

Il canzoniere Example esiste (creato durante l'implementazione: un canzoniere dedicato, non
uno dei segnaposto di `content/`, che restano il repertorio "vero" del primo account), è
flaggato `isExampleTemplate` e conteneva un brano segnaposto — aggiunto proprio per
verificare la clonazione end-to-end contro il database reale prima di dichiarare la
versione conclusa (vedi *Scostamenti dal piano* più sotto). Il contenuto editoriale è stato
scritto in seguito (v3.2): «Example Song» usa ora ogni direttiva che il visualizzatore
riconosce — title, artist, tags, canzoniere, sezione, comment, start_of_chorus/end_of_chorus,
start_of_bridge/end_of_bridge — spiegando ciascuna con un commento visibile nel testo stesso,
oltre a coprire i casi particolari dell'accordo in riga (a inizio parola, a metà parola, e una
riga di soli accordi senza testo sotto).

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
produzione, e "l'admin crea un account" non avrebbe ancora nessun percorso di codice per
farlo. Le due cose devono cambiare nello stesso rilascio:

1. **`isAdmitted` guadagna una seconda condizione, al posto di `members`**: l'indirizzo ha
   già una riga in `accounts` (come proprietario). Il parametro `members` sparisce dalla
   firma; arriva invece un semplice booleano ("questo indirizzo ha già un account?"), letto
   una volta da chi chiama (`auth.ts`), come già avveniva per le iscrizioni.
2. **`provisionAccount(email)` non cambia nella sostanza** — resta la stessa funzione
   idempotente chiamata ad ogni sign-in riuscito, che crea la riga in `accounts` e clona
   l'Example se non esistono ancora. Diventa, in più, l'azione che gira quando un
   proprietario globale preme "crea" sulla pagina Accounts: stessa funzione, due modi di
   invocarla. Un account creato così esiste già, con l'Example dentro, prima ancora che
   quell'indirizzo faccia il primo login — è così che "quando un utente nuovo si
   registrerà, il suo account c'è già" diventa vero anche per chi non è mai stato
   proprietario globale.
3. **`roleOf` si riduce a un solo ruolo concedibile.** Non esistendo più collaboratori, non
   esiste più nulla da leggere in una tabella per rispondere alla domanda "che ruolo ha
   questa persona qui": o è la proprietaria dell'account (o una proprietaria globale), ed è
   `admin`, oppure non ha alcun accesso, `null`. `ROLES`, `MEMBER_ROLES`, `MemberRole`,
   `readRole`, `Membership` spariscono; `canManageUsers` sparisce con loro (non c'è più
   nulla da "gestire" nel senso di persone da invitare). `canEdit(role)` resta, unica
   domanda di permesso rimasta, anche se ora equivale letteralmente a `role === 'admin'` —
   tenuta come funzione a sé, non inlineata, perché i punti che la chiamano (`asEditor`,
   `asEditorOn`) restano più leggibili a dire "posso modificare questo" che "sono admin".
4. **Tolto per intero**: la tabella `members` (nuova migrazione, solo dopo il deploy che
   smette di scriverci — stesso schema in due tempi già usato per `builds`, qui però senza
   una parte additiva: non c'è nulla da aggiungere, solo da togliere);
   `src/lib/members/{actions,read,types}.ts`; `MemberManager.tsx`; la pagina `/utenti`
   (`src/app/users/page.tsx`) e la voce corrispondente nel menù; `withPassword` in
   `auth/credentials.ts` (l'unico chiamante era `loadMembers`); i casi editor/viewer nei
   test di `roles.test.ts`; il testo su ruoli ed inviti nella pagina di login (FAQ e riquadro
   funzionalità); il caso `'Editor'` di `RoleNotice`.
5. **`accounts/current.ts`, `accounts/read.ts`, `accounts/actions.ts` perdono il parametro
   `memberships`** ovunque compare — non c'è più nulla da leggere lì per rispondere "questo
   indirizzo può aprire questo account": può, se è il suo, o se è un proprietario globale.
   `mayShowAccountSwitcher` si riduce a "sei un proprietario globale?" — il ramo "hai più di
   un account" non può più essere vero per nessun altro, quindi sparisce.
6. **La pagina Accounts ha un solo pubblico**: i proprietari globali. Non più due sezioni
   ("Yours" ed "Every account"), ma un solo elenco — ogni account dell'installazione, con
   *Entra*, e adesso anche *Crea* (un campo email, riusa `provisionAccount`) ed *Elimina*
   per ciascuna riga. La guardia della pagina passa da "proprietario globale o più di un
   account" a "proprietario globale", punto.
7. **Eliminare un account è una cascata immediata**, senza blocco se non è vuoto: canzoniere
   per canzoniere, sezioni e brani (le preferenze di quei brani seguono da sole, la chiave
   esterna verso `songs` è già `on delete cascade`), poi le eventuali trasmissioni Sing
   Together che stanno mostrando il repertorio di quell'account (`broadcastAccountEmail`),
   infine la riga in `accounts` stessa — tutto dentro una singola transazione, in
   quest'ordine perché è quello che rispetta i vincoli già presenti nello schema (`restrict`
   fra canzonieri/sezioni/brani, pensato apposta per impedire cancellazioni accidentali
   *dagli altri percorsi* — qui l'ordine esplicito li rispetta invece di doverli allentare).
   Le credenziali (password) dell'indirizzo si cancellano in più, ma solo se dopo la
   rimozione quell'indirizzo non risulta più ammesso in nessun altro modo (stessa logica già
   usata da `removeMember` per lo stesso motivo) — un proprietario globale il cui account
   viene eliminato resta ammesso e ne riceve semplicemente uno nuovo, vuoto, al prossimo
   login. L'unica rete di sicurezza è nell'interfaccia, non nel database: va ridigitato
   l'indirizzo dell'account da eliminare prima che il pulsante funzioni davvero — una scelta
   esplicita, discussa e confermata, di non bloccare la cancellazione di un account non
   vuoto né quella dell'account di un proprietario globale.
8. **Sing Together non cambia nel meccanismo.** `broadcastAccountEmail` resta distinto da
   `ownerEmail` — serve ancora esattamente al caso "un proprietario globale è entrato
   nell'account di qualcun altro e trasmette il suo repertorio", che questa versione non
   toglie affatto: un proprietario globale continua ad avere pieno controllo su ogni
   account, trasmissione compresa. Cambia solo cosa vuol dire poter avviare una
   trasmissione: non più "editor o admin sull'account aperto", ma "admin sull'account
   aperto" — che oggi è già vero per chiunque sia entrato nel proprio account o in uno
   altrui da proprietario globale, quindi nessun brano di codice cambia in `session.ts`, solo
   il significato di `canEdit` a monte.
9. **Migrazione dei quattro indirizzi ammessi solo tramite `members`** (lconsegni@yahoo.it,
   marcomassetti1980@gmail.com, albano.nicola@gmail.com, ing.paolo.guarducci@gmail.com):
   ciascuno riceve un proprio account — stesso `provisionAccount` di sempre, eseguito da
   script prima che il nuovo codice sia in produzione, non dopo, perché è `isAdmitted` a
   decidere chi entra dal momento del deploy in poi, non la tabella `members` (che a quel
   punto può ancora esistere per un istante, ma non viene più consultata). Nessuno dei
   quattro vedrà più Cartoni animati: ripartono con un proprio Example, esattamente come un
   utente mai visto prima — scelta esplicita, discussa e confermata, non un effetto
   collaterale scoperto dopo. Le credenziali che hanno già impostato restano valide, non
   sono legate a `members` in alcun modo.

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

1. **Il cancello non serve più.** `admitted()`/`isAdmitted()` esistono per tenere fuori
   chi non ha diritto — ma con la registrazione aperta, chi bussa ha sempre diritto, se
   arriva da uno dei due percorsi qui sotto. Vengono ritirate, non semplificate: la
   callback `signIn` in `auth.ts` chiama `recordSignIn` e `provisionAccount` per chiunque
   un provider abbia già autenticato con successo — un OAuth Google riuscito, o una
   password che corrisponde a un `credentials` già verificato — senza più chiedere il
   permesso a una funzione a parte. Un controllo aggiuntivo, non un cancello: il profilo
   Google deve dichiarare `email_verified`, così un OAuth provider mal configurato non può
   mai far entrare un indirizzo che Google stessa non garantisce.
2. **Registrarsi con Google è già registrarsi.** Il protocollo OAuth non distingue "entra"
   da "iscriviti": Google restituisce sempre la stessa cosa, un'identità verificata. Il
   pulsante "Sign in with Google" già su `/login` diventa, di fatto, anche il modo per
   registrarsi — nessun secondo pulsante, nessuna pagina diversa: la prima volta che quel
   flusso ha successo, `provisionAccount` gli crea l'account, esattamente come oggi accade
   a un proprietario globale al primo accesso.
3. **Registrarsi con email e password è in due tempi.** Una nuova tabella
   `pendingRegistrations` (`email` chiave primaria, `passwordHash`,
   `verificationTokenHash`, `expiresAt`, `createdAt`) tiene una richiesta di registrazione
   finché non è verificata — **non è un account**: nessuna riga in `accounts` o
   `credentials`, nessun canzoniere clonato, finché il link nella mail di verifica non
   viene cliccato. Coerente con come questo progetto tratta già "niente esiste finché non
   ce n'è un motivo vero" (lo stesso principio dietro il canzoniere Example, o dietro il
   non bloccare la cancellazione di un account: qui il motivo è il contrario, non creare
   affatto finché non è provato che l'indirizzo è reale). Registrarsi con un indirizzo che
   ha già un account vero viene rifiutato con un messaggio chiaro (accedi, o recupera la
   password); registrarsi di nuovo con un indirizzo ancora in sospeso rinnova semplicemente
   il token e rimanda la mail, senza errore — è così che "non mi è arrivata l'email"
   si risolve senza una funzione a parte.
4. **La pagina `/register`.** Stesso impianto di `/login`: un pulsante Google (il
   medesimo flusso del punto 2) e un modulo email/password/conferma password, con il
   CAPTCHA del punto 9. Il successo porta a una schermata "controlla la posta", con un
   pulsante per rispedire la mail. `/login` guadagna un rimando a `/register`, e perde la
   frase "Access is limited to approved email addresses", non più vera.
5. **Verifica: `/verify?token=...`.** Il token si confronta come una password — mai in
   chiaro nel database, con lo stesso hashing già usato altrove — e se valido e non scaduto:
   dentro una transazione, nasce la riga `accounts`, la riga `credentials` con l'hash già
   pronto dalla registrazione, e parte la clonazione dell'Example (`provisionAccount`,
   identica a ogni altro percorso di ammissione); la riga in `pendingRegistrations` si
   cancella; parte la mail di benvenuto; chi ha appena verificato entra subito, senza dover
   ridigitare la password che ha appena scelto. Un token scaduto o già usato mostra un
   errore con un invito a rispedire, non un vicolo cieco.
6. **Recupero password: `/forgot-password` e `/reset-password?token=...`.** La
   prima chiede solo un indirizzo (più CAPTCHA) e risponde sempre allo stesso modo,
   l'indirizzo esista o no, abbia già una password o no — esistere o meno non deve
   trapelare da qui, stesso principio della reiezione a tempo costante già scritta in
   `authorize()` per il login. Se un account vero esiste, nasce una riga in
   `passwordResetTokens` (`email`, `tokenHash`, `expiresAt`) e parte una mail con il link.
   La seconda pagina chiede la nuova password (`isPasswordAcceptable`, la stessa regola di
   sempre) e la scrive con `writePasswordHash` — la stessa chiamata che già serve sia per
   impostarne una prima volta sia per cambiarla, quindi un indirizzo senza password ancora
   ne riceve una prima proprio da qui, senza bisogno di un percorso diverso. Il token si
   cancella dopo l'uso; l'email risulta verificata come effetto collaterale, avendo appena
   dimostrato di controllare quella casella.
7. **Mail di benvenuto, una volta sola.** Parte nell'istante esatto in cui un account
   comincia a esistere davvero — dentro `provisionAccount`, quando crea la riga e non la
   trova già lì — mai sulle chiamate successive, che sono un no-op idempotente per
   costruzione. `provisionAccount` deve poter dire al chiamante se ha creato qualcosa o no,
   cosa che oggi non fa (ritorna `void`); guadagna quel bit di ritorno per questo motivo,
   non per un altro.
8. **Un fornitore di email: Resend.** Nuove variabili d'ambiente (`RESEND_API_KEY`,
   un mittente come `Songbook <no-reply@songbook.sisqo.dev>`), un modulo `lib/email/send.ts`
   sottile sopra l'SDK, tre modelli semplici (verifica, benvenuto, reset) che riprendono la
   stessa tavolozza chiara/scura dell'app senza inventarsi un sistema di design a parte.
   Richiede una verifica del dominio via DNS, un passo fuori dall'app — stessa categoria
   di setup già fatta per GitHub, Vercel e Neon.
9. **Un CAPTCHA: Cloudflare Turnstile**, sulla registrazione e sul recupero password — le
   due superfici che, su richiesta di chiunque, mandano un'email a un indirizzo scelto da
   chi la chiede, quindi il vettore più ovvio di email-bombing di qualcun altro. Nuove
   variabili d'ambiente (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` — la
   prima pubblica per forza, essendo Next.js a richiederlo per esporla al client),
   verificate lato
   server prima di scrivere qualunque riga in `pendingRegistrations` o
   `passwordResetTokens`. Richiede un account Cloudflare gratuito, altro setup fuori
   dall'app.
10. **Un limite di frequenza, nel database, senza un servizio nuovo.** Una tabella
    `rateLimitHits` (`key` chiave primaria, `windowStart`, `count`) condivisa da
    registrazione, reinvio, recupero password — e, visto che il meccanismo costa poco una
    volta che esiste, anche dal login stesso, chiave per indirizzo IP o email a seconda
    dell'azione. I numeri esatti (una proposta ragionevole: 5 tentativi ogni 10 minuti per
    chiave) restano da tarare quando ci sarà traffico reale da osservare, non un requisito
    da azzeccare oggi.

Nessuna migrazione dei dati esistenti: questa versione è puramente additiva sulla porta
d'ingresso, non tocca un solo account, canzoniere o membro già presente.

### v3.3 — il menu utente

Fino ad ora chi era loggato non aveva un modo per vedersi: l'indirizzo con cui si è
entrati, se si è proprietari globali, e le due azioni che riguardano solo il proprio
modo di entrare (password, sign out) vivevano sparse — la password dentro Impostazioni,
il sign out in fondo al menu hamburger, nessuna delle due accanto a un'identità
visibile. Questa versione aggiunge un secondo pulsante in testata, accanto
all'hamburger: un monogramma a due lettere, colorato in base all'indirizzo, che apre
un pannello con l'indirizzo per esteso, l'etichetta "Owner" per chi amministra l'intera
installazione, e le due azioni che gli erano rimaste addosso.

1. **"Owner" segue `isOwner`, non il ruolo `admin`.** Dalla v3.1 `admin` è l'unico ruolo
   che esiste, ed è di chiunque abbia un account — mostrarlo per quel controllo avrebbe
   acceso l'etichetta per ogni singolo utente registrato, senza distinguere nessuno.
   `isGlobalOwner`, nel contesto (`RoleProvider`), è la stessa domanda già posta da
   `mayShowAccountSwitcher` per il selettore Account, sotto il nome che questo pannello
   legge.
2. **Cambia password e Sign out si spostano, non si duplicano.** Uscivano dal menu
   hamburger — password dentro Impostazioni, sign out in fondo — per vivere solo qui:
   un solo posto per le azioni sul proprio account, l'hamburger resta solo navigazione.
3. **L'avatar legge l'indirizzo, non il profilo Google.** Un account per email e
   password (v3.2) non ha né nome né foto; usare quelli di Google per chi ha fatto
   l'accesso così, e un monogramma per tutti gli altri, avrebbe fatto sembrare due
   funzionalità diverse quella che è una sola. Iniziali e colore sono entrambi derivati
   dall'indirizzo (`lib/avatar.ts`), deterministici: lo stesso indirizzo disegna sempre
   lo stesso avatar, su ogni dispositivo.
4. **Sign-out arriva come `children`, non come import.** È un componente server che
   avvolge una server action inline; `UserMenu` è un componente client, e Next.js
   rifiuta di raggrupparli insieme se l'uno importa l'altro direttamente — la stessa
   ragione per cui `NavMenu` lo prendeva già così, prima che si spostasse qui.

Nessuna migrazione: nessuna tabella nuova, nessuna colonna toccata — solo interfaccia e
il contesto già esistente (`RoleProvider`), esteso con l'indirizzo che gli mancava.

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
10. ~~**Canzonieri condivisi o per utente**~~ — risolta dalla v3.0 (*Account*): ogni account
    ha i propri canzonieri, non più struttura condivisa fra tutti gli ammessi.
11. **Rinominare uno slug di brano** — non previsto nemmeno dall'import: lo slug si genera
    dal titolo alla creazione e poi resta. Cambiarlo orfanerebbe le preferenze salvate di
    quel brano, quindi servirebbe una tabella di alias.
12. ~~**Come si produce l'archivio dell'export**~~ — risolta: `fflate` (piccola, senza
    dipendenze), un `.chopro` per brano, zip piatto — questo è anche il percorso di
    ripristino, quindi resta senza cartelle né numeri. La domanda che ne era rimasta aperta,
    un export pensato per essere sfogliato piuttosto che ripristinato, è risolta a parte in
    *Export organizzato* (Decisioni), con due modalità (per canzone, per sezione), cartelle
    per canzoniere e sezione, e numerazione — non ancora implementata.
13. **Qualità della conversione** — l'euristica «accordi sopra il testo» fallirà su sorgenti
    con tabulazioni, etichette di sezione in mezzo, o accordi e testo sulla stessa riga. La
    preview e il corpo modificabile sono la mitigazione; se in pratica sbaglia troppo spesso
    su un sito che usi davvero, conviene aggiungere casi di test presi da lì.
14. **Brani in attesa non leggibili** — prima della pubblicazione un brano si vede solo nella
    preview dell'import. Se capiterà di volerlo provare a suonare subito, l'alternativa è una
    pagina di lettura dinamica per i soli brani in attesa, fuori dal precache.
15. ~~**Chi prende in carico il repertorio esistente (v3.0)**~~ — risolta: **f.limberti@gmail.com**.
    L'altro proprietario globale, f.limberti@3nd.it, riceve il proprio account personale
    (vuoto, con il solo Example) al prossimo login, come chiunque altro.
16. ~~**Contenuto del canzoniere Example (v3.0)**~~ — risolta in due tempi: prima con un
    unico brano segnaposto ("Example Song"), aggiunto proprio per verificare la clonazione
    end-to-end (confermata contro il database reale: un secondo account provisionato ha
    ricevuto `example-2` con la sua sezione e il suo brano, slug tutti nuovi); poi (v3.2)
    riscrivendone il corpo perché mostri, con commenti visibili nel testo, ogni direttiva
    che `chordpro.ts` riconosce — restano fuori solo gli alias, che sono la stessa direttiva
    scritta in un altro modo. Un account già provisionato prima di questa modifica tiene la
    propria copia clonata col vecchio testo: la clonazione avviene una volta sola alla
    creazione dell'account, non si ripete quando il template cambia.
17. ~~**Precache offline per account multipli (v3.0)**~~ — risolta: nessun precache
    d'installazione per i brani. Un salvataggio è live subito (pagine dinamiche), e la
    copertura offline arriva da un warm-up per-lettore che copre solo gli account a cui chi
    legge ha accesso — mai "tutti" indiscriminatamente.
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
    `isOwner` (v3.1)**~~ — risolta due volte. Prima consegna: cancellate come codice morto,
    perché `MemberManager` — il loro unico chiamante — era sparito e nessuna nuova
    interfaccia le richiamava ancora. Si è rivelato il ramo sbagliato: creare un account
    dalla pagina Accounts non basta a farci entrare chi lo riceve, se quell'indirizzo non
    ha un account Google corrispondente e l'app non manda inviti via email. Reintrodotte in
    `auth/actions.ts`, questa volta autorizzate su `isOwner` diretto (non su `asAdmin()`,
    che varrebbe per il proprietario di un account qualsiasi) e richiamate da un nuovo
    `AccountPasswordButton` nella pagina Accounts.
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
    volte col dominio: non più `sisqo.dev`, il dominio verificato su Resend è ora
    `strumfolio.com`, con la verifica DKIM/SPF sul sottodominio dedicato che Resend stesso
    richiede (`send.strumfolio.com`, non la radice — vedi `CLAUDE.md`), e `RESEND_FROM`
    punta a `no-reply@strumfolio.com` (`lib/email/send.ts`). ImprovMX (inoltro di
    `info@strumfolio.com`) coesiste sugli stessi MX/TXT a livello di radice senza conflitto,
    perché risponde a una domanda diversa (dove va la posta *in arrivo*, non chi può
    spedire *come* il dominio) — dettagli e il resto dei sei sistemi da toccare a ogni
    cambio di dominio sono in `CLAUDE.md`, non ripetuti qui.
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
29. ~~**Nome esatto delle funzioni server `clearPendingChange`/`forceExpireNow`/
    `paymentHistoryFor` (v3.6)**~~ — risolta: costruite con questi nomi esatti, confermato
    leggendo `lib/plans/checkout.ts` e `lib/plans/history.ts`.
30. ~~**Palette esatta dei sei colori di piano in `/accounts` (v3.7)**~~ — risolta:
    `DESIGN.md` porta la palette completa (`plan-standard`/`plan-plus`/`plan-premium`/
    `plan-lifetime`, ciascuno con la coppia `-soft`/`-night`/`-night-soft`) sotto "Plan
    Badges — a declared exception to the Chord-First Rule".
31. ~~**Copy esatta della schermata di attesa dopo la registrazione (v3.7)**~~ — risolta
    lasciando che il contesto parli da solo: nessuna frase aggiunta su `/pricing`, solo
    l'etichetta del pulsante che cambia ("Continue with Free" invece di "Start free").
