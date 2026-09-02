# Blog — impianto pubblico per l'acquisizione via SEO — piano

> Documento a sé, non una sezione di `PLAN.md`: quella tabella è il registro delle
> decisioni già *consegnate e in produzione*, e questa feature non è ancora scritta.
> Quando è chiusa, va ripiegata lì come una nuova sezione di versione — verificare
> l'ordine di fold-in reale al momento (altri `PLAN-<feature>.md` potrebbero essere
> stati consegnati nel frattempo), non assumere che il numero di versione successivo
> sia libero. Precedente diretto per la forma del documento: `PLAN-newsletter.md`.

## Cos'è

Oggi non esiste alcun blog nel repo — la parola non compare in nessun file di `src/`
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
  **tag**. Il tempo di lettura si calcola dal testo, non si scrive. `draft: true`
  esclude l'articolo da indice, sitemap, feed e `generateStaticParams`.
- **Tag: solo etichette, nessuna pagina tag.** Si vedono sull'articolo e filtrano
  l'indice, ma non esiste `/blog/tag/<x>` e non ci sono voci extra in sitemap: con
  pochi articoli quelle pagine sarebbero sottili, e Google tratta male le pagine
  sottili. Il campo però nasce subito, così accenderle quando gli articoli saranno
  trenta è aggiungere una rotta, non tornare su ogni articolo già scritto.
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
     tags: ['chordpro', 'import'],
     cover: '/blog/chordpro-explained.webp',   // opzionale
     draft: false,
   }
   ```

**3. Lettura e validazione — `src/lib/blog/`.**
   - `meta.ts`, **modulo puro e testabile**: `parsePostMeta(slug, raw): PostMeta`
     verifica presenza e forma di ogni campo (data ISO reale, description non vuota e
     entro il limite utile in SERP, slug coerente col nome del file, tag in
     kebab-case) e **lancia** su un articolo malfatto. Chiamato da `loadPost`, quindi
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
- **Nessuna scelta di parole chiave a monte.** L'impianto è pronto a ricevere
  articoli; quali articoli, su quali ricerche, e in che ordine, è una decisione
  editoriale non ancora presa. In inglese va cercata deliberatamente la coda lunga
  vicina al prodotto (`ChordPro`, stampa di un canzoniere, condivisione con la band)
  invece delle teste presidiate dai grandi — vedi il contro-argomento nella
  decisione 2.
- **L'italiano, se mai servirà, si pagherà per intero**: rotte, `hreflang`, `lang` per
  pagina, e ogni articolo già scritto da tradurre. Rifiutato consapevolmente due
  volte; qui solo per memoria del costo.
- **Pagine tag**: da riconsiderare quando gli articoli saranno abbastanza da riempirle
  — indicativamente trenta, con almeno cinque articoli per tag.
