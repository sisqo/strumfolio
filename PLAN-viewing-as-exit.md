# Personificazione: un controllo sempre visibile per tornare all'account admin — piano

> Documento a sé, non una sezione di `PLAN.md`: quella tabella è il registro delle
> decisioni già *consegnate e in produzione*, e questa feature non è ancora scritta.
> Quando è chiusa, va ripiegata lì come una nuova sezione di versione — verificare
> l'ordine di fold-in reale al momento (altri `PLAN-<feature>.md` potrebbero essere
> stati consegnati nel frattempo), non assumere che il numero di versione successivo
> sia libero. Precedente diretto per la meccanica toccata (non per la forma del
> documento): `PLAN-account-admin.md`, che descrive lo stesso `switchAccount` e lo
> stesso `mayAccess` di cui questa feature si serve, invariati.

## Cos'è

Un global owner può già entrare nell'account di un altro utente: `/accounts/[email]`
→ "Enter as this account" → `switchAccount(ownerEmail)` (`src/lib/accounts/actions.ts`)
scrive un cookie (`current.ts`) e reindirizza a `/`. Da quel momento `currentUser()`
(`src/lib/auth/session.ts`) risolve `accountOwnerEmail` diverso da `email`, e
`TopBar` (renderizzata su ogni schermata autenticata dell'app, songbook e lettura
canzoni incluse) mostra oggi `ViewingAsPill` — un semplice `<span>` di testo,
"Viewing: <email>", senza alcuna azione collegata.

Per tornare al proprio account admin, oggi l'unica strada è navigare di nuovo su
`/accounts/<propria email>` e cliccare lì "Enter as this account" — nessuna
scorciatoia. La richiesta: finché si sta guardando l'account di qualcun altro, deve
essere sempre visibile un controllo che riporti immediatamente all'account admin,
senza dover ripassare da `/accounts`.

## Cosa cambia, risolto nell'intervista

- **Il controllo sostituisce il pill di testo, non si aggiunge accanto**: niente
  bottone separato che lascia "Viewing: X" come semplice etichetta — un solo
  elemento cliccabile, per non aggiungere ulteriore ingombro a una barra che i
  commenti di `TopBar.tsx` descrivono già come stretta su schermo di telefono.
- **Aspetto: un tondo con le iniziali del cliente** (`avatarInitials`,
  `src/lib/avatar.ts`), stesso meccanismo del monogramma che `UserMenu` già usa per
  il proprio account — non più un pill di testo con l'indirizzo per esteso.
- **Colore: sfondo `--danger-soft`, testo `--danger`** (non un fill pieno con testo
  bianco) — non uno dei sei `--avatar-N` deterministici che coloreranno
  normalmente quello stesso indirizzo altrove. Deliberatamente diverso dal proprio
  avatar e da qualunque avatar "normale": è quel disallineamento cromatico a dire
  "non è il tuo account", non il testo. La coppia soft/on-soft è obbligata, non
  solo stilistica: a differenza dei sei `--avatar-N` (mai ridefiniti per tema,
  `globals.css` righe 95-104), `--danger` **cambia** in dark mode (`#9d2820` →
  `#ff9a90`, riga 182) — un fill pieno con testo `#fff` sarebbe illeggibile in
  quel tema (~1.6:1 di contrasto). `--danger-soft`/`--danger` è la stessa coppia
  già usata da `notice-error` e dal pill di oggi (`accent-soft`/`accent`), corretta
  in entrambi i temi senza introdurre alcun token nuovo.
  Il commento che oggi motiva `.viewing-as-pill` (`globals.css` righe 5364-5371,
  "this is not a warning... keeps a real control (Switch) from reading as a bug")
  argomenta esplicitamente per `--accent-soft`/`--accent` invece di
  `--danger-soft`/`--danger` su questo stesso elemento — quella scelta è superata
  da questa decisione (l'utente ha chiesto proprio un colore d'attenzione), e va
  riscritto insieme al codice, non lasciato a contraddire ciò che finisce per
  essere spedito.
- **Posizione: accanto al proprio avatar**, in fondo alla barra subito prima
  dell'apertura di `UserMenu`/hamburger — non più subito dopo il logo, dove vive
  oggi `ViewingAsPill`. Il confronto "questo cliente, non io" deve stare dove
  l'admin guarda per aprire il proprio menu, i due tondi fianco a fianco.
- **Destinazione dopo il click: riusa `switchAccount(email)` invariato**, stesso
  redirect a `/` che già usa "Enter as this account" — non un redirect mirato su
  `/accounts/[email]` del cliente. Stessa logica già scritta nel commento di
  `switchAccount`: la schermata aperta appartiene all'account che si lascia, non ha
  motivo di esistere su quello in cui si entra; vale allo stesso modo in uscita.
- **Conferma richiesta esplicitamente prima dello switch** — scelta in
  controtendenza con il resto dell'app (`SuspendAccountButton`, `EnterAccountForm`
  agiscono già al primo click, senza dialogo, perché reversibili in un click in
  più), ma voluta qui: il tondo è piccolo, vive in un angolo affollato della barra
  vicino ad altri controlli, e uno switch accidentale toglierebbe di scena l'account
  del cliente senza preavviso. Meccanismo: `window.confirm()` nativo, stesso pattern
  già in uso in `src/components/editor/UnsavedGuard.tsx` ("There are unsaved
  changes. Leave anyway?") — non un nuovo componente di dialogo.
- **Nessun testo visibile aggiuntivo** ("Exit to admin" o simili) nel componente:
  l'azione si segnala col colore d'attenzione e si spiega in `title`/`aria-label`
  (letto al passaggio del mouse o da uno screen reader), non in un'etichetta
  permanente — coerente con `.avatar-button` accanto, che è anch'esso solo un
  monogramma senza testo.

## Impianto — dove si aggancia

1. **`src/components/ViewingAsPill.tsx`** (nome file da rivalutare in fase di
   implementazione, es. `ImpersonationExit.tsx` — dettaglio di codice, non di
   prodotto): resta `'use client'`, legge `known`/`email`/`accountOwnerEmail` da
   `useRole()` come oggi, stesso `return null` quando i due indirizzi coincidono o
   l'identità non è ancora nota. Cambia il render: da `<span>` a `<button>` —
   diventa interattivo, quindi deve essere un elemento realmente cliccabile/
   accessibile da tastiera, non uno `<span>` con `onClick`.
   - `onClick`: `window.confirm(...)`; se confermato, chiama `switchAccount(email)`
     (già esportata da `@/lib/accounts/actions`, nessuna nuova server action).
   - Stato `busy` (via `useState`) per evitare doppio click mentre la redirect è in
     volo, e `disabled` quando `!useOnline()` — stesso schema già seguito da
     `ForceExpireButton`/`SuspendAccountButton` per ogni azione admin che dipende
     dalla rete.
   - `title`/`aria-label` con l'indirizzo per esteso e l'azione ("Viewing
     <email> — click to exit to admin" o simile; il testo esatto lo scrive la
     sessione di implementazione, non bloccante).
2. **`src/components/TopBar.tsx`**: sposta il punto in cui viene renderizzato —
   da subito dopo il blocco `<Link className="brand">` a subito prima di
   `<UserMenu>` (i.e. appena prima dell'apertura del proprio avatar). Il
   componente resta autosufficiente (legge da `useRole()` lui stesso): è solo
   una questione di dove sta la riga JSX, nessuna nuova prop da passare.
3. **`src/app/globals.css`**: nuova regola per il tondo (es. `.viewing-as-avatar`)
   che riusa dimensioni/forma di `.avatar-button` (2.5rem, `border-radius:
   var(--r-pill)`, stesso `font-size`/`font-weight` del monogramma) ma con
   `background: var(--danger-soft)` e `color: var(--danger)` al posto di uno dei
   sei `--avatar-N` (vedi rationale sul contrasto in dark mode sopra). La vecchia
   regola `.viewing-as-pill` va rimossa — verificare prima con un grep che nessun
   altro file la referenzi ancora — e il suo commento (righe 5364-5371, che
   argomenta per `--accent-soft`/`--accent`) va riscritto per la nuova scelta
   invece di lasciato a contraddirla.
4. **Nessuna migrazione DB, nessuna nuova server action**: la feature riusa per
   intero `switchAccount`/`mayAccess`/`avatarInitials` così come sono oggi.

## Domande aperte

- **`window.confirm()` in PWA standalone**: `UnsavedGuard.tsx` è un precedente
  reale nel repo, ma copre un momento raro e deliberato (uscita da un editor).
  Questo controllo vive su ogni schermata, lettura canzoni inclusa, spesso aperta
  in modalità standalone su iOS — dove alcune versioni sopprimono `confirm()` del
  tutto. Se soppresso, il click non fa nulla in modo silenzioso: il controllo resta
  visibile (il requisito dell'utente è soddisfatto) ma non funziona. Non cambia la
  decisione — l'utente ha chiesto esplicitamente una conferma — ma se in
  implementazione emerge questo comportamento, il fallback pronto è una conferma
  "a due click" sul bottone stesso (primo click arma, mostra brevemente un secondo
  stato tipo "Confirm exit?", secondo click entro pochi secondi esegue), riusando
  lo stato `busy` già previsto invece di un `window.confirm()` che può risultare
  inerte.
- **Testo esatto di `window.confirm()` e di `title`/`aria-label`**: non fissato in
  questa intervista, lasciato alla sessione di implementazione — nessuna delle due
  cose cambia la meccanica del controllo, solo la copy.
- **Icona**: nessuna. Scartata implicitamente scegliendo il monogramma a iniziali
  al posto di un'icona (`IconExit`/`IconUndo`, già presenti in `icons.tsx` ma non
  usate qui).
