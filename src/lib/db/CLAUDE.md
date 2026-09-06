# Schema, numeric keys and migrations

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

## Numeric keys (`0039`, v4.7) — and the four tables that deliberately still use an email

Every table is keyed by an `integer id` and every foreign key points at one. The email and
the slug stayed as `UNIQUE` natural keys, because the email is how somebody signs in and the
slug is in the URL. What a future change must not get wrong:

- **`src/lib/db/ids.ts` is the one seam.** `accountIdOf(email)`, `songIdOf(slug)`,
  `songbookIdOf(slug)` each render a scalar subquery, so a call site pays no round trip and
  writes no `await`. They yield NULL for something that does not exist, so a read finds
  nothing and a write into a `NOT NULL` column fails on the constraint — never use them to
  *decide* whether a row exists.
- **The edges keep speaking addresses and slugs, and that is load-bearing.** Three
  independent reasons: `data/files.ts` builds songs from `.chopro` files that have nothing
  but a slug; `currentUser()` reads no database at all, so it has no id to hand out and a
  global owner has a role with no `accounts` row; and the offline outbox already in readers'
  browsers names song slugs and client-minted comment ids in writes that drain *after* a
  deploy. So `SongRepository`, `CurrentUser`, `saveSongPrefs`, the comment actions and
  `data/access.ts` stay slug- and email-shaped. Resolve inside, never at the signature.
- **Four tables are still keyed by an email because a global owner has no `accounts` row**:
  `credentials`, `password_reset_tokens`, `sign_ins`, `pending_registrations`. A foreign key
  on any of them would break sign-in rather than harden it — `sign_ins` is written from
  `signIn` in `auth.ts` *before* `provisionAccount` creates the account row. Same reason
  `sing_along_sessions.owner_email` has no key while `broadcast_account_id` does.
- **Two email columns are history and must never be updated**:
  `paddle_events.account_owner_email` and `coupon_redemptions.account_owner_email` record the
  address something happened under. Each has an `account_id` beside it and every read uses
  the id. Do not add either to `changeAccountEmail`: on the coupon it would reopen the
  delete-and-recreate loop that `coupon_redemptions_once_email` exists to close.
- **`changeAccountEmail` is now one `UPDATE`** over `accounts`, `credentials`, `signIns` plus
  a stale `pendingRegistrations` delete. Needing to add a table to it is the signal that
  something is keyed by an address that should be keyed by an id.
- **`ON UPDATE CASCADE` on `songs_section_songbook_fk` is still required.** It looks
  redundant and is not: moving a section between songbooks changes `sections.songbook_id`,
  the *referenced* column, and the constraint is checked per statement. Verified by moving a
  section with 31 songs in it.
- **Two primary keys are text on purpose.** `user_song_comments.id` is minted by the client
  so a note written offline has an identity before any server sees it;
  `coupon_campaigns.id` is a server `randomUUID()`, already a surrogate key.
- **The `DOWN` is `drizzle/0039_numeric_ids.down.sql`**, written and round-trip verified. It
  rebuilds the dropped emails and slugs *from the ids*, which works only because `accounts`,
  `songs` and `songbooks` kept both keys — the reason the shape is «surrogate **plus**
  natural».

## `db:generate` does not run — every migration since `0024` is hand-written

`drizzle-kit generate` refuses to work in this repo, `--custom` included: the snapshots
`drizzle/meta/0028_snapshot.json`, `0029` and `0030` all carry the **same `id` and the same
`prevId`** (`8d0b1ba2…` / `c406eebf…`), so the chain drizzle-kit walks to diff against is
broken. Verified 2026-09-06, still broken.

So `0024` through `0039` were written by hand — **the `.sql` file *and* its
`drizzle/meta/_journal.json` entry**, which is the half that is easy to forget and, per the
root `CLAUDE.md`'s production-migration section, the load-bearing one. Repairing the chain is
unattempted work, not a known-easy fix; until somebody does it, treat `npm run db:generate` in
*Commands* as a command that will fail, and copy the shape of a recent pair (say `0038` plus
its journal entry) instead.
