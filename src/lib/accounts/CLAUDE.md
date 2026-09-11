# Accounts admin, names and the newsletter

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

- **`/accounts/[email]` is the admin surface** — a read-only summary strip over five tabs, all
  five now the mock's own (`Account Detail.dc.html`, redrawn 2026-09-11: Identity, Plan & gift,
  Payments, Outreach, Security, in that order). Outreach postdated the *first* handoff and its
  absence from that one was never a deviation to reconcile; the current mock draws it. The tab
  is a URL param (`?tab=`), not client state, which is what keeps the page a server component
  and the «All N events» link a link; the strip above the tabs holds no control at all.
  Newsletter is **read-only** there (`loadNewsletterSummaryFor`); the name *is* admin-editable,
  while `/profile` is the reader's own self-service page for it.
- **The strip is two halves and only the left one is an answer.** The tinted `.acct-force` panel
  states the plan in force and the gift queued behind it; the seven `.acct-cells` beside it are
  facts checked against that. Three of those seven — Status, Last sign-in, Rate limit — came up
  out of the Security tab in the redesign, and that is the point of it: reading whether an
  account is suspended used to mean opening the one tab that also holds the password field and
  the delete row. **The Security tab is now controls only**, which is why it is drawn last.
- **The Outreach tab is a log now, and nothing else** (decided 2026-09-11, matching the mock).
  Its `Run now` / `Skip` / `Run everything due` rows are gone, so `OutreachPanel` is a server
  component holding the mock's four-column table and no control. The rows cost little to lose —
  `HANDLERS` is all `null`, so each button could only answer «not built yet», and the one
  message that really goes out (`gift_notice`) is sent from the Plan & gift tab, which keeps its
  «Send the notice». `skipOutreach` is what genuinely went: `suppressed` is still storable and
  no longer writable from anywhere. See `lib/outreach/CLAUDE.md`.
- **The Outreach tab is the only reader of `lib/outreach/`**, and since it stopped triggering
  anything it is the only caller of it at all — `loadOutreachFor` is the one function of that
  directory this app still invokes. That subsystem's own `CLAUDE.md` carries the rules; the two
  that reach into this directory are that the newsletter preference is a **consent gate** for
  any email-channel action (an unreadable one refuses), and that `accounts.suspended_at` blocks
  outreach as well as sign-in. Both still hold — they are computed on every read — but nothing
  on this screen can act on what they answer.
- **The Payments tab holds two ledgers, not one**: what this account paid
  (`PaymentHistoryTable`) and which coupons it was ever *shown* (`CouponsSeenCard`, from
  `lib/coupons/views.ts`). The second is there so a reminder about an unused coupon is a
  decision somebody can take from this screen; its rules are the coupons directory's own.
- **Every sentence about a plan lives in `planText.ts`**, the list's and the detail page's
  alike — `rowStatus` is literally what the detail page's In force panel prints under the plan
  name, and `giftCell` the clause after «gifted,» in the line below it. A second spelling of "what does this subscription say" on one of the two screens is
  the drift that module exists to prevent.
- **A read that failed renders «—», never a reassuring value.** `rateLimitStatusFor` answers
  null and the Rate limit cell shows a dash rather than «Not hit»; the Status cell does the
  same when `admin` is null. "Nothing is wrong" and "could not tell" are opposite answers on
  the one screen built to be believed. **The rule got wider when the strip split Content into
  three counted cells**: a failed `usageSummaryFor` must print three dashes and not three
  zeroes, since «0 songbooks» is a sentence about an empty account. The mock draws only the
  happy path for all seven cells, so a literal match of it silently drops every one of these
  branches — check them before checking anything cosmetic.
- **Creating an account by hand is back on `/accounts` (2026-09-11), and the reason is the
  quirk at the foot of this file.** v3.8 removed it as covered by self-service registration,
  which is true of everybody who *asks* for an account and was never true of the two cases left:
  the pre-`02ac495` repair that ends «delete and recreate the account from the Accounts admin
  page», whose second half had been impossible since, and an address that will never find the
  registration form. `createAccount` mirrors `confirmPendingRegistration` **minus the Telegram
  notice** — nobody needs telling about the account they are creating with their own hands,
  which is why the root `CLAUDE.md`'s «three callers» of `registrationNotice` is still three —
  and **plus a password**, which the confirmation path inherits from the pending row and this
  one has nowhere to get. The password is optional, and empty is an answer: `PasswordForm` and
  `SendResetEmailRow` on the detail page are the rest of it, and Google needs none. A pending
  registration on the address is **refused, never absorbed** — `Confirm now` is a button below
  on the same screen and keeps the password the person actually chose. **`already-exists` is
  guarded on the `accounts` row alone**, and not on the three tables `changeAccountEmail` checks
  before a rename: `removeAccountAndContent` never deletes `signIns`, so guarding on that one
  would refuse the second half of «delete and recreate» for every account that ever signed in —
  which is every account the quirk affects. No newsletter opt-in, for
  2026-09-03's reason: an operator cannot give that consent on somebody else's behalf.
  `Accounts.dc.html` draws no such control, and that is the mock predating the decision rather
  than a deviation to reconcile.
- **`confirmPendingRegistration` is an attribution seam, not only a provisioning one.** It calls
  `provisionAccount` itself, so it must also call `freezeLeadAttribution` — without it every
  account created from this screen keeps a null pointer and disappears from every attribution
  read, all of which ask by the id. It must **not** read the attribution cookie: this code runs in
  the operator's browser. **`createAccount` is the fifth seam** on those same two rules, and the
  only one that ordinarily finds nothing to freeze. See `lib/attribution/CLAUDE.md`.
- **`PLAN_COLUMNS`, `PlanRow` and `storedPlanFrom` live in `planColumns.ts`, not in `read.ts`.**
  `read.ts` is `'use server'` and may export only async functions, so a synchronous mapper
  exported from it compiles clean under `tsc --noEmit` and then fails at `next build` with
  "Server Actions must be async functions" — the `testCard.ts` arrangement the root `CLAUDE.md`
  describes. `/leads`' rollup is the third caller of that one definition.
- **Giving a gift offers to tell the reader, and that is a second action, never part of
  `setGrant`.** The gift is written first; `GiftNoticeModal` then opens over the saved state,
  so dismissing it, going offline or a refused send all leave the account exactly as set. Four
  rules hold it together, and each is cheap to break from a distance:
  - **The modal opens only on a change the reader gains by** (`worthAnnouncing`, in
    `giftNotice.ts`) **and only when the gift is not inert.** A corrected reason, a shortened
    date and a lower plan all save in silence. `setGrant` rewrites `granted_at` on every save,
    so "did the row change" is not the question.
  - **The `before` snapshot must be taken before awaiting `setGrant`.** `run()` ends in
    `router.refresh()`, which hands the component a `plan` prop already carrying the new gift;
    read after, the comparison is the gift against itself and the modal never opens.
  - **The operator types a subject and one optional line, and nothing else.** Which plan and
    until when are re-read from the row by `sendGiftNotice`, so no call can announce a plan the
    account does not hold. The line is escaped into the HTML and raw in the text
    (`feedbackEmail`'s split); **the subject is a header and is never escaped**. Never
    prefill the line from `granted_note` — those chips («Refund», «Beta tester») are audit.
  - **`source === 'grant'` is the one predicate on both sides**: `giftActive(plan)` hides the
    gift card head's «Send the notice», and `sendGiftNotice` refuses `nothing-to-announce` on
    the same answer. The head deliberately does **not** say whether the notice went out; a
    second press is answered by the unique index, through `already-sent`.
- **Suspending an account blocks future sign-ins only** — sessions already issued stay valid.
- **Clearing a rate limit clears the by-email keys, never the by-IP ones.**
- **`forceExpireNow(ownerEmail)` takes the address explicitly**, checking `isOwner` inside; it
  deliberately does not reuse the cookie-scoped self-service path.
- **`ViewingAsPill` (`TopBar.tsx`) is the real exit control** for impersonation, not a label;
  `SwitchAccountButton` performs the same three steps with a different `targetEmail`. A guest's
  own copy of a control must never be able to broadcast into the owner's session.
- **`firstName`/`lastName` are separate, nullable, filled only when missing and never a gate.**
  Google supplies `given_name`/`family_name`, falling back to `splitName`
  (`src/lib/auth/nameSplit.ts`), a heuristic split of `profile.name`.
- **`newsletterPrefs` is its own table and its insert sits *outside* the transaction that
  creates `accounts`** — a newsletter write must never be able to fail account creation.
  Existing accounts were backfilled `subscribed = true` by `0035`; Google sign-ups were
  subscribed by default until **2026-09-03**, when that was reversed.

## A known, understood data quirk

Accounts created before commit `02ac495` ("Niente più ospiti", 2026-08-14) — from the era of
shared accounts with view-only member roles — can get stuck unable to edit their own account.
The current permission code (`src/lib/roles.ts`, `src/lib/accounts/current.ts`) is correct
and tested; the failure is leftover data on those rows, not a logic bug. Fix is to delete and
recreate the account from the Accounts admin page, not to debug the permission code again.
Both halves of that repair exist again as of 2026-09-11 — between v3.8 and that date this
paragraph named a screen that could no longer do what it says, which is the argument that
brought `createAccount` back.
