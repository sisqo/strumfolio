# Blog — impianto pubblico per l'acquisizione via SEO — piano

> Documento a sé, non una sezione di `PLAN.md`: quella tabella è il registro delle
> decisioni già *consegnate e in produzione*, e questa feature non è ancora scritta.
> Quando è chiusa, va ripiegata lì come una nuova sezione di versione — verificare
> l'ordine di fold-in reale al momento (altri `PLAN-<feature>.md` potrebbero essere
> stati consegnati nel frattempo), non assumere che il numero di versione successivo
> sia libero. Precedente diretto per la forma del documento: `PLAN-newsletter.md`.
>
> **Ordine di lettura.** Il corpo qui sotto è la prima consegna, scritta prima che
> arrivasse un mock. La sezione *Ridisegno sul mock `Blog.dc.html`* più in basso la
> **sostituisce su tutto ciò che si vede** — nome, testata, piè di pagina, larghezze,
> schema dei metadati, temi. Dove i due divergono vale il ridisegno; i punti superati
> sono segnati sul posto. L'impianto (MDX, validatore, sitemap, robots, feed, guardiano,
> precache) è invece rimasto quello descritto qui.

## Cos'è

> *Stato al momento della prima stesura, tenuto perché spiega da dove si partiva.*

Non esisteva alcun blog nel repo — la parola non compariva in nessun file di `src/`
né in alcun documento. Non esistono nemmeno `sitemap.xml` e `robots.txt`: nessuna
delle due rotte è mai stata scritta, quindi **oggi Strumfolio non dichiara a Google
nulla di sé**. Le pagine pubbliche esistenti (`/login`, `/pricing`, `/changelog`, le
quattro legali) sono raggiungibili ma non indicizzate per invito, solo per scoperta.

La richiesta: costruire il blog e configurare tutto ciò che serve perché esista
davvero come superficie di acquisizione — non solo le pagine, ma il fatto che siano
trovabili.

Il blog è una **superficie pubblica di acquisizione via ricerca**: articoli scritti
per farsi trovare da musicisti che non conoscono ancora Strumfolio, ognuno con un
invito esplicito a provarlo in coda. Non è un canale di novità di prodotto — quel
lavoro è già di `/changelog`, che racconta cosa è uscito a chi l'app la usa già, e i
due non vanno confusi né fusi.

## Cosa cambia, risolto nell'intervista

- **Scopo: acquisizione via SEO**, non novità di prodotto. Ogni scelta sotto discende
  da qui: sitemap e robots esistono, il feed esiste, ogni articolo si dichiara la
  propria card social, e ogni articolo finisce con un invito a provare l'app.
- **Lingua: solo inglese**, come l'app (`lang="en"`, `locale: 'en_US'`, ogni testo di
  `/login` e `/pricing`). Confermato dopo un contro-argomento esplicito — che la
  nicchia inglese è presidiata da Ultimate Guitar, Chordify e Songsterr mentre quella
  italiana è quasi vuota, e che il proprietario scrive in italiano ovunque nel repo.
  **E confermato una seconda volta senza giunture i18n**: niente campo `lang` sugli
  articoli, niente rotta pensata per reggere `/blog/it/…`, nessuna impalcatura
  "a buon mercato per dopo". Le forme sono monolingua ovunque; se l'italiano servirà,
  si pagherà allora per intero (vedi *Domande aperte*).
- **Contenuti: file `.mdx` in `content/blog/`**, non costanti TypeScript e non
  database. MDX e non markdown puro per una ragione precisa: un articolo che parla di
  accordi può mostrare un accordo vero, disegnato dallo stesso codice che l'app usa
  già, invece di descriverlo a parole — ed è il tipo di contenuto che un concorrente
  non può copiare incollando testo.
- **Autoraggio: un file solo per articolo.** `content/blog/<slug>.mdx` con
  `export const meta = {…}` in testa; l'indice, la sitemap e il feed leggono la
  cartella al build. Scrivere un articolo = creare un file, perché l'attrito è ciò
  che uccide un blog. Poiché `tsc --noEmit` non guarda dentro gli `.mdx`, la garanzia
  persa si ricrea con un **validatore puro che fa fallire il build** su un articolo
  malfatto (punto 3 dell'impianto).
- **Metadati: titolo, slug, description, data** obbligatori, più **copertina** e
  ~~**tag**~~ → **`category`**, superato dal ridisegno: una sola categoria da lista
  chiusa, non un elenco. Il tempo di lettura si calcola dal testo, non si scrive.
  `draft: true` esclude l'articolo da indice, sitemap, feed e `generateStaticParams`.
- ~~**Tag: solo etichette, nessuna pagina tag.**~~ Superato dal ridisegno, che sostituisce
  l'elenco con una categoria unica — ma la conclusione regge identica: nessuna rotta
  `/blog/tag/<x>` né voce extra in sitemap, perché con pochi articoli quelle pagine
  sarebbero sottili e Google tratta male le pagine sottili.
- **Copertina: un file per articolo, con una card generata di riserva.** Nessun post
  resta senza card social, e non serve procurarsi un'immagine per poter pubblicare.
- **Traduzione: il blog si lascia tradurre.** Il `layout.tsx` di root vieta la
  traduzione (`translate="no"` su `<html>` e `<body>`, più `google: notranslate`), e
  per l'app è giusto: una `A` tradotta non è più un accordo. Ma su un blog di
  acquisizione quel divieto taglia fuori proprio il lettore non anglofono che si sta
  cercando di conquistare. Gli articoli lo annullano localmente; gli accordi che
  compaiono dentro un articolo restano protetti uno per uno (punto 8).
- **Conversione: CTA in coda a ogni articolo + voce «Blog» nel footer.**
  `PublicHeader` non si tocca: tiene una CTA sola, e il blog è un posto da cui si
  dovrebbe *arrivare*, non partire.
- **Feed RSS dal primo giorno**, su `/blog/feed.xml`.
- **Scope di questa sessione: piano + impianto completo + un articolo di esempio**
  breve, che serve a dimostrare che la catena gira. I contenuti veri sono un lavoro
  editoriale a parte.

## Impianto — dove si aggancia

**1. Dipendenze — `@next/mdx` e la composizione con Serwist.**
   `@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`, `@types/mdx`. `next.config.ts`
   oggi esporta `withSerwistInit({…})(nextConfig)`; diventa
   `withSerwistInit({…})(withMDX(nextConfig))` — entrambi sono trasformatori di
   config, quindi l'annidamento regge in entrambi i versi, ma il wrapper Serwist resta
   il più esterno perché è quello che genera il service worker dal config finale.
   **`pageExtensions` non si tocca**: gli `.mdx` vivono in `content/`, importati come
   moduli, non risolti come pagine — così la risoluzione delle rotte resta identica a
   oggi e nessun file di contenuto può diventare una rotta per sbaglio.

**2. Contenuti — `content/blog/<slug>.mdx`.**
   La cartella `content/` esiste già e contiene i quattro `.chopro` letti quando manca
   `DATABASE_URL`. Nessuna collisione: `src/lib/data/files.ts` filtra
   `entry.endsWith('.chopro')`, quindi una sottocartella è semplicemente ignorata —
   verificato, non assunto.
   Ogni file apre con:
   ```mdx
   export const meta = {
     title: 'What ChordPro is, and why your lyrics should live in it',
     description: '…',        // lo snippet in SERP: obbligatorio
     date: '2026-09-02',      // ISO, giorno incluso
     category: 'Guide',      // superato: era `tags: [...]` — vedi il ridisegno
     cover: '/blog/chordpro-explained.webp',   // opzionale
     draft: false,
   }
   ```

**3. Lettura e validazione — `src/lib/blog/`.**
   - `meta.ts`, **modulo puro e testabile**: `parsePostMeta(slug, raw): PostMeta`
     verifica presenza e forma di ogni campo (data ISO reale, description non vuota e
     entro il limite utile in SERP, slug coerente col nome del file, categoria
     dentro la lista chiusa) e **lancia** su un articolo malfatto. Chiamato da `loadPost`, quindi
     un articolo rotto fa fallire `next build`, non un lettore. È la garanzia che
     `tsc` non può dare sugli `.mdx`, ricreata dove può vivere.
   - `readingTime.ts`, puro anch'esso: parole/minuto sul sorgente dell'articolo.
   - `posts.ts`, lato server: `listSlugs()` legge `content/blog/` con `readdir`;
     `loadPost(slug)` fa `await import(\`…/content/blog/${slug}.mdx\`)` — un import
     dinamico con prefisso statico, che il bundler risolve in un contesto sull'intera
     cartella — e restituisce `{ meta, Body, readingTime }`. Gli articoli con
     `draft: true` sono filtrati qui, in un posto solo, così nessuna delle quattro
     superfici (indice, pagina, sitemap, feed) può dimenticarsene per conto proprio.
   - `meta.test.ts` con `node:test`, sullo stampo di `changelog.test.ts`: il repo sa
     testare solo moduli puri, ed è esattamente per questo che la validazione vive in
     un modulo puro invece che dentro la pagina.

**4. Rotte — `src/app/blog/`.**
   - `layout.tsx` — `PublicHeader width="48rem"` (la colonna di lettura di
     `/changelog`; `PublicHeader` non ha default apposta, ogni chiamante dichiara la
     sua) e nessuna CTA nell'header.
   - `page.tsx` — l'indice: lista dal più recente, ogni voce con copertina, titolo,
     description, data, tag e tempo di lettura. `Footer` in coda come ogni altra
     pagina pubblica.
   - `[slug]/page.tsx` — l'articolo. `generateStaticParams` da `listSlugs()`,
     `export const dynamicParams = false` (uno slug che non esiste è un 404 statico,
     e niente deve leggere `content/` a runtime), `generateMetadata` per titolo,
     description, canonical e blocco OpenGraph.
   - `[slug]/og/route.tsx` — la card generata di riserva (punto 7).
   - `feed.xml/route.ts` — il feed (punto 6). Un segmento statico chiamato
     letteralmente `feed.xml`, che Next preferisce a `[slug]` senza ambiguità.

**5. Il guardiano di sessione — `middleware.ts`, il punto più facile da sbagliare.**
   La lista dei percorsi pubblici è oggi una catena di `pathname === '…'`: un blog ha
   `/blog` **e** `/blog/<slug>` **e** `/blog/<slug>/og` **e** `/blog/feed.xml`, quindi
   serve un ramo a prefisso, non un'altra riga di uguaglianza. Sbagliare qui significa
   che ogni articolo risponde 307 verso `/login` e Google non indicizza niente — è il
   modo più probabile in cui questa feature spedirebbe rotta.
   - Ramo `pathname === '/blog' || pathname.startsWith('/blog/')`, marcato
     `x-songs-anonymous` **incondizionatamente** — come `/follow`, non come
     `/pricing`. Motivo: il blog mostra la stessa identica pagina a chiunque, quindi
     non esiste una copia "di quel lettore" che valga la pena mettere in cache, e la
     marcatura incondizionata garantisce che il service worker non conservi mai un
     articolo corretto dopo che è stato corretto.
   - `/sitemap.xml` e `/robots.txt` **cadono nello stesso guardiano**: il matcher
     esclude solo `_next/static`, `_next/image` e `favicon.ico`, e `isPublicAsset()`
     non li copre. Vanno aggiunti lì, tra gli asset pubblici e non tra le pagine: una
     sitemap che redirige a `/login` è peggio di nessuna sitemap.

**6. Indicizzazione — `src/app/sitemap.ts`, `src/app/robots.ts`, il feed.**
   - **Una sola fonte per "cosa è pubblico".** `middleware.ts` contiene già l'elenco
     autorevole dei percorsi senza sessione; la sitemap ne avrebbe bisogno di un
     secondo, ed è esattamente il tipo di deriva su cui questo repo scrive commenti.
     L'elenco si estrae in `src/lib/publicRoutes.ts` (un array puro, sicuro sul
     runtime edge del middleware) e lo importano entrambi.
   - `sitemap.ts` copre **tutta la superficie pubblica**, non solo il blog: `/login`,
     `/pricing`, `/changelog`, le quattro legali, `/blog` e ogni articolo non-bozza
     con la sua `lastModified`.
   - `robots.ts`: `allow` sulla superficie pubblica, `disallow` su `/songs/`,
     `/songbooks/`, `/follow/`, `/checkout/`, `/api/` — tutte rotte che a un crawler
     anonimo rispondono comunque un redirect, ma che così non consumano budget di
     scansione — e la riga `Sitemap:` che punta a `https://strumfolio.com/sitemap.xml`.
   - `feed.xml/route.ts`: RSS 2.0 dalla stessa lista dell'indice, `force-static`.

**7. Card social — il blocco OpenGraph e il font.**
   - **Next non fonde `openGraph`**: una pagina che ne dichiara uno sostituisce quello
     del layout per intero, come già annotato in `/pricing` e `/changelog`. Il blocco
     si costruisce quindi in un **helper solo** (`src/lib/blog/openGraph.ts`) che ogni
     articolo chiama, invece di copiarlo per articolo e dimenticarsi `images` al
     terzo.
   - Con copertina: `meta.cover`. Senza: `/blog/<slug>/og`, una `ImageResponse` con
     titolo e logo su fondo di marca.
   - **Il font della card è un costo reale, deciso qui e non lasciato aperto.**
     `ImageResponse` non sa leggere un handle di `next/font/google`: vuole i byte del
     font. Outfit (licenza OFL, quindi ridistribuibile) si versiona nel repo come
     `src/lib/blog/fonts/Outfit-SemiBold.ttf` — **fuori da `public/`, deliberatamente**:
     `publicEntries()` in `next.config.ts` scandisce `public/` ricorsivamente, e un
     font che serve solo a generare immagini lato server finirebbe nel manifest di
     precache, scaricato da ogni installazione della PWA senza che nulla lo disegni
     mai. La rotta `og` è prerenderizzata al build (`generateStaticParams` +
     `force-static`), quindi il file viene letto a build time e non a runtime — niente
     da tracciare nel bundle serverless.

**8. Traduzione — il divieto globale si toglie, la protezione scende dov'è il rischio.**
   Verificato empiricamente sull'HTML servito, e il risultato ha smentito il piano
   iniziale su entrambi i punti:
   - `other: {}` in un figlio **non** cancella il `notranslate` del root: Next fonde
     `other` chiave per chiave, quindi un oggetto vuoto non toglie niente. Il tag
     sopravviveva su ogni articolo.
   - `translate="no"` su `<html>` e `<body>` vive nel JSX del layout di root, che
     nessun layout figlio può modificare — quei due elementi si scrivono in un file
     solo. Un `translate="yes"` su un contenitore interno rende traducibile quel
     sottoalbero ma non fa tornare *l'offerta* del browser, che è ciò che serve.
   
   Quindi la decisione era spedibile solo togliendo il divieto dal root, ed è ciò che
   si fa: via `other: { google: 'notranslate' }` e via `translate="no"` da `<html>` e
   `<body>`. La protezione resta dove il rischio esiste davvero, ed era **già lì**:
   `SongSheet` marca foglio, griglie diteggiature e striscia accordi, `GraphicEditor`
   marca l'editor. La regola che sostituisce il divieto, scritta nel commento del
   layout di root: *una superficie che stampa un nome di accordo o una tonalità si
   marca da sola.* Costo accettato consapevolmente: su una schermata dell'app il
   browser potrà offrire di tradurre l'interfaccia — per un lettore non anglofono un
   guadagno — mentre parole e accordi dentro quei contenitori restano intatti.
   - Gli accordi dentro un articolo si proteggono uno per uno con `<Chord>`
     (`BlogChord`, `translate="no"`), stessa tecnica dei due contenitori sopra.
   
   **Questo tocca un commit di poche ore prima**, `5315e10` («Il browser poteva
   tradurre il foglio, storpiando gli accordi e spostandoli dalle sillabe»), che aveva
   introdotto insieme le protezioni sui contenitori *e* il divieto globale. Ne resta
   in piedi la parte che risolve il bug osservato; cade solo il divieto preventivo
   sull'intero documento. Confermato esplicitamente dall'utente due volte, la seconda
   proprio dopo che la data e l'origine di quel commit sono emerse — e dopo aver
   scartato l'alternativa che avrebbe tenuto tutto (due layout di root distinti via
   route group per app e blog), giudicata un refactor troppo ampio per il guadagno.

**9. Stili — `globals.css`, scritti a mano.**
   Nessun `@tailwindcss/typography`: `DESIGN.md` è la fonte viva dei token e questo
   repo rifinisce a mano entrambi i temi, mentre il plugin porta una scala tipografica
   propria che andrebbe riscritta variabile per variabile per non stonare. Una classe
   `.article` con i suoi titoli, paragrafi, liste, citazioni e blocchi di codice, sullo
   stampo di `.landing-title`/`.section-title` già presenti.

**10. Aggancio al resto del sito.**
   - `components/Footer.tsx`: voce «Blog» nella riga già esistente.
   - `components/BlogCta.tsx`: l'invito in coda a ogni articolo, un componente solo
     così che cambiarlo sia un posto solo.
   - `PublicHeader` **non si tocca**.
   - `scripts/precache-routes.ts` **non si tocca**: è una lista letterale esplicita,
     non un glob — verificato — quindi il blog non entra nel precache per inerzia. È
     la scelta giusta e la stessa di `/changelog`: un articolo servito da una cache di
     installazione è un articolo vecchio, e su una pagina di marketing è peggio che
     non averla offline.

**11. L'articolo di esempio.**
   Uno solo, breve, ma che **esercita ogni campo**: titolo, description, data, tag,
   copertina, un accordo protetto dalla traduzione, la CTA in coda. Un esempio che non
   usa la copertina lascia quel ramo non provato, e "dimostra che la catena gira"
   diventa falso. La card generata si verifica aprendo `/blog/<slug>/og`
   direttamente — esiste comunque, che i metadati la puntino o no.

## Fuori scope, dichiarato

- **I contenuti editoriali veri.** Questa sessione consegna l'impianto e un esempio;
  scrivere gli articoli è un lavoro a sé, con una scelta di parole chiave a monte.
- **Pagine tag** (`/blog/tag/<x>`) — il campo nasce, le rotte no.
- **Qualunque cosa in italiano**, e ogni impalcatura i18n: rifiutata esplicitamente.
- **Il collegamento con la newsletter**: `PLAN-newsletter.md` non è ancora scritto e
  dichiara comunque l'invio fuori scope. Il feed è ciò a cui si aggancerà, quando ci
  sarà qualcosa a cui agganciarsi.
- **Commenti sotto gli articoli**: le anti-referenze di `PRODUCT.md` (siti di accordi
  affollati) li escludono senza bisogno di discuterne.
- **Campo autore**: finché scrive una persona sola è una costante travestita da
  metadato.
- **La verifica in Google Search Console**: passo manuale da dashboard, vedi
  *Domande aperte*.

## Decisioni

| # | Scelta | Perché |
|---|---|---|
| 1 | Scopo: acquisizione via SEO, non novità di prodotto | `/changelog` già serve chi l'app la usa; i due pubblici vogliono cose diverse e mescolarli non serve nessuno dei due |
| 2 | Solo inglese, **senza** giunture i18n | Coerenza con l'app, che è interamente in inglese; il rilancio sull'italiano è stato posto e rifiutato due volte, la seconda proprio sulla giuntura |
| 3 | Contenuti in `.mdx` sotto `content/blog/` | Un articolo sugli accordi può mostrare un accordo disegnato dal codice del prodotto: contenuto che un concorrente non può copiare |
| 4 | Un file per articolo, `export const meta` dentro l'`.mdx` | L'attrito di scrittura è ciò che uccide un blog; la garanzia che `tsc` perde si ricrea con un validatore puro che fa fallire il build |
| 5 | Copertina e tag sì, autore e data di aggiornamento no | La copertina serve come card social, i tag come struttura futura; l'autore è costante, e un `updatedAt` fermo da due anni fa più danno che bene |
| 6 | Tag come sole etichette, nessuna pagina tag | Con pochi articoli le pagine tag sono sottili, e Google penalizza le pagine sottili — il campo però nasce subito |
| 7 | Il blog si lascia tradurre, gli accordi no — **togliendo il divieto dal layout di root**, non scavalcandolo dal blog | Un divieto di traduzione su una pagina di acquisizione esclude esattamente il lettore che si vuole conquistare; e verificato sull'HTML servito che dal blog non era annullabile, perché `other` si fonde per chiave e `<html>`/`<body>` si scrivono in un file solo. Deciso esplicitamente dall'utente dopo aver portato la scoperta |
| 15 | Font della card in **due istanze statiche**, non nel font variabile pubblicato da Google | Satori non sa leggere un font variabile: fallisce dentro le tabelle dei glifi con un errore che nomina la pagina e non la causa. Tagliate con `fonttools varLib.instancer` a `wght=400` e `600` |
| 16 | `public/blog/` escluso dal precache in `next.config.ts` | `publicEntries()` scandisce `public/` ricorsivamente: le copertine degli articoli — una per pezzo, per sempre — verrebbero scaricate da ogni installazione della PWA per mostrare a un lettore niente |
| 8 | Copertina per file, card generata di riserva | Nessun articolo resta senza card social e nessuno resta non pubblicato per mancanza di un'immagine |
| 9 | CTA in coda + voce nel footer, `PublicHeader` intatto | Il blog è un posto da cui si arriva, non da cui si parte; l'header pubblico ha una CTA sola e un solo motivo di esistere |
| 10 | Feed RSS dal primo giorno | È una rotta sola sulla stessa lista dell'indice, e aggiungerla dopo costa uguale ma nel frattempo chi voleva iscriversi se n'è andato |
| 11 | Marcatura `x-songs-anonymous` incondizionata su `/blog` | Il blog è identico per chiunque: non esiste una copia "di quel lettore" da mettere in cache, e un articolo corretto non deve restare vecchio in nessuna |
| 12 | `publicRoutes.ts` condiviso tra middleware e sitemap | Due elenchi indipendenti di "cosa è pubblico" derivano, ed è la classe di errore su cui questo repo scrive già commenti |
| 13 | Font della card versionato fuori da `public/` | `publicEntries()` scandisce `public/` ricorsivamente: un font lì dentro lo scaricherebbe ogni installazione della PWA senza che nulla lo disegni |
| 14 | Stili di prosa a mano, niente `@tailwindcss/typography` | `DESIGN.md` è la fonte viva dei token e i due temi sono rifiniti a mano; il plugin porterebbe una scala da riscrivere per intero |

## Assunzioni prese senza chiedere

Da correggere se una è sbagliata — nessuna è irreversibile.

- **`/blog` sull'apice**, non un sottodominio: tiene l'autorità di dominio su un
  nome solo e non richiede un secondo progetto Vercel.
- **`/blog/<slug>` piatto**, senza data nell'URL: una guida non invecchia come una
  notizia, e una data nell'URL la fa sembrare vecchia il secondo anno.
- **Bozze**: `draft: true` nei metadati, filtrate in `posts.ts` — non una cartella
  separata, così promuovere una bozza è cambiare una riga e non spostare un file.
  **Verificato con una bozza vera prima di consegnare**, non dedotto: non riceve
  pagina, il suo URL e quello della sua card danno 404, e non compare né in indice, né
  in sitemap, né nel feed. Verificato anche il rovescio, che è meno ovvio e va detto:
  una bozza **malfatta ferma il build** come un articolo pubblicato, perché la
  validazione gira su tutti i file prima che il filtro scelga quali pubblicare
  (`content/blog/a-draft-in-progress.mdx: `date` must be a real date…`). È il
  comportamento voluto — l'errore arriva mentre si sta ancora scrivendo, che è il
  momento in cui costa meno — ma è l'opposto di ciò che la parola «bozza» lascia
  intendere, quindi va saputo: una bozza in lavorazione non può avere una data
  segnaposto inventata.
- **Ordine dell'indice**: per data decrescente, e a parità di data per slug, così il
  build è riproducibile.
- **Le pagine del blog restano statiche**: nessun `force-dynamic`, nessun dato per
  lettore, `dynamicParams = false`.
- **Nessuna migrazione, nessuna tabella, nessuna variabile d'ambiente nuova** — quindi
  nessun passaggio dalla console SQL di Neon e nessun redeploy manuale: un push su
  `main` basta.
- **Nessun numero di versione fissato** per il fold-in in `PLAN.md` — verificare
  l'ordine reale al momento della consegna.

## Ridisegno sul mock `Blog.dc.html` (3 settembre 2026)

Arrivato un mock di Claude Design per il blog — progetto Strumfolio, file `Blog.dc.html`,
letto via MCP — dopo che l'impianto era già spedito. `CLAUDE.md` dice di seguirlo alla
lettera, e così è stato fatto: quasi tutto ciò che questo documento descriveva come
*aspetto* è stato rifatto, mentre l'impianto sotto (MDX in `content/blog/`, validatore
puro, sitemap, robots, feed, guardiano a prefisso, precache escluso) è rimasto intatto.

Cosa cambia rispetto a quanto descritto sopra:

- **Il blog si chiama «Playing notes»**; «Blog» resta solo il nome della sezione, la
  pillola accanto al marchio. Entrambi dal mock, che li stampa separati.
- **Testata propria** (`BlogHeader`) al posto di `PublicHeader`: marchio, pillola,
  «Pricing», capsula «Sign in». Due scostamenti deliberati dal disegno: quei due sono
  `<span>` nel prototipo e qui sono link veri, e l'interruttore del tema c'è (il mock è
  disegnato solo in chiaro — vedi sotto).
- **Piè di pagina proprio** (`BlogFooter`): centrato, © e quattro link, senza versione né
  hash di commit. Il mock elenca «Brand», che però è pagina riservata ai proprietari e
  darebbe 404 a tutto il pubblico del blog: al suo posto Changelog. Deciso in intervista.
- **Larghezze**: 1100px per indice e banda immagine, 720px per la prosa.
- **`tags: string[]` diventa `category`**, una sola, da una **lista chiusa**
  (`Guide | Capo | Keys | Chords`). Il mock la stampa in maiuscoletto accento in quattro
  posti diversi; un campo a testo libero avrebbe spedito `Chord` e `Chords` come due
  categorie che sembrano una.
- **L'indice ha tre ripiani** — in evidenza, riga di tre, «Earlier» — che compaiono solo
  quando c'è abbastanza da riempirli (`lib/blog/shelves.ts`, con test). Il mock è disegnato
  pieno, con otto articoli; con due, una griglia da tre che ne mostra uno non sembra vuota,
  sembra rotta.
- **Nuovi elementi d'articolo**: tabella accordi a due righe, riga estratta, pannello
  scuro di chiusura, «Read next». I primi due sono componenti MDX (`<ChordTable>`,
  `<Quote>`), perché markdown non sa esprimere né la riga in accento né il
  `translate="no"` che ogni nome di accordo deve portare.
- **Due temi, non uno.** Il mock è disegnato solo in chiaro; il chiaro lo riproduce
  colore per colore, lo scuro è scritto a mano sui token notturni. Deciso in intervista
  contro l'alternativa «solo chiaro»: `PRODUCT.md` dice che i due temi sono progettati,
  non invertiti. L'unica eccezione è il pannello di chiusura, volutamente quasi-nero in
  entrambi.
- **Colori nuovi, ma non nel palette globale**: sei variabili `--blog-*` definite su
  `.blog`, non in `:root`. Sono passi deliberati e misurati rispetto ai token esistenti
  (bordi dieci livelli più chiari di `--line`, inchiostro di lettura venti più chiaro di
  `--ink`), e promuoverli offrirebbe a ogni altra superficie una seconda linea e un
  secondo inchiostro senza motivo per preferirli.
- **Le alterazioni si scrivono come le scrive l'app** (`F#m`, `Bb`), non con ♯ e ♭ come
  nel mock. È l'unico punto in cui la copia disegnata non è stata seguita: `notes.ts`
  stampa ASCII, quindi un articolo che insegna «il tuo foglio dirà F#m» deve stampare ciò
  che il foglio stampa davvero. Come effetto secondario risolve anche la copertura dei
  glifi, che Outfit non ha.
- **Le copertine restano tipografiche**, non fotografiche. Il mock prevede foto («Hands on
  a capo, close up»); non ce ne sono, e le copertine generate sono un sostituto — vedi
  *Domande aperte*.
- **L'articolo del mock è stato portato per intero** (`capo-second-fret.mdx`): la sua copia
  è completa nel disegno, quindi riprodurla è seguire il mock, non inventare contenuto.

## Piano editoriale a ondate (3 settembre 2026)

Deciso dall'utente e riportato qui perché era una delle *Domande aperte* di questo
documento («nessuna scelta di parole chiave a monte»). Sei ondate, ordinate per
dipendenza di sviluppo prima che per volume di ricerca:

| Ondata | Contenuto | Tipo | Stato |
|---|---|---|---|
| 1 | Alternativa a OnSong | Pagina pura | **consegnata** |
| 1 | Alternativa a SongBook ChordPro | Pagina pura | **consegnata** |
| 1 | Alternativa a JustChords | Pagina pura | **consegnata** |
| 2 | Free ChordPro converter + «How to convert chord sheets to ChordPro» | Tool + articolo | **consegnata** |
| 3 | Free chord transposer online | Tool | da fare |
| 4 | Capo calculator | Tool | da fare |
| 5 | Setlist length calculator | Tool | da fare |
| 6 | Best chord chart apps for gigging musicians | Best-of | **consegnata** |
| 6 | Best offline chord chart apps (no wifi) | Best-of | **consegnata** |
| 6 | Best apps for solo acoustic performers | Best-of | **consegnata** |

L'ondata 1 non ha dipendenze di sviluppo — si scrive e si pubblica — ed è per questo che
va per prima. Le ondate 2-5 sono **strumenti interattivi**, cioè lavoro di prodotto e non
di scrittura: ognuna è una pagina che fa qualcosa, non una che spiega qualcosa. L'ondata 6
si appoggia alle precedenti e le linka internamente, quindi arriva per ultima.

### Cosa è servito per l'ondata 1

- **Nuova categoria `Comparisons`**, quinta della lista chiusa. È l'unica che non nomina un
  argomento ma un *genere*: un pezzo che pesa questa app contro un'altra, scritto per chi
  arriva già con un nome in mano. Copre anche i best-of dell'ondata 6.
- **I due test che inchiodavano la lista** delle categorie ora la leggono da `CATEGORIES`,
  così aggiungerne una non ne rompe due.
- **La lede del blog è stata allargata di una clausola** rispetto al mock. Il disegno
  prometteva solo guide su capotasto, tonalità e accordi; con tre confronti su cinque
  articoli quella riga litigava con l'indice che sta sopra — e, peggio, con lo snippet in
  SERP, visto che è la stessa stringa. La stessa frase nel canale RSS è stata allineata.

### Cosa è servito per l'ondata 2

Il primo strumento, e quindi la prima pagina pubblica che *fa* qualcosa invece di spiegarla.

- **Rotta propria, non un articolo**: `/tools/chordpro-converter`, con un `layout.tsx` che
  farà da casa anche ai tre strumenti successivi. Non sta sotto `/blog` perché non è un
  pezzo di scrittura e non passa da `shelve()` né dal template dell'articolo.
- **Gira tutto nel browser.** `lib/import/convert.ts` era già una funzione pura — solo
  `actions.ts` porta `'use server'` — quindi la pagina importa **lo stesso modulo che usa la
  schermata di import** dell'app, non una copia semplificata scritta per il marketing. È la
  differenza fra mostrare cosa farà l'app e promettere qualcosa che l'app non fa.
- **Niente account, niente upload, niente salvato**, ed è scritto sulla pagina: chi incolla
  parole non ancora uscite ha tutto il diritto di chiederselo.
- **La testata e il piè di pagina sono diventati del sito**, non del blog: `BlogHeader` e
  `BlogFooter` sono ora `SiteHeader` (con la pillola della sezione come prop) e — fino al
  commit `0db9552` — `SiteFooter`. **Quel piede è poi stato rimosso**: blog e strumenti usano
  di nuovo il `Footer` dell'app, versione e hash del commit compresi, per non avere due piedi
  diversi sullo stesso sito. Supera la decisione presa in intervista («piede del mock con
  Changelog al posto di Brand»).
  Con loro le primitive di layout condivise — `blog-bar*`, `blog-hero*`, `blog-main`,
  `blog-footer*` — sono diventate `site-*`, perché un nome che dice «blog» su una pagina che
  non è il blog è una bugia che il prossimo lettore paga.
- **Una lezione dall'esempio.** Il campione dietro «Use an example» era allineato a occhio e
  il motore, correttamente, produceva `hom[F]e`: un accordo sta sopra la sillaba su cui cade
  la sua colonna, quindi le colonne dell'esempio sono portanti. Ricontate e verificate
  eseguendo il motore vero sul sorgente del componente. Se si tocca quell'esempio, si guarda
  l'output, non l'aspetto.

Resta da fare per gli strumenti successivi una **pagina indice `/tools`**: oggi con un solo
strumento sarebbe sottile, quindi quell'indirizzo è un redirect al convertitore (vedi
`app/tools/page.tsx`), e diventa un indice vero — e `indexable` — quando arriva il secondo.

La voce **«Tools» è nel piè di pagina** dell'app, accanto a «Blog» e puntata a `/tools`, cioè
all'indirizzo durevole e non all'unico strumento di oggi: il giorno che diventa un indice, la
riga non va ritrovata e cambiata. Aggiungerla ha però fatto emergere un difetto che c'era già
in potenza: i separatori erano elementi flex a sé, quindi una riga andata a capo poteva
**iniziare con un puntino** — «· Tools» su un telefono. Ora ogni voce si porta il proprio
separatore in coda (`.app-footer-item::after`, con `content: '·' / ''` perché un lettore di
schermo legga un elenco di link e non una fila di puntini), e un capoverso non può più
aprirsi con uno.

### La regola di scrittura per un confronto

Ogni pagina «alternativa a X» dichiara, nell'ordine: cosa X fa bene (in dettaglio e senza
sconti), la cosa che spinge la gente a cercare un'alternativa, cosa cambia qui, e **una
sezione esplicita «quando restare con X»** con i casi reali in cui Strumfolio è la scelta
peggiore — PDF, annotazioni, pedali, MIDI, tracce, proiezione, metronomo, accordatore.
Non è cortesia: una pagina di confronto che non ammette un limite non viene creduta su
nessun altro punto, e chi la legge sta decidendo se fidarsi.

I fatti sui concorrenti sono stati **verificati sulle loro pagine ufficiali** al momento
della scrittura, non ricordati, e i prezzi portano la data. Vanno ricontrollati quando
cambiano: un confronto sbagliato sui fatti è peggio di nessun confronto.

### Cosa è servito per l'ondata 6 (3 settembre 2026)

I tre round-up sono arrivati prima degli strumenti 3-5, non dopo come l'ordine dichiarato sopra
li aveva pianificati — scelta esplicita dell'utente, non una deriva. Conseguenza diretta: **nessun
link a un trasposer, un capo calculator o un setlist calculator**, perché nessuno dei tre esiste
ancora. I tre pezzi si linkano fra loro e verso ciò che è già pubblicato (i tre confronti 1-a-1,
`convert-chord-sheets-to-chordpro`), non verso strumenti immaginari.

- **Categoria `Comparisons` per tutti e tre**, come il piano stesso prevedeva già («copre anche i
  best-of dell'ondata 6») — non serviva una categoria nuova.
- **`cover: null` per tutti e tre.** Le fotografie Adobe Stock delle consegne precedenti sono
  arrivate dalla cartella condivisa Parallels, non raggiungibile in questa sessione; piuttosto che
  aspettare un'immagine, si è usato il ripiego che `openGraph.ts` già prevede per questo caso
  esatto — la card generata al posto della copertina. Coerente con la regola scritta lì: «una
  scrittura non deve mai aspettare che qualcuno procuri un'immagine».
- **Fatti sui concorrenti nuovi rispetto ai tre confronti già pubblicati** (Ultimate Guitar: Chords
  & Tabs, Songsterr) verificati sulle rispettive schede App Store — la fonte ufficiale più
  affidabile trovata, dato che le pagine `ultimate-guitar.com`/`songsterr.com` stesse hanno
  restituito solo frammenti. Prezzi datati settembre 2026 nel testo, come ogni altro confronto qui.
- **Verificato con una build isolata prima di scrivere qui**: `git stash create` sui tre file
  nuovi (senza toccarli nel working tree, che un `next dev` teneva occupato sulla stessa cartella),
  `git archive` di quello stash in una copia sotto lo scratchpad, poi `tsc`/`npm test`/`npm run
  build`/`npm run lint` lì — tutti verdi, i nove articoli compaiono tutti in `generateStaticParams`.

## Elemento promozionale ridisegnato (3 settembre 2026)

Il mock `Blog.dc.html` ha sostituito la CTA di chiusura. Era una fascia scura con una frase
e un bottone; ora è un pannello chiaro caldo che dice **cosa è il prodotto** in tre righe.

- **`BlogCta` → `PromoPanel`, condiviso** («messo a comune»): non prende props, non appartiene
  a nessuna superficie, e lo usano sia gli articoli sia le pagine strumento. Chiude anche
  qualunque superficie pubblica futura.
- **Il bleed non è del pannello ma della pagina.** Nel mock il pannello sfonda la colonna di
  testo con margini negativi; ma la colonna di un articolo è 720px e quella di una pagina
  strumento 1100px, quindi un pannello che portasse i propri margini negativi sborderebbe
  dalla seconda. La regola vive su `.blog-article > .promo`.
- **I numeri si leggono, non si scrivono.** «1 songbook, 30 songs, no card» viene da
  `PLANS.free` tramite `limitLabel`, estratto dall'helper locale di `/login` in
  `lib/plans/limits.ts` con i suoi test: la stessa frase ora compare su ogni articolo e su
  ogni strumento, quindi un numero stantio qui è stantio in più posti che altrove.
- **Due token nuovi in `:root`**, non scopati a `.blog`: `--promo-bg` e `--promo-line`. È il
  caso che giustifica la promozione a globale — il pannello non è del blog.
- **Il telefono c'è**, consegnato a parte dalla cartella condivisa: `uploads/smartphone2.png`
  non passa dal MCP del design, che taglia i file a 256 KiB e lo restituisce con
  `truncated: true` — 209 KB di PNG diventano ~285 KB in base64. Convertito in WebP con
  l'alfa intatto (46 KB) in `public/promo/song-screen.webp`.
- **Due cose che quella cartella nuova ha richiesto**, entrambe della stessa famiglia già
  documentata qui:
  - `public/promo/` **escluso dal precache** in `next.config.ts`, come `public/blog/`: è un
    asset di marketing che l'app installata non disegna mai.
  - `/promo/` aggiunto a `isPublicAsset()` in `middleware.ts`. Senza, il guardiano
    rispondeva **307 verso `/login`** e `next/image` restituiva un **500** — un'immagine
    rotta il cui errore non nomina la causa. Nota utile: le copertine del blog non hanno
    bisogno di quella riga perché stanno sotto `/blog/`, che il ramo degli articoli già
    ammette; qualunque *nuova* cartella sotto `public/` non ha quella fortuna.

## Domande aperte

- **La home del sito, per un crawler, è `/login`.** `/` richiede una sessione e
  redirige lì, quindi la pagina di atterraggio commerciale vive a un URL che dice
  «accedi» — l'indirizzo peggiore possibile per la pagina che dovrebbe convertire uno
  sconosciuto, e l'apice non accumula autorità su niente. È un problema che esiste già
  oggi, indipendente dal blog, ma il blog lo rende costoso: ogni articolo manda
  traffico verso un sito la cui porta principale è una schermata di accesso. Da
  affrontare a parte — probabilmente separando la landing dal login — e non risolto
  qui.
- **Le superfici che stampano un accordo fuori da `SongSheet` e `GraphicEditor` non
  sono state passate in rassegna.** Togliendo il divieto globale dal layout di root
  (punto 8), la protezione resta solo dove è dichiarata: quei due contenitori, più
  `<Chord>` negli articoli. Restano da guardare, se e quando il problema si presenta:
  i badge di tonalità sulle song chips, la barra di lettura, i dialoghi di
  diteggiatura fuori dal foglio, `/help/chordpro` e `/design-system`. L'audit è stato
  offerto in intervista ed esplicitamente rimandato — è lavoro sull'app, non sul blog.
  Il rischio concreto è limitato: perché si manifesti, un lettore deve *accettare* la
  traduzione, non solo vedersela offrire.
- **Verifica in Google Search Console**: passo manuale da dashboard, senza alcuna
  credenziale in questo repo — stessa classe dell'allowlist di Turnstile e delle URI
  di redirect di Google OAuth documentate in `CLAUDE.md`. Senza, la sitemap esiste ma
  nessuno l'ha mai presentata a Google. Va aggiunta alla checklist dei sei posti
  quando sarà fatta.
- ~~**Nessuna scelta di parole chiave a monte.**~~ Risolta: vedi *Piano editoriale a
  ondate* sopra. Resta aperto il seguito — le ondate 2-5 sono strumenti da costruire, non
  articoli da scrivere, e ognuna va pianificata come lavoro di prodotto.
- **I fatti sui concorrenti invecchiano.** Le tre pagine dell'ondata 1 citano piattaforme,
  prezzi e funzioni verificati a settembre 2026. Un prezzo cambiato o una versione Android
  in arrivo rende falsa una pagina che continua a posizionarsi: vanno riviste, non
  dimenticate. I prezzi portano già la data nel testo, che è il minimo.
- **L'italiano, se mai servirà, si pagherà per intero**: rotte, `hreflang`, `lang` per
  pagina, e ogni articolo già scritto da tradurre. Rifiutato consapevolmente due
  volte; qui solo per memoria del costo.
- **Pagine per categoria**: da riconsiderare quando gli articoli saranno abbastanza da
  riempirle — indicativamente trenta, con almeno cinque per categoria. Il campo ora è una
  lista chiusa, quindi accenderle è aggiungere una rotta, non ripassare gli articoli.
### Immagini: fotografie sulle guide, disegni sui confronti (3 settembre 2026)

Sono arrivate undici immagini Adobe Stock nella cartella condivisa, e la regola che ne è
uscita vale più delle immagini stesse.

- **La copertina della pagina e la card social sono ora due cose diverse.**
  `pageImage()` disegna la banda dell'articolo e le schede dell'indice; `socialImage()`
  restituisce **sempre** la card generata, anche quando esiste una copertina. Motivo: in
  un'anteprima di WhatsApp una fotografia muta larga trecento pixel vale meno di un titolo
  leggibile con il marchio sopra. Non costa nulla — la rotta `og` era già prerenderizzata
  per ogni articolo, perché era già il ripiego.
- ~~**Le guide portano fotografie, i confronti tengono le card disegnate.**~~ Superata: su
  richiesta esplicita, **ogni articolo porta una fotografia**, scegliendo il meglio fra quelle
  disponibili anche quando il soggetto non è quello ideale — si migliorano più avanti. Dove
  possibile i confronti hanno ritagli **senza volto** (mani, strumento, scrivania), che è la
  mitigazione che resta del rilievo originale: la faccia di una persona sotto «An OnSong
  alternative» si legge come un endorsement che nessuno ha dato.
- **Le card disegnate «where it runs» non sono state buttate**: vivono in
  `public/blog/<slug>-where-it-runs.webp`, in attesa di un componente `<Figure>` che le
  rimetta *dentro* l'articolo, dove il confronto piattaforma-per-piattaforma sta meglio che in
  copertina.
- **Quattro delle undici erano generate con l'IA, e sbagliate.** In una, le corde
  attraversano la buca e svaniscono: nessun ponte, nessuna selletta, e meccaniche sulla
  fascia. Su un prodotto per musicisti quel dettaglio è visto in mezzo secondo dal pubblico
  esatto che si sta cercando di convincere. **Regola per il futuro: ingrandire lo strumento
  prima di usare una foto di repertorio** — ponte, paletta, numero di corde, mani. Le tre
  scelte sono fotografie vere; una di esse riprende un libro di accordi stampato in
  notazione tedesca (`G/H`, `A7/E`), che è esattamente ciò di cui parlano gli articoli.
- **Il capotasto è arrivato dopo**, in una seconda consegna. La foto era usabile solo
  ritagliata stretta sul manico: nell'inquadratura piena la persona **indossa una mascherina
  sanitaria**, che data lo scatto al 2020-22 e su una pagina del 2026 è l'unica cosa che si
  guarda. Tagliata sul capotasto e sulla mano, la mascherina esce e il verde resta uno sfondo
  sfocato. Terza cosa da controllare su una foto di repertorio, dopo l'IA e gli strumenti
  sbagliati: **cosa data lo scatto** — mascherine, telefoni riconoscibili, monitor spessi.
  Nota: a quell'angolazione il tasto sotto il capotasto si legge come primo *o* secondo, non
  è decidibile. Su una copertina non conta nessuno, ma il titolo dice «second fret».
- Le originali (2-7 MB) **non entrano nel repo**: vengono ritagliate a 1200×630 e convertite
  in WebP, 48-104 KB l'una.

- **Il mock prevedeva fotografie; le copertine tipografiche sono diventate la scelta.**
  Ogni `image-slot` del disegno descrive uno scatto («Hands on a capo, close up»), e al loro
  posto sono state generate copertine tipografiche. Nate come sostituto, dopo cinque
  articoli nello stesso stile non lo sono più: sono l'identità visiva del blog, e hanno un
  vantaggio che una foto di repertorio non ha — mostrano il prodotto (accordi sopra le
  parole, la tabella suona/suoni) invece di illustrarlo. Restano due conseguenze da
  ricordare: la banda da 380px ritaglia, quindi il contenuto di una copertina deve stare fra
  y 108 e 522 del file 1200×630, e il filo di bordo sull'immagine dell'articolo esiste
  perché una copertina chiara altrimenti si dissolve nella pagina. Se un giorno arrivano
  foto vere, quel bordo va tolto.
- **L'indice si vede pieno solo da otto articoli in su.** Con due, la riga da tre resta
  chiusa e «Earlier» tiene una riga sola. È il comportamento deciso e testato, non un
  difetto, ma il disegno dà il meglio quando c'è di che riempirlo.
