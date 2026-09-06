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
in them lives in this file and the nested ones it maps below; the rest was delivery history,
which `git log` and `/changelog` already hold. Do **not** recreate the convention: a feature
being built does not get a plan file of its own, and nothing gets "folded in" anywhere. All of
it is still readable
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

## Where the rest lives

Repo-wide rules stay in this file. Guidance scoped to one subsystem lives in a nested
`CLAUDE.md`, which loads only when Claude works under that directory:

| File | Covers |
|---|---|
| `src/lib/db/CLAUDE.md` | numeric keys, the four tables still keyed by an email, why `db:generate` is broken |
| `src/lib/plans/CLAUDE.md` | plans, entitlements, the mock checkout and its two env flags |
| `src/lib/coupons/CLAUDE.md` | campaigns, `liveDiscount`, and what a coupon is not allowed to decide |
| `src/lib/accounts/CLAUDE.md` | the admin surface, names, the newsletter preference, the old-account quirk |
| `src/lib/music/CLAUDE.md` | the song chips, alternate chord shapes, German and Nashville notation |
| `src/lib/import/CLAUDE.md` | the thirteen extensions, and what the importer refuses to guess |
| `src/lib/booklet/CLAUDE.md` | why the PDF prints the written key, and the one way to override it |

**Anything that scopes by directory can be missed by a command that edits no file**, so the
three facts whose absence is expensive are repeated here rather than left behind a path:

- **`db:generate` does not run**, and every migration since `0024` is written by hand — the
  `.sql` file *and* its `drizzle/meta/_journal.json` entry, which is the half that is easy to
  forget and, per *Migrating the production database* below, the load-bearing one.
- **Four tables are still keyed by an email on purpose** — `credentials`,
  `password_reset_tokens`, `sign_ins`, `pending_registrations`. A foreign key on any of them
  breaks sign-in rather than hardening it.
- **While the mock checkout is on, any signed-in reader can give their account any plan for
  free.** Neither `SONGBOOK_PLANS` nor `SONGBOOK_MOCK_CHECKOUT` is a security boundary.

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
