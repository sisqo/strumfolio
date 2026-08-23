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
| Auth | **Auth.js v5** (`next-auth@5`), provider Google, sessioni JWT |
| PWA | **Serwist** (successore mantenuto di `next-pwa`) |
| Lingua UI | Inglese (cambiata da italiano nel corso del progetto), testi in chiaro nel codice — nessun framework i18n |

### Flusso dei dati

Il punto chiave è che **il DB non sta davanti alla lettura**: la pagina si legge subito, e la
domanda al database viene dopo — se ha una risposta più recente, la si mette sopra.

```
build      Neon ──SELECT──▶ generateStaticParams ──▶ /canzoni/[slug] statiche
                        └──▶ /api index di ricerca (JSON statico)
runtime    lettura  ──▶ pagina statica (o cache del service worker)
                     └──▶ server action ──▶ Neon  (la versione corrente, dopo il paint)
           scrittura ──▶ server action ──▶ Neon   (preferenze, canzonieri, brani)
```

Le pagine dei brani sono generate al build leggendo Neon, quindi a runtime la lettura non
paga né latenza di database né cold start: quello che si legge è sullo schermo prima che
qualsiasi richiesta parta. La domanda «questa canzone è cambiata?» viene fatta dopo, e la
risposta conta solo se è più recente della pagina — vedi *Pubblicazione*.

Sono le scritture, non le letture, a pagare l'autosuspend di Neon: il primo `+1` dopo un
periodo di inattività attende il risveglio del database. La coda di scrittura rende
l'attesa invisibile sullo schermo, ma esiste.

Dopo una modifica ai contenuti serve una rivalidazione: la fa il deploy, e dalla v1.3 anche
`revalidatePath()` al salvataggio — che però non basta da solo, perché non passa davanti al
service worker.

**Conseguenza da gestire:** le pagine statiche sono identiche per tutti, quindi non possono
contenere le preferenze dell'utente. La pagina viene servita nella tonalità originale e le
preferenze si applicano lato client. Per evitare un lampo di accordi nella tonalità
sbagliata, gli accordi vivono nel markup come dati strutturati e la trasposizione si applica
in un `useLayoutEffect` prima del paint.

### Modello dati

**Istantanea a metà v2.3, non lo schema di oggi** — la parte di dominio (canzonieri,
sezioni, brani, preferenze) non è cambiata nella sostanza; per la forma esatta e
aggiornata, comprese le colonne aggiunte dalla v3.0 in poi (`accounts`, `songbooks` con
`accountOwnerEmail`/`isExampleTemplate`/`position`, e tutto quanto arrivato con account,
piani e pagamenti), `src/lib/db/schema.ts` è la fonte viva: ogni tabella lì porta ormai lo
stesso genere di commento che c'è qui sotto, aggiornato a ogni cambiamento, mentre questo
blocco non lo è. `canzonieri` è stata rinominata `songbooks` (nome inglese) alla v2.4; le
righe `members` e `builds` sotto sono state rimosse per intero — la prima alla v3.1, la
seconda alla v3.0 — e restano solo per il loro perché.

```sql
songbooks(slug primary key, name, created_at, updated_at)  -- "canzonieri" nel prosa; rinominata da v2.4

sections(id serial primary key,                                      -- v2.3
         songbook_slug not null references songbooks(slug) on delete restrict,
         name, position, created_at,
         unique (songbook_slug, name),      -- l'import indirizza per nome
         unique (id, songbook_slug))        -- solo per essere referenziata, sotto

songs(slug primary key, title, artist, body, tags[],
      songbook_slug not null references songbooks(slug) on delete restrict,
      section_id,                                                    -- v2.3, nullable per un deploy
      position,                                                      -- v1.6, nullable
      created_at, updated_at,
      foreign key (section_id, songbook_slug)                        -- v2.3
        references sections(id, songbook_slug)
        on delete restrict on update cascade)
      -- original_key rimossa in v2.0: la tonalità si stima dagli accordi

members(email primary key, added_by, created_at,                     -- RIMOSSA alla v3.1
        role)                                                        -- v2.1: admin|editor|viewer
      -- solo gli invitati; i proprietari restavano in ALLOWED_EMAILS e admin per definizione.
      -- Tolta con "niente più ospiti": un account è un indirizzo, nessuno è più ospite altrove.

credentials(email primary key, password_hash, updated_at)            -- v2.2
      -- come si dimostra un indirizzo, non se è ammesso: tabella a parte perché
      -- un proprietario non ha riga in members e deve poter avere una password

user_prefs(user_email primary key, zoom_step, notation)              -- globali
user_song_prefs(user_email, song_slug, semitones, scroll_speed,      -- per brano
                capo,                                                -- v1.8
                updated_at, primary key (user_email, song_slug))

builds(id primary key default 'last', built_at)                      -- v1.2, RIMOSSA alla v3.0
```

**`builds` (rimossa alla v3.0).** La riga singola veniva timbrata dal build, per sapere
quali brani erano ancora *in attesa di pubblicazione*: quelli con `updated_at` più recente
dell'ultimo build — l'unico modo onesto di rispondere, perché rifletteva ciò che il build
aveva effettivamente visto invece di ciò che l'app credeva di aver pubblicato. Sparita
insieme al pannello che la leggeva quando le pagine sono diventate dinamiche (v3.0): con
ogni pagina generata per richiesta, un salvataggio è live all'istante, e non c'è più una
build da aspettare.

`user_email` come chiave: con sessioni JWT non serve una tabella di utenti per
l'autenticazione. `members` (v2.0–v3.0, poi rimossa) non era quella tabella — diceva chi
era ammesso, non chi era autenticato, e i proprietari non vi comparivano.
Lo `slug` come chiave naturale al posto di un id surrogato: vedi *Scostamenti*.

**Lo slug di un canzoniere è immutabile.** Si genera una volta dal nome iniziale e non
cambia mai più: rinominare tocca solo `name`. È questo che rende una rinomina gratuita —
nessuna chiave esterna da aggiornare, nessuna URL che si sposta, nessuna voce di precache
da rigenerare.

L'`on delete restrict` è la regola "rifiuta se non è vuoto" scritta nel database, non solo
nella UI: nessun percorso, nemmeno un errore di programmazione, può cancellare un
canzoniere lasciando brani orfani.

**La chiave esterna composta è ciò che rende impossibile un brano in una sezione di un
altro canzoniere.** Il canzoniere di un brano è scritto due volte — sul brano e sulla sua
sezione — e invece di affidare la coerenza al codice la tiene il database. `on update
cascade` non è decorazione: è l'unica cosa che permette a una sezione di traslocare in un
altro canzoniere, misurato su uno schema di prova (senza, l'update è rifiutato in
*entrambi* gli ordini, perché il vincolo si controlla per statement e non per transazione).
`on delete` resta `restrict`: una sezione che contiene brani non si cancella.

**`songs.position` è nullable e resta null** finché qualcuno non riordina quella sezione o
non ci importa dentro. Dalla v2.3 conta **dentro una sezione**, non dentro il canzoniere. Non è un dettaglio implementativo: `null` significa «nessuno ha detto»,
e Postgres lo mette in fondo a un ordinamento crescente, quindi l'ordine alfabetico è il
comportamento di default senza una riga di codice che lo produca — verificato interrogando
Postgres, non la tabella. Un riordino, e ogni import, rinumerano l'intero canzoniere da 1 a N.

### Contenuti e seed

Sorgente di verità in v1: file nel repo, caricati da uno script.

```
content/
  certe-notti.chopro
  bocca-di-rosa.chopro
scripts/seed.ts             # npm run seed → upsert per slug
```

Lo script è idempotente (upsert per `slug`), così rilanciarlo dopo una correzione non
duplica nulla.

**Con la v1.2 questo regime cambia:** il database diventa il padrone dei brani e il seed
diventa di solo inserimento. Vedi *Import e modifica*.

**Il canzoniere è l'eccezione a questa regola, e va capita bene.** La direttiva
`{songbook: Repertorio}` in un `.chopro` dice dove il brano *nasce*, e il seed la applica
soltanto all'inserimento — o quando la colonna è ancora vuota, che è come i brani già
esistenti ricevono il loro canzoniere senza uno script separato. In aggiornamento la
direttiva viene **ignorata**: da quel momento comanda il database, altrimenti il primo
`npm run seed` cancellerebbe ogni rinomina e ogni spostamento fatto dall'app.

Ne segue una seconda eccezione: il seed **non fa pruning dei canzonieri**. Sono creati
dall'app, quindi esistono legittimamente righe che nessun file ha mai dichiarato. Dalla
v2.0 la regola "cancella ciò che non ha un file" non vale più per nessuno: era rimasta
solo per le scalette, e le scalette non ci sono più.

Un file senza la direttiva finisce in **Da ordinare**, un canzoniere creato al bisogno.
Serve perché ogni brano deve appartenere a uno, e il nome è deliberatamente un promemoria:
ciò che non è archiviato si vede a colpo d'occhio.

### Autenticazione

- Auth.js v5, sessioni JWT (nessun adapter, nessuna tabella di utenti per l'autenticazione).
- Due provider: **Google** e **credenziali** (email e password, v2.2). Il secondo dimostra
  *quale indirizzo* sei e non concede niente: `roleOf` decide come sempre, e non sa che la
  tabella delle password esista.
- Il callback `signIn` confronta l'email con l'unione di `ALLOWED_EMAILS` (i proprietari,
  dall'ambiente) e della tabella `members` (gli invitati, gestiti da `/utenti` — v2.0);
  qualunque altro account Google valido viene respinto con una pagina dedicata.
- **Ruoli** (v2.1): admin, editor, viewer. Una funzione sola, `roleOf`, risponde sia al
  login sia alle guardie davanti a ogni scrittura, e i proprietari sono admin per
  definizione. Il ruolo **non** entra nel token: una sessione dura novanta giorni e si
  porterebbe dietro i poteri di ieri, mentre così un cambio vale dall'azione successiva.
- `maxAge` sessione **90 giorni**: una sessione scaduta senza rete significherebbe restare
  chiusi fuori dal repertorio nel momento peggiore.
- Middleware a protezione di tutto tranne `/login`, gli asset statici e il manifest.
- **Da sapere:** con service worker cache-first, i brani già in cache restano leggibili sul
  dispositivo anche a sessione scaduta e senza rete. È il comportamento desiderato per
  l'uso dal vivo, ma va detto: la protezione è sull'accesso alla rete, non sul dispositivo.

### Offline e PWA

- Serwist con precache degli asset e delle pagine dei brani generate al build:
  installata sulla home del tablet, l'app apre istantaneamente e a rete assente.
- **Il punto più fragile di tutto il piano, da verificare prima di dichiarare l'offline
  funzionante.** Il precache del service worker fa richieste HTTP vere, che passano dal
  middleware di autenticazione: se il service worker si installa senza una sessione valida,
  quelle richieste vengono reindirizzate a `/login` e finiscono in cache **sotto gli URL dei
  brani**. Il risultato è la modalità di errore peggiore possibile, perché la cache sembra
  piena: offline ogni brano mostra una schermata di login. Va garantito che il precache parta
  solo dopo l'autenticazione, e va verificato che una pagina precachata renda offline con il
  cookie di sessione assente. Da controllare anche che venga messo in cache il payload RSC
  insieme all'HTML: con App Router è la parte che si rompe più facilmente.
- `manifest.json`, icone, `display: standalone`, tema coerente con la UI.
- Le preferenze scritte offline finiscono in una **coda in memoria** svuotata all'evento
  `online`; un indicatore discreto mostra che c'è una modifica non ancora salvata.
  Il DB resta l'unica fonte di verità: nessun mirror locale, nessuna logica di merge. Il
  limite accettato: un reload mentre si è ancora offline perde la modifica in coda.

## Formato dei contenuti

ChordPro, con accordi inline tra parentesi quadre. Direttive supportate in v1:

```
{title: Certe notti}
{artist: Ligabue}
{tags: lento, acustico}
{songbook: Repertorio}       ← solo il valore iniziale, vedi Contenuti e seed
{start_of_chorus} … {end_of_chorus}
{comment: assolo}

[Am]Certe [F]notti la [C]macchina sembra una [G]donna
```

Tutto il resto dello standard viene ignorato senza errori. Il parser produce un AST
(sezioni → righe → coppie accordo/testo) riusato da rendering, trasposizione e indice di
ricerca.

**Normalizzazione dei suffissi.** Il parser riduce le grafie equivalenti a una forma
canonica interna prima di qualunque altra cosa: `m` / `min` / `-` → `m`, `maj` / `ma` / `△`
→ `maj`, `dim` / `°` → `dim`, `aug` / `+` → `aug`. Entrambe le tabelle di notazione
formattano **a partire da quella forma canonica**, mai dal testo grezzo del file. Senza
questo passaggio l'affermazione "in internazionale il display coincide col sorgente" vale
solo per i file scritti in modo coerente: un `Cmin7` scritto a mano finirebbe a schermo
così com'è e non verrebbe mappato in `Do-7`.

## Motore musicale

### Trasposizione

Ogni accordo viene scomposto in `{ fondamentale, suffisso, basso }`. La fondamentale
diventa una classe di altezza 0–11, la trasposizione è `(pc + n) mod 12`, e anche il basso
degli accordi con slash viene trasposto.

Due regole distinte, non una:

1. **Senza trasposizione la grafia della sorgente si conserva.** Un `Bb` in un brano in Do
   resta `Bb`: riscriverlo `La#` perché "Do usa i diesis" sarebbe sbagliato, dato che un
   accordo prestato in bemolle si scrive sempre in bemolle. Questo caso è emerso da un test
   in implementazione, non era previsto nella prima stesura del piano.
2. **Trasponendo decide la tonalità d'arrivo**, secondo il circolo delle quinte: tonalità con
   diesis usano i diesis, con bemolli i bemolli. Alzando quel brano di dieci semitoni si
   arriva in Sib, dove si legge `Ab` e mai `Sol#`.

La tonalità d'arrivo si calcola dalla tonalità di partenza più i semitoni (e meno il
capotasto, dalla v1.8). Fino alla v2.0 la partenza era la colonna `original_key`; ora si
**stima dagli accordi del brano**, che è la stessa risposta senza il campo — vedi *v2.0*.

Il capotasto non è in v1 (vedi *Domande aperte*).

### Notazione

Il toggle IT/INT cambia **due** cose insieme: alfabeto delle note e stile delle sigle. Due
tabelle separate, ognuna coerente con le convenzioni del proprio sistema.

| Sorgente | Internazionale | Italiano |
|---|---|---|
| `C` | Do → `C` | `Do` |
| `Cm` | `Cm` | `Do-` |
| `Cm7` | `Cm7` | `Do-7` |
| `Cmaj7` | `Cmaj7` | `Do△7` |
| `Cdim` | `Cdim` | `Do°` |
| `Caug` | `Caug` | `Do+` |
| `Cm7b5` | `Cm7b5` | `Do-7b5` |
| `Csus4` | `Csus4` | `Dosus4` |
| `Bb` | `Bb` | `Sib` |
| `C/E` | `C/E` | `Do/Mi` |

Note italiane: Do, Do#, Re, Re#/Mib, Mi, Fa, Fa#, Sol, Sol#/Lab, La, La#/Sib, Si.
In internazionale il display coincide col sorgente ChordPro; in italiano no, ed è
intenzionale.

**Rischio da verificare presto:** i glifi `△` e `°` devono esistere nel font scelto e avere
una larghezza che non rompa l'allineamento sopra il testo. Se il font non li porta, si
ripiega su `maj7` e `dim` in italiano.

## Interfaccia di lettura

### Rendering accordi sopra il testo

Ogni coppia accordo/sillaba è un `inline-block` che contiene l'accordo in un blocco sopra il
testo. Le righe vanno a capo **fra** le unità e mai dentro, così l'allineamento non si perde
mai su schermo stretto — che è il punto debole classico di questo layout su telefono.

```
┌ unità ┐┌ unità ┐┌ unità ─┐
  Am        F        C
  Certe     notti la macchina
```

### Barra dei controlli

Barra inferiore fissa e compatta (~56px), sempre visibile, a portata di pollice:

```
│  Do-      Fa       Sol       │
│  Certe notti la macchina     │
├──────────────────────────────┤
│ ▶ −●●●○○+  A− A+  −1 Re +1 ⋯ │
└──────────────────────────────┘
```

Play/pause, velocità e semitoni sono raggiungibili con un tap solo: dal vivo fermare lo
scroll o alzare di un semitono non può costare la ricerca di un menù. Notazione e altre voci
stanno nel `⋯`. L'header mostra di quanti semitoni si è mossi, con un tap per tornare al
punto di partenza: il nome della tonalità è su ogni accordo dello spartito, mentre la
distanza da casa non sarebbe scritta da nessuna parte. (Nel disegno originale mostrava la
tonalità corrente accanto all'originale; dalla v2.0 nessun nome di tonalità compare
nell'interfaccia.)

### Zoom

Stepper `A− / A+` su 6 passi (≈14px → 30px) applicati con una custom property CSS sul
contenitore di lettura: accordi e testo scalano insieme e il testo **rifluisce**, senza
scroll orizzontale. Il pinch-zoom nativo del browser non viene disabilitato (nessun
`user-scalable=no`): è una via d'uscita di accessibilità che non va tolta.

### Auto-scroll

- Loop `requestAnimationFrame` con accumulo frazionario di pixel, per un movimento fluido
  invece che a scatti.
- Velocità su 8 passi discreti, regolabile mentre scorre; l'ultima usata per quel brano
  viene ricordata.
- Un gesto di scroll manuale mette in pausa (si riprende dal pulsante), così una correzione
  al volo non combatte con l'animazione.
- **Wake Lock API** (`navigator.wakeLock`) attivo durante lo scroll, rilasciato in pausa e
  al cambio di visibilità: senza questo la funzione è inutilizzabile, perché lo schermo si
  spegne a metà brano. Dove l'API non c'è, si degrada silenziosamente.
- Rispetta `prefers-reduced-motion` per ogni altra animazione dell'app, non per lo scroll
  stesso (è la funzione richiesta, non decorazione).

## Navigazione e ricerca

- **Home**: l'elenco dei canzonieri, uno per riga col numero di brani, e la ricerca sopra.
  Nessun brano finché non si cerca: la prima domanda è quale canzoniere.
- **Pagina del canzoniere** (`/canzonieri/<slug>`, v2.0): i suoi brani nell'ordine in cui si
  suonano, e da qui si riordinano.
- **Ricerca istantanea** lato client su titolo, artista, tag e testo (accordi esclusi),
  contro un indice generato al build. Nessuna chiamata di rete mentre si scrive. Vive in
  home e lavora su **tutti** i brani, perché una ricerca non appartiene a un canzoniere;
  ogni risultato dice dove abita.

## Canzonieri

Un canzoniere è una **libreria**: ogni brano appartiene a uno e uno solo, come un file in
una cartella. È un concetto diverso dai tag, che restano descrizioni libere e
sovrapponibili (`lento`, `acustico`).

Si possono **creare, rinominare, spostare brani fra l'uno e l'altro e rimuovere**, e tutto
questo dall'app, non dai file.

### Le sezioni (v2.3)

Un canzoniere è diviso in sezioni e ogni brano sta in una e una sola. Una sezione è un
**oggetto del canzoniere** — nome, ordine proprio, può restare vuota — e non un'etichetta
scritta sul brano: un'etichetta non ha ordine (e «Prima parte»/«Seconda parte» non sono in
ordine alfabetico), non può esistere prima dei brani che la riempiranno, e un refuso ne
creerebbe una gemella.

Identificata da un numero e non da uno slug, perché non ha una pagina: nessuno la indirizza
per nome, quindi rinominarla è gratis. Il nome è però unico dentro il canzoniere, ed è
quello che permette all'import di crearne una per nome senza gemelle e al seed di far
combaciare i file con il database.

Nella pagina del canzoniere partono **chiuse**, con due eccezioni che cedono a qualunque
scelta di chi legge: una sola sezione si apre da sé, e tornando da un brano si apre la sua.
La piega sta in `localStorage`, per canzoniere: è un gesto della mano, non una preferenza
da ritrovare altrove, e deve funzionare senza rete.

### Il canzoniere ha una rotta propria (v2.0)

Per due versioni non l'ha avuta, e le ragioni erano queste:

- un canzoniere **creato dall'app** non esisterebbe fra le rotte generate al build, quindi
  non sarebbe precachato e offline non esisterebbe fino al deploy successivo;
- una **rinomina** sposterebbe la rotta, se lo slug seguisse il nome — e se non lo segue, la
  URL resta legata a un nome vecchio, che è peggio.

La seconda si è rivelata **falsa nel nostro schema**: lo slug si genera una volta dal nome
iniziale e non cambia più, quindi una rinomina tocca `name` e nient'altro. La prima è vera,
ed è lo stesso patto che ogni brano importato accetta da sempre: visibile subito, offline
alla pubblicazione successiva.

Dall'altra parte della bilancia c'era il costo di non averla: aprire un canzoniere doveva
succedere **dentro la home**, come una piega, perché non c'era altro posto dove potesse
succedere. Con la rotta, la home è l'elenco dei canzonieri, `/canzonieri/<slug>` è il
canzoniere, e la pagina di un brano ha una via di ritorno che vuol dire qualcosa.

Storicamente la vista era la lista filtrata su `/?c=repertorio`, poi la card che si apriva.
Non c'è più nulla che produca quel parametro, ma `c` resta in
`ignoreURLParametersMatching` di Serwist perché un vecchio segnalibro continui a trovare la
home in cache anche offline.

Resta **`/canzonieri`** come schermata di gestione: creare, rinominare, rimuovere. Leggere e
gestire sono due gesti diversi, e solo il primo sta sulla strada di chi suona.

### Guscio statico, dato mutabile

Le pagine restano statiche e precachate. Nomi dei canzonieri e assegnazione dei brani sono
invece dati che cambiano a runtime, quindi vivono in uno strato separato che l'app legge
dopo il mount e conserva in cache locale — lo stesso meccanismo già usato per le
preferenze, non uno nuovo:

```
statico (build)   brani, titoli, testi, accordi, indice di ricerca
runtime (server)  { canzonieri: [{slug, name, count}],
                    assegnazioni: { songSlug → canzoniereSlug } }
                  ↓ cache locale
```

Una rinomina si vede subito; offline si vede l'ultimo stato conosciuto. Il payload è
minuscolo, dell'ordine di poche centinaia di byte per canzoniere.

`revalidatePath()` sarebbe la risposta standard di Next e **da sola qui non basterebbe**: il
service worker serve quelle pagine cache-first, quindi una rigenerazione lato server
resterebbe invisibile al dispositivo che ha installato l'app fino al build successivo. Viene
comunque chiamata dopo ogni scrittura, ma per l'altro tipo di visita — un browser senza
service worker — che altrimenti riceverebbe la pagina vecchia dalla cache del server.

### Gestione

`/canzonieri` elenca i canzonieri con il conteggio dei brani e permette di crearne,
rinominarne e rimuoverne. Lo spostamento di un singolo brano si fa dall'editor del brano, e
uno nuovo si crea anche in `/importa`, dove serve. **L'ordine dei brani dentro un canzoniere**
si sistema invece dove i brani si vedono: nella card aperta in home, con *Riordina* (v1.6).

La rimozione **rifiuta** un canzoniere non vuoto e propone prima dove spostare i brani:

```
[ Rimuovi "Da imparare" ]
→ contiene 2 brani
  Sposta in: [ Repertorio ▾ ]
  [ Sposta e rimuovi ]   [ Annulla ]
```

Ne segue che l'ultimo canzoniere non è rimovibile finché esistono brani, che è corretto dato
il vincolo di appartenenza. L'ordinamento è alfabetico.

Le scritture passano da server action che richiedono una sessione autorizzata, come le
preferenze. A differenza delle preferenze, però, **non c'è coda offline**: senza rete i
pulsanti di gestione si disabilitano con una spiegazione. La ragione è che i canzonieri sono
una struttura condivisa fra gli account in allowlist, dove un last-write-wins fra dispositivi
non è innocuo come su una trasposizione personale — e rinominare un canzoniere non è
qualcosa che si fa sul palco senza segnale.

### Stato iniziale

I canzonieri di partenza si ricavano dai tag già usati, che contenevano di fatto questa
categorizzazione. Le direttive vengono scritte nei quattro file, così un database ricreato da
zero riproduce lo stesso risultato senza script una tantum:

| Brano | Canzoniere | Tag residui |
|---|---|---|
| `ferma-il-tram` | Repertorio | `veloce` |
| `le-luci-di-via-ostiense` | Repertorio | `lento` |
| `novembre-in-cortile` | Da imparare | `lento` |
| `quasi-domenica` | Da imparare | — |

I tag `repertorio` e `da imparare` vengono rimossi: ora sono canzonieri, e tenerli in
entrambi i posti creerebbe due verità sulla stessa cosa. `lento` e `veloce` restano tag,
che è il loro ruolo giusto.

## Import e modifica

Una sezione per far entrare brani nuovi incollando testo, più la possibilità di correggerli
e rimuoverli. È il passo che sostituisce l'editor `/admin` immaginato per la v2, ristretto a
ciò che serve davvero.

### Cambio di regime: il database diventa il padrone

Fino alla v1.1 i file in `content/` erano la sorgente di verità dei brani e il seed li
imponeva al database. Dalla v1.2 non è più così: un brano importato nasce nel database e non
ha alcun file. Tre conseguenze, tutte obbligate:

1. **Il seed non può più fare pruning dei brani.** Cancellava le righe senza file: quelle
   sono ora esattamente i brani importati.
2. **Il seed non può più aggiornare i brani.** Sovrascriverebbe con la versione del file una
   correzione fatta dall'app.
3. **La cancellazione deve esistere nell'app.** Senza un file da eliminare, un brano
   importato per errore non avrebbe altrimenti nessun modo di andarsene.

Il seed diventa dunque di **solo inserimento** (`on conflict do nothing`): carica ciò che
manca e non tocca ciò che c'è. Perde il ruolo di padrone e ne acquista uno nuovo — è la via
di ripristino dell'export (vedi sotto).

### Cosa si incolla

Prima **dove**, poi **cosa**: il canzoniere di destinazione è il primo campo della
schermata, vale per tutto ciò che si incolla, e vince su un `{songbook: …}` nel testo. Poi
un solo campo di testo, e il formato viene riconosciuto:

- se il testo contiene accordi fra parentesi quadre è già ChordPro e passa così com'è;
- altrimenti si tenta la conversione da **accordi sopra il testo**, che è la forma in cui gli
  accordi si trovano quasi sempre in giro.

```
INCOLLATO                    CONVERTITO
Am        F                  [Am]Certe [F]notti la
Certe notti la               [C]macchina...
```

La conversione riconosce una riga di accordi quando **tutti** i suoi token si leggono come
accordi, riusando `parseChord` — che già rifiuta le parole normali e le annotazioni, quindi
una riga come `Ritornello` o `x2` non viene confusa. Gli accordi si abbinano poi alla riga
di testo successiva per posizione di colonna.

È un'euristica e sbaglierà su qualche sorgente. Per questo il salvataggio avviene **dopo una
preview** dello spartito reso, e il corpo ChordPro resta modificabile a mano nello stesso
form: la via d'uscita è sempre visibile.

### Più brani in una pasta

Lo stesso campo accetta **più brani**, divisi solo su segni espliciti: una riga di `---`
(o `===`, `***`, `___`), il `{ns}`/`{new_song}` di ChordPro, un secondo `{title:}`, un salto
pagina. Una riga vuota non divide niente — fra le strofe ce ne sono a decine. Senza segni è
un brano solo.

Trovati più brani, al posto del form arriva una riga per brano: titolo e artista
modificabili e formato in chiaro, il testo dentro un `details`. Si scrive solo
premendo *Importa*, in sequenza, e ogni riga dice come è finita — salvato, già in archivio,
oppure l'errore. Ripremere riprova solo ciò che manca.

```
3 brani in questo testo                      incolla altro
┌───────────────────────────────────────────────────────┐
│ ① [ Certe notti        ] [ Ligabue      ]           × │
│   accordi sopra il testo, convertiti                  │
│   ▸ Testo e accordi                                   │
├───────────────────────────────────────────────────────┤
│ ② [ Albachiara         ] [ Vasco Rossi  ]  ✓ salvato  │
└───────────────────────────────────────────────────────┘
Se un brano è già in archivio [ salta quelli già presenti ▾ ]
[ Importa 3 brani ]
```

### Il form

Per un brano solo. Titolo e artista si deducono dalle direttive se ci sono, altrimenti dalle
prime righe. La tonalità **non è fra i campi** dalla v2.0: si stima dagli accordi ogni volta
che serve, e serve solo per la grafia enarmonica. Il canzoniere non è fra i campi: l'ha già chiesto la schermata, sopra. Lo slug si genera dal titolo con
`uniqueSlug`, lo stesso già usato per i canzonieri.

```
Titolo   [ Certe notti          ]
Artista  [ Ligabue              ]
┌─ corpo ChordPro ─┬─ preview ────┐
│ [Am]Certe notti  │  Do      Fa  │
│ ...              │  Certe notti │
└──────────────────┴──────────────┘
```

### Duplicati

Se titolo e artista coincidono con un brano esistente, l'import lo dice prima di salvare e
offre tre strade: **sostituire** il corpo di quello esistente, **aggiungere comunque** come
brano separato con slug numerato, o annullare. Sostituire è spesso l'intento reale — hai
trovato una versione migliore — e conserva lo slug, quindi le preferenze salvate di quel
brano sopravvivono.

### Pubblicazione

**v1.3.** Il modello «si vede dopo il build» era sbagliato, e sbagliato in un modo che
sembrava una perdita di dati: correggevi un verso, salvavi, lo spartito non cambiava, e
riaprendo la modifica ritrovavi le parole vecchie — perché il form era riempito dalla pagina,
non dal database. La modifica era salva, ma nessuna schermata lo mostrava.

Quindi le pagine restano statiche e precachate, ma sopra ci va uno strato di runtime, lo
stesso già usato per preferenze e canzonieri:

```
statico (build)   brani, titoli, testi, accordi, indice di ricerca
runtime (server)  la canzone aperta, per intero
                  l'elenco senza i corpi
                  ↓ cache locale (solo le canzoni, non l'elenco)
```

La regola che tiene insieme il tutto è **una sola**: si confrontano le versioni,
`songs.updated_at` del database contro quello con cui la pagina è stata generata. Niente
timbri, niente orologi del browser. Il timbro in `builds` viene scritto *prima* del build,
quindi qualsiasi cosa derivata da lui è falsa per tutta la durata di un deploy; e una data
generata nel browser sarebbe una supposizione su un valore che appartiene al database — e
vincerebbe per sempre, dato che viene messa in cache. Per questo un salvataggio restituisce
la riga scritta, non l'input che gli era stato passato.

Ne segue il comportamento giusto senza casi speciali: la copia fresca resta al suo posto per
tutta la durata del build che la sta incorporando, e si fa da parte da sola quando arriva la
pagina che la contiene.

La pubblicazione resta, con un compito più stretto: **rendere le modifiche disponibili
offline**, incorporandole nelle pagine e nel precache. Un solo deploy per cinque import,
come prima.

Lo stato «in attesa» non è una colonna: è il confronto fra `songs.updated_at` e il timbro in
`builds`. Ne segue che un deploy fatto per altri motivi, per esempio un push di codice,
pubblica anche i brani in attesa. E ne segue anche cosa può dire il pulsante: dopo aver
chiamato il hook, la schermata **aspetta** che la lista si svuoti, che è il momento in cui il
build che sta girando ha timbrato il database e quindi contiene quei brani. Non dice «è
online», perché saperlo richiederebbe l'API di Vercel. Prima non aspettava affatto, e la
lista restava lì immobile: il secondo sintomo del bug.

Cosa resta fuori dallo strato, dalla v2.0: solo **le frecce** nell'header di un brano.
Portano ad altre pagine statiche, generate con la stessa lista di questa, e leggere qui
l'assegnazione viva le farebbe puntare a brani le cui pagine credono ancora di stare
altrove. Le righe della pagina di un canzoniere, invece, sono aggiornate come l'elenco in
home: sono una lista di titoli, e un titolo vecchio in una lista è esattamente il bug che
questo strato esiste per evitare.

L'elenco in home non viene messo in cache. Una riga lì è la promessa che toccandola si apre
qualcosa, e un brano importato dopo l'ultimo build non ha una pagina nel precache da aprire
(online sì: la rotta non è fra quelle generate e Next la genera su richiesta). Quando il
server non risponde, l'elenco resta quello del build, dove ogni riga porta da qualche parte.

### Export e ripristino

I file non sono più la rete di sicurezza, quindi ne serve un'altra: un pulsante **Scarica
tutto** produce un archivio dei `.chopro`, direttive `{songbook:}` comprese, da conservare
dove si vuole. Nessun token e nessuna infrastruttura; la copia dipende da chi se ne ricorda,
ed è un compromesso accettato consapevolmente.

Il ripristino è il seed di solo inserimento: si rimettono i file in `content/`, si lancia
`npm run seed`, e torna tutto ciò che manca senza toccare ciò che c'è.

### Export organizzato

Un secondo export, distinto da «Scarica tutto» e senza toccarlo: quello resta piatto, uno
slug a file, perché è anche il percorso di ripristino — `npm run seed` rilegge `content/` con
`readdir` non ricorsivo e ricava lo slug dal nome del file stesso, quindi cartelle o nomi
numerati lì dentro lo romperebbero. L'export organizzato è pensato per un uso diverso:
sfogliare, stampare, portarsi il canzoniere fuori dall'app — non per tornare nel database.

Due pulsanti, accanto a «Scarica tutto» nel pannello Export:

- **Esporta per canzone** — un `.chopro` a canzone, dentro `<Canzoniere>/<NN - Sezione>/<NN -
  Canzone>.chopro`. Una cartella per canzoniere (solo il nome, senza numero: a numerare sono
  le canzoni e le sezioni, non i canzonieri), una sottocartella per sezione.
- **Esporta per sezione** — un `.chopro` a sezione, `<Canzoniere>/<NN - Sezione>.chopro`, con
  tutte le canzoni di quella sezione incollate in sequenza e separate da `{new_song}` — la
  stessa direttiva ChordPro standard che l'import sa già dividere da un incolla-multiplo, così
  lo stesso file si taglierebbe di nuovo giusto se mai rientrasse da quella porta. Ogni canzone
  mantiene tutte le proprie direttive, `{songbook:}`/`{division:}` comprese, come nell'export
  attuale: sono ripetute su ogni canzone dello stesso file, ma restano ciò che rende una singola
  canzone leggibile da sola se mai finisse fuori dal file o dalla cartella che oggi le tiene.

La numerazione (`NN - `, due cifre, sempre presente) segue l'ordinamento già in mano
all'utente — `sections.position` entro il canzoniere, `songs.position` entro la sezione,
alfabetico dov'è ancora `null` — non un nuovo criterio. Il nome del file è il titolo così com'è
scritto, ripulito solo dei caratteri che un filesystem non accetta: è pensato per essere letto,
non per essere uno slug. Una sezione o un canzoniere vuoti non producono un file o una
cartella vuoti.

È una fotografia dell'ordine di adesso, non un archivio da confrontare nel tempo: la stessa
sessione ha appena aggiunto il trascinamento a tutti e tre i livelli, quindi i numeri di un
export di ieri e uno di oggi possono non coincidere più — accettato consapevolmente, per lo
stesso motivo per cui il backup non ha un token: è uno strumento per il momento in cui serve,
non un sistema da tenere sincronizzato.

### Ciò che può risorgere

Un effetto da conoscere, non un difetto da correggere: se cancelli un brano dall'app e il suo
file è ancora in `content/`, il prossimo `npm run seed` lo **reinserisce**. È il comportamento
giusto per un comando che significa «carica ciò che manca», ma va saputo. In pratica: quando
entrerà il repertorio vero, i quattro file segnaposto vanno rimossi dal repo, altrimenti
resteranno a risorgere a ogni ripristino.

### Accesso

Le scritture passano da server action con sessione autorizzata, come per i canzonieri. Senza
rete la sezione è disabilitata: salvare richiede il database e pubblicare richiede un deploy,
quindi non c'è nulla che possa funzionare offline e nulla da mettere in coda.

## Preferenze

| Preferenza | Granularità | Dove |
|---|---|---|
| Trasposizione (semitoni) | per brano | `user_song_prefs` |
| Velocità auto-scroll | per brano | `user_song_prefs` |
| Zoom | globale | `user_prefs` |
| Notazione IT/INT | globale | `user_prefs` |

Tutte sul DB, sincronizzate fra telefono, tablet e computer, con la coda offline descritta
sopra. Scritture debounced (2s) via server action per non generare una query a ogni tap.

## Fasi

### v1 — lettura

1. Neon + Drizzle + schema e migrazioni
2. Auth.js Google + allowlist + middleware + pagina di login
3. Parser ChordPro → AST, con test sulle grafie enarmoniche e sui suffissi
4. `scripts/seed.ts` + primi brani reali in `content/`
5. Pagine statiche: lista, brano, scaletta
6. Rendering accordi sopra il testo, con wrapping corretto
7. Barra controlli: zoom, trasposizione, notazione
8. Auto-scroll + wake lock
9. Preferenze su DB + coda offline
10. Ricerca client-side
11. PWA: manifest, icone, Serwist, precache
12. `PRODUCT.md` e `DESIGN.md` secondo la convenzione dei progetti fratelli

Consegnata e in produzione.

### v1.1 — canzonieri

Consegnata. La prima scrittura dall'app, deliberatamente su una superficie minima: nomi e
appartenenza, non i brani.

1. Migrazione: tabella `canzonieri`, colonna `songs.canzoniere_slug` con
   `on delete restrict`. La colonna nasce nullable, così il backfill è il seed stesso; una
   migrazione successiva la stringe a `not null` quando è tutto popolato
2. Direttiva `{canzoniere: …}` nel parser, con test
3. Seed: applica la direttiva su insert **o quando la colonna è vuota**, la ignora in
   aggiornamento, crea i canzonieri mancanti, **non fa pruning** dei canzonieri
4. Direttive nei quattro file esistenti e rimozione dei tag ora promossi a canzoniere
5. Strato mutabile: server action di lettura + cache locale, sul modello delle preferenze
6. Filtro a chip nella lista, con `?c=` e `c` in `ignoreURLParametersMatching`
7. `/canzonieri`: crea, rinomina, rimuovi con spostamento obbligato se non vuoto
8. Selettore di canzoniere nella testata del brano
9. Disabilitazione dei controlli di gestione quando offline

La garanzia centrale è verificata end to end e non assunta: una rinomina e uno spostamento
applicati al database sono sopravvissuti a un `npm run seed` che rileggeva file che ancora
nominavano il vecchio canzoniere.

### v1.2 — import e modifica

Consegnata. Il cambio di regime: il database diventa il padrone dei brani.

1. Tabella `builds` e timbro scritto dal build, per sapere cosa è in attesa
2. Seed a solo inserimento: nessun pruning, nessun aggiornamento dei brani
3. Convertitore «accordi sopra il testo» → ChordPro, con test sui casi che sbagliano
4. Riconoscimento del formato incollato e stima della tonalità dagli accordi
5. `/importa`: campo di testo, form dedotto, preview dello spartito, salvataggio
6. Rilevamento duplicati con sostituisci / aggiungi comunque / annulla
7. Modifica e cancellazione di un brano esistente, dallo stesso form
8. Elenco «in attesa» e azione Pubblica via deploy hook
9. Export «Scarica tutto» e ripristino documentato tramite seed
10. Rimozione dei quattro file segnaposto quando entra il repertorio vero *(in attesa
    del repertorio: i segnaposto sono ancora l'unico contenuto)*

Verificato end to end e non assunto: una correzione applicata al database e un brano
esistente solo lì sono sopravvissuti a `npm run seed`; l'elenco «in attesa» è vuoto
subito dopo un build e nomina esattamente il brano toccato dopo.

### v1.3 — le modifiche si vedono subito

Consegnata, in risposta a un bug: salvare non cambiava niente sullo schermo e riaprire la
modifica mostrava le parole vecchie, mentre il pulsante Pubblica lasciava la lista immobile.

1. `songs.updated_at` esposto nel dominio: è la versione con cui la pagina è stata generata
2. `saveSong` restituisce la riga scritta — canzoniere risolto e data del database compresi
3. Regola di sovrapposizione pura e testata: vince solo ciò che è più recente della pagina
4. Provider della canzone letta: pagina → cache locale → database, e il salvataggio applicato
   subito
5. Elenco sovrapposto a runtime: brano nuovo, brano rinominato, brano cancellato
6. `revalidatePath()` dopo ogni scrittura, per chi non ha il service worker
7. Pubblica attende che il build prenda in carico i brani, e dice solo quello che sa

Verificato su un build di produzione con il service worker installato, non in sviluppo: la
pagina in precache è ancora quella vecchia — controllato leggendo la Cache API — e sullo
schermo c'è la correzione. Poi ricarica, riapertura del form, elenco, cancellazione. La
prova che serviva era proprio questa: battere il precache, non evitarlo per caso.

### v1.4 — editor e icone

Consegnata.

L'editor esce dalla pagina del brano e diventa una pagina sua, `/canzoni/<slug>/modifica`,
con tre modalità sopra un'unica sorgente: **Grafico**, **Sorgente**, **Anteprima**.

1. Modello a blocchi, uno per riga del file, con `toSource(fromSource(x)) === x`
2. Operazioni pure e testate: testo, accordi, taglia e unisci riga, commento, sezioni
3. Grafico: le parole sono `input` veri, gli accordi appesi a una copia nascosta delle parole
4. Sorgente: il ChordPro, con gli stessi comandi
5. Anteprima: lo spartito e la barra dei controlli veri
6. Rotta dinamica, esclusa dal precache anche a runtime
7. Accordi: si mettono toccando la riga sopra la sillaba, si spostano con due frecce
8. Annulla, con la scrittura raggruppata in un passo per raffica
9. Guardia sull'uscita con modifiche non salvate, header e menù compresi
10. Set di icone generato da uno script, con favicon vero al posto di quello di Next

**La copia nascosta.** Gli accordi devono stare sopra la sillaba giusta, ma le parole sono
dentro un `input`, e dentro un input non ci sono nodi di testo su cui appendere qualcosa. La
soluzione non misura niente: sotto la riga di accordi c'è una copia invisibile delle stesse
parole, nello stesso font, e ogni accordo è appeso a un'ancora di larghezza zero fra le sue
lettere. È il browser a fare la misura, quindi non si sposta nulla quando il font finisce di
caricare o cambia il tema. Verificato con un righello indipendente — un canvas col font
dell'input — su ogni accordo: **scarto 0,0 px**.

**Il round trip è la rete di sicurezza.** Il parser del lettore butta via quello che non gli
serve: `{new_song}` — che sta in due dei tre brani veri — sparirebbe al primo salvataggio.
Quindi il modello dell'editor tiene ogni riga, comprese quelle che il lettore ignora, gli
spazi in coda (diciannove righe ne hanno) e le interruzioni di riga di Windows. Provato sui
brani veri, non su fixture inventate: identici byte per byte.

**Perché questa pagina non è statica.** Tutto il resto lo è, per sopravvivere senza rete.
Un editor precachato invece mostrerebbe le parole dell'ultimo deploy e poi non riuscirebbe a
salvare quelle nuove: peggio di una pagina che si rifiuta di aprirsi. Serve anche una regola
nel service worker, perché le regole di default se lo prendevano comunque — trovato nella
cache `others`, non immaginato.

**Dal punto alla lettera.** Mettere un accordo *posizionandolo* non richiede misure — la
copia nascosta fa tutto. La direzione opposta, da un tocco alla lettera sotto il dito, non
ha lo stesso trucco: lì si misura con un canvas impostato sul font del campo. Che sia la
stessa cosa che fa il browser è verificato, non sperato — `caretPositionFromPoint` dà la
stessa lettera dello stesso punto — e un accordo finito una lettera più in là si sposta con
le frecce accanto al nome, che tengono il campo aperto perché perdere il fuoco chiuderebbe
proprio la cosa che si sta spostando. Spostarne uno oltre un altro cambia quale dei due
viene prima, quindi l'operazione restituisce anche il nuovo indice: senza, il campo aperto
si troverebbe a modificare l'accordo sbagliato.

**Le pastiglie che sembravano etichette.** Tre segnalazioni di fila — «non posso mettere un
accordo», «non posso eliminare uno stacco», «posso spostare il brano solo dall'editor» — e
tutte e tre riguardavano cose che si potevano già fare, con un comando che non si vedeva. Il
selettore del canzoniere nella testata era un `select` nudo, testo attenuato, in mezzo a
un'altra riga di testo attenuato: leggeva come un'etichetta. È diventata una pastiglia con
l'icona e il chevron — e poi, col ridisegno, è uscita dalla testata del brano: spostare un
brano si fa dall'editor. La lezione resta, ed è quella che conta: un controllo che sta in
mezzo al testo va disegnato come un controllo, non come il testo che lo circonda.

**Le righe che non sono testo.** Stacchi, marcature e direttive si potevano già eliminare —
click sulla riga, poi *Elimina riga* — ma nessuno lo trovava, e una funzione che non si trova
è una funzione che non c'è. Ora ognuna porta il suo ×.

**La guardia sull'uscita.** `beforeunload` copre solo l'uscita dal sito. Ogni link
dell'header è una navigazione interna e non fa scattare niente: con mezzo verso scritto,
toccare il menù lo buttava via in silenzio. I click vengono quindi intercettati in fase di
cattura, prima che il router li veda, così valgono il marchio, il menù, le frecce e
qualunque cosa venga aggiunta all'header dopo.

Il prezzo, detto: la vecchia modifica in pagina si apriva anche senza rete, e questa no. Non
salvava neanche prima, ma potevi almeno guardare il form.

Resta fuori l'import: un brano nuovo si crea ancora dal form di `/importa`, e le tre modalità
valgono per i brani che esistono.

### v1.5 — l'header sempre uguale, e l'import di più brani

Consegnata.

1. Il marchio non lascia più l'header: entrando in un brano restavano solo un `‹` e un
   testo attenuato
2. `/importa` chiede **per prima cosa** in quale canzoniere, e lì se ne può creare uno
3. Un testo con più brani diventa più brani, uno per riga, controllabili prima di salvare

**Il marchio se ne andava proprio dove serve.** L'header sostituiva icona e nome con il link
di ritorno, per stare su una riga sola: sulla pagina del brano lo spazio verticale è il
prodotto. Ma quella è anche la pagina dove si sta più tempo, in standalone, senza nessuna
cornice del browser attorno: l'unica cosa che dice quale app sia questa spariva esattamente
lì. Ora il marchio c'è sempre e il link di ritorno è qualcosa che l'header *aggiunge* — e
solo quando porta altrove: per un brano letto da solo il marchio va già alla lista, quindi
un «‹ Tutte le canzoni» accanto sarebbe lo stesso posto scritto due volte.

Misurato a 320, 360 e 430 px su cinque pagine: niente straborda, e il nome resta intero.
Ma la misura ha anche mostrato il prezzo — dentro una scaletta la pastiglia veniva tagliata
a «Sabato in canti…», e quello che si perdeva era il `· 1 di 12`, cioè l'unica informazione
che serve mentre si suona. La posizione è quindi scesa sotto il titolo, dove non viene
abbreviata, e siccome lì accanto c'è già il canzoniere si dice per intero di cosa è la
posizione: «1 di 2 in Sabato in cantina».

**La destinazione prima del testo.** Il canzoniere era il quarto campo di un form che
compariva *dopo* l'analisi: un momento strano per chiedere dove stai mettendo una cosa, e
impossibile da rispondere una volta per venti brani. Ora è il primo campo, vale per tutta
la pasta, e vince su un eventuale `{songbook: …}` nel testo — che la riga segnala, perché
reimportare un export significa portarsi dietro la vecchia archiviazione e sovrascriverla in
silenzio sarebbe una sorpresa. Nel form del brano singolo il campo è sparito: due controlli
per una decisione, senza sapere quale vince, è il problema di prima al contrario.

Questo valeva anche per `{division: …}`, finché non si è rivelato il problema sbagliato da
risolvere per la sezione: a differenza del canzoniere, che si sceglie una volta per tutta la
pasta, incollare più brani insieme non offre alcun modo di scegliere una sezione diversa per
ciascuno — quindi ignorare la dichiarazione di ognuno significava non poter mai ricostituire
la sezione originale di un export a più brani, non solo nel caso raro del reimport. La
sezione dichiarata nel testo ora vince, riga per riga, creando la sezione se il canzoniere
non ce l'ha ancora; il campo scelto in alto resta il destino di chi non dichiara nulla, e
una scelta fatta o creata a mano — sia nel form del brano singolo sia con «Nuova sezione» —
vince comunque, sempre, sulla dichiarazione. Il `{songbook: …}` resta ignorato come prima:
qui il problema che l'aveva reso tale — sovrascrivere in silenzio un canzoniere scelto
apposta — c'è ancora, perché quello lo si sceglie una volta sola, non per ogni brano.

L'elenco delle destinazioni arriva dal database e non dal build, per lo stesso motivo per cui
ci arrivano le parole di un brano: un canzoniere creato un minuto prima esiste, e una
schermata che non lo offre è una schermata vecchia. Crearne uno da qui lo rende subito la
destinazione — farlo qui significa volerci importare dentro.

**Dove tagliare, e dove no.** Dividere una pasta in più brani si fa solo su segni messi da
una persona: una riga di `---`, il `{ns}` di ChordPro, un secondo `{title:}`, un salto
pagina. L'euristica allettante — riga vuota e poi una riga che sembra un titolo — è
esattamente sbagliata su questo materiale: le canzoni sono piene di righe vuote fra le
strofe, e la prima riga di una strofa somiglia a un titolo quanto un titolo. Sbagliare lì
spezza un brano in cinque, e chi incolla non lo vede finché non sono salvati. Senza segni è
un brano solo: è il modo giusto di sbagliare, perché uno in meno è una ripetuta e uno in più
è da ripulire.

**La lista è il punto, non il salvataggio.** Tre guessi in fila — dove tagliare, cosa sono
accordi, quali righe sono un'intestazione — e l'unica difesa vera per un'euristica non è
avere ragione sempre, è **essere visibile quando sbaglia**. Quindi ogni brano arriva con
titolo e artista modificabili, il testo a un tocco, e niente scritto finché non lo chiedi.

**Uno alla volta, e ognuno dice come è finito.** I salvataggi sono in sequenza: lo slug si
ricava leggendo quelli già presi, e due scritture in parallelo lo leggerebbero entrambe
prima che l'altra abbia scritto, chiedendo lo stesso. In cambio ogni riga può dire cos'è
successo a sé, che è ciò che rende un fallimento parziale — quattro salvati, uno già
presente, uno rifiutato — una cosa su cui agire invece di una riga di riassunto. Ripremere
non riscrive quelli riusciti, e le righe già scritte smettono di accettare modifiche: la
canzone esiste, e da quel momento si cambia nell'editor.

Verificato contro il database, non contro l'avviso a schermo: tre brani da una pasta in un
canzoniere creato sul momento, l'artista corretto a mano che arriva nella riga giusta, e
la seconda passata che riconosce i due identici. Il terzo, di cui avevo cambiato l'artista,
viene salvato di nuovo — ed è giusto: stesso titolo con artista diverso è una cover.

### v1.6 — una via sola per il brano accanto, e l'ordine in mano

Consegnata.

1. Le due card «Precedente / Successiva» in fondo allo spartito non ci sono più: le frecce
   nell'header portano negli stessi due posti e sono sempre a portata
2. `songs.position`, nullable, e un trascinamento che la scrive
3. Riordino dal canzoniere aperto in home, col dito o con le frecce della tastiera

**Due volte la stessa strada.** In fondo al brano c'erano due card coi titoli dei vicini, e
nell'header due frecce che portano esattamente là. La copia in fondo costava anche due query
in più per pagina al build — servivano solo a leggere quei due titoli — e per raggiungerla
bisognava scorrere tutta la canzone, cioè arrivava tardi proprio quando serve: mentre suoni.
Restano le frecce, e `SetlistContext` non porta più titoli, solo slug.

**Perché `null` e non `0`.** La colonna è nullable senza default, e Postgres mette i null in
fondo a un ordinamento crescente: così la migrazione è additiva davvero — ogni riga esistente
resta null, l'ordine resta alfabetico finché nessuno tocca niente, e un brano importato in un
canzoniere già sistemato si accoda invece di comparire in testa. Un default `0` avrebbe fatto
l'opposto (il nuovo arrivato primo) e avrebbe richiesto un `position = 0 → in fondo` scritto
a mano in ogni query. Al primo trascinamento il canzoniere viene rinumerato tutto da 1 a N,
così buchi e pari merito — due brani il cui ordine reciproco non è definito — sono impossibili
per costruzione.

**Il trascinamento, con gli eventi puntatore.** L'API drag-and-drop di HTML non esiste su un
touchscreen, e il touchscreen è dove questa app si usa. Quindi `pointerdown/move/up` con
`setPointerCapture` sulla maniglia, e `touch-action: none` su di essa — senza quello il
browser si prende il gesto verticale per lo scroll e gli eventi smettono di arrivare a metà
strada.

Le bande verticali delle righe si misurano **una volta**, all'inizio del trascinamento, e non
si rimisurano mentre le righe si spostano: rimisurare sposterebbe i confini contro cui si
confronta il dito, e la lista oscillerebbe fra due ordini col dito fermo. Le righe non sono
tutte alte uguale — un brano con artista è più alto di uno senza — quindi si cammina sulle
bande invece di dividere per un'altezza.

**Anche da tastiera.** La maniglia è un `button`: a fuoco risponde a ↑ e ↓. Senza, questo
sarebbe stato l'unico comando dell'app che una tastiera non può dare. I salvataggi sono
accodati su una promessa, così cinque pressioni rapide finiscono nel database nell'ordine in
cui sono state fatte e non in quello in cui la rete risponde.

**Quello che il riordino non è.** Non è una modifica ai brani: `updated_at` non viene toccato,
quindi venti righe trascinate non finiscono nella lista «in attesa di pubblicazione», dove non
avrebbero niente da pubblicare. Le frecce dentro il brano però vengono dal build, quindi
seguono l'ordine nuovo alla ricostruzione successiva — ed è *Ricostruisci ora* che serve, la
stessa asimmetria già vera per una rinomina.

**La ricerca è tornata alfabetica di proposito.** Ordinare la lista per `(position, title)`
serve alle frecce, ma la stessa lista alimenta i risultati di ricerca: fra canzonieri diversi
le posizioni sono 1..N ciascuna, quindi i risultati sarebbero arrivati come tutti i «primi»,
poi tutti i «secondi». La ricerca ordina per titolo per conto suo.

**Il costo, detto.** Il riordino richiede la rete (il pulsante non compare offline), e con
`touch-action: none` un canzoniere più lungo dello schermo non si può scorrere mentre si
trascina: si arriva in fondo con le frecce della tastiera, oppure in due mosse. L'ordine non
entra nell'export `.chopro` — non è un fatto del brano, e inventare una direttiva non standard
renderebbe quei file meno leggibili altrove.

### v1.7 — i comandi fermi, l'ordine dell'import, l'ukulele

Consegnata.

1. I comandi dell'editor non scorrono più con la pagina
2. I brani importati restano nell'ordine in cui sono stati incollati
3. Chitarra o ukulele, dal menù: cambia la forma che il diagramma disegna

**Un blocco fermo, e corto.** I comandi dell'editor stavano in fondo a una pagina che
scorre, cioè più lontani proprio quando la canzone è lunga — il caso in cui si scorre. Ora
le due righe stanno in un unico elemento sticky: uno e non due sovrapposti, perché l'altezza
della prima cambia con la larghezza dello schermo e un secondo offset dovrebbe indovinarla.
L'offset è quello dell'header, **misurato** a 64 px, non dedotto da un commento.

Farli stare lì ha richiesto di accorciare il blocco: su un telefono da 360 px la sola riga
delle modalità ne occupava tre, 146 px di controlli prima di un comando. Quindi il link di
ritorno è il suo chevron (l'etichetta resta per chi legge con la voce), la scritta «non
salvato» è sparita perché un pulsante *Salva* attivo dice già quello, e «riga 3» è sparita
perché la riga su cui agiscono i comandi è quella col bordo accento accanto. I comandi
scorrono in orizzontale invece di andare a capo, con *Annulla* fuori dalla striscia: un
comando che si cerca dopo un errore non deve essere anche da trovare. 102 px a ogni
larghezza.

**Perché l'import numera il canzoniere.** Incollare venti brani in un ordine e ritrovarli
alfabetizzati non è quello che significa incollarli in un ordine. Ma un posto in mezzo a
brani senza posto non vuol dire niente: i null stanno in fondo, quindi un brano nuovo *con*
un numero salterebbe in testa a un canzoniere che nessuno ha ordinato. Da qui le due
strade — se il canzoniere è già 1..N i nuovi continuano da N, altrimenti viene numerato
prima, nell'ordine in cui è in quel momento. In entrambi i casi ciò che era a schermo
mantiene il suo ordine e i nuovi finiscono sotto.

Il resto sono conseguenze della stessa regola: un brano *spostato* in un altro canzoniere
resta senza numero (arriva in coda: il numero che aveva era un posto fra altri brani, e
quelli non sono questi), e sostituire il testo di un brano che sta già lì non lo muove.

**Chitarra o ukulele.** Un Do è un Do su qualsiasi strumento: cambia la *forma*, non
l'accordo, quindi sullo spartito non si muove niente e cambia solo il diagramma che si apre
toccando un accordo. Lo strumento è una preferenza globale accanto alla notazione —
sincronizzata sul database, non locale come il tema, perché è una preferenza su chi legge e
non sullo schermo che ha davanti.

La tabella dell'ukulele **non è scritta a mano**: una ricerca prova le combinazioni in una
finestra di quattro tasti e tiene solo quelle che il test già sa giudicare — nessuna nota
estranea, tutte quelle indispensabili — ordinate per corde mute, posizione, estensione e
dita. L'ordine di quei quattro criteri è tutta la differenza fra un diagramma riconoscibile e
uno no: mettendo l'estensione prima della posizione la ricerca risponde Fa con 5555, quattro
dita in fila al quinto tasto, valido e non quello che suona nessuno. Con la posizione prima,
le forme dei manuali escono da sole — Do 0003, Fa 2010, Sol 0232, La- 2000 — e sono ventuno
casi nel test, nessuno dei quali è scritto nel codice.

Su quattro corde e senza corde da smorzare una combinazione su 216 non ha voicing entro il
dodicesimo tasto (`G#m9`, che chiede quattro note distinte): lì `shapeFor` risponde null e la
finestra mostra le note, che è più utile di una forma al quattordicesimo tasto di uno
strumento che ne ha dodici. Il test quindi non pretende più «una forma per ogni famiglia» ma
verifica quanto ciascuno strumento copre.

Il diagramma è passato a essere dimensionato in **altezza**: a larghezza fissa una cassa da
quattro corde veniva stirata — stessi tasti, più distanti, il manico di uno strumento che non
esiste — mentre così ognuno resta nelle sue proporzioni e la chitarra non cambia di un pixel.

**Il costo, detto.** Una preferenza in più nell'header significa che il menù ora legge le
preferenze, quindi le tre pagine che avevano solo la barra — canzonieri, scalette, la singola
scaletta — hanno anche loro il `PrefsProvider`. Il conto è una query in più su quelle pagine.

### v1.8 — capotasto

Consegnata.

1. `user_song_prefs.capo`, e uno spartito che mostra le forme da fare invece degli
   accordi che suonano
2. Una pastiglia sotto il titolo che dichiara il capotasto e la tonalità che suona
3. Un suggerimento: quale tasto rende aperti più accordi del brano

**Due spostamenti che non sono lo stesso spostamento.** Trasporre muove il suono;
il capotasto muove la mano e lascia il suono dov'è. Insieme: `letto = scritto + semitoni
− capotasto`, `sonante = scritto + semitoni`. È una sottrazione, e per questo sta in un
modulo con i test invece che dentro un componente: sbagliata di segno resta plausibile a
schermo, e l'unico caso che la smaschera è **+2 semitoni con il capotasto al 2**, dove le
lettere devono tornare quelle scritte *e* il brano deve suonare un tono sopra. Una delle
due cose da sola non basta: con un segno invertito una delle due continua a tornare.

**Perché la pastiglia sotto il titolo.** Il pannello di lettura è chiuso quasi sempre —
è una scelta di design già dichiarata: «col pannello chiuso la barra non dice più in che
tonalità stai leggendo» — e un capotasto ricordato da ieri rinomina *ogni* accordo della
pagina. Senza una riga fissa, aprire un brano mostrerebbe Do dove c'era Re e niente
spiegherebbe perché: la sorpresa silenziosa che questa app evita altrove. La pastiglia
c'è solo col capotasto inserito, perché a zero non c'è niente da spiegare.

**Il suggerimento, e la definizione che ha dovuto cambiare.** Il criterio parte da una
domanda semplice: quali accordi sono aperti. La prima versione lo chiedeva alla tabella
delle posizioni aperte — sembrava di principio ed era sbagliata: il La aperto arriva allo
spartito attraverso una forma mobile che capita di cadere al capotasto, quindi la tabella
non ha una voce per lui e il suggerimento contava il La fra i difficili. Il test l'ha
trovato subito. La definizione buona è **almeno una corda libera, e niente oltre il terzo
tasto**: una corda libera è esattamente quello che un barré toglie, quindi dice «senza
barré» senza dover riconoscere un barré — cosa che nessuna euristica fa bene, perché tre
dita in fila al secondo tasto sono indistinguibili da un barré e sono un La aperto. E vale
identica sui due strumenti, dove prima servivano due regole diverse.

Il suggerimento **non si applica da sé** e si confronta col capotasto già messo, non con
un manico nudo: a chi ha già scelto il secondo tasto, sentirsi dire che il secondo tasto
andrebbe bene è rumore. Il test della proprietà — su cinque brani, otto tasti e due
strumenti — verifica che quando parla sia sempre un miglioramento vero.

**Il diagramma non si rinumera.** Col capotasto al 2 la forma di Do *è* la forma di Do:
il capotasto è il nuovo tasto zero. Cambia solo la barra, colorata e col numero accanto,
perché altrimenti una forma aperta e la stessa forma dietro un capotasto sarebbero lo
stesso disegno.

**Cosa ha detto il tipo.** Aggiungere `capo` a `SongPrefs` ha fatto fallire la
compilazione in tre punti: la server action, la cache locale e le fixture del test della
coda — cioè esattamente i tre posti che costruiscono le preferenze campo per campo
invece di passarle intere. È la stessa classe di bug evitata due volte in v1.7 (il
confronto di uguaglianza in `updateGlobal`, poi in `updateSong`), e stavolta l'ha trovata
il compilatore invece di me.

**Il costo, detto.** Il capotasto è una preferenza del brano, quindi lo segue anche dentro
una scaletta: se in una serata lo stesso brano va fatto in due modi diversi, questo
modello non lo permette. E non entra nell'export `.chopro`, come non ci entrano
trasposizione e ordine: quel file è il brano come è scritto, non come lo leggi.

### v1.9 — la modifica ridisegnata

Consegnata. Viene da un handoff di Claude Design: *Turno 5* del documento
`Songs Grafica`, che completa il ridisegno già fatto per lettura, elenchi e barra.

1. La testata dell'editor: il titolo del brano, *Annulla* e *Salva* su una riga
2. Le tre modalità come icone — matita, parentesi, occhio — invece di tre parole
3. I comandi come icone, con la sola *Accordo* che tiene la sua parola
4. *Dati del brano* con il suo chevron, *Elimina* come unico controllo scuro dell'app

**Cosa il mockup non poteva sapere.** È stato disegnato prima che i comandi diventassero
fissi (v1.7, la stessa giornata): lì stanno nel flusso della pagina, con la card dei dati
in mezzo fra la riga del titolo e le modalità. Fissa, quella card renderebbe il blocco
alto quattrocento pixel appena la si apre. Quindi l'ordine è quello del mockup tranne la
card, che scende sotto il blocco fisso — l'unico scostamento, e la ragione è una
richiesta esplicita dello stesso giorno.

**Le icone hanno pagato il titolo.** Tre parole per le modalità riempivano la riga da
sole; a icone (66 px l'una) ne resta abbastanza per il nome del brano in alto, che prima
non c'era da nessuna parte: l'header dice «songs», e in modalità grafica le parole sullo
schermo sono la canzone, non il suo titolo. Ogni icona conserva il nome in `title` e in
`aria-label` — la lezione delle pastiglie che sembravano etichette valeva anche al
contrario.

**Una cosa rotta trovata implementando.** La prima riga di un brano con intro —
`[re] [la] [re] [sol]` — sovrapponeva tutti gli accordi in una macchia: le sue "parole"
sono spazi singoli, quattro pixel, e un nome di accordo ne occupa venti. Il lettore non
ha il problema perché lì è l'accordo a decidere la larghezza della parola sotto; qui le
parole sono un `input` vero e la copia nascosta sopra deve corrispondergli lettera per
lettera, quindi allargarla è esattamente ciò che non si può fare. Una riga senza parole
non ha sillabe a cui appendere niente: gli accordi diventano una riga di accordi.

Resta il caso di due accordi a due lettere di distanza su una riga *con* parole, che si
sovrappongono ancora: si separano con le frecce, e risolverlo davvero richiede di
misurare. Era così anche prima.

### v2.0 — utenti, e tre cose in meno

Cinque richieste, e tre sono **rimozioni**. Vale dirlo prima di tutto il resto: la
maggior parte di questa versione è codice che non c'è più — tre rotte, due tabelle, una
colonna, una dipendenza, e le funzioni che esistevano solo per servirle.

**1. Chi può entrare, dall'app.** Nuova tabella `members` e nuova schermata `/utenti`.
L'elenco ha due metà che non sono la stessa cosa: i **proprietari** vengono da
`ALLOWED_EMAILS`, che l'app non può scrivere, e gli **invitati** dalla tabella. È la
differenza che rende impossibile chiudersi fuori — non c'è nessun gesto, in nessuna
schermata, che tolga l'accesso all'ultima persona che ce l'ha — e che tiene in piedi
l'accesso dei proprietari anche con il database irraggiungibile, dato che per loro non
c'è niente da leggere.

Le due metà si incontrano in `isAllowed(email, env, members)`, che risponde **sia** al
callback di login **sia** alla guardia davanti a ogni scrittura. Questa è la parte da non
sbagliare, ed è il primo errore che il revisore ha fermato: una guardia che avesse letto
solo la tabella avrebbe lasciato i due proprietari — le sole persone con accesso — dentro
l'app e incapaci di salvare qualunque cosa, perché non sono righe. Verificato attraverso
l'interfaccia dopo il cambio: una trasposizione salvata da un proprietario arriva al
server.

Quello che una rimozione **non** fa: chiudere una sessione già aperta. Il cookie dura
novanta giorni per una ragione (scadere senza rete chiuderebbe fuori dal repertorio in
scena) e le pagine sono già sul dispositivo di chi le ha scaricate. Smette subito ogni
scrittura, perché la guardia rilegge l'elenco a ogni azione. La schermata lo dice al
momento di rimuovere: promettere una porta che si chiude sarebbe falso.

**2. Le scalette non ci sono più.** Due rotte, due tabelle, il tipo, i due metodi del
repository, i file YAML, la voce di menù, l'icona, la dipendenza `yaml`. Non erano mai
diventate scrivibili dall'app e nel database erano due gusci vuoti — due righe in
`setlists`, **zero** in `setlist_songs` — quindi non si è persa nessuna serata. Il
`SetlistContext` di `SongReader` va con loro, e con esso l'unico caso in cui la pagina di
un brano poteva stare in due sequenze diverse.

**3. La tonalità non è più un campo.** Via la colonna `original_key`, il campo
nell'editor, le pastiglie negli elenchi, la direttiva `{key:}` e ogni readout che
nominasse una tonalità. Ma la tonalità serviva a qualcosa di preciso, e non era mostrarla:
`transposeChord` sceglie fra `Fa#` e `Solb` **dalla tonalità d'arrivo**. Toglierla senza
sostituirla avrebbe fatto ripiegare ogni brano su Do maggiore, cioè avrebbe cambiato la
grafia di brani che nessuno aveva toccato.

Quindi la tonalità si **stima dagli accordi**, con l'estimatore che l'import già usava —
spostato da `lib/import/key.ts` a `lib/music/key.ts`, perché non è più una cosa
dell'import. Interna, mai scritta, mai stampata. Misurato **prima** di far cadere la
colonna, che è l'unico momento in cui si poteva misurare: sui ventuno brani con una
tonalità salvata la stima ha indovinato **ventuno volte su ventuno**. I tre senza tonalità
salvata ci guadagnano, perché prima ripiegavano su Do.

Ne segue una potatura che vale la pena nominare: `formatKey`, `keyLabel`, `parseKey` e
`soundingKey` sono state cancellate. Non erano rotte — erano diventate senza chiamanti,
perché una tonalità non si scrive più in nessun senso della parola, né dentro né fuori. I
loro test sono stati riscritti per dire la stessa cosa attraverso ciò che resta.

**4. La home è l'elenco dei canzonieri**, e ogni canzoniere ha la sua pagina. Il perché
sta in *Il canzoniere ha una rotta propria*: delle due obiezioni storiche una era falsa
nel nostro schema. La ricerca resta in home; il riordino trasloca nella pagina del
canzoniere, che è dove ora vive l'elenco che riordina.

**5. Dal brano si torna al canzoniere**, con la pastiglia `‹ Cartoni animati` nell'header.
Qui c'era una trappola che il revisore ha visto prima di me: `seriesFor` calcolava insieme
il canzoniere e la posizione nella sequenza, e restituiva `null` per entrambi quando i
brani erano meno di due. Un canzoniere con un brano solo avrebbe quindi perso **anche** la
via del ritorno, che non ha niente a che vedere con l'avere dei vicini. Sono due funzioni
adesso, con due condizioni diverse.

**Le migrazioni sono due, e nell'ordine giusto.** `0006` crea `members` e va applicata
*prima* del push, perché il login la legge; `0007` lascia cadere la colonna e le due
tabelle e va applicata *dopo* che il deploy è pronto, perché fino a quel momento il sito
in produzione è ancora quello vecchio, che quella colonna la seleziona. Al contrario si
aprirebbe una finestra di qualche minuto in cui salvare un brano sul sito vivo fallisce.

**Cosa è stato misurato, non supposto.** Trentatré controlli attraverso l'interfaccia:
che le righe della home siano collegamenti e non pieghe, che seguire la pastiglia del
ritorno *atterri* sul canzoniere che nomina, che togliere il capotasto rimetta esattamente
gli accordi di prima, che rimuovere un invitato lo faccia sparire dall'elenco. Due
fallimenti erano miei e non dell'app: un profilo del browser riusato si portava dietro una
trasposizione in `localStorage`, e un `input` svuotato via DOM non aggiorna lo stato di
React. Il terzo era vero e istruttivo: un `type="email"` fa rifiutare l'indirizzo
malformato al browser, prima che l'azione sul server venga chiamata.

### v2.1 — ruoli

Tre ruoli, e la linea fra loro è cosa possono **cambiare**: admin tutto, editor il
repertorio, viewer niente di condiviso. Quattro decisioni tengono in piedi il resto.

**I proprietari sono admin per definizione, non per una riga.** `ALLOWED_EMAILS` non è
scrivibile dall'app, quindi chi c'è dentro non si può rimuovere — e la stessa cosa lo
rende non retrocedibile. Non esiste perciò una sequenza di gesti permessi che lasci
l'installazione senza nessuno al comando, che è la proprietà da cui dipende tutto il
resto: le altre regole possono sbagliare senza chiudere fuori nessuno.

**Le preferenze non sono modifiche.** Trasposizione, capotasto, velocità, dimensione e
notazione restano aperte a ogni ruolo, viewer compresi. Non toccano il repertorio: sono
come una persona legge sul proprio schermo, e un viewer che non potesse trasporre non
servirebbe a niente sul palco — l'unico posto dove questa app viene usata. Verificato come
tale: un viewer alza di un semitono e la riga arriva nel database.

**Il ruolo non entra nel token.** Una sessione dura novanta giorni; un ruolo scritto lì
dentro terrebbe i poteri di ieri per tre mesi. Le guardie rileggono la tabella a ogni
azione, quindi retrocedere qualcuno gli toglie i controlli **dalla sua azione successiva**
— provato spostando un editor a viewer sotto la stessa sessione e vedendo sparire
*Modifica*.

**L'interfaccia è la spiegazione, il server è la garanzia.** Le pagine sono statiche e
precachate: sono le stesse per tutti, e nessuna può sapere al render chi la guarda. Quindi
il ruolo arriva dopo il mount, come le preferenze, e i controlli compaiono solo quando la
risposta è arrivata e permette — mai il contrario, perché un pulsante che appare e sparisce
è un pulsante che qualcuno ha già premuto. Offline non arriva affatto, il che va bene:
tutto ciò che un ruolo sblocca ha comunque bisogno della rete. Il ruolo **non** è messo in
cache di proposito: un «admin» ricordato disegnerebbe pulsanti che rifiutano.

L'unica pagina che rifiuta da sé è l'editor, l'unica generata su richiesta: a un viewer non
manda nemmeno i campi.

**Cosa è stato misurato.** Ventisette controlli con tre sessioni vere — un invitato
temporaneo per ruolo, una sessione firmata per ciascuno, e l'app usata come quella persona:
i controlli assenti dove devono essere assenti, le tre schermate che spiegano invece di
offrire, un editor a cui `/utenti` non dice nemmeno chi altro esiste, e una richiesta POST
sparata diretta a un'azione di scrittura che non cambia niente — perché un pulsante
nascosto non è una serratura. Le due volte che il controllo ha segnalato un problema era
il controllo a sbagliare: leggeva `document.body`, che comincia con lo script del tema, e
cercava le parole del brano in una pagina dove Next le aveva prefetchate legittimamente
dal link di ritorno.

### v2.2 — email e password

Un secondo modo di entrare, accanto a Google. Quattro decisioni, e la prima spiega la forma
di tutte le altre.

**Una tabella a parte, `credentials`, non una colonna su `members`.** Il motivo è lo stesso
fatto che rende i proprietari impossibili da chiudere fuori: un proprietario **non ha riga**
in `members`, quindi una colonna là non potrebbe mai contenere la sua password. Separandole,
`members` risponde *se* puoi essere qui e `credentials` soltanto *come dimostri di essere
quell'indirizzo*. Una riga di password non concede niente: `roleOf` decide come prima e non
sa che questa tabella esista.

**scrypt dalla libreria standard.** L'alternativa era un bcrypt in puro JS: una dipendenza
per una funzione, in un'app che ha appena finito di cancellare una dipendenza che non usava
più. scrypt è un KDF da password nella standard library, lento e affamato di memoria di
proposito, e il suo costo è l'unico freno ai tentativi che questa app abbia — misurato:
34 ms per un hash, 30 ms per una verifica, con N=16384, r=8, p=1 e 16 MiB. La stringa
salvata porta i propri parametri (`scrypt$16384$8$1$sale$hash`), così alzarli domani non
rompe le righe scritte ieri.

**Il login non distingue mai i suoi rifiuti.** Password sbagliata, indirizzo senza password,
indirizzo fuori elenco: una frase sola. Il controllo di ammissione sta *dentro* `authorize`
oltre che in `signIn`, e non è ridondanza — è ciò che fa collassare due esiti diversi in uno
visto da fuori. Altrimenti indovinare la password di qualcuno che è stato rimosso darebbe un
errore diverso, e il modulo diventerebbe un oracolo su chi esiste. Il *tempo* di risposta
direbbe la stessa cosa, e per quello c'è la verifica contro un hash finto quando la riga non
c'è.

**La password di un proprietario non si imposta da un'altra persona.** L'identità di un
proprietario la garantisce Google; poter scrivere la sua password sarebbe la strada per
entrare come qualcuno che non si può né rimuovere né retrocedere — l'unica scalata di
privilegi che il sistema dei ruoli lasciava aperta. La propria sì, sempre, e per questo la
regola è «tranne il tuo indirizzo» e non «solo gli invitati».

E una cosa in più di quanto chiesto, da valutare: **`/password`**, dove ognuno cambia la
propria indicando quella attuale. Una password che solo un admin può cambiare è una password
che l'admin conosce; con quella schermata l'admin dà la prima e poi non serve più. Ogni ruolo
ce l'ha, viewer compreso: come entri è affare tuo, e l'unica autorizzazione è che l'indirizzo
viene dalla sessione e non da un parametro.

**Cosa è stato misurato.** Ventidue controlli, e la prima metà **senza cookie forgiati**: il
browser compila il modulo e l'app deve restituire una sessione. La password arriva nel
database solo come hash `scrypt$…`, mai in chiaro; entra con quella giusta e non con quella
sbagliata; un indirizzo che nessuno conosce ottiene la stessa frase di una password
sbagliata; l'interessato la cambia da sé e la vecchia smette di funzionare; una password
attuale sbagliata non cambia niente e lo dice; un admin invitato non si vede offrire la
password di un proprietario; rimuovere l'utente porta via anche la password, e il modulo
allora lo rifiuta come qualsiasi estraneo.

**Cosa non è stato provato end-to-end**: il giro completo di Google, perché non si può
guidare la sua schermata di consenso. Di quello resta verificato che i due provider si
costruiscono, che `/login` mostra entrambe le strade e che il middleware non è cresciuto —
`node:crypto` non è finito sull'edge.

Migrazione 0009: crea `credentials`. Solo aggiunta, quindi applicata prima del push.

### v2.3 — sezioni

Il canzoniere si divide, e ogni brano sta in una sezione sola. Cinque decisioni tengono su
il resto.

**La coerenza la garantisce il database, non il codice.** Il canzoniere di un brano resta
scritto sul brano — è la colonna su cui filtrano le pagine statiche e l'overlay — e la
sezione dice a sua volta in quale canzoniere sta. Due copie dello stesso fatto: quindi
`unique (id, canzoniere_slug)` su `sections` e una chiave esterna **composta** su `songs`,
che rende impossibile la riga sbagliata. Il `on update cascade` che la completa è stato
misurato prima di scriverlo, su uno schema di prova poi rimosso, perché senza di esso far
traslocare una sezione è rifiutato in entrambi gli ordini di update.

**Una disposizione sola, in una transazione sola.** `arrangeCanzoniere` sostituisce
`reorderCanzoniere` e scrive tutto: l'ordine delle sezioni, l'ordine dei brani dentro
ognuna, e la sezione di ogni brano. Un brano trascinato oltre un'intestazione cambia tre
cose insieme, e scriverle con due chiamate lascerebbe un momento in cui il brano non sta né
qua né là. Un controllo di obsolescenza solo, su **entrambi** gli insiemi — sezioni e brani
— perché il caso vero è qualcuno che importa o rimuove mentre le righe sono aperte.

**Le frecce non si fermano a una sezione.** Il canzoniere resta una sequenza sola, percorsa
sezione dopo sezione; l'header del brano dice la sezione e conta il canzoniere («Prima
parte · 3 di 12»), perché il numero e la freccia devono raccontare la stessa storia.

**Il ritorno da un brano porta un frammento, non un parametro.** `#brano-<slug>` è ciò che
apre la sezione giusta all'arrivo, e un frammento non arriva al service worker: una query
avrebbe fatto mancare la pagina nel precache, cioè avrebbe rotto il ritorno da un brano
proprio offline.

**La struttura non timbra `updated_at`.** Disporre non cambia nessun brano, cambia
l'insieme. La riga che il codice esistente aveva già tracciato viene tenuta: si timbra chi
**cambia canzoniere** — è su un'altra pagina, quindi va pubblicato — e non chi cambia solo
posto o sezione. Per allineare frecce e header si usa *Ricostruisci ora*.

Migrazioni 0010 (additiva: la tabella, la colonna nullable, i vincoli, `canzoniere_slug`
`not null`, e il backfill di una sezione «Brani» per canzoniere scritto a mano sotto il DDL
generato — la prima migrazione di questo repo che porta dati) e 0011 (contrattiva, dopo il
deploy: ripete il backfill per la finestra fra le due e mette `section_id` `not null`).

**Cosa è stato misurato.** Sessantasette controlli attraverso l'interfaccia, in quattro
passate.

*In lettura, sul locale (23):* la divisione di un canzoniere, un brano portato oltre
l'intestazione con la tastiera, le sezioni chiuse e le due eccezioni, la piega che resta
dopo un ricarico, l'editor e l'import che chiedono la sezione.

*Ruoli e rifiuti (16):* un nome già preso rifiutato con la sua ragione, un brano portato
oltre l'intestazione **col dito**, la rimozione di una sezione piena che chiede dove, e la
*stessa* richiesta di scrittura di un editor ripetuta da un viewer — con l'identificatore
vero dell'azione, registrato da una chiamata legittima, e la conferma che arriva davvero
all'azione (200, non un 404 di rotta) — che non cambia niente.

*In produzione (14):* le stesse cose sul dominio vero, più le due che solo lì si vedono —
l'header del brano che resta fermo al build mentre le schede sotto sono già cambiate, e
tutto il giro **offline**: il canzoniere che si apre dal precache con le sue sezioni, una
sezione che si apre comunque perché la piega è locale, e il ritorno da un brano che trova la
pagina in cache proprio grazie al frammento.

*Il trasloco delle sezioni (14):* l'SQL più intricato della versione e la sola strada che
potrebbe perdere un brano, quindi provato su canzonieri creati per l'occasione: «Messa»
diventa una sezione di chi accoglie i brani, la «Brani» omonima non arriva come gemella,
il brano portato cambia canzoniere **per cascata** senza essere riscritto, chi era già là
non si muove, i due arrivati risultano da pubblicare e lui no. Nella stessa passata il caso
che sbaglierebbe in silenzio: nell'editor il menu delle sezioni segue il canzoniere scelto,
e salvando il brano finisce davvero là.

Un difetto vero trovato dai controlli: un nome duplicato arrivava a schermo come
«salvataggio non riuscito», perché drizzle incapsula l'errore del driver e il codice `23505`
sta su `cause`. Tre volte era invece il controllo a sbagliare — misurava le coordinate del
trascinamento prima di scorrere la pagina, apriva la sessione del viewer nella stessa
finestra dell'editor portandogli via il cookie, e guardava il database prima che la
scrittura fosse arrivata (in sviluppo la prima chiamata a un'azione va compilata). Da qui
le attese sullo *stato* invece che sul tempo.

Due cose sono state corrette rileggendo invece che provando: la sezione da aprire al
ritorno va **ricavata** dal brano e non fissata quando si legge il frammento, perché gli
effetti di layout girano prima nei figli che nei genitori e in quell'istante le assegnazioni
sono ancora quelle del build; e i conteggi appartengono alla lista viva, non
all'intestazione generata al build, o le due metà dello stesso schermo direbbero due cose
diverse.

### v2.4 — Songbook

Un nome e un payoff, non una funzione: **songs** diventa **Songbook**, con «Where every
fire needs a melody» accanto al titolo. Deliberatamente non tradotto — un payoff si
ascolta, non si legge per il significato — su una app che per il resto parla italiano.

Una sola fonte, `lib/brand.ts`, con `APP_NAME` e `APP_PAYOFF`: il nome compariva già in
quattro posti che non si vedono l'un l'altro — il titolo della pagina, il manifest della
PWA, il marchio nell'header, e ora la pagina pubblica — e un nome scritto a mano in
quattro punti è un nome che la prossima modifica dimentica in uno dei quattro.

**`/login` diventa anche la pagina pubblica del progetto**, perché lo era già per
costruzione: `middleware.ts` manda lì chiunque non ha una sessione, prima di questa
versione e dopo, quindi non c'è una seconda rotta da inventare. Sotto il nome e il payoff
resta esattamente il modulo di accesso di prima — Google, poi email e password, entrambi i
rifiuti in una frase sola — perché chi entra ogni giorno non è un visitatore e non deve
scorrere una vetrina per arrivarci. Sotto il modulo, una vetrina di sei caratteristiche,
in una frase ciascuna: canzonieri e sezioni, tonalità e capotasto, la forma di ogni
accordo, zoom e scorrimento, l'uso offline, i ruoli. Sei fatti verificabili nel codice, non
un elenco copiato dal README.

Un'icona nuova, `IconOnStage`, per l'unica caratteristica per cui nessuna icona esistente
andava bene: `IconOffline` esiste già, ma è disegnata come un avviso — un segnale
attraversato da una riga — e ogni sua chiamata nell'app è dentro un banner che dice che
qualcosa è disabilitato. Usarla per una caratteristica positiva avrebbe detto il contrario
di quel che c'entrava.

### v2 — il resto

Restava: scalette modificabili dall'app, allowlist su tabella, ordinamento manuale dei
canzonieri. La v2.0 ha chiuso le prime due in due modi opposti — l'allowlist è diventata una
tabella con la sua schermata, le scalette sono state **rimosse** invece di essere finite,
perché non servivano. Resta l'ordinamento dei canzonieri (vedi *Domande aperte*).

Nota la progressione deliberata: la v1.1 ha aperto il percorso di scrittura su una superficie
minima — nomi e appartenenza — e la v1.2 lo estende al contenuto. Ogni passo ha portato una
regola nuova su chi possiede cosa, ed è la parte da rileggere prima di toccare il seed.

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
  funzionante e non ha contenuti. La sequenza corretta è in `README.md`: crea Neon, `env
  pull`, migrate, seed, e **solo dopo** aggiungi la variabile in produzione.

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
