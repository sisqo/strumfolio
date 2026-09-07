# Accounts admin, names and the newsletter

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

- **`/accounts/[email]` is the admin surface** — a read-only summary strip over five tabs:
  the mock's four (`Account Detail.dc.html`: Plan & gift, Identity, Payments, Security) plus
  **Outreach**, which postdates the handoff, so its absence from the mock is not a deviation to
  reconcile. The tab is a URL param (`?tab=`), not client state, which is what keeps the page a
  server component and the «All N events» link a link; the strip above the tabs holds no
  control at all. Newsletter is **read-only** there (`loadNewsletterSummaryFor`); the name *is*
  admin-editable, while `/profile` is the reader's own self-service page for it.
- **The Outreach tab is the only caller of `lib/outreach/`**, and the whole reason it exists is
  that nothing in this repo runs on a schedule: it is where an action is triggered by hand and
  where the record that it already happened is read back. That subsystem's own `CLAUDE.md`
  carries the rules; the two that reach into this directory are that the newsletter preference
  is a **consent gate** for any email-channel action (an unreadable one refuses), and that
  `accounts.suspended_at` blocks outreach as well as sign-in.
- **The Payments tab holds two ledgers, not one**: what this account paid
  (`PaymentHistoryTable`) and which coupons it was ever *shown* (`CouponsSeenCard`, from
  `lib/coupons/views.ts`). The second is there so a reminder about an unused coupon is a
  decision somebody can take from this screen; its rules are the coupons directory's own.
- **Every sentence about a plan lives in `planText.ts`**, the list's and the detail page's
  alike — `rowStatus` is literally what the detail page's In force cell prints under its
  badge. A second spelling of "what does this subscription say" on one of the two screens is
  the drift that module exists to prevent.
- **A read that failed renders «—», never a reassuring value.** `rateLimitStatusFor` answers
  null and the Rate limit cell shows a dash rather than «Not hit»; the Status cell does the
  same when `admin` is null. "Nothing is wrong" and "could not tell" are opposite answers on
  the one screen built to be believed.
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
