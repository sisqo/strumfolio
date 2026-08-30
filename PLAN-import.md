# Importazione da più formati — piano

> Documento a sé, non una sezione di `PLAN.md`: quella tabella è il registro delle
> decisioni già *consegnate e in produzione* (la sua nota d'apertura lo dice), e questa
> feature non è ancora scritta. Quando è chiusa, va ripiegata lì come sezione
> `### Import da più formati (v4.x)`, stesso formato di tabella già in uso. Stesso
> trattamento di `PLAN-booklet-personal-print.md` e del `PLAN-comments.md` che l'ha
> preceduto.

## Cos'è

Oggi l'import legge **tre estensioni** (`.txt`, `.cho`, `.chordpro`, filtrate da
`FILE_TYPES` in `AddSongScreen.tsx:36`) più il campo «Incolla», e passa tutto per la stessa
pipeline pura di tre funzioni: `splitSongs` → `convert` → `deduce`, orchestrate da
`prepareSongs` (`src/lib/import/prepare.ts`). È una pipeline buona — la preview modificabile
prima di scrivere è già la rete di sicurezza giusta per un'euristica — ma il suo ingresso è
stretto: chi arriva da OnSong, SongbookPro, MobileSheets, o semplicemente con i propri brani
in Word o in PDF, non ha una porta.

La richiesta: aprire quella porta al maggior numero di formati realisticamente ottenibili,
inclusi quelli dei concorrenti, senza rompere il patto che regge la schermata di oggi —
*niente si scrive prima che tu l'abbia visto*.

---

## Parte I — Lo studio dei formati

Ricerca condotta su fonti primarie (documentazione dei vendor, specifiche scritte, sorgente
di parser reali); le sintesi dei motori di ricerca sono state trattate come piste, non come
conferme. Dove non è stato possibile confermare, sotto si legge **non confermato** invece di
un'ipotesi.

### Le tre conclusioni che decidono il piano

**1. ChordPro è l'unico vero formato d'interscambio.** Letto da ~10 app, scritto da ~7.
Non c'è un secondo candidato: significa che ogni brano che riesce ad arrivare qui come
ChordPro arriva già alla massima fedeltà possibile, e che il lavoro migliore che si possa
fare per un utente in migrazione spesso è **indirizzarlo all'export ChordPro dell'app che
sta lasciando**, non decodificare il suo backup interno.

**2. OpenSong XML non serve al nostro segmento.** Circola solo nel mondo della proiezione
liturgica: è assente dalle liste di import di *ogni* app rivolta ai chitarristi (SongbookPro,
MobileSheets, LinkeSoft, BandHelper, Setlist Helper). Si legge perché costa pochissimo
(XML piatto, `DOMParser` è nel browser), non perché sposti la migrazione.

**3. La stessa direttiva significa cose diverse in app diverse.** È la scoperta più
pericolosa dell'intera ricerca, perché il danno è silenzioso: nessun errore, solo un campo
riempito col dato sbagliato. Vedi la tabella delle collisioni più sotto.

### Chi si può realmente lasciare, e chi no

| App | L'export esiste? | Nota |
|---|---|---|
| **Ultimate Guitar** | **No, a nessun livello** | Nessun export testuale; PDF/stampa solo Pro. Le tab ufficiali sono deliberatamente trattenute. L'unica via è incollare. |
| **OnSong** | Sì, ma **a pagamento** (PREMIUM/ESSENTIALS) | Esporta in ChordPro, OpenSong XML, e testo `.onsong`. |
| **CCLI SongSelect** | Sì, **Premium, max 200 brani/anno** | Solo il ChordPro Premium porta gli accordi: i download `.usr`/`.txt`/`.bin` sono **solo testo, senza accordi**. |
| **WorshipTools** | **No** | Importa 14+ formati, non esporta nulla (confermato dallo staff). |
| **SongbookPro** | Sì | Nessun export per singolo brano documentato: la via d'uscita è il backup `.sbpbackup`. |
| **MobileSheets** | Sì | Ma «Export ChordPro» **non è un convertitore**: restituisce un `.cho` che era già nella libreria. Un brano entrato come PDF non diventa mai ChordPro. |
| **OpenSong, LinkeSoft, BandHelper, Setlist Helper, Planning Center** | Sì | Tutti su testo o API. |

### La matrice

Livelli di fedeltà: **A** = la posizione accordo↔sillaba è recuperabile (conversione
ChordPro vera). **B** = strutturato ma con perdita. **C** = opaco.

| Formato / App | Estensioni | Contenitore | Accordi come | Livello | In piano? |
|---|---|---|---|---|---|
| **ChordPro** | `.cho` `.crd` `.chopro` `.chord` `.pro` | Testo | `[C]` inline | **A** | **Sì** — già letto |
| **Accordi sopra il testo** | `.txt` | Testo | Colonne monospace | **A** | **Sì** — già letto |
| **OnSong testo** | `.onsong` | Testo | Sia `[C]` sia colonne; `.` o backtick forzano una riga accordi | **A** | **Sì** |
| **OnSong → ChordPro** | `.chopro` | Testo | `[C]` inline | **A** | **Sì** — è la via consigliata |
| **OnSong → OpenSong** | `.xml` | XML | Righe accordi con `.` | **A** | **Sì** |
| **OpenSong** | **nessuna estensione** | XML | Riga con `.` sopra riga con spazio | **A** | **Sì** |
| **OpenLyrics** (export di OpenLP) | `.xml` | XML | `<chord root="D"/>` attorno alle sillabe | **A** | **Sì** |
| **SongbookPro backup** | `.sbpbackup` | **ZIP** → `dataFile.txt` (`1.0\r\n` + JSON su una riga), `dataFile.hash` (MD5), + i PDF importati | `[C]` inline | **A** | **Sì** — chiave JSON del corpo **non confermata**, serve uno smontaggio manuale |
| **Word** | `.docx` | **ZIP di XML** (`word/document.xml`) | Convenzione monospace | **C→A** | **Sì** |
| **PDF** | `.pdf` | Binario ISO 32000-1 | **Nessuno**: nudge `TJ` per glifo, non spazi | **C→B** | **Sì**, ricostruito dalle coordinate |
| **OnSong Backup** | `.backup` | **ZIP** → `OnSong.sqlite3` + media | Dentro il SQLite | **B** | **No** — rimando all'export ChordPro |
| **OnSong Archive** | `.onsongarchive` `.archive` | Binario, **struttura non confermata**, nessun parser pubblico | — | **C** | **No** — rimando |
| **MobileSheets backup** | `.msb` | Binario custom (non ZIP), incorpora `mobilesheets.db` + PDF/audio | Solo dentro i `.cho` inclusi | **B** | **No** — rimando |
| **MobileSheets share** | `.msf` / `.mss` | `.msf` non estraibile fuori dall'app; `.mss` è XML di soli riferimenti | — | **C** | **No** |
| **Ultimate Guitar** | *nessuna* | Testo con `[ch]`/`[tab]`, solo dentro il JSON di pagina | Colonne monospace | **A** se incollato | **Sì, via «Incolla»** |
| **iReal Pro** | `.html` (avvolge `irealb://`) | XHTML → URL percent-encoded offuscato | **Nessun testo, mai** — solo griglia accordi | **B** | **No** — non c'è niente da allineare |
| **Guitar Pro** | `.gp` (GP7/8), `.gpx` (GP6), `.gp3/4/5` | `.gp` = ZIP + `Content/score.gpif`; il resto binario | Accordi per-beat; **il testo è un blob ancorato alla battuta**, la mappatura è ri-dedotta al caricamento | **B** | **No** — vedi nota |
| **CCLI SongSelect** | ChordPro / PDF / `.usr` `.txt` | Testo / PDF | ChordPro inline | **A** / **C** | **Sì**, come ChordPro |
| **Planning Center** | *nessun file* | API JSON | ChordPro inline | **A** | **No** — servirebbe OAuth |
| **LinkeSoft SongBook** | `.pro` `.chordpro` `.chopro` `.cho` `.txt` | Testo | `[Em]` inline | **A** | **Sì** — è ChordPro |
| **BandHelper** | `.txt` tab-delimitato, + export ChordPro | Testo | Colonne separate Lyrics/Chords **e** `[C]` inline | **A** | **Sì**, come ChordPro |
| **Setlist Helper** | `.PRO` (Android) / cartella ChordPro (iOS) | Testo | `[C]` inline | **A** | **Sì** — è ChordPro |

**Nota su Guitar Pro** — la trappola del testo: gli accordi sono un fatto memorizzato per
battuta, ma le sillabe si ancorano solo a una battuta di partenza e la mappatura
sillaba→beat viene ri-dedotta spezzando su spazi e trattini. Il sorgente di alphaTab avverte
da sé che «uno scarto fra chunk e beat può portare a beat mancanti»: **una pausa sposta
tutto ciò che segue**. Il file non registra mai «questa sillaba sta sotto questo accordo» —
che è esattamente il dato che a Strumfolio serve. Fuori piano.

**Sei nomi confondibili, verificati separatamente:** OnSong (iOS, onsongapp.com) ·
OpenSong (desktop XML, opensong.org) · OpenSongApp (Android, `.ost` nativo) — e
SongbookPro (songbook-pro.com) · SongBook+ (songbookplus.com) · LinkeSoft SongBook
(linkesoft.com).

### Le collisioni fra dialetti

Ogni riga è confermata. Interpretata col dialetto sbagliato, ognuna corrompe un campo in
silenzio.

| Direttiva | ChordPro | OnSong | MobileSheets | SongbookPro |
|---|---|---|---|---|
| `{a:}` | **non è un'abbreviazione** | `artist` | **`album`** | non confermato |
| `{st:}` / `{subtitle}` | sottotitolo | **ridefinita: è l'artista** | sottotitolo | sottotitolo |
| ↳ *e qui?* | **`DIRECTIVE_ALIAS` mappa già `st` e `subtitle` → `artist`** (`chordpro.ts:84-85`) — cioè Strumfolio segue di fatto la convenzione **OnSong**, non la specifica | | | |
| `{cb}` | `comment_box` | **`comment_bold`** | `comment_box` | non confermato |
| `{book:}` | non definita | `book` (nome canzoniere) | **alias di `{album}`** | non definita |
| `{k:}` / `{ok:}` | **nessuna abbreviazione `k`** | `key` / `original key` | solo `{key:}` | solo `{key:}` |
| `{su:}` | non definita | non definita | **alias di `subtitle`** | non definita |
| `{f:}` | non definita | `footer` | solo `{footer:}` | solo `{footer:}` |
| `{gc:}` | non definita | non definita | **alias di `{comment}`** | non definita |
| `{chorus}` | richiama il ritornello memorizzato | — | richiama | **è un'etichetta di sezione, non un richiamo** |
| `{textfill}` | non definita | non definita | non definita | **solo SongbookPro** |
| `[Dm7 (play twice)]` | non valido (`[*…]` è per le annotazioni) | parentesi tollerata | testo non-accordo | **reso come testo visibile** |

### Un avvertimento che convalida il codice già scritto

L'implementazione di riferimento di ChordPro instrada verso il convertitore
«accordi-sopra-testo» **ogni file privo di una riga `{direttiva}`** — e così sfascia in
silenzio i file ChordPro validi che usano solo le parentesi. `convert.ts` qui **non fa quell
errore**: `looksLikeChordPro` (`convert.ts:121-126`) controlla se un token fra parentesi si
legge come accordo, non se esistono direttive. È la scelta giusta, e va lasciata com'è.

---

## Parte II — Cosa cambia, risolto nell'intervista

### La forma della schermata

- **Tutto resta dentro `/songbooks/[slug]/add`.** Nessuna rotta `/import` nuova. La
  premessa «in *questo* canzoniere» regge perché nessun import creerà mai un canzoniere
  (vedi sotto): la schermata continua a rispondere a una sola domanda di destinazione.
- **Gli archivi si appiattiscono.** Un `.zip` o un `.sbpbackup` porta la propria struttura a
  cartelle: quelle cartelle diventano **sezioni** dentro il canzoniere già scelto in cima
  allo schermo. Mai un canzoniere nuovo. La regola già scritta in `prepare.ts:27-40` —
  `declares` (canzoniere) si mostra ma **non** si obbedisce, `declaresSection` si obbedisce —
  sopravvive intatta, e le cartelle d'archivio entrano dalla porta di `declaresSection`.
  Chi migra tre canzonieri fa tre import.
- **Sopra soglia, riepilogo invece di lista.** `ImportBatch` disegna oggi una riga per brano
  e salva in sequenza: giusto per venti brani incollati, insostenibile per 212. Sopra la
  soglia la lista si chiude in un riepilogo che conta le **eccezioni** — senza titolo, già in
  archivio, nessun accordo trovato — e si espandono solo quelle. La lista intera resta
  apribile per chi la vuole. Il salvataggio va **a blocchi**, con lo slug risolto server-side
  per l'intero blocco: risolve anche il motivo per cui oggi si salva uno alla volta (due
  salvataggi paralleli si contenderebbero lo stesso slug, `ImportBatch.tsx:63-68`).

### Dove gira il codice

- **Tutto nel browser**, come oggi. La proprietà che la pipeline attuale ha già — il
  repertorio di una persona non tocca il server finché non decide di salvarlo — è una
  proprietà da difendere, non un dettaglio d'implementazione.
- **Un `await import()` per formato.** Chi incolla ChordPro non deve scaricare pdfjs. La
  rotta `add` resta leggera a bundle statico; ogni parser arriva al momento del drop.
  Vincolo dichiarato in `CLAUDE.md`: `/booklet` è già a 655 kB di first-load, non se ne
  aggiunge un secondo per sbaglio.
- **Nessuna AI.** Considerata e scartata per ora: vedi le questioni aperte.

### I formati, in tre gruppi

**Gratis (nessuna dipendenza nuova):**
- ChordPro e tutte le sue estensioni: `.cho` `.crd` `.chopro` `.chord` `.pro` `.onsong`
  `.cpm` — già letti dalla pipeline, va solo allargato `FILE_TYPES`.
- OpenSong XML e OpenLyrics XML: `DOMParser` è già nel browser.
- `.zip` di file di testo: `fflate` **è già una dipendenza** (`ExportPanel.tsx` la usa per
  scrivere gli zip) ed esporta `unzipSync` oltre a `zipSync`. Leggere un archivio costa
  zero KB in più.
- `.sbpbackup` di SongbookPro: è uno ZIP con dentro `dataFile.txt` = `1.0\r\n` + JSON su una
  riga. Stesso `fflate`, più `JSON.parse`.
- `.docx`: è uno ZIP di XML. Stesso `fflate`, più `DOMParser` su `word/document.xml`.

**Una dipendenza nuova:**
- `.pdf` → `pdfjs-dist`, caricato in dynamic import solo al drop di un PDF.
  **Nota**: `pdf-lib`, già installato, **non serve** — non ha alcuna API di estrazione
  testo, e in questo repo esiste solo per *rileggere e contare le pagine* di un PDF
  generato (`booklet/document.tsx:1017`).

**Fuori piano, con un rimando utile invece di un errore:**
`.backup` e `.onsongarchive` di OnSong, `.msb`/`.msf` di MobileSheets, `.gp*` di Guitar Pro,
iReal Pro. Al drop, la schermata non dice «formato non supportato»: dice cosa fare invece.

> Questo è un backup interno di OnSong. Per portare qui i brani: in OnSong, Songs →
> seleziona tutto → Share → ChordPro, poi trascina qui quello zip.

Sul caso OnSong questa è anche la scelta **migliore**, non un ripiego: il `.backup` è uno ZIP
con dentro un `OnSong.sqlite3`, e leggerlo nel browser vorrebbe dire `sql.js` — circa 1 MB
di WebAssembly e uno schema non documentato che può cambiare a ogni aggiornamento — per
ottenere brani che l'export ChordPro di OnSong consegna già, meglio e senza costo.

### Il PDF, in concreto

pdfjs restituisce ogni frammento di testo con la propria `x`/`y`. La ricostruzione è:
raggruppa i frammenti per `y` (una riga), ordina per `x`, e **ricostruisci una riga spaziata
in proporzione alle x**. Da lì il PDF **rientra nella pipeline che esiste già**: `isChordLine`
e `merge` (`convert.ts:58-101`) fanno il resto senza una riga di codice nuova.

```
pdfjs → [{str:'C', x:12, y:340}, {str:'G', x:96, y:340},
         {str:'Amazing grace how sweet', x:12, y:328}]

  ↓ raggruppa per y, spazia per x

'C            G'
'Amazing grace how sweet'

  ↓ convert.ts, già scritto

'[C]Amazing [G]grace how sweet'
```

Su un PDF pulito il risultato è ottimo; su uno impaginato a mano è approssimativo — ed è
esattamente il caso per cui la preview modificabile esiste. **Ogni pagina è un brano**:
`splitSongs` tratta già il form feed come una separazione (`split.ts:52`), e con pdfjs il
confine di pagina è noto direttamente invece di essere dedotto.

### Il riconoscimento del dialetto

Una funzione pura `sniffDialect(text)`, chiamata **una volta per file**, che riconosce dal
contenuto:

| Dialetto | Impronta |
|---|---|
| OnSong | Metatag `Nome: Valore` in blocco **prima della prima riga vuota** — nessun altro formato lo fa |
| SongbookPro | `{textfill}` |
| MobileSheets | `{su:}`, `{gc:}` |
| ChordPro | il default, quando nulla combacia |

Ogni dialetto porta la propria tabella di mappatura direttiva→campo. Quando il dialetto è
`chordpro` (cioè: non riconosciuto), **le direttive ambigue si ignorano invece di
indovinare** — `{a:}` in un file che non si sa da dove venga non diventa né artista né
album. Ogni riga della tabella delle collisioni diventa un caso di test.

> **Con un'eccezione già in produzione, che va rispettata.** `DIRECTIVE_ALIAS`
> (`chordpro.ts:84-85`) mappa **oggi** `st` e `subtitle` su `artist`: sulla direttiva più
> contesa della tabella, Strumfolio segue già la convenzione **OnSong**, non la specifica
> ChordPro. La colonna «ChordPro (default)» della tabella di mappatura deve quindi
> rispecchiare **ciò che `chordpro.ts` fa adesso**, non ciò che dice la specifica: applicare
> lì la regola stretta della specifica sarebbe una **regressione su file che oggi si
> importano correttamente**. Vale la stessa verifica, prima di scrivere `dialect.ts`, per
> ogni altra riga della tabella delle collisioni: la tabella descrive il mondo, non questo
> repo, e dove i due divergono vince il comportamento già spedito. `a` invece non è
> aliasata da nessuna parte qui, quindi su quella la regola stretta è libera.

### I sette campi nuovi

Dei ~45 campi che i concorrenti trasportano, diventano colonne vere solo i dieci ad alta
resa — quelli presenti in **cinque o più formati**, quindi quelli che si riempiranno davvero
invece di restare vuoti. Titolo, artista e tag esistono già; le setlist non sono una colonna.
Restano sette:

```sql
-- migration 0032 (0031 è già occupata da booklet_footer)
ALTER TABLE "songs" ADD COLUMN "key" text;
ALTER TABLE "songs" ADD COLUMN "capo" integer;
ALTER TABLE "songs" ADD COLUMN "tempo" integer;
ALTER TABLE "songs" ADD COLUMN "time_signature" text;
ALTER TABLE "songs" ADD COLUMN "duration" integer;   -- secondi
ALTER TABLE "songs" ADD COLUMN "copyright" text;
ALTER TABLE "songs" ADD COLUMN "ccli" text;
```

Tutte nullable, nessun default: un brano scritto qui non ne ha nessuno, ed è giusto che si
distingua da uno importato che li dichiarava a zero.

**`songs.capo` non è `user_song_prefs.capo`, e i due si chiamano uguale.** La colonna che
esiste già (`db/schema.ts:551`, `notNull().default(0)`) è *la preferenza di questo lettore su
questo brano* — «dove ho messo il capotasto io» — e la nuova è *il capo che il file
dichiarava*, cioè un fatto del brano come è scritto. Finché vale «lettura invariata» nessuna
delle due si vede insieme all'altra e non c'è alcun bug; ma è esattamente la trappola contro
cui è costruito il ragionamento sulla tonalità qui sopra, e chi un domani vorrà «far servire
davvero il capo importato» troverà due colonne `capo` e nessuna riga che dica quale è quale.
Il commento della colonna nuova deve dirlo per esteso.

**La tonalità memorizzata non piloterà nulla.** `estimateKey` (`music/key.ts:103`) resta
l'unica verità per la lettura, in tutti e tre i punti che la usano — `SongSheet.tsx:82`,
`ControlBar.tsx:188`, `booklet/document.tsx:691`. La colonna `key` conserva ciò che il file
dichiarava, per l'archivio e per il ri-export, e basta. Il motivo è la deriva: basta che
qualcuno trasponga il corpo nell'editor dopo l'import e una colonna che pilotasse la lettura
mentirebbe, mentre la stima dagli accordi non può mai contraddire gli accordi che ha sotto
gli occhi. La regola dichiarata in `deduce.ts:9-12` — la tonalità non si memorizza per la
lettura — resta vera dove conta.

### Dove i sette campi si vedono

- **`toChoproFile` scrive le sette direttive** (`import/export.ts:28-36`, accanto alle
  otto che già scrive). Obbligatorio, non opzionale: l'export è il percorso di ripristino
  di questo repo, e un campo che entra ma non riesce si perde al primo giro.
- **`METADATA_DIRECTIVE`** (`deduce.ts:26-27`) va esteso alle sette, così restano fuori dal
  corpo esattamente come già fanno `{title}` e le altre — la ragione è la stessa scritta lì:
  una copia nel corpo non può essere né mostrata né esportata, e nell'editor visuale compare
  come un chip senza niente dietro.
- **`SongForm` guadagna un blocco richiudibile «Dettagli»** con i sette campi, chiuso di
  default. Visibili e correggibili: un dato che entra e non si può correggere è peggio di un
  dato scartato.
- **La schermata di lettura non cambia.** Resta la superficie che `DESIGN.md` protegge di
  più — nulla compete con gli accordi.

### I piani

- **Nessun campo nuovo in `PlanLimits`.** Importare resta gratis su ogni piano, formati dei
  concorrenti inclusi: mettere un pedaggio su chi sta migrando è tassare esattamente il gesto
  con cui una persona decide se restare.
- **Il cap si verifica prima di scrivere.** Oggi un archivio da 212 brani su un account Free
  verrebbe rifiutato dal brano 31 in poi, uno alla volta, 182 volte. Al suo posto una frase
  sola, prima che qualsiasi cosa venga scritta:

  > Il piano Free tiene 30 brani. Ne hai 4. Questo file ne porta 212: ne entrano 26.
  > **[Importa i primi 26]** **[Passa a Standard]**

  I conti ci sono già: `RepertoireCounts` e `LimitFacts` (`plans/types.ts`) portano quel che
  serve, e `PlanUpgradeModal` è già il posto dove l'invito all'upgrade vive.

---

## Come si costruisce

Un modulo puro per formato, ognuno col proprio file di test — è la forma che `npm test`
sa eseguire (`tsx --test` su moduli puri) e che `split.test.ts` / `deduce.test.ts` già
stabiliscono. `import/actions.ts` è `'use server'` e può esportare **solo funzioni async**
(vedi `CLAUDE.md`, e `plans/testCard.ts` come precedente): ogni riconoscitore o parser
sincrono vive in un file fratello normale.

```
src/lib/import/
  detect.ts          + detect.test.ts       ← quale formato è questo file
  dialect.ts         + dialect.test.ts      ← sniffDialect + le tabelle di mappatura
  formats/
    chordpro.ts                             ← già coperto da convert.ts
    opensong.ts      + opensong.test.ts     ← XML, DOMParser
    openlyrics.ts    + openlyrics.test.ts   ← XML
    songbookpro.ts   + songbookpro.test.ts  ← unzip + JSON
    docx.ts          + docx.test.ts         ← unzip + XML
    pdf.ts           + pdf.test.ts          ← dynamic import pdfjs, coordinate → righe
    archive.ts       + archive.test.ts      ← unzip, cartelle → sezioni
  prepare.ts                                ← stessa firma, tipo più largo
```

`prepareSongs` resta il punto in cui tutto converge: ogni parser nuovo ha il compito di
produrre testo che quella funzione già sa leggere, non di sostituirla. La sua **firma** non
cambia (`text → PreparedSong[]`); il suo **tipo** sì, perché i sette campi devono
attraversarlo.

### I sette campi attraversano otto tipi, non due

È la parte del lavoro che il blocco `ALTER TABLE` fa sembrare più piccola di quanto sia.
Ogni salto è un file che esiste già:

```
Deduced          deduce.ts:29-40        ← i sette letti dalle direttive
  → PreparedSong  prepare.ts:15-41       ← e mostrati nella preview
  → SongInput     import/types.ts:4-31   ← e mandati al salvataggio
  → saveSong / createSong                import/actions.ts
  → songs                                db/schema.ts
  → Song          data/types.ts:33-67    ← e riletti
  → snapshot()                           songbooks/snapshot.ts
  → lo strato offline che serializza Song
```

L'ultimo salto è quello da non sottovalutare: `Song` è ciò che viene cotto nella pagina e
ciò contro cui girano i confronti su `updatedAt` (il suo stesso commento,
`data/types.ts:57-66`, spiega perché). Allargarlo tocca lo snapshot offline, non solo il
form. **Stimare il punto 5 come «una migrazione più un blocco nel form» lo sottostima di
una decina di file.**

**Ordine consigliato**, per resa decrescente su costo crescente:

1. Allarga `FILE_TYPES` a tutte le estensioni ChordPro + `detect.ts`. Costo quasi nullo,
   copre subito LinkeSoft, Setlist Helper, BandHelper, SongSelect, e l'export ChordPro di
   OnSong e MobileSheets — cioè la maggioranza delle migrazioni reali.
2. `dialect.ts` con le collisioni e i loro test. Va prima dei parser dei concorrenti,
   non dopo: è ciò che impedisce loro di corrompere in silenzio.
3. `archive.ts` (zip → cartelle → sezioni) + `songbookpro.ts`. `fflate` è già in casa.
4. Il riepilogo sopra soglia e la verifica preventiva del cap. Servono prima che qualcuno
   droppi davvero 212 brani.
5. La migrazione 0032 e i sette campi lungo tutti e otto i tipi qui sopra, le sette
   direttive in `toChoproFile`, il blocco «Dettagli». **È il punto più grosso della lista**,
   nonostante sembri il più contenuto.
6. `docx.ts`.
7. `pdf.ts` — ultimo, è il più caro e il solo con una dipendenza nuova.

> **Prima di scrivere `songbookpro.ts`**: nessuna fonte documenta quale chiave del JSON
> contenga testo e accordi. Va messo in conto **uno smontaggio manuale** di un
> `.sbpbackup` vero prima di stimare quel parser.

> **Migrazione 0032 in produzione**: `vercel env pull --environment=production` restituisce
> segreti vuoti con questo token (vedi `CLAUDE.md`), quindi si applica dalla console SQL di
> Neon sul progetto **`songs-db`** — riga di journal inclusa, dentro `BEGIN`/`COMMIT`. Vedi
> la sezione dedicata in `CLAUDE.md` per l'hash e il timestamp. Va applicata anche
> separatamente a `songs-db-dev`: dal 2026-08-29 sono due database distinti che derivano.

---

## Decisioni

| Decisione | Scelta | Perché |
|---|---|---|
| Ambizione | Testo + archivi ZIP + PDF + Word; niente AI | Copre ogni formato realisticamente ottenibile; l'AI è l'unica che manderebbe il repertorio fuori dal server |
| Dove gira | Browser, un `await import()` per formato | Conserva la proprietà che la pipeline ha già — il testo non tocca il server prima del salvataggio — e tiene la rotta leggera |
| Rotta | Tutto in `/songbooks/[slug]/add` | Una porta sola da imparare; regge perché nessun import crea canzonieri |
| Struttura degli archivi | Appiattita: cartelle → sezioni, mai canzonieri nuovi | Salva la premessa «in questo canzoniere» e la regola già scritta in `prepare.ts` |
| Scala | Riepilogo + sole eccezioni sopra soglia; salvataggio a blocchi | Nessuno legge 212 righe, e 212 round-trip sequenziali sono un minuto d'attesa |
| Piani | Import gratis, cap verificato **prima** di scrivere | L'import è la porta d'ingresso; e una frase sola batte 182 rifiuti in fila |
| Metadati | Sette colonne vere: key, capo, tempo, time_signature, duration, copyright, ccli | Solo i campi presenti in ≥5 formati, cioè quelli che si riempiono davvero |
| Tonalità | `estimateKey` vince sempre; la colonna è solo d'archivio | Una colonna che pilota la lettura deriva alla prima trasposizione; la stima non può contraddire gli accordi che ha sotto |
| Superficie | Editor («Dettagli», chiuso) + ri-export; lettura invariata | Un campo invisibile è peggio di uno scartato, ma la schermata di lettura non compete con gli accordi |
| Dialetti | `sniffDialect` dal contenuto; ambigue ignorate se ignoto | `{a:}` è artista o album a seconda dell'app: indovinare corrompe in silenzio |
| PDF | pdfjs, riga ricostruita dalle coordinate x | Riporta il PDF dentro `convert.ts` senza una riga nuova; la preview copre l'errore |
| OnSong `.backup` | Non letto: rimando all'export ChordPro | 1 MB di wasm e uno schema non documentato per brani che l'export consegna già meglio |
| Guitar Pro, iReal Pro | Fuori piano | iReal Pro non ha testo; Guitar Pro non registra mai quale sillaba sta sotto quale accordo |
| OpenSong XML | Letto (costa poco), ma senza aspettative | Circola solo nel mondo della proiezione liturgica, assente dalle app per chitarristi |

---

## Questioni aperte

- **`flow` / arrangement.** È il campo strutturalmente più importante escluso: dice in che
  ordine si suonano le sezioni (`V1 C V2 C B C`), e quattro formati lo esprimono con quattro
  nomi diversi (`Flow` in OnSong, `presentation` in OpenSong, `sequence` in Planning Center).
  Fuori dai dieci ad alta resa, quindi oggi si perde. Da riconsiderare se Strumfolio
  acquisirà un concetto di sezioni ordinate nel brano.
- **Le setlist.** OnSong, SongbookPro, MobileSheets, BandHelper e iReal Pro le trasportano
  tutti; qui non c'è niente a cui mapparle (canzonieri e sezioni sono filing, non scaletta).
  Si perdono, senza un piano per recuperarle.
- **La conversione con AI.** Scartata per ora. Resta la sola via realistica per i PDF
  impaginati a mano e per le foto di uno spartito. Se un giorno rientra, il punto d'innesto
  è una server action che riceve il testo estratto — l'architettura scelta non la preclude,
  la rimanda.
- **PDF scansionati.** Fuori piano: senza uno strato di testo pdfjs non restituisce nulla.
  Serve OCR, che è un problema diverso.
- **La soglia del riepilogo.** Non fissata. Da tarare su un import vero; l'ordine di
  grandezza discusso era ~50.
- **La chiave JSON di SongbookPro** che contiene testo e accordi: non documentata da nessuna
  fonte. Uno smontaggio manuale di un `.sbpbackup` reale, prima di stimare quel parser.
- **`.onsongarchive`.** Nessun parser pubblico esiste, eppure SongbookPro e OpenSongApp lo
  importano entrambi: è opaco per incuria, non per crittografia. Se un giorno qualcuno lo
  smonta, il costo di supportarlo crolla.
- **L'unità di `duration`.** Assunta in secondi. Da confermare contro ciò che i formati
  scrivono davvero prima della migrazione 0032.
- **Le altre righe della tabella delle collisioni, confrontate con `DIRECTIVE_ALIAS`.** La
  verifica è stata fatta per `st`/`subtitle` (già aliasate su `artist` qui) e per `a` (non
  aliasata). Le restanti — `cb`, `book`, `k`, `ok`, `su`, `f`, `gc`, `chorus` — vanno
  confrontate una per una con `chordpro.ts:81-110` prima di scrivere `dialect.ts`: dove il
  repo e la specifica divergono, vince ciò che è già spedito.
- **Ultimate Guitar.** Non ha export a nessun livello: l'unica via resta «Incolla». Vale la
  pena di riconoscere il suo `[ch]…[/ch]` nel campo incolla, che è a costo quasi nullo.
