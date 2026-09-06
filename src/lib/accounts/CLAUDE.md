# Accounts admin, names and the newsletter

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

- **`/accounts/[email]` is the admin surface** — one page, everything open. Newsletter is
  **read-only** there (`loadNewsletterSummaryFor`); the name *is* admin-editable, while
  `/profile` is the reader's own self-service page for it.
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
