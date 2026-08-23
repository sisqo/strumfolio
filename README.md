# Strumfolio

*Where every fire needs a melody.*

Testi e accordi del proprio repertorio, da leggere su tablet e telefono: zoom,
scorrimento automatico, cambio di tonalità, capotasto e notazione italiana o
internazionale. Ci si registra da soli, con Google o con email e password (v3.2): ogni
indirizzo ha il proprio account e il proprio repertorio, senza bisogno che nessuno lo
ammetta. `/login` è anche la pagina pubblica del progetto: chiunque non ha una sessione ci
arriva, con o senza account.

Il nome mostrato è cambiato in v2.4; repo e dominio sono seguiti in v3.3 e di nuovo il
21 agosto 2026 (vedi la nota in testa a [PLAN.md](PLAN.md)). La tabella `songs` nel
database resta `songs` di proposito — è un brano, non un progetto — stessa nota.

- Produzione: https://strumfolio.com
- Repo: https://github.com/sisqo/strumfolio
- Progetto e decisioni: [PLAN.md](PLAN.md)

## Sviluppo

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # parser, motore musicale, allowlist, fixture
npm run build    # genera le rotte da precachare, poi builda
```

Senza `DATABASE_URL` l'app legge le canzoni direttamente da `content/`. È il modo
normale di lavorare in locale: non serve un database per vedere l'app funzionare.

## Aggiungere una canzone

Dall'app, in `/importa`, in due passi: **prima scegli dove finiranno i brani** —
canzoniere e sezione, i primi due campi della schermata, e da lì si possono anche creare
sul posto — poi incolli il testo. L'app riconosce se è già ChordPro o se sono accordi sopra
il testo e converte, deduce titolo e artista, e mostra il risultato prima di salvare.

Il canzoniere scelto **vince** sempre su quello che dice il testo: se un brano porta
un `{songbook: …}` — succede reimportando un export — la riga lo segnala e lo ignora.
La sezione invece no: un `{division: …}` nel testo viene creato (se questo canzoniere
non ce l'ha ancora) e il brano ci finisce dentro, a meno che tu non abbia scelto o
creato tu stesso una sezione — quella scelta, fatta a mano, vince sempre. Con più
brani incollati insieme ognuno segue la propria `{division: …}`, e la sezione scelta
in alto resta il destino solo di chi non ne dichiara una.

### Più brani in un colpo

Se nel testo incollato ci sono più brani, l'app li divide e ne mostra uno per riga,
con titolo e artista modificabili e il testo a un tocco di distanza. Nulla viene
scritto finché non premi *Importa*; poi ogni riga dice cos'è successo a sé, e i brani
si salvano uno alla volta, in ordine.

I brani vanno separati da uno di questi segni, e solo da questi:

| Segno | Da dove arriva |
|---|---|
| Una riga di `---` (o `===`, `***`, `___`) | quello che si scrive a mano incollando due brani |
| `{ns}` o `{new_song}` | il separatore di ChordPro per i file multi-brano |
| Un secondo `{title: …}` | un export: la riga del titolo resta al brano che apre |
| Un salto pagina (`\f`) | testo estratto da un PDF |

Una riga vuota **non** separa: le canzoni sono piene di righe vuote fra le strofe, e
indovinare lì significa spezzare un brano in cinque. Senza segni è un brano solo —
che è il modo giusto di sbagliare, perché si vede prima di salvare.

Se due brani hanno lo stesso titolo *e* artista di uno già in archivio, decidi una
volta per tutto il gruppo: saltarli, sostituirli o aggiungerli comunque. Stesso
titolo con artista diverso è una cover, quindi passa.

Correggere e cancellare si fanno **nell'editor**, `/canzoni/<slug>/modifica`, che si
apre dal pulsante *Modifica* sotto lo spartito.

Quello che salvi **si vede subito**: la pagina del brano e l'elenco chiedono al
database la versione corrente e la mettono sopra quella generata al build, quindi una
correzione appare senza aspettare nulla. Il confronto è per versione — `updated_at`
del database contro quello con cui la pagina è stata generata — perciò la copia
fresca resta al suo posto per tutta la durata del deploy che la sta incorporando, e
si fa da parte appena arriva la pagina nuova.

La **pubblicazione** serve ancora, ma per una cosa sola: incorporare le modifiche
nelle pagine statiche e nel precache, cioè renderle disponibili **senza
connessione**. La schermata elenca i brani non ancora nel sito, e `Pubblica` lancia
la ricostruzione per tutto il gruppo, poi resta in attesa finché il build non li
prende in carico — quello che la lista può dire con certezza, dato che il build
timbra il database quando parte. Serve `DEPLOY_HOOK_URL`, un deploy hook creato su
Vercel in Settings → Git → Deploy Hooks.

Un brano importato adesso è cliccabile dall'elenco anche prima della pubblicazione:
la sua rotta non esiste fra quelle generate, e Next la genera su richiesta. Offline
no, per lo stesso motivo — non è nel precache — ed è per questo che l'elenco, quando
il server non risponde, resta quello del build, dove ogni riga porta da qualche
parte.

Il database è la sorgente di verità dei brani, quindi **non c'è cronologia git**: il
pulsante *Scarica tutto* produce un archivio dei `.chopro` da conservare. Per
ripristinarlo, rimetti i file in `content/` e lancia `npm run seed`, che inserisce
solo ciò che manca.

Cosa l'archivio **non** porta con sé: l'ordine dei brani dentro il canzoniere. Un
file `.chopro` sa a quale canzoniere appartiene — c'è una direttiva per quello — ma il
suo posto nella fila non è un fatto del brano, e inventare una direttiva non standard
per scriverlo dentro renderebbe quei file meno leggibili da qualsiasi altro programma.
Dopo un ripristino i canzonieri tornano in ordine alfabetico.

### Via file, come bootstrap

Un file `content/<slug>.chopro`, dove lo slug diventa l'URL:

```
{title: Titolo}
{artist: Autore}
{tags: lento}
{songbook: Repertorio}
{division: Prima parte}

[Bb]Prima [Eb]riga del [F]testo

{start_of_chorus}
[Gm7]Ritornello
{end_of_chorus}
```

`{division: …}` dice in quale sezione del canzoniere nasce il brano; senza, va nella
sezione «Brani». Non `{section}`: altri programmi scrivono quella per indicare un
*blocco* del brano — `{section: chorus}` — e leggerla qui archivierebbe la canzone in
una sezione chiamata «chorus». Le esportazioni di prima usavano `{sezione: …}`, ancora
letta ma non più scritta. Senza database le sezioni si ricavano da queste righe, in
ordine alfabetico: non c'è nessun posto dove sia stato scritto un ordine.

Gli accordi si possono scrivere in **entrambe le notazioni**: `[Bb]` e `[sib]`, `[D]`
e `[re]`, `[Em7]` e `[mi-7]`. Vengono letti allo stesso modo e mostrati nella
notazione scelta da chi legge, quindi un brano preso da una fonte italiana si
traspone e mostra i diagrammi come uno scritto in internazionale.

Due dettagli di questa lettura, entrambi coperti dai test:

- `Do` è **C**, non un Re diminuito scritto con l'alias `o`. Chi intende il
  diminuito scrive `sol°` o `soldim`.
- Le parole italiane che finiscono in `o` e iniziano con un nome di nota —
  `[solo]`, `[mio]` — **non** sono accordi: resterebbero fuori dal testo. Vale
  anche nell'import, dove una riga come `la la la la` è testo cantato e non una
  riga di accordi: a distinguerla è la spaziatura, perché una riga di accordi è
  allineata sulle sillabe e ha spazi larghi.

Un `{key: …}` nel file viene **ignorato**, come qualsiasi direttiva che l'app non
conosce: nessuna colonna conserva la tonalità di un brano — vedi *Tonalità e capotasto* —
e una direttiva che nessuno legge non finisce nemmeno fra le parole.

`{songbook}` dice **soltanto dove il brano nasce**: il seed lo applica
all'inserimento, o quando la colonna è ancora vuota, e da lì in poi comanda il
database. Un file senza la direttiva finisce in "Da ordinare". Rinominare o
spostare si fa dall'app, e un `npm run seed` successivo non lo disfa. Le
esportazioni di prima usavano `{canzoniere: …}`, ancora letta ma non più scritta.

Il seed è di **solo inserimento**: carica ciò che manca e non aggiorna né cancella
mai un brano, perché una riga esistente può portare una correzione fatta dall'app.
Effetto da conoscere: se cancelli un brano dall'app e il suo file è ancora in
`content/`, il prossimo seed lo **reinserisce**. Quando entrerà il repertorio vero,
i quattro segnaposto vanno rimossi dal repo.

## Editor

Tre modi di guardare lo stesso brano, con una sola sorgente sotto: quello che cambi
in uno c'è già nell'altro.

- **Grafico** — lo spartito modificabile. Le parole sono campi di testo veri, quindi
  cursore, selezione e tastiera del telefono funzionano come dovrebbero; gli accordi
  stanno nella riga sopra, ognuno appeso alla lettera cui appartiene.
  - **Tocca la riga degli accordi** sopra una sillaba per metterne uno lì.
  - Tocca un accordo per cambiarlo; **‹ ›** lo spostano di una lettera (o Alt con le
    frecce), e svuotarlo lo toglie.
  - Ogni riga che non è testo — stacco, inizio e fine di ritornello, direttive —
    ha il suo **×**.
  - Invio divide la riga, Backspace a inizio riga la unisce a quella sopra.
- **Sorgente** — il ChordPro come sta nel file, senza aiuti.
- **Anteprima** — il brano come si legge, con la barra dei controlli vera. Trasporre
  qui trasporta davvero: è la stessa preferenza che ti ritrovi sul palco.

I comandi agiscono sulla riga dove sta il cursore, in entrambe le modalità di
modifica: **Accordo** (dove sei, l'equivalente da tastiera del tocco sulla riga),
**Ritornello** e **Ponte** (marcano il blocco di righe fra due stacchi, e premuti di
nuovo lo smarcano), **Commento**, **Elimina riga**. C'è **Annulla**: un passo per comando, e uno per ogni raffica di scrittura
invece di uno per lettera.

Uscire con modifiche non salvate chiede conferma — anche dall'header e dal menù, che
sono navigazioni interne e non farebbero scattare nessun avviso del browser.

Gli accordi restano attaccati alle sillabe anche mentre riscrivi le parole, e una
direttiva che il lettore ignora — `{new_song}`, o qualsiasi altra — non viene buttata
via: aprire un brano nell'editor e salvarlo senza toccare nulla restituisce lo stesso
file, byte per byte. È la proprietà su cui poggia tutto il resto, e ha i suoi test.

L'editor è l'unica pagina **non** statica e non precachata: deve mostrare la versione
che il database ha adesso, e senza rete non potrebbe comunque salvare. Quindi offline
non si apre — mentre i brani si leggono. Se la rete cade mentre stai scrivendo, il
salvataggio lo dice e il testo resta sullo schermo.

## Icone e brand mark

Favicon, icone PWA/Apple touch e immagine OpenGraph (`public/brand/`, `src/app/favicon.ico`)
vengono da un pacchetto di asset disegnati (nota su libro aperto, tile marrone/arancio —
`#97490F`/`#F1B369`, gli stessi valori di `--accent` chiaro/scuro in `globals.css`), non
più generati da uno script: quello che c'era (`scripts/icons.ts`, un placeholder disegnato
a mano) è stato rimosso il 2026-08-21 quando sono arrivati gli asset reali. Il glifo
inline usato da sé solo (senza wordmark) — `IconNote` in `src/components/icons.tsx`, dove
marca un brano nel menu e nella riga "sto suonando", e il badge di copertina del booklet
PDF in `src/lib/booklet/document.tsx` — è lo stesso tracciato vettoriale, così eredita
`--accent`/`--on-accent` invece di portarsi un colore fisso. Il path vive in due copie
(react-pdf non disegna l'`<svg>` del DOM, gli serve il suo), e le due si aggiornano
sempre insieme — **path e `viewBox`**, non uno solo: un tracciato nuovo dentro il box
vecchio deforma il glifo senza che niente si rompa, e nel PDF non lo vedrebbe nessuno.

Il 2026-08-22 il logo è stato ridisegnato — tile più arrotondato (raggio al 27,7% del
lato) e nota nuova — e tutto è stato rigenerato dal drop aggiornato, che questa volta è
**vettoriale**: i PNG sono render dell'SVG, non ritagli di un raster, quindi nitidi a
qualsiasi taglia. Una sola eccezione: `icons/icon-maskable-192.png`, che il pacchetto non
contiene più (ha solo il 512) e qui è un downscale di quello — il manifest dichiara
entrambe le taglie per entrambi i purpose, per la ragione scritta in `manifest.ts`.

Dove serve il logo per intero (header dell'app, badge sull'hero di `/login`, firma delle
email), il file è il lockup orizzontale disegnato (`public/brand/lockup-horizontal-black.svg` /
`-white.svg`, icona+wordmark in un'unica immagine) invece di icona+testo composti dal vivo:
entrambe le varianti sono nel markup, e CSS ne mostra una sola in base al tema
(`img.lockup-light`/`.lockup-dark` in `globals.css`, stesso doppio blocco chiaro/scuro dei
token colore — una pagina precachata e statica non può sapere a tempo di render quale
tema sta guardando il lettore). Nell'email invece è un solo file (`public/brand/email/logo.png`)
perché lì non c'è alcun tema da seguire: un PNG, non l'SVG, e con `width`/`height` scritti
nel tag nel rapporto esatto del lockup (163×24) — un client con le immagini spente disegna
l'`alt` dentro quella scatola, uno che le mostra ci scala il file, e due numeri scelti
indipendentemente stirano il logo di quanto non tornano.

Dove il logo sta in colonna invece che in riga c'è il lockup **verticale**, arrivato con il
drop del 2026-08-22 (`lockup-vertical-black.svg` / `-white.svg`, mark sopra e wordmark
sotto): lo usa `AuthLockup` in testa a tutte le pagine sotto `(auth)` — registrazione,
verifica email, richiesta e scelta della nuova password. Prima lì c'era un badge circolare
con `IconNote` e `{APP_NAME}` scritto sotto in un `<h1>`, cioè un lockup verticale composto
a mano in mancanza del file, ripetuto identico in quattro pagine; ora è un componente solo,
e il lockup **è** l'`<h1>` — il wordmark sta dentro l'immagine, quindi il nome arriva a uno
screen reader solo per `alt`, e senza quello quelle pagine resterebbero senza intestazione.
È dimensionato in larghezza (`.auth-lockup`), non in altezza: il disegno è 1688×804 col
lettering alto un sesto della larghezza, e le due larghezze scelte mettono "Strumfolio"
alla stessa taglia del `.landing-title` che prima lo stampava come testo.

Un logo per schermata, però: `PublicHeader` accetta `brand={false}` e lo passano i due
layout delle pagine che il logo lo stampano da sé — `/login`, col lockup orizzontale nel
badge dell'hero, e il gruppo `(auth)` con quello verticale. Lo stesso disegno due volte
sulla stessa schermata, piccolo in un angolo e grande in mezzo, si legge come una
sbadataggine e non come una carta intestata. La barra resta comunque, perché è lei a tenere
il selettore chiaro/scuro/auto, e una pagina col proprio lockup ne ha bisogno quanto le
altre; il ritorno a `/` non manca a nessuno — `/login` per chi non è autenticato *è* la
home, e le altre quattro dicono "Sign in" nel loro testo. `/pricing` e le pagine legali non
hanno logo in pagina e quindi tengono il mark nella barra, che lì è anche l'unica via
d'uscita.

Tutto quanto sopra vive sotto `public/brand/` (icone in `brand/icons/`, lockup e OG image
alla radice di `brand/`, logo email in `brand/email/`) invece che sciolto nella radice di
`public/`: un solo prefisso che `middleware.ts` lascia passare senza sessione
(`isPublicAsset`), invece di una riga per file — la dimenticanza di aggiungere quella riga
per un asset brand appena arrivato era già successa due volte prima di questa
riorganizzazione (2026-08-22).

### `public/brand/kit/` — il drop intero, servito

Quelli sopra sono i pochi file che l'app disegna. Il pacchetto completo sta in
`public/brand/kit/`, così com'è arrivato: `svg/` (sorgenti vettoriali, lockup orizzontale e
verticale nelle varianti black/white/adaptive/mono, mark, glifo, nota, wordmark, icone,
favicon), `logo/` (lockup, mark e wordmark in PNG a più larghezze), `icons/` (icone quadrate
da 16 a 1024), `web/` (favicon, icone PWA, OG image, quadrati 1200×1200 per i social),
`ios/AppIcon.appiconset` (set completo con `Contents.json`, da trascinare in Xcode),
`preview/` (contact sheet e diff di verifica) e il `README.md` del drop, che è l'indice: dice
file per file a cosa serve. Serve per prendere un logo alla taglia giusta con un URL quando
lo chiede qualcosa fuori da qui — uno store, una slide, una firma, un profilo social.

Due conseguenze da tenere a mente:

- **È pubblico**, come tutto ciò che sta sotto `/brand/`: `middleware.ts` non chiede la
  sessione a quel prefisso. Quello che finisce lì dentro è pubblicato.
- **Non è precachato.** `publicEntries()` in `next.config.ts` mette nel manifest del service
  worker ogni file di `public/`, e questa cartella pesa dieci volte tutto il resto messo
  insieme: senza il filtro che la esclude, ogni installazione della PWA si scaricherebbe
  megabyte di PNG che nessuna schermata disegna. I file che l'app disegna stanno fuori dal
  kit e restano precachati, anche quando sono la copia identica di un file lì dentro — la
  duplicazione è voluta, il kit vale come pacchetto integro.

Fuori dal kit è rimasto solo `build-assets.py` del drop, che rigenera tutto da due PNG del
logo: è uno strumento, non un asset, e questo repo non tiene la generazione delle icone
(`scripts/icons.ts` è stato rimosso il 2026-08-21 per la stessa ragione). Per rigenerare o
ridimensionare qualcosa si parte da `kit/svg/` con lo script nel drop, non da qui.

### `/brand` — la pagina che indicizza il kit

Una cartella di centoquaranta file non dice quale dei quattro lockup orizzontali prendere.
`/brand` sì: ogni asset è mostrato **sul fondo per cui è stato disegnato** — un riquadro in
due metà, paper a sinistra e night a destra, con la variante black sulla prima e la white
sulla seconda — accanto alla riga che dice quando è quello giusto. Poi palette, regole d'uso
e, in fondo, tutto il drop elencato senza commento per chi già sa cosa cerca. Su ogni riga un
pulsante copia l'URL **assoluto**: quello che serve quando lo incolli fuori da qui, non il
percorso relativo utile solo dentro il sito.

Cose che vale la pena sapere prima di toccarla:

- **L'elenco dei file lo legge dal disco**, non da un array scritto a mano (`lib/brandKit.ts`).
  Centoquaranta righe battute a mano sono sbagliate di uno al primo drop che nessuno nota.
  Leggere il filesystem lì è sicuro per il prerender esattamente come leggere `process.env`
  — non è un'API dinamica, quindi risolve a **build time** e non c'è nessun `export const
  dynamic`, per la stessa ragione spiegata per esteso in `pricing/page.tsx`.
- **È pubblica e indicizzabile**, per scelta: `/brand` è nell'elenco di `middleware.ts` (ramo
  condizionale, come `/pricing` e le legali) e non ha override di `robots`. Chi cerca "logo
  Strumfolio" è esattamente il lettore per cui è scritta, e la voce **Brand** nel footer è la
  via da cui un crawler la trova.
- **Le due metà dei riquadri hanno colori fissati**, `#f6f5f2` e `#101216` scritti a mano in
  `globals.css`: un campione deve continuare a mostrare il fondo per cui il file è stato
  disegnato, anche a un lettore che sta in tema scuro. Ogni fondo ripubblica la terna
  ink/muted/faint del *suo* tema come `--ground-*`, così un'etichetta dentro un fondo fissato
  resta leggibile senza un secondo colore letterale da nessuna parte.
- **I riquadri hanno un bordo visibile e nessuna ombra**, al contrario di ogni card dell'app:
  in tema chiaro il colore della pagina *è* il fondo chiaro su cui va il lockup nero, quindi
  un riquadro separato dalla sola elevazione non avrebbe alcun bordo sinistro.
- **I tre file in `currentColor`** (glifo, nota, wordmark) e i lockup `mono` sono dipinti con
  una `mask` CSS, non messi in un `<img>`: un `<img>` è un documento a sé, `currentColor` lì
  dentro non eredita niente e il file arriverebbe nero su qualunque fondo. La pagina consiglia
  la stessa tecnica che usa.

## Canzonieri

Ogni brano appartiene a un canzoniere, e a una **sezione** di quel canzoniere — a una e
una sola. La home è l'elenco dei canzonieri: una riga per canzoniere, col numero di
brani, e un tocco porta alla **sua pagina**, `/canzonieri/<slug>`, dove i brani stanno
sotto la sezione a cui appartengono, nell'ordine in cui li suoni. Da lì si apre un brano,
e nell'header del brano c'è la via di ritorno al canzoniere; il marchio accanto porta
alla home, che è un livello sopra. Le frecce nell'header scorrono le altre canzoni del
canzoniere, **attraversando le sezioni**: un canzoniere resta una sequenza sola, e le
sezioni sono la sua struttura.

Prima i canzonieri si aprivano **sul posto**, in home, e i brani comparivano sotto. Le
due obiezioni a una rotta per canzoniere erano che uno creato dall'app non l'avrebbe
avuta fino alla ricostruzione successiva, e che rinominarlo l'avrebbe spostata. La
seconda è falsa: lo slug si genera una volta e non cambia più, quindi una rinomina tocca
il nome e nient'altro. La prima è vera, ed è lo stesso patto che vale per ogni brano
importato — si vede subito, offline dopo la pubblicazione. Da sapere per intero: un
canzoniere creato adesso compare in home anche senza rete, perché l'elenco dei canzonieri
è in cache locale, ma la sua pagina non è nel precache finché non si ricostruisce. È
l'unica riga dell'app che offline può non portare da nessuna parte, e *Ricostruisci ora* la
sistema.

Si creano, rinominano e rimuovono da `/canzonieri`, che è la voce nel menù, e se ne crea
uno anche in `/importa`, dove serve — appena creato è già la destinazione dell'import.
**Spostare un brano** si fa dai campi *Canzoniere* e *Sezione* nell'editor,
`/canzoni/<slug>/modifica`: scegliendo un canzoniere le sezioni offerte cambiano con lui.
L'import chiede le stesse due cose per tutta la pasta, e sa creare la sezione sul posto —
incollare la scaletta di una serata la fa diventare una sezione in un colpo. La rimozione di un canzoniere non vuoto chiede prima dove
spostare i brani — e il vincolo `on delete restrict` la impedisce comunque a livello di
database.

La **ricerca** invece resta in home, perché una ricerca non appartiene a un canzoniere:
cerca fra tutti i brani, e ogni risultato dice dove abita.

L'elenco dei canzonieri che `/importa` offre è quello del database, non quello del
build: uno creato un minuto prima da `/canzonieri` non ha una pagina da aspettare, e
una destinazione mancante all'appello sarebbe la stessa cosa di un brano vecchio.

Il gruppo «Senza canzoniere» che stava in fondo alla home non c'è più: la colonna è
`not null` e il canzoniere di un brano si ricava dalla sua sezione, quindi quello stato
non esiste più da rappresentare.

### Le sezioni

Un canzoniere è diviso in sezioni: hanno un nome, un ordine loro, possono restare vuote,
e due canzonieri possono averne una omonima senza che le due c'entrino niente l'una con
l'altra. Rinominare una sezione è gratuito, come per un canzoniere e più di lui: una
sezione è identificata da un numero, quindi il suo nome non è un indirizzo per nessuno.
Nello stesso canzoniere però due sezioni non possono avere lo stesso nome — non sarebbero
due cose, sarebbero un refuso — e questo è anche ciò che permette all'import di
indirizzarne una *per nome* senza mai creare una gemella.

Ogni canzoniere che esisteva prima ha ricevuto una sezione **«Brani»** con dentro tutti i
suoi brani, nell'ordine che avevano; ogni canzoniere nuovo nasce con la sua. Un canzoniere
senza sezioni sarebbe un canzoniere dove non si può archiviare niente.

Nella pagina del canzoniere le sezioni si aprono e si chiudono, e **partono chiuse**: il
canzoniere si legge come un indice delle sue parti e si apre quella che serve. La piega
sta in `localStorage` per canzoniere, quindi funziona anche offline e non costa una
scrittura sul server — chiudere una sezione è un gesto della mano, non una preferenza da
ritrovare sul tablet. Due eccezioni, e valgono solo dove non hai già scelto tu:

- **una sola sezione si apre da sé.** Una fisarmonica con un solo scomparto non è una
  scelta, ed è lo stato di ogni canzoniere finché non lo dividi;
- **tornando da un brano si apre la sua sezione**, perché il tasto «indietro» deve
  riportarti dove eri e non davanti a un elenco chiuso. La via di ritorno porta il brano
  in un frammento — `/canzonieri/<slug>#brano-<slug>` — e non in un parametro di query,
  perché un frammento non arriva al service worker e non fa mancare la pagina nel
  precache: il ritorno da un brano deve funzionare anche senza rete, che è quando serve.
  Vale per il link in cima allo schermo, non per il gesto «indietro» del telefono, che
  non porta frammenti e riporta il canzoniere come l'hai lasciato.

### L'ordine dei brani, e come si divide un canzoniere

Nella pagina del canzoniere il pulsante **Organizza** apre il modo in cui si dispone
tutto: una maniglia su ogni sezione e su ogni brano, la matita per rinominare una
sezione, il cestino, e *Nuova sezione*. Si trascina col dito o col mouse, e la riga sotto
il dito si sposta appena lo supera. **Un brano cambia sezione trascinandolo oltre
l'intestazione**: un gesto solo per le due cose, perché dove sta un brano è un fatto solo.
Con la maniglia a fuoco funzionano anche ↑ e ↓ — e salendo oltre la prima riga di una
sezione il brano passa in quella sopra, così anche la divisione si fa da tastiera. Ogni
spostamento è salvato appena la riga si posa, e *Fatto* rimette i collegamenti al loro
posto.

Rimuovere una sezione piena chiede prima dove spostare i brani, come per un canzoniere, e
per la stessa ragione: qui non si distrugge niente in silenzio. Rimuovendo un **canzoniere**
e spostandone i brani, le sue sezioni traslocano con loro: «Messa» e «Cena» diventano
sezioni del canzoniere che li accoglie, in fondo, con i brani nell'ordine che avevano. Se
là c'è già una sezione con lo stesso nome, i brani si accodano a quella.

Finché nessuno lo tocca l'ordine è alfabetico: la colonna `position` è `null`, e
Postgres mette i null in fondo a un ordinamento crescente, quindi una sezione mai
sistemata è in ordine di titolo. `position` conta **dentro una sezione**, non dentro il
canzoniere: al primo trascinamento — o al primo import — le sezioni vengono rinumerate da
1 a N e i brani di ognuna da 1 a N, nell'ordine in cui erano in quel momento.
Da lì in poi l'ordine è esplicito: rinominare un brano non lo fa più risalire, e ogni
brano nuovo si accoda alla fine.

**I brani importati restano nell'ordine in cui li hai incollati**, ed è per questo che
un import numera il canzoniere: se i nuovi arrivassero con un numero e i vecchi
restassero `null`, i nuovi finirebbero *primi*, perché i null stanno in fondo.
Spostare un brano in un'altra sezione — o in un altro canzoniere — lo lascia invece senza
numero, quindi arriva in coda: dove un brano che nessuno ha ancora ordinato appartiene.

La ricerca resta **alfabetica**: dentro un canzoniere l'ordine è quello che hai
scelto, ma fra canzonieri diversi non è un ordine — i risultati arriverebbero come il
primo brano di ognuno, poi i secondi, e in una lista di risultati serve l'ordine che
si può prevedere.

L'ordine su cui scorrono **le frecce** è quello del build, come i vicini di un brano
appena spostato di sezione: restano quelli vecchi fino alla ricostruzione successiva —
e con loro il nome della sezione scritto nell'header del brano, accanto al posto che
occupa nel canzoniere («Prima parte · 3 di 12»). È l'unica parte della pagina che resta ferma al build, e volutamente: le
frecce portano ad altre pagine statiche, generate con la stessa lista di questa,
mentre le parole che stai leggendo arrivano dal database. Riordinare non mette i brani
«in attesa di pubblicazione» — nessun testo è cambiato — quindi per allineare le
frecce si usa *Ricostruisci ora*.

Il parametro `/?c=slug` diceva quale canzoniere era aperto in home, quando aprirlo
voleva dire dispiegarlo lì. Ora un canzoniere è una pagina, quindi nessuno lo produce
più; la regola `c` in `ignoreURLParametersMatching` di Serwist resta al suo posto perché
un vecchio segnalibro continui a trovare la home in cache.

## Tonalità e capotasto

Due controlli nel pannello di lettura, e rispondono a due domande diverse:

| | Cambia il suono | Cambia le forme |
|---|---|---|
| **Tonalità** (−1 / +1) | **sì** | sì |
| **Capotasto** (0–7) | no | **sì** |

Il capotasto fa quello che fa sulla chitarra: dici a quale tasto lo metti e lo spartito
mostra **le forme da fare**, non gli accordi che suonano. Un brano in Re col capotasto
al 2 si legge in Do e continua a suonare in Re. Una formula sola:

```
accordo letto   = accordo scritto + semitoni − capotasto
accordo sonante = accordo scritto + semitoni
```

Gli accordi letti si scrivono con le alterazioni della tonalità **letta**, perché quelle
sono le lettere che hai davanti. Che ci sia un capotasto lo dichiara una pastiglia sotto
il titolo — «capotasto 2° tasto · gli accordi sono già quelli da fare» — che compare solo
col capotasto inserito. Serve lì e non solo nel pannello: il pannello è chiuso quasi
sempre, e un capotasto ricordato da ieri rinomina ogni accordo della pagina senza
spiegare perché.

### La tonalità non è un campo

Nessuna colonna dice in che tonalità è un brano, e nessuna schermata la chiede o la
mostra. Serviva a una cosa sola: scegliere fra `Fa#` e `Solb` quando un accordo si
sposta, perché quella scelta appartiene alla tonalità d'arrivo. E quella tonalità si
ricava dagli accordi del brano nel momento in cui lo si legge — gli accordi *sono* la
risposta — quindi resta un fatto interno, mai scritto e mai stampato.

Misurato prima di togliere la colonna: sui ventuno brani che avevano una tonalità
salvata, la stima l'ha indovinata **ventuno volte su ventuno**. Dove sbaglia, sbaglia di
norma con il relativo maggiore o minore, che si scrivono con le stesse alterazioni. I
brani senza tonalità salvata ci guadagnano: prima ripiegavano su Do maggiore, che è la
tonalità di nessuno.

Il controllo si chiama ancora **Tonalità** perché è quello che cambia, e dice di quanti
semitoni ti sei mosso invece del nome dove sei arrivato: il nome è su ogni accordo dello
spartito, la distanza da casa non era scritta da nessuna parte.

Il **suggerimento** sotto il controllo prova i tasti da 0 a 7 e dice quale rende aperti
più accordi del brano — «col 3° tasto tutti gli accordi sono aperti» — con un pulsante
per metterlo. Non si applica da sé: il capotasto lo mette chi suona. Un accordo conta
come aperto quando la sua forma lascia **almeno una corda libera** e non passa il terzo
tasto: una corda libera è esattamente ciò che un barré toglie, e la regola vale identica
su chitarra e ukulele. Mette insieme Do, La, Sol, Mi, Re, La-, Mi- e le loro settime, e
lascia fuori Fa, Si-, Sib, Fa#- — cioè i quattro accordi per cui il capotasto si mette.

Il capotasto è **per brano**, accanto alla trasposizione: «questo lo faccio col
capotasto al 2» lo ritrovi la volta dopo, e nessun brano che non hai toccato cambia da
solo. Nel diagramma la forma non si rinumera — col capotasto al 2 la forma di Do *è* la
forma di Do — e il capotasto si vede come una barra colorata col numero accanto.

## Forme degli accordi

Ogni accordo sullo spartito è un bottone: aprirlo mostra la forma per lo strumento
che hai scelto nel menù — **chitarra** o **ukulele** — trasposta e nella notazione che
stai leggendo. Un Do resta un Do: cambia la diteggiatura, non l'accordo, quindi sullo
spartito non si muove nulla.

Le diteggiature sono in `src/lib/music/shapes.ts`, e i due strumenti le trovano in
modi diversi, di proposito:

- **Chitarra**, sei corde: una tabella corta di forme in posizione aperta, più due
  forme mobili con la fondamentale sulla sesta o sulla quinta corda che coprono le
  dodici tonalità. Scritta a mano perché quello che si suona è un barré o x32010, e
  nessun punteggio automatico inventerebbe un barré.
- **Ukulele**, quattro: una ricerca. Con quattro corde e una mano che copre quattro
  tasti le posizioni valide sono poche e non c'è spazio per smorzare, quindi la più
  compatta *è* quella che si usa — e infatti dalla ricerca escono da sole le forme dei
  manuali (Do 0003, Fa 2010, Sol 0232, La- 2000, Si7 2322), che è la prova che il
  criterio ha capito il problema. Su 216 combinazioni una sola non ha forma entro il
  dodicesimo tasto: lì il popup mostra le note, che è la risposta onesta.

Ogni forma, in entrambi i casi, è verificata dai test contro le note dell'accordo —
nessuna nota estranea, e presenti quelle che fanno l'accordo.

La scelta dello strumento sta nel menù insieme al tema, ma a differenza del tema **è
sincronizzata**: è una preferenza su chi legge, come la notazione, e la stessa persona
prende lo stesso strumento sul telefono e sul tablet.

Quando il cifrato chiede qualcosa che la tabella non ha, la forma mostrata può
**omettere** una nota ma non contraddirla: un accordo di tredicesima si disegna come
la settima che ci sta sotto, e il popup lo dichiara. Le alterazioni della quinta
(`7b5`, `7#5`) non si possono semplificare così, quindi lì non c'è forma e restano i
nomi delle note.

Lo slug di un canzoniere è immutabile: rinominare cambia solo il nome, così nessuna
chiave esterna, URL o voce di precache si muove. Senza rete la gestione è
disabilitata — è struttura condivisa fra account — mentre la lettura non cambia.

I brani in `content/` sono testi segnaposto originali, non repertorio reale.

## Chi può entrare

Dalla v3.2 la registrazione è aperta: **chiunque, con qualunque indirizzo email**, si crea
da solo il proprio account, con Google o con email e password — nessun admin deve
ammetterlo prima. `ALLOWED_EMAILS`, nell'ambiente e mai scrivibile dall'app, non è più il
cancello d'ingresso: resta solo l'elenco dei **proprietari globali**, che hanno pieno
controllo su ogni account dell'installazione (pagina `/accounts`, solo per loro) e non si
possono rimuovere né retrocedere da nessuna schermata — è questo che tiene in piedi il loro
accesso anche quando il database non risponde.

Ogni altro indirizzo è **admin del proprio account e di nessun altro** (v3.1: "un account è
un indirizzo email, e un indirizzo email è un account", senza ruoli intermedi — non esiste
più editor o viewer, né la possibilità di essere invitati nell'account di qualcun altro).
Chi entra e cosa può fare sono quindi la stessa domanda: superare la registrazione (o il
login) *è* avere pieno controllo sul proprio repertorio.

### Due modi per entrare

**Google**, che è il modo che non richiede di custodire niente, e **email e password**, per
chi preferisce non dare a Google un altro accesso o non ha un account Google. Non sono due
account: sono due modi di dimostrare lo stesso indirizzo, e la prima riuscita — con
l'uno o con l'altro — crea l'account, se non esiste già. Con email e password la creazione
è in due tempi: `/register` scrive solo una richiesta in sospeso, e l'account vero nasce
alla verifica del link ricevuto via mail (`/verify`).

Una password si imposta in due posti:

- **Da `/accounts`**, un proprietario globale la dà o la sostituisce per conto di un
  indirizzo altrui — utile per chi ha un account ma non riesce più a entrarci. Non per un
  *altro* proprietario globale: la sua identità la garantisce Google, e poter scrivere la
  sua password sarebbe un modo di entrare come qualcuno che non si può né rimuovere né
  retrocedere. La propria password un proprietario globale la cambia come chiunque altro.
- **Da `/password`**, voce *Password* nel menù, ognuno cambia la propria, indicando quella
  attuale se ce l'ha. Serve perché una password che solo un altro può cambiare è una
  password che quell'altro conosce.

Rimuovere una password lascia Google come unica via. Eliminare un **account** (dalla pagina
di dettaglio in `/accounts`, solo un proprietario globale può farlo, su qualunque indirizzo)
cancella anche la sua password, se dopo la rimozione quell'indirizzo non risulta più
ammesso in nessun altro modo: un hash che sopravvive all'accesso che dimostrava è un
segreto tenuto per nessuno.

Come sono conservate: **scrypt** dalla libreria standard di Node, senza dipendenze nuove,
con un sale per ognuna e i parametri scritti dentro la stringa salvata — così si possono
alzare domani senza rompere le righe di ieri. Misurato su questa macchina: 34 ms per
calcolare un hash, 30 ms per verificarlo. Il confronto è a tempo costante, e quando
l'indirizzo non esiste la verifica gira comunque contro un hash finto, perché altrimenti il
*tempo* di risposta direbbe quali indirizzi esistono.

La pagina di login non distingue mai i suoi rifiuti: password sbagliata e indirizzo senza
password danno **la stessa frase**. Distinguerli vorrebbe dire rispondere alla domanda
«questo indirizzo esiste qui», che non è una domanda a cui una pagina di login debba
rispondere — stesso principio dietro la risposta sempre uguale di `/forgot-password` (v3.2).

**Il freno ai tentativi è duplice**: il costo di scrypt (una trentina di millisecondi qui),
e dalla v3.2 anche un rate limiting nel database (`rateLimitHits`), condiviso da login,
registrazione, reinvio e recupero password. Registrazione e recupero password sono anche
dietro un CAPTCHA (Cloudflare Turnstile, v3.2) — le due superfici che, su richiesta di
chiunque, mandano un'email a un indirizzo scelto da chi la chiede.

## Il database

Postgres su Neon, provisionato via marketplace Vercel (progetto `songs-db`), già
migrato e popolato. Il build legge da lì; senza `DATABASE_URL` legge da `content/`.

Dopo una modifica ai contenuti: `npm run seed` e poi un deploy. Il seed è di **solo
inserimento** e non cancella niente: la sorgente di verità dei brani è il database, e una
riga senza file è esattamente un brano importato dall'app.

### Se va rifatto da zero

**L'ordine conta.** Il build genera le pagine dei brani dai dati che trova: se
`DATABASE_URL` arriva su Vercel prima del seed, il build legge una tabella vuota e
pubblica **zero canzoni**, con una lista di precache vuota — un'app che sembra sana
e non ha contenuti.

1. Crea il database, collegandolo **solo a development** per non anticipare la
   variabile in produzione:
   `vercel integration add neon -e development --name songs-db --scope sisqoz`
   (la prima volta va accettati i termini marketplace nel browser)
2. `npm run db:migrate` — applica le migrazioni
3. `npm run seed` — carica `content/` nel database
4. Verifica che il build dica `Precache routes (database)` e non `(files)`
5. **Solo adesso** aggiungi `DATABASE_URL` a Production e fai un redeploy

Due dettagli che costano tempo se non si sanno:

- `vercel env pull` **sovrascrive** `.env.local`, e scarica un solo ambiente. Le
  variabili di auth sono anche in `development` proprio per sopravvivere al pull.
- Le migrazioni girano sulla connessione **diretta** (`DATABASE_URL_UNPOOLED`), non
  su quella con PgBouncer: `scripts/migrate.ts` la preferisce da sé quando esiste.
  Il runtime invece usa l'endpoint pooled, con `prepare: false` nel client.

## Variabili d'ambiente

| Variabile | A cosa serve |
|---|---|
| `AUTH_SECRET` | Firma delle sessioni |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Client OAuth Google |
| `ALLOWED_EMAILS` | I **proprietari globali**: sempre ammessi e con pieno controllo su ogni account, separati da virgola, non rimovibili né retrocedibili dall'app. Vuota: nessun proprietario globale, ma la registrazione (v3.2) resta aperta a chiunque per il proprio account |
| `AUTH_URL` | Non impostata in produzione (dal 2026-08-21): NextAuth v5 deriva l'origine dall'host della richiesta (`trustHost`, automatico su Vercel), così `strumfolio.com` e qualunque altro dominio collegato funzionano ciascuno per conto proprio. Serve solo se un giorno l'host della richiesta non fosse più affidabile (es. dietro un proxy che lo riscrive) |
| `DATABASE_URL` | Postgres. Assente: si legge da `content/` |
| `DEPLOY_HOOK_URL` | Deploy hook Vercel, usato dal pulsante Pubblica |
| `RESEND_API_KEY` | Invio reale delle email di registrazione (v3.2). Assente: le email vengono solo loggate in console, link incluso |
| `RESEND_FROM` | Indirizzo mittente, es. `Strumfolio <no-reply@strumfolio.com>`. Il dominio deve essere verificato su Resend — dal 2026-08-21 `strumfolio.com` lo è, ma la verifica (DKIM/SPF) vive sul sottodominio dedicato `send.strumfolio.com` che Resend stesso richiede, non sulla root: non toccare quei record DNS pensando siano ridondanti. Assente: usa il default nel codice |
| `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile, il CAPTCHA su registrazione e recupero password (v3.2). La seconda dev'essere `NEXT_PUBLIC_` perché Next.js la esponga al client. Assenti: nessun CAPTCHA, verifica lato server sempre superata |

Per le password non serve nessuna variabile: stanno nella tabella `credentials`, e la firma
delle sessioni è già `AUTH_SECRET`.

## Note

Tailwind è fissato alla v3: il binding nativo `@tailwindcss/oxide` della v4
richiede Node ≥ 20 e lo sviluppo locale gira su Node 18. Vercel builda su Node 24.

I push su `main` fanno auto-deploy in produzione.
