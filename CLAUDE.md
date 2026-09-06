# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository. Setting up a
*new* sisqo project is the user-level `create-new-project` skill (`/create-new-project
<name>`), not a document — it owns the `gh`/`vercel` steps, the domain alias and every trap.
The conventions that matter *here* are stated in the sections below rather than borrowed:
the GitHub account is `sisqo`, the Vercel team scope is `sisqoz` (different strings — that
catches people), and `strumfolio.com` is a real domain on the Vercel registrar, not a
`sisqo.dev` subdomain.

## What this is

Strumfolio — a private PWA for reading a musician's own lyrics/chords on stage: zoom,
auto-scroll, transposition, capo, offline. Next.js 15 App Router, React 19, TypeScript,
Tailwind v3, Postgres on Neon via Drizzle ORM, NextAuth v5, Serwist for the service worker.
Deployed on Vercel (`sisqo` account), production at https://strumfolio.com.

`PRODUCT.md` frames the product, `DESIGN.md` the visual language, and **this file is the only
prose that has to stay true.** Write build-relevant constraints here, in the section they
belong to.

**The `PLAN*.md` files were deleted on 2026-09-06** — `PLAN.md` plus fourteen
`PLAN-<feature>.md`, about 7,300 lines. **All fourteen** described features already in
production, so they had become a second, drifting description of the code: every line
reference in them was stale (`shapeFor` had moved 87 lines), and ten still opened by claiming
their feature "non è ancora scritta" when it had shipped weeks earlier. What was load-bearing
in them lives in the sections below; the rest was delivery history, which `git log` and
`/changelog` already hold. Do **not** recreate the convention: a feature being built does not
get a plan file of its own, and nothing gets "folded in" anywhere. All of it is still readable
at the commit before the deletion — `git show 2b32ee9:PLAN.md`, `git show
2b32ee9:PLAN-coupons.md`, and so on (the `:path` form, not `-- path`, which prints nothing
because that commit never touched them).

Their citations were stripped from every `.ts`/`.tsx`/`.css` comment, but **`drizzle/*.sql` and
`.impeccable/critique/*.md` deliberately keep theirs.** Both are records of something that
already happened — an applied migration, a critique run on a given day — so a reference to the
document that was open at the time is accurate history, not a dangling link. Leave them.

Version numbers (v3.2, v4.1, v4.7…) survive in code comments as era labels and no longer
index anything. Dozens of comments in `auth.ts`, `RegisterForm.tsx`, `rateLimit.ts` and their
neighbours cite a numbered point from the old v3.1/v3.2 lists; those numbers are now inert, so
read such a comment as a self-contained statement, which is how each was written.

## Commands

```bash
npm run dev       # next dev, http://localhost:3000
npm test          # tsx --test over every src/**/*.test.ts and scripts/**/*.test.ts
npm run lint      # eslint
npm run build     # tsx scripts/precache-routes.ts, then next build
npm run db:migrate  # tsx scripts/migrate.ts — applies drizzle/*.sql to $DATABASE_URL
npm run db:generate # drizzle-kit generate — BROKEN, see its own section below; write by hand
npm run seed      # tsx scripts/seed.ts
```

Without `DATABASE_URL` the app reads songs straight from `content/` — the normal way to work
locally, no database needed. `npm test` is plain `node:test` over pure functions only; there
is no React component test runner here, so logic worth testing belongs in a plain module (see
`src/lib/plans/testCard.ts` beside `checkout.ts`: a `'use server'` module may only export
async functions, so a synchronous check or constant that needs testing lives in a sibling).

## Before pushing: verify against the committed snapshot, not the working tree

Run the full check — `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build` —
against what was actually **committed**:

```bash
SCRATCH=/tmp/claude-*/…/scratchpad/push-check   # anywhere outside the repo
rm -rf "$SCRATCH" && mkdir -p "$SCRATCH"
git archive HEAD | tar -x -C "$SCRATCH"
ln -s "$(pwd)/node_modules" "$SCRATCH/node_modules"
cd "$SCRATCH" && npx tsc --noEmit && npm test && npm run build
```

A working-tree build (even an `rsync`'d copy) can pass while the commit is broken if a file
was edited after `git add` and never re-staged — it happened for real: a commit that deleted
`LightThemeOnly.tsx` still imported and rendered it on `/login`.

Push once verified — don't wait for a separate "go ahead" on the push itself for an ordinary
forward commit. Still: stage explicit paths (never `git add -A`), confirm `gh auth status`
shows the `sisqo` account, and treat force-push, `reset --hard` and amending a pushed commit
as needing explicit confirmation first.

## Dev server / build collision

Every `next dev` in this repo binds the same `.next` directory whatever the port. A second
`next dev`, or a `npm run build` while one is live, corrupts whichever was already serving:
stale HTML referencing 404ing chunk hashes, or a React Client Manifest error, sometimes
surviving even `rm -rf .next`. Check `ss -ltnp | grep 300` before building for verification —
if a dev server owns port 3000, either verify another way or be ready to `rm -rf .next` and
restart it (`nohup npm run dev > log 2>&1 & disown`). This machine accumulates orphaned `next
dev` processes across sessions; clean up your own before leaving.

## Deploys: a push to `main` is the deploy

Vercel's own GitHub integration builds and deploys to Production on every push to `main`,
alias included (`strumfolio.com`) — confirmed 2026-08-31. There is no need for `vercel
deploy`/`vercel --prod` for an ordinary code change.

The one case that genuinely needs a manual redeploy: an env var change with **no**
accompanying code change (e.g. flipping `SONGBOOK_MOCK_CHECKOUT` off). Env vars are baked
into a deployment at build time, so `vercel env rm <name> production` alone changes nothing
already deployed. With no commit to push, that means `vercel redeploy <deployment-url>
--target production --scope sisqoz` — the `--scope` is required, or the CLI reports
"Deployment belongs to a different team" even though `sisqoz` is the only team here. That
command is blocked by Claude Code's auto-mode classifier and needs the user's explicit
permission. Confirm the flip took effect on copy that differs between the two states, not on
a signed-out page that looks identical either way — `/login`'s plan-limits FAQ
(`plansEnforced() && !mockCheckoutEnabled()`) is one that does.

## Migrating the production database

The direct (non-pooled) connection string for `strumfolio-db` lives in
`~/.config/strumfolio/prod-db.env` (`chmod 600`, outside the repo) under the name
`STRUMFOLIO_PROD_DATABASE_URL` — deliberately not `DATABASE_URL`/`DATABASE_URL_UNPOOLED`, so
no script in the repo picks it up on its own. Read it through
`~/.config/strumfolio/prod-url`, which refuses to print anything that is not a direct string
to host `ep-muddy-rain-awwahyle`. Inject it per command, never export it:

```bash
DATABASE_URL_UNPOOLED="$(~/.config/strumfolio/prod-url)" npm run db:migrate
psql "$(~/.config/strumfolio/prod-url)" -c '…'
```

That works because `scripts/load-env.ts` sets each variable with `??=`, so a shell export
always beats `.env.local`, and `scripts/migrate.ts` promotes `DATABASE_URL_UNPOOLED` to
`DATABASE_URL` right before connecting. One command points at production while every file on
disk stays pointed at dev.

**Never put that string in `.env.local`**: `vercel env pull` rewrites that file wholesale,
and the `DATABASE_URL` in it is read by `dev`, `build` and `seed`. Nor in `.env.production*`,
which Next.js loads by itself under `NODE_ENV=production`, i.e. at `next build`.

**Check the journal before any write.** Drizzle applies every journal entry whose `when`
exceeds `max(created_at)` in `drizzle.__drizzle_migrations` and never matches hashes, so one
row with a wrong timestamp skips a migration silently and forever:

```bash
psql "$(~/.config/strumfolio/prod-url)" -c 'select created_at from drizzle.__drizzle_migrations order by 1'
```

must line up one-for-one with the `when` values in `drizzle/meta/_journal.json`. Verified
2026-09-06: 41 rows, identical and monotonic, and `db:migrate` against production ran clean
as a no-op. That proves the connection and the alignment — **not** the write path: no
migration has actually been applied to production from this CLI yet.

Two negative facts worth not re-deriving: `vercel env pull --environment=production` exits 0
and looks like a success but writes `[SENSITIVE]` in place of all 16 secrets (test with
`grep -c SENSITIVE`, not by eye), and **`DATABASE_URL_UNPOOLED` does not exist in Production
at all** — exporting it from such a pull yields an empty string and quietly migrates
*development* instead, which is worse than not running.

### Fallback: the Neon SQL console, journal row included

If the local file is ever gone, production is still reachable from a browser: Neon dashboard
→ the **`strumfolio-db`** project (not `strumfolio-db-dev`) → SQL Editor. This is how `0030`
and `0032` were applied. The second statement is the part that is easy to forget and
expensive to skip:

```sql
BEGIN;
ALTER TABLE "user_song_prefs" DROP COLUMN "note";   -- the migration's own SQL
INSERT INTO drizzle.__drizzle_migrations ("hash","created_at") VALUES ('<sha256>', <when>);
COMMIT;
```

`<sha256>` is of the migration file's **raw bytes** (`readMigrationFiles` hashes the file,
not the statements); `<when>` is that migration's `when` in `drizzle/meta/_journal.json`, and
it is the load-bearing value — `pg-core/dialect.js` compares `created_at`, never the hash, so
it must be greater than the previous migration's. Without the insert the *next* migration
re-runs this one, and since `migrate` wraps the run in one transaction that failure takes
every later migration down with it.

## Development and Production are separate Neon databases (since 2026-08-29)

Two independent Neon projects that **will drift**: production `strumfolio-db`
(`ep-muddy-rain-awwahyle`) and development `strumfolio-db-dev` (`ep-little-boat-aui3a9q1`),
both serving a database called `neondb`. Before 2026-08-29 they were the same one, so local
`npm run dev` was reading and writing real production data.

`~/.config/strumfolio/dev-url` is the dev counterpart of `prod-url` and deliberately keeps no
copy of the secret: it reads `DATABASE_URL_UNPOOLED` out of `.env.local`, which is already
the source and which `vercel env pull` keeps current. It returns the **unpooled** endpoint,
right for `psql` and migrations — `next dev` itself runs on the pooled `DATABASE_URL`, so
chase a PgBouncer-shaped difference on that one instead. Dev migrations need no injection at
all: `.env.local` already points there, so plain `npm run db:migrate` is enough.

**Renamed 2026-09-06**: the two projects were `songs-db` and `songs-db-dev` until that date,
and the reproduction note in `src/lib/prefs/actions.ts` still says so — it records what was
run at the time, so read the old name as the new one wherever it turns up. Only the label
changed: endpoints,
Postgres database name and connection strings are untouched, which is why no env var and no
redeploy were involved. The rename happens in **Vercel, not Neon** (`action restricted;
reason: "organization is managed by Vercel"`, because a Marketplace project lives in a
Vercel-managed organisation): <https://vercel.com/sisqoz/~/stores> → the database → Settings,
store ids `store_ymYuYVjaylIEI48x` (production) and `store_YV4I8u7ePKrckzf6` (dev). **No API
and no CLI verb does it** — every plausible `PATCH`/`POST`/`PUT` under `/v1/storage/stores/…`
404s except `PATCH /v1/storage/stores/integration/{id}`, which is real but rejects `name` and
nine other spellings with `should NOT have additional property`. `vercel api <endpoint>` is
how that was probed and the general way to reach the Vercel REST API from here: it
authenticates on its own, so it works even though reading the CLI's stored token is blocked
by the auto-mode classifier. `vercel api
"/v1/storage/stores?teamId=team_ZnJvYlBo3JNg9eLJweZVUdWJ"` reads back the `name` the
dashboard writes.

- **Schema changes ship twice**: against `strumfolio-db-dev` for local/preview work, and
  separately against production when the migration is meant to ship.
- **Data**: dev got a one-time, one-way `pg_dump --data-only` / `pg_restore` copy of
  production on 2026-08-29 (excluding `drizzle.__drizzle_migrations` and
  `neon_auth.project_config`). A snapshot, not a sync — real accounts, emails, password
  hashes and `paddle_events` from that date live in the dev database too.
- **`pg_dump`/`pg_restore` version**: Neon runs Postgres 17, Ubuntu 24.04's stock
  `postgresql-client` stops at 16, and `pg_dump` refuses a newer major.
  `postgresql-client-17` comes from the PGDG apt repo (`apt.postgresql.org`).
- **A second Neon resource on the same Vercel environment collides on env var names.**
  `vercel integration add neon -e development --prefix DEV_` sidesteps it; copy the values
  into the plain `DATABASE_URL`/`DATABASE_URL_UNPOOLED` the app reads (`vercel env rm` the
  old ones first, they don't auto-overwrite), then delete the `DEV_` duplicates and the old
  resource's stale `PGHOST`/`POSTGRES_*`/`NEON_PROJECT_ID`.
- **`vercel integration resource disconnect`/`remove` is blocked by the auto-mode
  classifier**, so the old `strumfolio-db` resource still shows as "connected" in `vercel
  integration ls` with none of its env vars left anywhere — cosmetic, harmless to leave.

## Domain, email, CAPTCHA and OAuth: six independent places, six different access methods

The production domain moved twice on 2026-08-21 (`songbook.sisqo.dev` →
`strumfolio.sisqo.dev` → `strumfolio.com`, the last a real domain on the Vercel registrar). A
future move needs all six again — Google OAuth was the one missed, caught a day later once
Google sign-in started failing:

- **Vercel** (project domains + DNS zone) — fully automatable: `vercel dns add`, and
  `POST`/`DELETE` on `/v9/projects/<id>/domains`. `strumfolio.com`'s zone is on Vercel's own
  nameservers, so records can be added from here.
- **Resend** (`RESEND_FROM`'s sending domain) — automatable with `RESEND_API_KEY` from
  `.env.local`. Its DKIM/SPF live on a dedicated `send.<domain>` subdomain Resend requires,
  never the apex, so they coexist with ImprovMX's apex MX/TXT. Don't "simplify" either set
  thinking they are redundant: they answer different questions (who may send *as* the domain
  vs where mail *to* it goes).
- **ImprovMX** (forwarding `info@<domain>`, the legal pages' `CONTACT`) — DNS-only from here:
  the records make the domain routable, but the forwarding rule itself lives in ImprovMX's
  dashboard, behind no credential available here. Confirm with a real test send (`POST
  /emails` on the Resend API, then check `last_event` on the returned id) rather than
  assuming DNS is enough.
- **Cloudflare Turnstile** (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, the CAPTCHA on registration and
  recovery) — a per-widget hostname allowlist in the Cloudflare dashboard, separate from DNS
  and Vercel. The site key doesn't change with the domain, only the allowlist. No credential
  here: manual every time, unverifiable by an agent.
- **Gmail "Invia messaggi come"** — to *reply* as `info@<domain>` rather than the personal
  address, Gmail relays through `smtp.resend.com:587`, user `resend`, password a dedicated
  Resend key with `permission: sending_access` scoped to that domain (deliberately not the
  app's `RESEND_API_KEY`, so rotating one never breaks the other). Not ImprovMX's SMTP, which
  is a paid add-on; its free tier only forwards inbound. Works only because the domain is
  already Resend-verified, so no new DNS. Lives in Gmail's settings: redo by hand every move.
- **Google OAuth** (`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`) — the credentials don't change,
  but the OAuth client's **Authorized redirect URIs** (and JavaScript origins) in Google
  Cloud Console → APIs & Services → Credentials must list
  `https://<domain>/api/auth/callback/google`, or Google rejects the callback with `Error
  400: redirect_uri_mismatch` entirely inside its own redirect — no code-side symptom, no log
  here. Console-only; `gcloud` has no command for it. To check without logging into Google,
  build the authorization URL NextAuth would send (`client_id` + `redirect_uri` from a `POST
  /api/auth/signin/google` against the live site) and fetch it anonymously: a normal sign-in
  page means the URI is registered, the mismatch page means it isn't.

`AUTH_URL` is deliberately **not set** in Production (removed 2026-08-21, it was pinned to
the old domain and caused cross-domain login redirects). NextAuth v5 derives the origin from
the request's `Host` header (`trustHost`, automatic on Vercel), which is what lets every
attached domain work on its own. Re-add it only if the request host stops being trustworthy.

## Plans, entitlements and the mock checkout (`src/lib/plans/`)

- `types.ts` — `Plan`, `PLANS` (the limits table), `PLAN_RANK` (generosity order, not price).
- `prices.ts` — `PRICES`, `LIFETIME`; separate from `types.ts` because a price changes on a
  different clock than a limit does.
- `entitlements.ts` — `resolveSubscription`/`liveSubscription`: pure functions collapsing a
  scheduled downgrade or cancellation the instant `now` passes its date. Called at every read
  site instead of a cron job — there is no background job anywhere in this repo.
- `checkout.ts` (`'use server'`) — the mock checkout: `mockPurchase`, `mockCancel`,
  `clearPendingChange`, `forceExpireNow` (test-only). Writes the same
  `plan`/`planStatus`/`planExpiresAt`/`pendingPlan`/`pendingCycle` columns a real Paddle
  webhook will write, and logs every mutation to `paddle_events` (`history.ts`) under an
  `eventType` prefixed `mock.` — the table and reading code a real integration will reuse.
- `resolve.ts` — two env flags read fresh at call time: `plansEnforced()` (`SONGBOOK_PLANS=on`)
  gates enforcement, `mockCheckoutEnabled()` (`SONGBOOK_MOCK_CHECKOUT=on`) gates `/checkout`
  and the "Choose <plan>" buttons on `/pricing`. **Neither is a security boundary** — while the mock
  checkout is on, any signed-in reader can give their account any plan for free. Both are
  currently `on` in production, which is why a stale "not on sale yet" notice is a real bug.
- `testCard.ts` — the mock's "processor": `isAcceptedTestCard` accepts only
  `4111 1111 1111 1111` (digits compared, formatting ignored); everything else declines
  client-side in `CheckoutScreen.tsx`, before `mockPurchase` is called.
- `SONGBOOK_FORCE_PLAN` — a deliberately risky local-only escape hatch (forces every read to
  one plan); never meant to run in production.

## Coupons (`src/lib/coupons/`) — and what a coupon is *not* allowed to decide

Percentage-off campaigns, native to Strumfolio: no Paddle client exists, so this repo is the
source of truth until one does. The load-bearing parts:

- `types.ts` — the vocabulary and every parser, with **no `@/lib/db` import** so client
  components can value-import it. `CAMPAIGN_FAILURE_MESSAGE` lives here for the `testCard.ts`
  reason: a `'use server'` module may only export async functions.
- `discount.ts` — pure, `node:test`-covered. `discountedAmount` works in **integer cents,
  never floats**, and its test holds the commercial deck's own 30% promo table as a fixture:
  all seven figures agree, so a rounding change names the row of the deck that stopped being
  true. `campaignStatus` is computed at every read — no `status` column, no sync job, the
  same precedent as `resolveSubscription`.
- **`discountCycles` vs `discountedMonths`** — adjacent names, different consumers, silent if
  swapped. Cycles feed the **copy** («the first year»); months feed **`discount_ends_at`**. A
  campaign of `3` months says "the first year" on a yearly card and stores a date twelve
  months out. The yearly cycle always rounds **up** to whole years, which is why
  `coupon_campaigns` has no `applies_to_monthly`/`applies_to_annual`: every campaign covers
  both cycles by construction.
- **`liveDiscount` is the only way to read
  `accounts.coupon_code`/`coupon_percent`/`discount_ends_at`.** That date passes with no
  request there to observe it, exactly like `planExpiresAt`, so `subscriptionColumnsOf` never
  lets the raw columns out — it returns `{ subscription, discount }` already resolved.
- **`mockPurchase` reads the cookie itself and re-validates.** The coupon is never an
  argument: `CheckoutScreen` is `'use client'`, and a code travelling as a parameter is a
  self-service discount of any size while the mock checkout is live. The screen's `coupon`
  prop decides what is *printed*; `redeemableCouponFor` decides what is charged.
- **The cookie carries a code and nothing else.** Every read re-derives state, window, both
  ceilings and `entry` from the table (`read.ts`' header). Written by `rememberUrlCoupon`
  from an effect in `CouponBar` — not by the middleware, which runs on the edge where the
  database is unreachable, and not during a render, which Next.js forbids.
- `coupon_redemptions_once` (unique on campaign + account) makes `usage_limit` a ceiling that
  can be *verified*: `times_used` is a `COUNT(*)`, not a mirrored number.
  `coupon_campaigns_one_default` is a **partial** unique index — confirm the `WHERE
  (is_default AND archived_at IS NULL)` predicate survives any regeneration, because without
  it that index forbids a second *non-default* campaign.
- **Struck prices appear only while a coupon is applied.** That conditionality is the legal
  argument, not a styling choice: the deck rejects a reference price never charged, and what
  answers it is that the listino is genuinely what a reader without a coupon pays. The
  guardrail nothing enforces: `expires_at` is nullable by decision, so `/coupons` marks every
  active campaign that has none and counts the days the `?promo=1` one has been running.
- The Lifetime's own promo mechanism is **gone** — `LIFETIME` lost `originalAmount`,
  `closesOn` and `closesOnLabel`. Whether it is in the catalogue is the `lifetime.on_sale`
  row in `app_settings`, flipped from `/app-settings`.

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
production-migration section above, the load-bearing one. Repairing the snapshot chain is
unattempted work, not a known-easy fix; until somebody does it, treat `npm run db:generate` in
*Commands* as a command that will fail, and copy the shape of a recent pair (say `0038` plus
its journal entry) instead.

## Reading a song: chips, chord shapes and notation

- **The song owns key/capo/accidentals/chord-display** — chips on the song itself, not controls
  in the reading panel. A reader's own transposition is separate, in
  `user_song_prefs.semitones`/`.capo`.
- **`shapeFor` picks the default, not the only shape.** Every chord has an alternate-forms
  picker inside the existing `ChordPopup`, guitar *and* ukulele. Three things a change must not
  get wrong: `user_song_prefs.chord_shapes` is `jsonb` keyed
  `${instrument}:${root}:${family}` and valued with the **chosen shape's fingering text**
  (`'320003'`) rather than an index into the candidate list, so reordering the shape search can
  never silently repoint somebody's saved choice; **a missing key means "default"**, never an
  explicit value for "first candidate"; and the form binds to the chord **as it currently
  appears** — root and family after any shift — not to the token in the source.
- **For chord shapes a Strum Together guest follows the capo rule, not the key rule**: their
  own choice stands, where the key is forced by the leader.
- **German and Nashville notation are output-only** and belong to the reader, not the song.
  German `[B]` is the international `Bb`, so letting it into parsing would make one token mean
  two different chords with nothing in the file to disambiguate — `readRoots` stays on Italian
  and international deliberately.

## The booklet prints for a room, except when the reader asks otherwise

`/booklet` typesets each song in its **written** key by default, because a booklet is meant to
be printed and handed to other people, where somebody else's capo means nothing. A reader can
override with their own key and capo, and the rules are narrow on purpose:

- **Asked at every download and never persisted** — a checkbox above "Download PDF", not a
  modal on click and not a second button.
- **Every song printed that way says so on its own page**, same text and logic as
  `TransposeNote` on screen, and only when capo or semitones ≠ 0.
- **Preferences are read for the email actually signed in, never `accountOwnerEmail`** — the
  two differ precisely while a global owner is viewing as somebody else.
- `/login`'s public FAQ states this behaviour in full. Change one and the other is wrong.

## Import (`/songbooks/[slug]/add`)

- **Thirteen extensions**, all listed in `ACCEPTED` (`src/components/AddSongScreen.tsx`) —
  plain text, the ChordPro dialects, OnSong, MusicXML, ZIP and a SongbookPro backup. Parsing
  happens **in the browser**, one `await import()` per format, so an unused format costs
  nothing. No AI anywhere. **PDF and Word were designed and never built** — don't read the
  `.zip`/`.xml` support as covering them.
- **Archives flatten: folders become sections, never new songbooks.**
- **The plan cap is checked before anything is written**, and import itself is free.
- **`estimateKey` (`src/lib/music/key.ts`) always wins** over an imported key column, which is
  archival only.
- **`sniffDialect` (`src/lib/import/dialect.ts`) reads the content, not the extension**, and
  genuinely ambiguous files are skipped rather than guessed.

## Accounts admin, names, and the newsletter preference

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

## Design fidelity from Claude Design handoffs

Design mocks arrive in the Parallels shared folder `/media/psf/Download/songbook/` (macOS
host, not under `~/git`): a Claude Design handoff bundle of `README.md`, `project/<Name>.dc.html`
(an HTML/CSS prototype with inline styles), `support.js` and a `.thumbnail`. Read the
`.dc.html` directly rather than rendering it — every pixel value is in the inline styles.
Match a redesign **literally** — exact font sizes, card/table structure, copy — rather than
preserving prior "more accurate" wording; ask before keeping something the mock removed, but
default to matching the mock over defending the status quo.

`DESIGN.md`'s frontmatter and prose are the living design-token source (colors, radius scale,
typography), kept in sync by hand with what ships — including the current font (Outfit,
replacing DM Sans as of August 2026).

Chromium here is a snap and cannot write into `/tmp/claude-*` — pass `--screenshot=` a path
under `$HOME` (e.g. `~/songbook-shots`) if a visual comparison is needed.

## A known, understood data quirk

Accounts created before commit `02ac495` ("Niente più ospiti", 2026-08-14) — from the era of
shared accounts with view-only member roles — can get stuck unable to edit their own account.
The current permission code (`src/lib/roles.ts`, `src/lib/accounts/current.ts`) is correct
and tested; the failure is leftover data on those rows, not a logic bug. Fix is to delete and
recreate the account from the Accounts admin page, not to debug the permission code again.
