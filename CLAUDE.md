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

`PRODUCT.md` frames the product, `DESIGN.md` the visual language, and **this file with the nested
`CLAUDE.md`s listed below is the only prose that has to stay true.** Write a build constraint in
the one whose directory it governs, or here if it binds the whole repo or a command that edits
no file.

**There are no plan files, and the convention must not come back.** The `PLAN*.md` files
(`PLAN.md` plus fourteen `PLAN-<feature>.md`) were deleted on 2026-09-06 because every one
described a feature already in production and had drifted from the code. A feature being built
gets no plan file; build constraints go in the right `CLAUDE.md`, delivery history is `git log`
and `/changelog`. The old files are readable at `git show 2b32ee9:PLAN.md` (the `:path` form —
`-- path` prints nothing, since that commit never touched them).

**`drizzle/*.sql` and `.impeccable/critique/*.md` deliberately keep their citations** of those
files: they record something that already happened, so leave them. Version labels in code
comments (v3.2, v4.1, v4.7…) are era labels and index nothing, and the numbered v3.1/v3.2 points
cited in `auth.ts`, `RegisterForm.tsx`, `rateLimit.ts` and their neighbours are inert — read each
such comment as a self-contained statement.

## Where the rest lives

Repo-wide rules stay in this file. Guidance scoped to one subsystem lives in a nested
`CLAUDE.md`, which loads only when Claude works under that directory. **The last three rows are
neither**: `CASES.md`, `INTEGRATION-TESTS.md` and `customer-journey.md` are documents rather than rule files — nothing
loads them automatically, and they are listed here because this table is the index of where
everything that is not in this file has gone. Open them by name when the work is theirs.

| File | Covers |
|---|---|
| `src/lib/editor/CLAUDE.md` | ChordPro in depth: the song-data form, where each field lives, `{transpose}` as modulation, the 2026-09-23 conformance pass and what is deliberately not followed — **read it before touching `src/lib/chordpro.ts`**, which has no directory of its own |
| `src/lib/auth/CLAUDE.md` | the password chosen on `/verify`, `currentUser`/`requireAccount`, session revocation, the owner exemption |
| `src/lib/qa/CLAUDE.md` | the passwordless `/qa` sign-in and its two guards |
| `src/lib/storage/CLAUDE.md` | why every browser cache is scoped to one account, the scope cookie, the worker's epoch |
| `src/lib/install/CLAUDE.md` | the «Add to home screen» row and the site-wide `beforeinstallprompt` capture |
| `src/lib/telegram/CLAUDE.md` | what the operator notices carry, and the three Privacy Policy passages that move with them |
| `src/components/CLAUDE.md` | the reading bar's motion: prefetch, step direction, the end-of-song glow |
| `src/lib/db/CLAUDE.md` | numeric keys, the four tables still keyed by an email, why `db:generate` is broken |
| `src/lib/plans/CLAUDE.md` | plans, entitlements, the Paddle checkout, which Paddle id the code holds and which it deliberately does not, and how the catalogue is verified |
| `src/lib/coupons/CLAUDE.md` | campaigns, `liveDiscount`, and what a coupon is not allowed to decide |
| `src/lib/accounts/CLAUDE.md` | the admin surface, names, the newsletter preference, the old-account quirk |
| `src/lib/music/CLAUDE.md` | the song chips, alternate chord shapes, German and Nashville notation |
| `src/lib/import/CLAUDE.md` | the fifteen extensions, how PDF and Word are read, and what the importer refuses to guess |
| `src/lib/booklet/CLAUDE.md` | why the PDF prints the written key, and the one way to override it |
| `src/lib/outreach/CLAUDE.md` | actions the platform aims at a reader, and why one can never happen twice |
| `src/lib/courtesy/CLAUDE.md` | the two founder emails, legitimate interest vs. newsletter consent, the stateless unsubscribe link |
| `src/lib/mcp/CLAUDE.md` | AI access over MCP: the token-as-actor seam, `STRUMFOLIO_MCP`, the plan gate, whole-text writes with `songs.version`, the revision history, which clients a token reaches |
| `src/lib/attribution/CLAUDE.md` | where a lead came from, the five seams that record it, and the touch rules |
| `src/lib/plans/CASES.md` | the forty-one plan-change cases by their analysis-document number: what each does, which test covers it, and whether anybody has ever watched it happen |
| `INTEGRATION-TESTS.md` | the live runs — which environment and why not the other two, why they are driven through a real signed-in Chrome and photographed step by step, the throwaway users, the sandbox card, how a Paddle transaction settles an argument between the screen and the charge, and where the screenshots go |
| `customer-journey.md` | every email a reader receives, with their copy, and the moments that deliberately have none |

**Anything that scopes by directory can be missed by a command that edits no file**, so the
five facts whose absence is expensive are repeated here rather than left behind a path:

- **`db:generate` does not run**, and every migration from `0028` on is written by hand — the
  `.sql` file *and* its `drizzle/meta/_journal.json` entry, which is the half that is easy to
  forget and, per *Migrating the production database* below, the load-bearing one.
- **Four tables are still keyed by an email on purpose** — `credentials`,
  `password_reset_tokens`, `sign_ins`, `pending_registrations`. A foreign key on any of them
  breaks sign-in rather than hardening it.
- **The mock checkout was demolished on 2026-09-13** — `SONGBOOK_MOCK_CHECKOUT` no longer
  exists, and `/checkout/[plan]` sells through Paddle or says it cannot sell. `SONGBOOK_PLANS`
  gates enforcement and is not a security boundary; whether money can be taken is not a flag at
  all but whether `PADDLE_API_KEY` and `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` are both configured.
- **`songbook-attribution` is the first cookie here that is not strictly necessary**, and the
  Cookie Policy had to be rewritten for it: §2 gained a paragraph, «No advertising or third-party
  tracking» and §3's «everything above is strictly necessary… we will ask for your consent» were
  both no longer true as written. Its legal basis is legitimate interest, Art. 6(1)(f), so the
  Privacy Policy's §3 table and the §7 right-to-object list both name it — **change one of those
  five places and the others are wrong**, the rule the booklet override and the install row already
  live under. There is no consent banner, by decision.
- **`songbook-coupon` is the second, and lives under the same rule** (disclosed 2026-09-22, on
  legitimate interest by decision): its thirty days are Google Ads' attribution window, not the
  offer's. With it the Cookie Policy §2 describes `songs:coupon` and `songbook-offer-collapsed`, the
  Privacy Policy §2 describes `coupon_views` and `coupon_redemptions` (in words, not by name), §3's table has its own row, §6
  says both of those keep the address after the account is deleted, and §7's object list names
  the offers. `songbook-scope` is among the essential cookies in the same commit.

## ChordPro is read by two parsers, and they have to agree

`src/lib/chordpro.ts` is the **reader** — it throws away what the screen does not need.
`src/lib/editor/document.ts` is the **editor's**, one block per source line, holding
`toSource(fromSource(x)) === x` byte for byte (separators included, via each block's `raw`) so
saving never rewrites somebody's file. A construct taught to one and not the other does not
fail: the editor turns it into an opaque chip, or reads it as lyrics and offers its `[` as a
chord. **Teach both, in the same commit**, and note the fan-out — `SongSheet.tsx` (screen),
`booklet/layout.ts` plus `booklet/document.tsx` (PDF), `import/deduce.ts`'s
`METADATA_DIRECTIVE` (what is stripped), `import/export.ts` (what is written),
`editor/songData.ts` (which fields the song-data form owns), and `components/ChordProGuide.tsx`,
which documents all of it — plus `mcp/guide.ts`, the same guide written for an AI assistant. Directive names are matched by one function for both parsers,
`matchDirective` (`lib/directiveLine.ts`).

- **Run the invariant over `content/` and the reference files**, not over a hand-written string;
  `chordpro.test.ts`'s «the reader and the editor agree» is the cheapest check that a new
  construct is safe.
- **Understood must never mean deleted.** `KEPT_IN_BODY` (`import/deduce.ts`) is the whole
  answer to «what does the importer keep»: a `Field` with no column belongs in it. **Dropping a
  column and adding its field to `KEPT_IN_BODY` are one change**, and the second half has no
  compiler behind it.
- **Anything a drawn line does that the source does not say is decided at render, never at
  parse** (`%{…}`, a `{chorus}` repeat, a conditional's selector), and notes are anchored by
  line identity (`buildAnchorMap` takes the caller's own sections).

**Everything else — the song-data form, where each field lives, `{transpose}` as modulation,
the conformance decisions of 2026-09-23 and what is deliberately not followed — is in
`src/lib/editor/CLAUDE.md`.** Read it before touching `chordpro.ts`, whose directory has no file
of its own.

## Commands

```bash
npm run dev       # next dev, http://localhost:3000
npm test          # tsx --test over every src/**/*.test.ts and scripts/**/*.test.ts
npm run lint      # eslint
npm run build     # tsx scripts/precache-routes.ts, then next build
npm run db:migrate  # tsx scripts/migrate.ts — applies drizzle/*.sql to $DATABASE_URL
npm run db:generate # BROKEN — snapshots 0028/0029/0030 share one id; write migrations by hand
npm run seed      # tsx scripts/seed.ts
```

Without `DATABASE_URL` the app reads songs straight from `content/` — the normal way to work
locally, no database needed. `npm test` is plain `node:test` over pure functions only; there
is no React component test runner here, so logic worth testing belongs in a plain module (see
`src/lib/plans/planChange.ts` beside `paddlePlanChange.ts`: a `'use server'` module may only
export async functions, so a synchronous rule that needs testing lives in a sibling — and
exporting it from the server module would turn an internal decision into an endpoint the
browser can call, which `redeemable.ts` was moved out of `checkout.ts` to prevent).

## Before pushing: verify against the committed snapshot, not the working tree

Run the full check — `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build` —
against what was actually **committed**:

```bash
SCRATCH=/tmp/claude-*/…/scratchpad/push-check   # anywhere outside the repo
rm -rf "$SCRATCH" && mkdir -p "$SCRATCH"
git archive HEAD | tar -x -C "$SCRATCH"
ln -s "$(pwd)/node_modules" "$SCRATCH/node_modules"
cd "$SCRATCH" && npx tsc --noEmit && npm test && npm run lint && npm run build
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
accompanying code change (e.g. adding `PADDLE_API_KEY` to Production). Env vars are baked
into a deployment at build time, so `vercel env rm <name> production` alone changes nothing
already deployed. With no commit to push, that means `vercel redeploy <deployment-url>
--target production --scope sisqoz` — the `--scope` is required, or the CLI reports
"Deployment belongs to a different team" even though `sisqoz` is the only team here. That
command is blocked by Claude Code's auto-mode classifier and needs the user's explicit
permission. Confirm the flip took effect on copy that differs between the two states, not on
a signed-out page that looks identical either way — the landing page's plan-limits FAQ at
`/` (`plansEnforced()` crossed with `paddleCheckoutEnabled()`, in `app/(home)/Landing.tsx`) is
one that does. It was on `/login` until the public home was split out.

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

must line up one-for-one with the `when` values in `drizzle/meta/_journal.json`.

**The write path works, and has been used** — `0041_id_first` was applied to production from
this CLI on 2026-09-06 with the command above, taking the journal from 41 rows to 42, still
identical and monotonic. So the injection trick is proven end to end, not just for a
read-only no-op. Two measurements worth keeping: `db:migrate` against production took **~18
seconds** for a 200-statement migration and the rehearsal ~20, almost all of it round-trip
latency to `us-east-1` rather than work — a migration that rebuilds tables therefore holds
its locks for that long, not for the sub-second the row counts suggest. And rehearsing it
first cost nothing: `BEGIN; \i drizzle/00xx.sql; …checks…; ROLLBACK;` runs the real file
against the real data and leaves the database exactly as it was.

Two negative facts worth not re-deriving: `vercel env pull --environment=production` exits 0
and looks like a success but writes `[SENSITIVE]` in place of all 16 secrets (test with
`grep -c SENSITIVE`, not by eye), and **`DATABASE_URL_UNPOOLED` does not exist in Production
at all** — exporting it from such a pull yields an empty string and quietly migrates
*development* instead, which is worse than not running.

**Backing it up is one command**: `strumfolio-dump` — a symlink on `PATH` to
`~/.config/strumfolio/prod-dump`, beside `prod-url` — writes a full `pg_dump -Fc` of all three
schemas (~125 KB, ~13 seconds, latency again) into the Parallels shared folder
`/media/psf/Download`, staging it on local disk first so a dropped connection cannot leave a
truncated `.dump` on the Mac. It is production-only by construction, since `prod-url` refuses
every other host, and there is deliberately no dev twin — client 17 cannot dump the 18.6 dev
server, per *Three separate Neon databases* below. The dump is
complete on purpose, so it carries `drizzle.__drizzle_migrations` and `neon_auth.*`: pouring
those into another database rewrites which migrations that one believes it has applied, and
the reason the format is custom rather than plain SQL is that `pg_restore -n public` then
leaves both out. The script's own header carries the full restore line. It also carries real
accounts and password hashes, and its closing `chmod 600` binds inside the VM only, not on the
host side of the mount.

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

## Three separate Neon databases: production, development, preview

Three independent Neon databases that **will drift** — preview is its own subsection below. Two of them are Neon projects: production `strumfolio-db`
(`ep-muddy-rain-awwahyle`) and development `strumfolio-db-dev` (`ep-little-boat-aui3a9q1`),
both serving a database called `neondb`. Before 2026-08-29 they were the same one, so local
`npm run dev` was reading and writing real production data.

`~/.config/strumfolio/dev-url` is the dev counterpart of `prod-url` and deliberately keeps no
copy of the secret: it reads `DATABASE_URL_UNPOOLED` out of `.env.local`, which is already
the source and which `vercel env pull` keeps current. It returns the **unpooled** endpoint,
right for `psql` and migrations — `next dev` itself runs on the pooled `DATABASE_URL`, so
chase a PgBouncer-shaped difference on that one instead. Dev migrations need no injection at
all: `.env.local` already points there, so plain `npm run db:migrate` is enough.

**Renamed 2026-09-06** from `songs-db`/`songs-db-dev` (old notes such as
`src/lib/prefs/actions.ts` still use those names). Only the label changed — endpoints, database
name and connection strings did not. The rename happens in **Vercel, not Neon** (`action restricted;
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

- **Schema changes ship three times** — dev, preview and production, each with its own
  `__drizzle_migrations` — and no deploy step applies anything to any of them.
- **Data**: dev got a one-time, one-way `pg_dump --data-only` / `pg_restore` copy of
  production on 2026-08-29 (excluding `drizzle.__drizzle_migrations` and
  `neon_auth.project_config`). A snapshot, not a sync — real accounts, emails, password
  hashes and `paddle_events` from that date live in the dev database too.
- **The two run different Postgres majors, and that is Neon's doing, not a setting here.**
  Measured 2026-09-06: production `strumfolio-db` is **17.11**, dev `strumfolio-db-dev` is
  **18.6**. So dev is the stricter of the two to migrate against, and a catalogue difference
  between them is not automatically drift — from 18 a `NOT NULL` is a named row in
  `pg_constraint`, so dev shows hundreds of `*_not_null` constraints that production simply
  does not have. Postgres accepts `CONSTRAINT <name> NOT NULL` on both and ignores the name
  on 17 (probed against production inside a rolled-back transaction), which is what lets one
  migration file serve both.
- **`pg_dump`/`pg_restore` version**: Ubuntu 24.04's stock `postgresql-client` stops at 16
  and `pg_dump` refuses a newer major, so `postgresql-client-17` was installed from the PGDG
  apt repo (`apt.postgresql.org`). That is now too old for **dev**: `pg_dump` against 18.6
  aborts with `server version mismatch`, and `postgresql-client-18` from the same repo is
  what would fix it. `psql` is unaffected and talks to both. Where a dump was only wanted to
  rehearse a migration, there is a better tool anyway — Postgres DDL is transactional, so
  `BEGIN; \i drizzle/00xx.sql; …checks…; ROLLBACK;` rehearses the real thing on the real
  data and leaves nothing behind.
- **A second Neon resource on the same Vercel environment collides on env var names.**
  `vercel integration add neon -e development --prefix DEV_` sidesteps it; copy the values
  into the plain `DATABASE_URL`/`DATABASE_URL_UNPOOLED` the app reads (`vercel env rm` the
  old ones first, they don't auto-overwrite), then delete the `DEV_` duplicates and the old
  resource's stale `PGHOST`/`POSTGRES_*`/`NEON_PROJECT_ID`.
- **`vercel integration resource disconnect`/`remove` is blocked by the auto-mode
  classifier**, so the old `strumfolio-db` resource still shows as "connected" in `vercel
  integration ls` with none of its env vars left anywhere — cosmetic, harmless to leave.

### Preview

`neon-byzantium-harbor`
(`ep-blue-mode-avih2w94`, Postgres 18.6) was created on 2026-09-12 with
`vercel integration add neon -e preview --plan free_v3 -m region=iad1 -m auth=false`, connected
to **Preview only**, so sandbox purchases have somewhere to land that is neither production nor
the dev snapshot of it. The integration writes `DATABASE_URL` itself, which is the point: no
connection string passes through a person or a shell on the way in.

The Preview environment carries its own `AUTH_SECRET`, `ALLOWED_EMAILS` and `SONGBOOK_PLANS=on`
(it had no database and no `AUTH_SECRET` at all before 2026-09-12).

**Preview migrations use the `prod-url` arrangement**: `~/.config/strumfolio/preview-url` reads
`STRUMFOLIO_PREVIEW_DATABASE_URL` out of `preview-db.env` (pasted there by hand, and present),
refuses anything that is not `ep-blue-mode-avih2w94` or is pooled, and prints nothing otherwise:

```bash
DATABASE_URL_UNPOOLED="$(~/.config/strumfolio/preview-url)" npm run db:migrate
```

The secret never passes through a shell history, a transcript or `.env.local`. An agent must not
*fetch* it: `vercel env pull --environment=preview` is refused by the auto-mode classifier, and
routing around that is not the fix — being handed access and taking it are different things.

Code reading a new column must not reach the preview before the migration does: the symptom is
`column "…" does not exist` thrown out of the page that reads it (2026-09-15, `/billing` stuck on
«One moment…»). Rehearse against dev first, and against production too — `BEGIN; \i drizzle/00xx.sql;
…; ROLLBACK;` runs the real file against the real rows and leaves nothing, so there is no excuse
for a migration whose first execution is the real one.

- **The Turnstile keys are deliberately absent from Preview.** `captcha.ts` answers `true` when
  `TURNSTILE_SECRET_KEY` is missing — the documented local-development fallback — and leaving
  the key in place would have made registration *impossible* there rather than merely
  unprotected, because the widget never draws on a hostname Cloudflare has not been told about
  and a present key with no token is a refusal. Removing both keys is what lets an account be
  created on a preview at all.
- **`AUTH_GOOGLE_*` is absent too**, and the build survives it. Google sign-in could not work on
  a preview regardless: the URL is not among the OAuth client's authorised redirect URIs, and
  adding each one by hand is exactly the manual step that section warns about.
- **`all_except_custom_domains` means the *production* custom domain, and nothing else.** The
  name reads as "any custom domain is exempt" and that is wrong — measured 2026-09-12 by adding
  `preview.strumfolio.com`, binding it to the `paddle-checkout` branch, and watching it answer
  the same 302 to `vercel.com/sso-api` that every `*.vercel.app` URL does, production's
  included. So a custom domain on a *preview* deployment buys a readable, durable URL and no
  change in protection at all. That is the better outcome of the two: the preview stays closed,
  which matters here because its Turnstile keys are gone and its registration is open.
- **An automated caller gets through with the automation bypass token as a query parameter —
  and only that parameter.** Adding `x-vercel-set-bypass-cookie=false` beside it turns the 400
  back into a 307, which Paddle counts as a failed delivery. The header form works too, but
  Paddle's notification destinations send no custom headers, so the query parameter is the only
  shape that helps.
- **`strumfolio-sisqoz.vercel.app` is production.** It looks like a project-wide preview alias
  and is not: it resolves to the latest `main` deployment. Pointing a sandbox webhook at it
  would write sandbox subscriptions into the customers' database. A preview needs the
  *branch* alias, `strumfolio-git-<branch>-sisqoz.vercel.app`, which exists only once git has
  built that branch — a deployment made with `vercel deploy` from the CLI gets a hashed URL and
  no branch alias. **`preview.strumfolio.com` is bound to the branch in the project's Domains
  settings** and is the durable name for the same thing: if the preview ever moves to another
  branch, that binding changes in one place instead of in Paddle's destination config.
- **A branch that points at an already-built commit does not deploy.** `paddle-checkout` was
  created at `main`'s own HEAD and Vercel never built it — no check run, no deployment, nothing
  to find. It is commit-SHA deduplication and not a broken integration; the first real commit on
  the branch built immediately.
- **`vercel integration add` rewrites `.env.local` too.** The warning above is written about
  `vercel env pull`, and it applies verbatim here: the command reported
  `- PADDLE_NOTIFICATION_WEBHOOK_SECRET` among its changes and took it out. Anything local that
  is not also in Vercel's Development environment is lost on the next run of either command.
- **No fresh database is ever empty.** `0015_v3_accounts_additive.sql` and its breaking half
  carry a backfill with `f.limberti@gmail.com` written out as a literal, so migrating an empty
  database creates that account as id 1 with a `newsletter_prefs` row beside it. Harmless, and
  not a seed anybody chose — a historical data migration that keeps running for ever.

## Paddle: three MCP servers, two catalogues, and one promise about tax

The payment processor, and **wired to take real money in production since 2026-09-19** (no
subscription existed there yet on 2026-09-25). The
sandbox catalogue exists since 2026-09-12 and the live one since 2026-09-19; the facts below are
the ones that cost something to rediscover.

**Three MCP servers, three different authentications, and the server name *is* the
environment** — there is no flag to pass and no way to point one at the other:

- **`paddle-sandbox`** (`sandbox-mcp.paddle.com/mcp`) — a `pdl_sdbx_…` API key held in the
  plugin's own user config, injected as `Authorization: Bearer ${user_config.sandbox_api_key}`.
  Deliberately **not** an env var and nothing in this repo: `.env.local` never sees it, so
  `vercel env pull` cannot clobber it and no script picks it up. With no key the server answers
  401 at connect time and its tools are simply absent from the session — the failure looks like
  "the capability does not exist", not like "the token is wrong", which is the one way to lose
  an hour here. Set it through `/plugin`, not by editing a file: there is no `claude plugin
  config` verb.
- **`paddle-live`** (`mcp.paddle.com/mcp`) — OAuth in the browser, no key. **The connection
  starts read-only**, so a write answering `forbidden` is the expected state and not a bug;
  write permissions are granted under Paddle → Connectors → MCP, capped by that Paddle user's
  role.
- **`paddle-docs`** (`paddlehq.mcp.kapa.ai`) — OAuth, documentation search only, no account
  data.

The two catalogues are **completely separate**: a `pro_…`/`pri_…` id from sandbox does not
exist in live, and vice versa. Always `search` before `execute` — method paths are camelCase
(`client.pricingPreview.preview`) while body params and response fields are snake_case
(`tax_category`, `unit_price`, `billing_cycle`), and an unknown parameter throws rather than
being ignored.

### The sandbox catalogue

Four products, seven prices, created 2026-09-12. `free` has no product and must never get one:
it is what an account already is, not something that is sold.

| Plan | Product | Year | Month |
|---|---|---|---|
| Standard | `pro_01m2avn0cfjpvx8kadw23he2td` | `pri_01m2avn0eetkfxqcar0twcjrn6` | `pri_01m2avn0g2xgpv2hhz14gqrm7s` |
| Plus | `pro_01m2avn0kfrqhah231rbsaw2cc` | `pri_01m2avn0n3c0amp7bxmvecdnvr` | `pri_01m2avn0q6d87rcrnys59basw1` |
| Premium | `pro_01m2avn0sqywy1naz9apb8w23p` | `pri_01m2avn0xgm83yjc4bccw952gc` | `pri_01m2avn112qdts12bqcvx1mxyz` |
| Lifetime | `pro_01m2avn14bpkya89e6cdzkaq6q` | — | `pri_01m2avn164vxawbm08p2khskyp` |

Every price carries `custom_data: {plan, cycle}` and every product `{plan}`, so a webhook maps
a `pri_…` back to one of `PRICES`' rows from the payload itself — no second table to keep in
step with this one, which is the failure mode every other "two places must agree" note in this
file describes.

### The live catalogue, and why its ids are *not* in `prices.ts`

Created 2026-09-19 through the `paddle-live` MCP as an exact replica of the sandbox one —
`tax_category: saas`, `tax_mode: internal`, `quantity: {minimum: 1, maximum: 1}`, euro, no
`trial_period`, no `unit_price_overrides`, the same `custom_data` stamps, and no product for
`free`.

| Plan | Product | Year | Month |
|---|---|---|---|
| Standard | `pro_01m2wf60jkrz5p6md76wxp8sss` | `pri_01m2wf613emkxqg0xs0khgfcm8` | `pri_01m2wf6161k8x9gt38gdns0jy6` |
| Plus | `pro_01m2wf60r06d3xstsfp1b66xqm` | `pri_01m2wf618tke9dbed6phx45bt3` | `pri_01m2wf61c6a4q5rqf8fdm9g6cj` |
| Premium | `pro_01m2wf60wc8s68aqecqqsknv2y` | `pri_01m2wf61fp9ygk4pecwrxt27et` | `pri_01m2wf61jf8p6ed05zyg2377z3` |
| Lifetime | `pro_01m2wf610p86147t1k3v1s21wm` | — | `pri_01m2wf61n74er87t4hmwtb75jt` |

**Verified on the total, not on the field.** `pricingPreview` on 2026-09-19 for IT (22%), DE
(19%) and US (0%) returns the identical total for every one of the seven while the taxable base
moves — Standard yearly reads 28.68 + 6.31, 29.40 + 5.59 and 34.99 + 0.00, all landing on
**€34.99**. That is `prices.ts`' central sentence, demonstrated against the catalogue that will
take real money.

**The seven ids live in `PADDLE_PRICE_IDS`, not in `paddleId`.** Writing them into `prices.ts`
was tried and reverted, because the committed id wins **in every
environment**: `paddlePriceId` consults the environment only where `paddleId` is empty, so the
moment all seven are filled the *preview* deployment stops reading its sandbox ids and starts
naming live prices at the sandbox API — killing the one environment where a purchase can be
tested at all, which is what `INTEGRATION-TESTS.md` is built on.

**Two tests are what caught it, and they are a tripwire rather than an oversight.**
`paddlePrices.test.ts`'s «is only reachable while the code holds no live id» asserts the
*premise* — all seven `paddleId` empty — precisely so that filling them in fails loudly; and
`catalogue.test.ts`'s unwired case can no longer be built from a wired table. Both failed the
minute the ids went in, which is exactly what they were written to do. **Do not "update" them to
match a future change without deciding this question again.**

**What the decision costs, stated because it is invisible**: a *live* run of
`verify-paddle-catalogue.ts` has no ids to match by and exits 2 — the state that means «nothing
was verified», which is honest but is no longer a check. The repair is available and not taken:
the live prices carry the same `{plan, cycle}` stamps as the sandbox ones, so the `--sandbox`
mode's `custom-data` matching would work against live unchanged. What it also costs is the thing
`paddlePrices.ts` argues against — production now depends on an environment variable being right,
where the committed id could not be forgotten. The mitigation is that being wrong fails loudly:
a sandbox `pri_…` sent to the live API is not found, so the checkout refuses rather than
completing a sale that charges nothing.

### `tax_mode: 'internal'` is what makes `prices.ts`'s central sentence true

`prices.ts` promises that «the number written here is the number the customer pays, wherever
they are». **That is a property of the Paddle price, not of this repository**, and it holds
only because all seven prices set `tax_mode: 'internal'` explicitly. Omitting the field
defaults it to `account_setting`; if that account setting is ever tax-exclusive, VAT is added
*on top* and the promise — plus /pricing's lede, which spends a sentence on it — becomes false
in production with no code change and nothing to find. Measured against the sandbox on
2026-09-12 with `pricingPreview`, Standard yearly:

| Country | Taxable base | VAT | **Total** |
|---|---|---|---|
| Italy (22%) | 28.68 | 6.31 | **34.99** |
| Germany (19%) | 29.40 | 5.59 | **34.99** |

The base moves and the total does not — which is the whole claim, demonstrated rather than
inferred. Verify this way after any catalogue change, on the *total*: a `200` from
`prices.create` proves only that the field was accepted. **Never `tax_mode: 'location'`**,
whose per-jurisdiction behaviour is the exact opposite of "wherever they are".

**And the reader has to be told**: «€34.99» alone leaves «plus whatever your country adds» open,
which is a different offer, not a missing disclaimer. `TAX_NOTE` (`prices.ts`, beside `euro()`) is
**repeated beside every number** rather than written once under the grid, because a reader
compares one column against another. It is abbreviated because it sits on the price's own line —
«€3.49 /mo Tax incl.» — where a plan card's ~140px content box at the four-column layout will not
hold «Tax included»; verified at 1280, 1024, 820 and 390px, both cycles, with and without a
coupon, and `white-space: nowrap` means it can only break *before* «Tax».

**The tax claim is printed in six places and they move together**: on /pricing the four plan cards
(`.plan-price-tax`, absent on Free), the comparison table header (`.plan-table-tax`, inside
`.plan-table-price`, which is `display: block`) and the Lifetime panel (`.lifetime-tax`); in
`PaddleCheckout`, `footNote`'s «Tax included, in euro.» on a first purchase and the same sentence
under a **plan change** (kept out of `footNote`, whose cycle and renewal date a change does not
share); and Terms of Service § 7, the long form («VAT or any other applicable sales tax — the
amount shown is the amount charged»), which must stay true if the others are reworded.

**«Tax», never «VAT»** — Paddle is merchant of record and collects whatever the reader's
jurisdiction levies, so «VAT included» is false for an American — and the stop in «incl.» is part
of the string. **No free trial is stated and none exists** (no price carries a `trial_period`); the
bank's cut on a non-euro card is in Terms § 7 and nowhere on /pricing, by decision.

Everything else about the catalogue is checked by `scripts/verify-paddle-catalogue.ts`, which
compares it against `PRICES` row by row — `--sandbox` matches on the stamped `custom_data` and
needs no ids, and since no Paddle credential lives in this repo the catalogue is fetched
through the MCP server and passed in with `--from`. `plans/CLAUDE.md` has the rest.

Four more properties of that catalogue, each of which is a decision rather than a default:

- **`tax_category` cannot be changed after a product's first sale.** All four are `saas`, and
  **the live catalogue must use the same value** or the two environments issue different
  invoices for the same product.
- **No price carries a `trial_period`, and that is copy rather than an oversight.** The Free
  card on `/pricing` says «no card, no end date, no trial to run out», and the lede spends a
  sentence denying the trial reading. A trial in Paddle would contradict copy already shipped.
- **No `unit_price_overrides`.** Euro only, as `prices.ts` argues at length: a localised price
  is a claim a statically generated page cannot make, and what a non-euro cardholder's bank
  charges is not ours to promise.
- **Every price is capped at `quantity: {minimum: 1, maximum: 1}`, and omitting that field is
  the trap.** Paddle fills it with **1-100** when a price is created without it, so the checkout
  overlay grows a quantity selector offering up to a hundred subscriptions — and nothing
  downstream refuses them: `planOfItems` reads the first item's price and grants the plan
  whatever the quantity says, so five would be charged five times and grant exactly the same
  Premium. It shipped that way on 2026-09-12 and was caught by somebody looking at the overlay,
  not by any check. `catalogue.ts` asserts it now, so **the live catalogue must be created with
  the cap set** rather than relying on whoever makes it to remember.

### The payment form is branded from Paddle's dashboard, and one palette is all there is

The inline checkout frame is Paddle's, inside our card. The *code* controls the settings in
`checkoutSettings` (`lib/plans/checkoutFrame.ts`, read by `PaddleCheckout.tsx` and `PayFrame.tsx`) — `theme` pinned to `light`, `variant: 'one-page'`, a transparent borderless
`frameStyle`, `showAddDiscounts: false`. Everything else is **`/checkout-settings#Inline`**, the
Inline tab of Checkout Settings (the docs call it «Branded inline checkout»; there is no page by
that name). Five sections — Overall, Buttons, Inputs, Links, Messages — held in the Paddle
account, not in this repo.

**The trap: an *unset* colour follows the theme, a *set* one does not, and Save sets every colour
in the editor** — the untouched ones and the ones just emptied, which come back as Paddle's
light-theme defaults (`Label color` `#2B2A35`, `Placeholder` `#9393A8`, `Font` `#2B2A35`, `Border`
`#D2D4DE`, `Checkbox background` `#FFFFFF`, message pairs `#EBECF0`/`#FFFFFF`; measured
2026-09-16). So an unset colour cannot be persisted once anything has been saved, and the grey
hint in an empty field is not always what Save writes (`Label color` hinted `#9393A8`, saved
`#2B2A35`). `Reset` means «revert to the last published settings», not «Paddle's defaults».

**There is no dark palette and no theme selector**, and the editor colours foreground only:

| Section | Colours it holds |
|---|---|
| Overall | focus shadow, focus border (plus font family, checkout padding, `Max width (px)` 643) |
| Buttons | primary and secondary fill, text, border, hover |
| Inputs | label, placeholder, input text, input border, **checkbox background** (`Label position: Left`) |
| Links | link and hover |
| Messages | footer and coupon-notice **border and background** — not their text |

The ground is not settable, nor are the heading «Please enter your details», its helper line, the
footer's «Sold by Paddle…» or the text inside the message containers — those follow `theme`. One
input-text colour cannot be legible on two grounds, so **branding and theme-switching are
mutually exclusive here, and the form is pinned to `light`**: in the dark theme the payment form
is a light panel inside a dark page, knowingly, and it is never re-opened on a theme change (which
used to throw away a half-typed card number). **The card under the frame is `bg-white`** — one of the
app's three hard-coded colours, with `/pay`'s frame and the email preview — because it is
Paddle's ground, not our `--surface`.

**Every dashboard value is one of `DESIGN.md`'s light tokens:**

- **Overall** — focus border and shadow `#97490f`; checkout padding **off** (hence `frameStyle`'s
  `min-width: 286px`; 312 is the padding-on minimum).
- **Buttons** — primary height 44, radius 45 (the field's cap, already `--r-pill`), background
  `#97490f`, hover `#884311` (`color-mix(--accent 88%, --ink)`), font 15px `#fffaf4`, border set to
  the same two so Paddle's green ring disappears. Secondary: height 40, radius 45, colours cleared.
- **Inputs** — label `#5c626c` (`--muted`), text `#16181d` (`--ink`), placeholder `#8d939c`
  (`--faint`), border `#e6e3dc` (`--line-soft`); radius 18 (`--r-lg`), height 50, border 1, **font
  size 16** — what stops iOS zooming on focus, inside the iframe too.
- **Links** — `#97490f` / `#884311`.
- **Messages** — radius 18, border `#e6e3dc`, background `#f1efe9` (`--surface-3`), footer and
  coupon notice both.

Cannot follow us: **the font** (Outfit is not offered; Lato stays) and **the selected
payment-method tab's green outline**.

**Sandbox and live are separate accounts, configured twice; live done 2026-09-19**, verified field
by field after a reload. Two live differences: the primary button border is `No` (the live editor
offers only Yes/No, and `Yes` kept the green ring), and live has no `Label color` field. The
secondary button came out of Save explicitly Paddle green (`#06C668`/`#05B25E`) in both accounts —
the rule above, not a mistake. **A change to `--accent`, `--r-lg` or `--r-pill` makes these copies
wrong with nothing to catch it.**

### The webhook, and the two traps in the SDK

`POST /api/paddle/webhook` (`app/api/paddle/webhook/route.ts`) is where Paddle says money
moved. Verified 2026-09-12 against a locally-signed delivery: a valid event applies, a replay
of the same `event_id` answers `duplicate`, a wrong secret answers 401, and an event for an
account that does not exist is recorded as `unmatched`.

- **`middleware.ts` has to carry the path, and `isPublicAsset` is where it is.** Without that
  line a delivery is answered with a redirect to `/login` — which Paddle does not follow and
  counts as a failure, so the symptom is not an error anywhere in this app but three days of
  retries against a sign-in form, with nothing in the route ever running.
- **`NodeRuntime.initialize()` must be called by hand, and nothing warns when it is not.** The
  SDK keeps its crypto implementation in a static `RuntimeProvider` that **only the `Paddle`
  constructor fills in** — the node entry point wraps `Paddle` in a subclass whose constructor
  calls it. `Webhooks`, used standalone so the route needs no API key, initialises nothing, and
  with the provider unset `isSignatureValid` returns **false for every signature**. Every
  legitimate delivery is then refused, and the log says «signature verification failed», which
  is indistinguishable from a wrong secret. Found by signing a request by hand and watching a
  known-good signature be refused.
- **The signature is checked with the SDK; the body is read as Paddle's wire format.**
  `unmarshal` does both at once and is the documented path, but it deserialises `data` into
  entities whose fields are **camelCase** (`currentBillingPeriod`, `customerId`) — snake_case
  reads come back `undefined`, so a mapping written against the documented payload silently
  grants nothing for ever. It also **throws** on a payload missing a field it expects, and a
  throw is a 500, which is retried for three days: one unexpected shape becomes an event that
  can never be delivered. `isSignatureValid` plus `JSON.parse` keeps `webhook.ts`'s defensive
  readers in charge, and reads the same bytes that `paddle_events.payload` stores.
- **Only a 2xx means "delivered".** Every other status is retried (3 attempts over ~15 minutes
  in sandbox, 60 over ~3 days in live), so the one answer that loses an event is a 2xx on a
  failure. A missing `DATABASE_URL` therefore answers 500 too, against the instinct: it is a
  fault that will be fixed, and the retry window is what turns a fixed fault into no lost
  payment.
- **`PADDLE_NOTIFICATION_WEBHOOK_SECRET` is the route's only secret**, and it belongs to *one*
  notification destination. Sandbox and live have separate destinations with separate secrets;
  crossing them fails every delivery in exactly the way the `initialize()` trap does. It is
  **not** `PADDLE_API_KEY`, which verification never needs (applying an event may, see the
  API-key paragraph below).
- **The signature proves who sent the event, not who wrote its `custom_data`** (2026-09-24).
  Paddle.js opens a checkout with any items and any `customData` using the public client token,
  and `updateCheckout` replaces it, so `account_id` and the downgrade stamp are believed only
  when this server signed them — `account_sig` and `downgrade.sig`, an HMAC keyed off
  `AUTH_SECRET` (`plans/customDataSignature.ts`; `plans/CLAUDE.md` has the contract). The
  coupon stamp needs no signature: the applied `discount_id` decides (`appliedDiscountOf`).
  **So `AUTH_SECRET` is now also a payment secret**: rotating it invalidates the signatures on
  every live subscription — events still match by `paddle_subscription_id`, but a pending
  downgrade's stamp stops being believed and the plan drops to the items. Re-sign first, or
  rotate while no subscription carries a stamp.

### Changing plan: Paddle cannot schedule one, so the app makes it look as if it could

`subscriptions.update` replaces items **immediately** and `scheduled_change` models only `cancel`,
`pause` and `resume`, so «move this to Standard when the year runs out» cannot be said. The items
move now under `do_not_bill` and a `custom_data` stamp carries the date the old plan lasts until,
which the webhook turns into `pendingPlan` — no cron, no renewal-time write. **The direction of the
money decides the timing, not the direction of the plan**: a change that would hand money back
waits, only one that collects money happens now (so monthly-while-a-year-is-paid waits even when
the tier rises, B7). Two proration modes in the whole app. The screen reads
`update_summary.credit` and infers nothing, because the credit after a change of cycle is not
predictable — `plans/CLAUDE.md` holds the six sandbox measurements behind all of this.

**The live notification destination exists since 2026-09-19**: `ntfset_01m2wgwgzewvq76c14h83xa15a`,
`https://strumfolio.com/api/paddle/webhook`, active, `api_version: 1` and
`include_sensitive_fields: false` — the same two as the sandbox one, so the payloads the webhook
was tested against are the payloads production receives. It carries the same eleven events,
**`adjustment.created` and `adjustment.updated` included**; without those two a refunded Lifetime
is never revoked and nothing anywhere errors (`plans/CLAUDE.md`).

**Its `traffic_source` is `platform`, where the sandbox one is `all`, and that is a decision.**
A simulation delivered to production is a real payload reaching `webhookApply.ts`, which is the
single writer of the plan columns — so a test event could grant or revoke somebody's plan. Keep
simulations on the sandbox destination, which exists for exactly that.

**Its signing secret was never read by an agent**: created through the MCP with code that returns
every field except `endpoint_secret_key`, and copied by hand from Developer Tools → Notifications
into Production's `PADDLE_NOTIFICATION_WEBHOOK_SECRET` — the `prod-url` principle, applied to a
secret that would otherwise have been printed into a transcript.

**Everything that stood between the integration and a real charge was finished on 2026-09-19** —
the branding, the five variables, the domain, the default payment link and the campaign's Discount
entities. **Until a first live purchase lands, the Production signing secret has never verified a
real signature** (no subscription existed on 2026-09-25) — the one untested link, and quiet in
the expensive direction: a wrong secret answers 401 to every delivery for three days of retries.
Drive the first live purchase deliberately rather than let a customer be the first, and check
`paddle_events` afterwards.

**The gate that sat in front of all of them was the live domain, and it opened on 2026-09-19.**
`strumfolio.com` (`chedom_01m2we9rfyfcy7jtwpnr90rcvm`) went from `pending_review` to `approved`
in about forty minutes, and **Apple Pay came out `verified` with it** — the domain-association
file under `.well-known/` was never hosted, so that step can be skipped and checked rather than
done. `client.checkoutDomains.get` reads the status, so none of this needs a browser.

Approval is what unlocks the **default payment link**, a field in Checkout Settings → General
whose own text reads «a default payment link is required to create a transaction».
`startPaddleCheckout` creates one on **every** view of `/checkout/[plan]`, so until that field
holds a value nothing is sellable at all, whatever else is configured. It is now
`https://strumfolio.com/pay` — **not the home page**, because that URL is where Paddle appends
`?_ptxn=…` for its own dunning emails and only `/pay` carries Paddle.js without a session.

**Before approval the field fails silently**, which is the half worth not rediscovering: typing a
URL into it and pressing Save answers «Checkout settings saved», persists every other change made
on that same form, and leaves the field **empty on reload**, with no error anywhere. Measured
2026-09-19, on both sides of the approval — it took the value and kept it the moment the domain
turned `approved`. Read an empty field as «the domain is not approved yet», never as a typo.

**Production holds all five `PADDLE_*` variables since 2026-09-19**: `PADDLE_API_KEY`,
`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_ENV=production`,
`PADDLE_NOTIFICATION_WEBHOOK_SECRET` and `PADDLE_PRICE_IDS`. They were set **before** the push
that bakes them, which is the required order and not a preference: `/pricing` reads
`paddleCheckoutEnabled()` at module scope, so a variable added after a deploy needs the `vercel
redeploy` that the auto-mode classifier blocks. Any ordinary forward commit does the baking.

**The live API key carries three permissions and no others**, derived from the calls rather than
guessed — the whole app makes exactly eight, on three entities: `transactions.create`;
`subscriptions.get`/`list`/`update`/`cancel`/`previewUpdate`; `discounts.create`/`update`. So
**Transactions write, Subscriptions read+write, Discounts read+write**. Nothing else, and
**Adjustments write above all**: that is the power to issue refunds, and no code path here issues
one — the webhook only *receives* `adjustment.*`, and verifies it with the signing secret, not with
this key (applying an event can still use the key: a Lifetime buying out a subscription
cancels it through `webhookApply.ts`). Products and Prices are absent too, since the ids come from the environment
and the app never asks Paddle for a price.

Two more things the dashboard holds that are decisions rather than defaults, both set 2026-09-19.
**Sales tax settings** is «Price includes tax»: it was «Automatic based on location», i.e. the
`location` mode this file forbids by name, which mattered not for the seven prices — each states
`tax_mode: internal` for itself — but for the next price created without the field. And
**«Display discount field on the checkout» is off**: `PaddleCheckout` already passes
`showAddDiscounts: false`, but the account default is a second door, and a code typed into
Paddle's own field attaches a discount without passing `redeemableCouponFor` — no row in
`coupon_redemptions`, no campaign ceiling applied, none of the three coupon columns (`coupon_code`,
`coupon_percent`, `discount_ends_at`) written.

### Coupons are Paddle Discounts, and a coupon never causes a sale at full price

Since 2026-09-14 each campaign in `lib/coupons/` has real Paddle Discount entities behind it
(`paddleDiscount.ts` translates, `paddleDiscountSync.ts` writes them on every create and edit),
attached at checkout by `dsc_…` id. **The invariant: a price shown with a coupon is the price
charged.** Two questions keep it, on the display path and the write path alike
(`couponRefusalFor`): «does this exact plan and cycle have a `dsc_…`» (`coupon-unsupported`
otherwise) and «may this account still redeem it» (`redeemability`). `changePaddlePlan` refuses
any redeemable coupon outright. `/billing` reads Paddle's `next_transaction` (never
`recurring_transaction_details`, which ignores the discount) and lets Paddle **veto** the
discount line (`paddleDiscountState` → `discountStillLive`), since a change of cycle stops the
discount applying. `coupon_redemptions`' insert is both the campaign ceiling and the clock that
tells a first payment from a renewal. All of it — entity counts, `restrict_to` all-or-nothing, the
2026-09-14/16 sandbox measurements — is in `src/lib/coupons/CLAUDE.md`.

## Domain, email, CAPTCHA and OAuth: six independent places, six different access methods

The production domain moved twice on 2026-08-21 (`songbook.sisqo.dev` →
`strumfolio.sisqo.dev` → `strumfolio.com`, the last a real domain on the Vercel registrar). A
future move needs all six again — Google OAuth was the one missed, caught a day later once
Google sign-in started failing:

- **Vercel** (project domains + DNS zone) — fully automatable: `vercel dns add`, and
  `POST`/`DELETE` on `/v9/projects/<id>/domains`. `strumfolio.com`'s zone is on Vercel's own
  nameservers, so records can be added from here.
- **Resend** (`RESEND_FROM`'s sending domain) — automatable with a `RESEND_API_KEY` (not in `.env.local`,
  which holds none — locally `deliverEmail` only logs). Its DKIM/SPF live on a dedicated `send.<domain>` subdomain Resend requires,
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
  here: manual every time, unverifiable by an agent. `localhost` is not on it, so the widget
  answers 400 locally and never draws its iframe — expected, and not a thing to debug.
  **`TurnstileWidget` must render explicitly (`?render=explicit` + `turnstile.render()`), never
  by Cloudflare's implicit `.cf-turnstile` scan**: that scan runs once, at script load, and
  `next/script` will not re-run a script it has already loaded, so with implicit rendering any
  *client-side* arrival at `/register`, `/forgot-password` or `/verify`'s resend — each
  reachable by `Link` from another page that carries the widget — got no widget and, worse, no
  hidden `captchaToken` input at all. Fixed 2026-09-11; it had made registration silently
  impossible for anybody who reached the form by navigating rather than by loading it.
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
The links this app emails (verify, reset, unsubscribe) take their origin from the same headers
through `requestOrigin`, which since 2026-09-24 passes them through `linkOrigin`
(`src/lib/origin.ts`): a host outside the product's own, this project's `*-sisqoz.vercel.app`
and localhost is written as `https://strumfolio.com`. Harmless on Vercel, where the headers
cannot be forged, and the one thing standing between a pass-through proxy and a reset link to a
stranger's site. **A new domain goes into `OWN_HOSTS` there**, or its emails link to the old one.

**`middleware.ts` strips NextAuth's own session-token `Set-Cookie` from every response, and
signing out does not work without it.** With the `jwt` strategy, Auth.js' `session` action
**re-signs the token and returns a fresh ninety-day cookie** on every request the matcher covers
(even `/brand/og-image.png`), appended after the callback returns — so the export is wrapped. Without
the strip, any GET in flight when `signOut()` deletes the cookie comes back carrying a new one and
restores the session; `OfflineSync`'s sequential walk of the repertoire guarantees one is in flight.
**It must be unconditional**: stripping only non-GET and `/api/auth/*` fixed the sign-out POST and
nothing a reader could see. **Test with songs** — an empty repertoire reproduces none of it.
**The cost**: a session lasts ninety days from signing in and no longer rolls.

## Design fidelity from Claude Design handoffs

Design mocks arrive in the Parallels shared folder `/media/psf/Download/songbook/` (macOS
host, not under `~/git`): a Claude Design handoff bundle of `README.md`, `project/<Name>.dc.html`
(an HTML/CSS prototype with inline styles), `support.js` and a `.thumbnail`. Read the
`.dc.html` directly rather than rendering it — every pixel value is in the inline styles.
Match a redesign **literally** — exact font sizes, card/table structure, copy — rather than
preserving prior "more accurate" wording; ask before keeping something the mock removed, but
default to matching the mock over defending the status quo.

**One qualification, learned from `Home.dc.html` (2026-09-08): a mock's copy can be older than
the code's.** That file was drawn against the landing page as it stood some weeks earlier, so
four of its nine feature cards carried claims this repo had already repaired and left comments
about — «Starting a session is part of the paid plans» (every plan leads one, free included,
`PLANS.free.mayLead`), «The paid plans remember which one you picked» about chord shapes
(`ReadingPanel` refuses the tap itself, so guitar is free and ukulele is paid), «no starter
library» (a new account is created with one songbook of public-domain traditionals) and the
booklet's «once they open» hedge written out by hand where the code reads it from
`plansEnforced()`. Its FAQ dropped the example-songbook sentence for the same reason, and it
asked one question — «Can I switch who's leading during a session?» — about a feature
`lib/strumTogether/` has no function for at all.

So: **design from the mock, copy from the code.** The literal-match rule exists to stop anybody
defending a *stylistic* preference against a drawing; it is not licence to re-publish a claim
the code proves false, and a landing page contradicting `/pricing` about what the free plan does
is the exact drift the rest of this file keeps warning about. When a mock's wording and a code
comment disagree, the comment was written against the behaviour — check it, then decide.

Colours need no such care: these mocks are drawn in this app's own light palette, so map each
hex onto the token that already holds it (`#f6f5f2` → `--bg`, `#dcdad4` → `--line`, `#e6e3dc` →
`--line-soft`, `#f4e7d9` → `--accent-soft`, `#f1efe9` → `--surface-3`, `#97490f` → `--accent`,
`#fffaf4` → `--on-accent`) and write the few that have none as a `color-mix` over one that does,
so the hand-tuned dark theme follows for free. `/accounts` and `/accounts/[email]` each state
this at length in globals.css; the public bar's `#3b4048` is the newest instance.

`DESIGN.md`'s frontmatter and prose are the living design-token source (colors, radius scale,
typography), kept in sync by hand with what ships — including the current font (Outfit,
replacing DM Sans as of August 2026).

Chromium here is a snap and cannot write into `/tmp/claude-*` — pass `--screenshot=` a path
under `$HOME` (e.g. `~/songbook-shots`) if a visual comparison is needed.

## The public side: `/` is the landing page, `/login` is only the form

Split on 2026-09-08; before, `/` required a session and `/login` was the only public page.

- **`/` serves two audiences from one URL.** `app/(home)/layout.tsx` decides: no session →
  `Landing` (`app/(home)/Landing.tsx`); a session → `page.tsx`, the reader's songbooks.
- **`/login` is the sign-in card**, inside the `(auth)` group with the four other narrow pages.
- **`/home` is the same landing page ignoring the session** (`app/home/page.tsx`): it renders
  `(home)/Landing` directly — a redirect or rewrite to `/` cannot work, since the request would
  still carry the session cookie. `indexable: false` in `publicRoutes.ts` *and* a `robots`
  `noindex` on the page, because the two answer different questions (this site advertising it,
  a crawler arriving from a pasted link). **It is linked from one place only, and only for a
  signed-in reader** — the public bar's brand mark (`lib/publicBar.ts`) — so a crawler only ever
  sees a mark pointing at `/`.
- **The two public bars are deliberately different.** `PublicHeader` draws the app's chrome with
  no sections (theme, «Pricing», one action); `SiteHeader` draws the blog/tools paper surface with
  `lib/publicNav.ts`'s sections, collapsing into `PublicNavMenu` below 48rem — two components
  because `SiteHeader`'s `--blog-*` tokens are scoped to `.blog`/`.tool-page`. Blog and tools are
  reachable from every page through `Footer`.
- **`PublicHeader` carries one action and knows who is reading** (2026-09-20, overruling
  `Home.dc.html`'s two): «Sign in» for a visitor, «My songbooks» for a reader, and the mark leads
  to `/` or `/home` by the same answer. `lib/publicBar.ts` decides it alone (`publicBarFrom` pure
  and tested, `publicBarFor` the read):
  - **It reads `currentUser()`, never `auth()`** — a session whose account was deleted would be
    handed «My songbooks» pointing at `/`, which for them *is* the landing page: a loop. A reader
    costs one memoized lookup per public page; a visitor never touches the database.
  - **Seven pages stopped being prerendered for it** — the four legal ones, `/changelog`,
    `/register`, `/forgot-password` — knowingly, over a frame of «Sign in» shown to a reader.
  - **`/pricing` has a third case**: a reader `requirePlanChoice` sent there gets no capsule,
    since every destination bounces them back; it is the only public page that may pay for
    `hasChosenPlan`.
  - **`SiteHeader` still prints «Sign in» + «Start free» to everybody**, a known, deferred defect:
    the blog and the seven tool pages are prerendered and are what search sends people to. The
    two ways out are deciding in the browser from the non-`httpOnly` `songbook-scope` cookie (a
    flash) or giving up the prerender.
- **«Start free» stays where it converts** — the landing hero and `PromoPanel` (which closes every
  article and tool), pointing at `/register`.
- **The brand mark is drawn on every public page**, including the two that print it again below
  (landing hero badge, `AuthLockup`): the repetition is known, not missed.

Six things here are expensive to get wrong, and none of them fails loudly:

- **`(home)/layout.tsx` has three outcomes, not two.** Without `hasDatabase`, `currentUser()` is
  null, and reading that as a visitor would serve the landing page on every `npm run dev` with no
  `DATABASE_URL`. The `hasDatabase` gate wraps the whole decision, and render and
  `generateMetadata` share one `audience()` helper so both get all three outcomes.
- **`/` is dual-audience, so `publicRoutes.ts` answers three questions**: session-free (the
  guard), indexable (the sitemap) and `isOutsideAppPath` (`FeedbackProvider`). Listing `/` as
  public without the third takes the feedback bubble off every reader's home screen, and looks
  right to anybody checking signed out. A second such path goes in `DUAL_AUDIENCE_PATHS`.
- **`ANONYMOUS_HEADER` on an anonymous `/` keeps the landing page out of the app's cache**:
  `sw.ts` gives `/` its own `NetworkFirst` rule and `rejectUnauthenticated` refuses anything
  carrying that header. The middleware's `SESSION_FREE_PATHS` branch is conditional (`if
  (request.auth) return`) for this reason — do not «simplify» it to `/follow`'s unconditional shape.
- **`/` is not precached.** Serwist answers a precached URL from the cache before `runtimeCaching`
  is consulted, so a device that installed while signed in kept that reader's home under `/` after
  sign-out, indistinguishable from a failed logout. The replacement rule is `NetworkFirst`, with no
  `ExpirationPlugin` (the installed app's `start_url` must open offline however long it has been),
  matching **navigations only** so an RSC fetch for `/` falls through to the RSC rules. Still
  unfixed: offline and signed out, the stored copy is the last signed-in home.
- **Every precached URL must be fetchable by a stranger, and no page is one.** Install fetches
  every manifest entry; a session-gated URL answers a redirect, `rejectUnauthenticated` refuses it,
  and since Serwist awaits all entries together **one such entry fails the whole install**, so the
  old worker serves for ever with no error anywhere. `scripts/precache-routes.ts` therefore lists
  only `/manifest.webmanifest`. Check any candidate with `curl -sSI -o /dev/null -w '%{http_code}
  %{num_redirects}' https://strumfolio.com<path>` → `200 0`. Worker *updates* start by themselves
  on any navigation, signed out included.
- **`lead_attribution.landing_page` changes meaning on 2026-09-08**: `/login` before, `/` after,
  for the same visits. No backfill, by decision (`attribution/CLAUDE.md`).

`manifest.ts` keeps `start_url: '/'`; `StandaloneRedirect` sends an installed app whose session
has lapsed to `/login`, client-side on purpose (nothing in a request says the page runs as an
installed app). **It is rendered by `(home)/layout.tsx`'s landing branch, not by `Landing`**, or
it would follow the page to `/home` and bounce the installed app off the one URL promised to show
the landing page unconditionally.

`SignOutButton` ends at `/login`; `deleteMyAccount` ends at `/`, since there is no account left.

## The registration notice names a person, and three texts have to agree

`registrationNotice()` sends the registrant's email (and name) to a private Telegram chat, and
`webhookApply.ts`'s payment alerts send pseudonymous account numbers and Paddle ids. Both are
personal data leaving the EEA, so **the Privacy Policy's §2, its processors list and §5 move
together with the notice text** — change one and the others are wrong. Detail in
`src/lib/telegram/CLAUDE.md`.

## The password is chosen on `/verify`, never on `/register`

Since 2026-09-24 registering asks for a name and an address only; the password (and the
newsletter switch) is answered on `/verify`, by whoever proved the inbox — so a stranger can no
longer register over an owner's pending attempt. Detail, including `NO_PENDING_PASSWORD`, in
`src/lib/auth/CLAUDE.md`.

## A session no longer outlives its account

- **`currentUser()` asks the database whether the account still exists** (`accountExists`,
  fails open, memoized with `cache()`), which closes every write through `permit()`/`accessTo()`.
- **Getting the reader off the screen is `requireAccount()`, and it has to be called** — in a
  layout wherever the segment has a `loading.tsx`. `src/lib/auth/gatedRoutes.test.ts` fails when a
  new page forgets it.
- **A session can be revoked** (`accounts.sessions_valid_after`, `0052`): the check wraps
  `auth()` in `src/auth.ts`, not `currentUser`, so operator actions reading `auth()` are covered.
  Always a JavaScript `Date`, never the database's `now()`.
- The middleware cannot do any of this: it runs on the edge, where Postgres does not reach.

The rest — the global-owner exemption, who writes `sessions_valid_after`, self-deletion — is in
`src/lib/auth/CLAUDE.md`.

## `/qa` signs somebody in without a password, and must never exist in production

`app/qa/page.tsx` makes an already-verified account and issues its session in one click. Two
independent guards, both in `lib/qa/entry.ts` and **both on the first lines of
`lib/qa/actions.ts`** (a Server Action is reachable by id whatever the page renders):
`qaAllowed` is an *allowlist* of `VERCEL_ENV` (absent, `preview`, `development`) — never
`!== 'production'`, which fails open — and `isQaEmail` admits only `@strumfolio.test`. No QA
account can be a global owner from here (`QA_OWNER_EMAIL` exists to be pasted into
`ALLOWED_EMAILS` by hand). How to use it for a live run is `INTEGRATION-TESTS.md`; the rest is in
`src/lib/qa/CLAUDE.md`.

## Everything this app stores in a browser is scoped to one account

- **Every `localStorage` key is built by `keyFor` (`src/lib/storage/scope.ts`), never written as a
  constant**, and no tag means no cache at all, never an unscoped one. `DEVICE_KEYS` (`songs:theme`,
  `songs:coupon` and the stored scope) are the device's, not the account's, and stay exempt.
- **Any new service-worker page cache goes into `PAGE_CACHES`** (`lib/storage/pageCaches.ts`) in the
  same commit, or sign-out and a change of account stop clearing it.

The mechanism — the `songbook-scope` cookie, the two defences, the worker's epoch, purge-then-warm
— is in `src/lib/storage/CLAUDE.md`.

## The reading bar's motion

No `loading.tsx` under `songs/[slug]`, by decision, and the next/previous songs are prefetched
in full. The rest (direction, the end-of-song glow, `:active` on iOS) is in
`src/components/CLAUDE.md`.

## Adding the app to the home screen

The hamburger's "Add to home screen" row is **absent inside the installed app on purpose** —
check `/app-settings` («opened from the Home Screen» / «in a browser tab») before diagnosing a
deploy. The row, `/help` §7 and the landing page's install FAQ must agree. The rest is in
`src/lib/install/CLAUDE.md`.
