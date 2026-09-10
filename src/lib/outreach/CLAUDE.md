# Outreach (`src/lib/outreach/`) — what the platform does *to* a reader, and doing it once

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

Everything else in this repo is something a reader does; this is the one thing the platform
does to them. A birthday greeting, an upgrade offer carrying a voucher, whatever joins them:
the engine is written and **no action this panel can run is built yet** — `HANDLERS` is still
all `null`, the state it was deliberately left in, and the two kinds declared beside it exist
so the shape of a definition answers to a real example.

One message does go out, and it is the exception the first bullet below is about:
`gift_notice` is composed and sent from `/accounts/[email]`'s Plan & gift tab and only
*recorded* here. So «nothing is built» is true of the panel and false of the table.

- **One kind is recorded here and not run from here.** `gift_notice` carries
  `trigger: 'elsewhere'`: the moment belongs to the Plan & gift tab, where an operator gives a
  plan by hand, and `sendGiftNotice` (`accounts/actions.ts`) claims and settles its row itself
  because the message carries two fields somebody typed a moment earlier — a handler is called
  with an `OutreachTarget` and nothing else, and widening that for one caller would put an
  optional payload on every action. Three consequences worth not re-deriving:
  `outreachViewFor` draws **no line** for such a kind (its occurrence key comes from
  `giftOccurrenceKey`, not from a cadence, so a line would never match its own rows and would
  read «nothing claimed yet» beside a message already sent) — the rows appear as *history*;
  `eligibilityFor` therefore never runs for it, which is what keeps **`consentGate` from
  refusing a transactional message** — a gift notice is on the same footing as `purchaseEmail`,
  and the newsletter does not govern it; and `HANDLERS.gift_notice` stays `null` as a fence, so
  nothing can ever run it with an empty subject.
- **The claim is an insert, and it happens before anything is sent** (`claim.ts`, extracted
  from `run.ts` once `sendGiftNotice` became its second caller — the half that must not be
  written twice is not the insert but `claimVerdict`, since there are **two** unique indexes
  and only a row pointing at *this* account may be taken over). That single
  ordering is the whole guarantee: a read-then-write has a window as long as a delivery, and
  two runs inside it both send. The unique indexes on `outreach_actions` answer «has this been
  done» inside one statement instead.
- **`occurrenceKey` is what makes a recurring action expressible**, and it is minted by one
  pure function (`occurrence.ts`): `'2026'` for a yearly cadence, `'once'` for a one-shot. It
  is a **year and not a date** on purpose — a day-shaped key would let a yearly action out
  twice within two hours around local midnight, since two runs either side of it would name
  different occurrences. Read in UTC, like every other date this repo prints.
- **Only `status = 'done'` is terminal.** `failed`, `suppressed` and a `pending` row left by a
  process that died are all retried *in place*, on the same row, by an operator. So the promise
  is exactly «a completed action is never completed twice» — the alternative, treating every
  claimed row as final, turns one bad afternoon into an occurrence silently cancelled forever
  with a row on file saying it was handled.
- **`suppressed` is a first-class outcome**, not a missing row: «we were allowed to and chose
  not to» and «nothing has happened here» are opposite answers, the distinction
  `rateLimitStatusFor` already refuses to collapse. A skip claims the occurrence exactly as a
  send does, so it is as binding as one until somebody presses `Run anyway`.
- **An unreadable newsletter preference refuses** (`eligibility.ts`, `consentGate`). This is
  the one place that inverts `readBooleanSetting`'s stated direction, and the inversion is the
  point: what quietly happens if a null reads as `true` is marketing mail sent without verified
  consent. Only the `email` channel asks at all — an in-app notice is not marketing mail.
- **Eligibility is computed at every read, never stored**, the `campaignStatus` /
  `resolveSubscription` rule. Consent is withdrawn between occurrences, accounts are suspended
  between them, plans lapse between them; a stored `eligible` column would need the
  reconciliation job this repo has nowhere to put.
- **The audience rule this engine owns is a plan question and nothing finer.** «This month's
  sign-ups», «readers who lapsed twice» belong to a handler: those change with the campaign,
  and as enum members they would grow `OUTREACH_AUDIENCES` once per campaign and never shrink
  it. The plan asked about is `planStateFor`'s **effective** one, so a gifted Premium is a
  Premium here.
- **Two account columns, and the email one must never be added to `changeAccountEmail`.**
  `accountId` is the pointer (nullable, `ON DELETE SET NULL`); `account_owner_email` is
  history, written once. An action carrying a voucher must not be farmable by deleting an
  account and signing up again, which is what the email index closes and the pointer's index
  cannot. `claimVerdict` is where that becomes behaviour: a conflict caused by the address
  alone is reported `already-done`, and only a row pointing at *this* account may be taken
  over.
- **Nothing runs on a schedule, and that is not an oversight.** `runDueOutreach` is a plain
  seam that takes an address and a `triggeredBy`, with no session check in it; its only caller
  today is the button on `/accounts/[email]`'s Outreach tab. A cron route or a hook on sign-in
  would loop accounts and call it per account, and nothing in `run.ts` or `read.ts` has to
  change for that — but adding one starts sending mail to real people on a clock, so it is a
  decision and not a follow-up.
- **`STALE_ATTEMPT_MS` (15 minutes, in `types.ts`) is where the ordering's one cost is paid.** A
  `pending` row younger than that is refused with `in-flight` rather than taken over — the only
  path by which this engine could send twice. Older, and it is offered to an operator as a
  retry, because a settle write that failed after a successful send leaves exactly that row and
  only a person can tell whether the message landed. Two consequences that are easy to get
  backwards: **a skip is still allowed inside the window** (it takes the row over — a live
  attempt is the most likely moment somebody wants to stop the next one), and the screen carries
  the window as `OutreachLine.inFlight` so the run button is *disabled* rather than offering
  something the action would refuse. The constant lives with the vocabulary and not in `run.ts`
  because `read.ts` needs it too and cannot import `run.ts`.
- **`types.ts` imports no `@/lib/db` and carries no `'use server'`**, the `coupons/types.ts`
  arrangement: the panel value-imports it, and a `'use server'` module may export only async
  functions. `actions.ts` is the only module here that checks a session, and it re-checks
  `isOwner` in every one of its four exports — a server action is reachable by anything holding
  a cookie.

## Adding an action

A definition in `OUTREACH` (`types.ts`) and a handler in `HANDLERS` (`handlers.ts`). Nothing
else: no migration, no change to the engine, no new screen — the account tab draws whatever the
registry declares. `HANDLERS` is a `Record` over `OutreachKind` so a kind added without a
decision about its handler does not compile.

A handler is called **after** the claim and exactly once, so it never has to be idempotent and
never has to ask whether it has run before. What it must do is answer truthfully: `ok` means the
reader was reached, and no code path anywhere undoes a `done` row.

The two declared kinds each say what they are still missing, in the definition's own `missing`
field, because the operator reading that row on screen is who would supply it — no date of birth
is stored anywhere for the greeting, and the offer has no campaign chosen and no email written.
