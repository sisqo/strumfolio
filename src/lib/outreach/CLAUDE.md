# Outreach (`src/lib/outreach/`) — what the platform does *to* a reader, and doing it once

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

Everything else in this repo is something a reader does; this is the one thing the platform
does to them. A birthday greeting, an upgrade offer carrying a voucher, whatever joins them:
the engine is written and **`birthday_greeting`/`upgrade_voucher` are not built** — their
`HANDLERS` entries are `null`, the state they were deliberately left in, and both are declared
so the shape of a definition answers to a real example rather than to prose alone.

**Three kinds go out for real, and none of them runs through this engine's own dispatch.**
`gift_notice` is composed and sent from `/accounts/[email]`'s Plan & gift tab;
`courtesy_thanks`/`courtesy_checkin` (`lib/courtesy/`) are composed and sent from icons on
`/accounts`' list. All three are only *recorded* here — `outreach_actions`, the claim/settle
path in `claim.ts` — and all three carry `trigger: 'elsewhere'` and a `null` handler for the
same reason: each has a refusal `runOutreach` cannot express (a gift not yet given, an address
opted out, a check-in with no thank-you sent first), and a handler is called with an
`OutreachTarget` and nothing else, by design. So «nothing is built» is true of `HANDLERS` and
false of the table — for three kinds now, not one.

**And since 2026-09-11 nothing calls the engine at all.** `OutreachPanel` was redesigned to the
mock, which draws that tab as a log and nothing else, so `runOutreachNow`, `skipOutreach` and
`runEverythingDue` have no caller anywhere in the app. They stay exported on purpose — they are
what a schedule would call, which is the whole shape this directory was built to, and they
re-check `isOwner` themselves — but read every sentence below about «an operator presses» as
describing a capability with no button left. The one that is now unreachable rather than merely
unbuilt is **`skipOutreach`**: `suppressed` is a first-class outcome this deploy can still store
and no longer offers any way to write.

- **Three kinds are recorded here and not run from here — `gift_notice`, `courtesy_thanks` and
  `courtesy_checkin`, all carrying `trigger: 'elsewhere'`.** The moment for `gift_notice`
  belongs to the Plan & gift tab, where an operator gives a plan by hand; the moment for the two
  courtesy kinds belongs to icons on `/accounts`' own list. Each of the three composes its own
  message and claims/settles its own row (`sendGiftNotice` in `accounts/actions.ts`;
  `sendCourtesyThanks`/`sendCourtesyCheckin` in `lib/courtesy/actions.ts`) rather than going
  through `runOutreach` — a handler is called with an `OutreachTarget` and nothing else, and
  each of these three needs something that shape cannot carry: two operator-typed fields for
  the gift, an opted-out check and a "thank-you sent first" ordering for the courtesy pair.
  Widening the handler signature for three callers with three different extra needs would put
  an optional payload on every action this engine will ever have. Consequences worth not
  re-deriving: `outreachViewFor` draws **no line** for any `elsewhere` kind (`gift_notice`'s
  occurrence key comes from `giftOccurrenceKey`, not a cadence, so a line would never match its
  own rows and would read «nothing claimed yet» beside a message already sent) — their rows
  appear as *history*; `eligibilityFor` therefore never runs for any of the three, which is what
  keeps **`consentGate` from refusing a transactional or legitimate-interest message** — see
  `lib/courtesy/CLAUDE.md` for why that matters more for the courtesy pair than it ever did for
  the gift notice; and each `HANDLERS` entry stays `null` as a fence, so none of the three can
  ever be run by anything but its own dedicated action.
- **The claim is an insert, and it happens before anything is sent** (`claim.ts`, extracted
  from `run.ts` once `sendGiftNotice` became its second caller and now shared by two more — the
  half that must not be written twice is not the insert but `claimVerdict`, since there are
  **two** unique indexes and only a row pointing at *this* account may be taken over). That
  single ordering is the whole guarantee: a read-then-write has a window as long as a delivery,
  and two runs inside it both send. The unique indexes on `outreach_actions` answer «has this
  been done» inside one statement instead.
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
  send does, so it is as binding as one until it is deliberately taken over — which `claimVerdict`
  still allows and, since the panel became a log, no screen still asks for.
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
  arrangement: the panel value-imports it for its labels, and a `'use server'` module may export only async
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
