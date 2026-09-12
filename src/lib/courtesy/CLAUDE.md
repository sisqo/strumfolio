# Courtesy emails — legitimate interest, per-account, and their own unsubscribe

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

Two messages, `courtesy_thanks` ("A thank-you and a question") and `courtesy_checkin`
("Anything you need?"), sent by an operator's own click, one account at a time, from icons on
`/accounts` — never on a schedule, never to more than one address per click. Both are declared
in `lib/outreach/types.ts` (`OUTREACH_KINDS`) with `trigger: 'elsewhere'`, exactly like
`gift_notice`, and both keep `HANDLERS` entries `null` in `lib/outreach/handlers.ts` for the
same reason: the send is composed here, not run through `runOutreach`.

- **Legitimate interest, not newsletter consent — the whole reason this directory exists
  separately from the engine it uses.** `lib/outreach/eligibility.ts`'s `consentGate` refuses
  any `email`-channel action unless `newsletter_prefs.subscribed` is `true`, refusing on `null`
  too. New accounts start unsubscribed by default (`RegisterForm`'s checkbox, and every Google
  sign-up since 2026-09-03), so routing these two through that gate would refuse nearly every
  reader `courtesy_thanks` is written for. `trigger: 'elsewhere'` keeps `eligibilityFor` from
  ever running for either kind — the same mechanism that already lets `gift_notice` bypass a
  gate built for marketing mail, extended to a second case. Because of this, the Privacy
  Policy's own processing-purposes table carries a row for these two under Art. 6(1)(f), not
  under the consent row the newsletter uses.
- **These two carry no design at all, and that is load-bearing rather than a style.** They are
  the only templates in `lib/email/templates.ts` that do not go through `layout()`: no wash, no
  card, no lockup, no payoff footer, no heading — and below that not one `style` attribute, so
  the text inherits whatever font the client reads mail in. The helper is `plainMessage()`,
  written beside `layout()` so the choice between the two is visible in one screen; the whole
  argument, the accepted costs (Outlook may pick a serif, and long lines on a wide window,
  since no `max-width` is declared either) and the refusal of a `List-Unsubscribe` header are in
  `courtesyThanksEmail`'s own header. Five tests in `templates.test.ts` hold the line, because
  nothing about `layout()` makes it look wrong to wrap these two in it "for consistency" with
  the six templates around them. The opt-out line moved into the body's own voice at the same
  time — same size, same ink, last line of both halves — for the same reason: small grey type
  is the one thing left in a message that announces a machine wrote it.
- **`accounts.courtesy_opted_out_at` is the gate that actually governs these two, and it is
  checked here, in `actions.ts`, never by the engine.** A dedicated column rather than the
  newsletter's, because unsubscribing from one must say nothing about the other — a reader who
  opts out of these two founder notes has not touched their newsletter preference, and vice
  versa.
- **`courtesy_checkin` refuses unless `courtesy_thanks` already has a `done` row for the same
  address** (`thanksAlreadySent`, `actions.ts`). Its own copy says "still Francesco" and "a
  second and last time" — both false for an address that never received the first message. This
  is enforced server-side, not only by the icon's disabled state on `/accounts`: the UI is a
  courtesy, the check in `sendCourtesyCheckin` is the actual fence.
- **The unsubscribe link (`unsubscribe.ts`) is stateless by design.** No table, no expiry: an
  HMAC-SHA256 of the normalized address, keyed by `COURTESY_UNSUBSCRIBE_SECRET` — a **dedicated**
  env var, never `AUTH_SECRET`. A link that must never die should not share a lifetime with a
  secret that has every reason to rotate. The cost, accepted on purpose: not revocable per
  address, only by rotating the secret for everyone.
  - **`COURTESY_UNSUBSCRIBE_SECRET` must exist in Vercel Production (and `.env.local` for local
    work) before this feature can actually send.** It does not exist in either place by default.
    A missing secret makes `courtesyUnsubscribeToken` throw, which both send actions catch
    *before claiming anything* and report as `'no-secret'` — the same before-the-claim
    discipline `runOutreach` already applies to a kind with no handler. This is deliberate: a
    link signed from an empty or fallback value would verify against nothing, and the send would
    still settle the row `done`, permanently burning the occurrence for a message whose
    unsubscribe link can never work.
  - **`confirmCourtesyUnsubscribe` (`publicActions.ts`) is deliberately its own file, never
    merged into `actions.ts`.** It is the one server action in this whole app a signed-out
    stranger is meant to call — the token is the authorization, not a session — and keeping it
    apart from the owner-gated sends is what stops a future edit giving it an `isOwner` check by
    habit, which would lock every reader out of their own unsubscribe link.
- **`/courtesy-unsubscribe` reads on GET, writes only on an explicit tap**, the rule this repo
  states for `/verify` and `/reset-password`: a corporate mail scanner follows every link in a
  message before a person sees it, and a GET that wrote would opt out an account nobody but the
  scanner ever visited. It is listed in `publicRoutes.ts` — session-free, not indexable, outside
  the app — the same three-question shape every session-free page there answers.
- **`lib/courtesy/read.ts`'s `listCourtesyStatus` groups by `account_owner_email`, never by
  `account_id`.** `claimVerdict`'s rule 2 (`outreach/claim.ts`) treats a row matching only by
  address, with no matching account id, as `already-done` — the guarantee that stops a voucher
  or a message being farmed by deleting an account and signing up again. Reading this list by
  `accountId` instead would show an icon as "not sent" for an address the send action would
  actually refuse: the screen would lie in exactly the way `OutreachLine.inFlight` was built to
  prevent, in a new place.
- **A `failed` or a stale `pending` row reads as "not sent," never as "sent."** Clicking the icon
  again is what re-enters `claimOccurrence`'s compare-and-swap and retries it — the same
  behaviour `sendGiftNotice`'s own retry already relies on. Only `status = 'done'` lights the
  icon.
- **Testing burns the occurrence.** With no `RESEND_API_KEY` (this machine's `.env.local`
  default), `deliverEmail` reports `{ ok: true }` locally and the send settles `done` — which
  then permanently refuses a real send to that same address, by design (the anti-farming rule
  above). Test against a single-use throwaway account on `strumfolio-db-dev`, never a real
  address, and never reuse the address across test runs: `removeAccountAndContent` does not
  delete `outreach_actions`, so the row (and the refusal) outlives the deleted account.
