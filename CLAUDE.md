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
| `src/lib/import/CLAUDE.md` | the fifteen extensions, how PDF and Word are read, and what the importer refuses to guess |
| `src/lib/booklet/CLAUDE.md` | why the PDF prints the written key, and the one way to override it |
| `src/lib/outreach/CLAUDE.md` | actions the platform aims at a reader, and why one can never happen twice |
| `src/lib/courtesy/CLAUDE.md` | the two founder emails, legitimate interest vs. newsletter consent, the stateless unsubscribe link |
| `src/lib/attribution/CLAUDE.md` | where a lead came from, the four seams that record it, and the touch rules |

**Anything that scopes by directory can be missed by a command that edits no file**, so the
four facts whose absence is expensive are repeated here rather than left behind a path:

- **`db:generate` does not run**, and every migration since `0024` is written by hand — the
  `.sql` file *and* its `drizzle/meta/_journal.json` entry, which is the half that is easy to
  forget and, per *Migrating the production database* below, the load-bearing one.
- **Four tables are still keyed by an email on purpose** — `credentials`,
  `password_reset_tokens`, `sign_ins`, `pending_registrations`. A foreign key on any of them
  breaks sign-in rather than hardening it.
- **While the mock checkout is on, any signed-in reader can give their account any plan for
  free.** Neither `SONGBOOK_PLANS` nor `SONGBOOK_MOCK_CHECKOUT` is a security boundary.
- **`songbook-attribution` is the first cookie here that is not strictly necessary**, and the
  Cookie Policy had to be rewritten for it: §2 gained a paragraph, «No advertising or third-party
  tracking» and §3's «everything above is strictly necessary… we will ask for your consent» were
  both no longer true as written. Its legal basis is legitimate interest, Art. 6(1)(f), so the
  Privacy Policy's §3 table and the §7 right-to-object list both name it — **change one of those
  five places and the others are wrong**, the rule the booklet override and the install row already
  live under. There is no consent banner, by decision.

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
a signed-out page that looks identical either way — the landing page's plan-limits FAQ at
`/` (`plansEnforced() && !mockCheckoutEnabled()`, in `app/(home)/Landing.tsx`) is one that
does. It was on `/login` until the public home was split out.

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
server, per *Development and Production are separate Neon databases* below. The dump is
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

**`middleware.ts` strips NextAuth's own session-token `Set-Cookie` from every response, and
signing out does not work without it.** `auth()` asks Auth.js for the session on each request,
and with the `jwt` strategy the `session` action does not merely read the token — it **re-signs
it and returns a fresh ninety-day cookie**. `handleAuth` appends that *after* this file's
callback has returned, so it cannot be dropped from inside the callback; the export is wrapped.

That refresh rides on **every request the matcher covers** — measured against production
2026-09-09, `/brand/og-image.png` and `/manifest.webmanifest` each answered with a session
cookie. So when `signOut()` deletes the cookie, **any GET already in flight comes back a few
milliseconds later carrying a fresh ninety-day cookie and restores the session**. `OfflineSync`
makes that certain rather than unlucky: it walks the reader's whole repertoire with sequential
`fetch()` calls, so anybody with songs always has one in flight. Reproduced in a real browser
against production with service workers blocked.

**It must be unconditional, and the narrower version is the trap.** This first shipped stripping
only non-GET and `/api/auth/*` — which fixed the sign-out POST, verified, and changed nothing a
reader could see, because the request that resurrects the session is an ordinary GET for a PNG.
An account with an **empty repertoire cannot reproduce any of it**, which is what hid the bug
through three wrong diagnoses; test with songs.

**The cost, stated plainly**: the ninety days no longer roll — a session lasts ninety days from
signing in, not from the last visit, since this was the only place the expiry was extended
(`auth()` in a server component cannot write cookies). Auth.js' own `session.updateAge` exists
to throttle exactly this refresh and the middleware path ignores it, so what is given up was
never a considered design.

Two service-worker bugs were found and fixed while chasing that one, and neither was the cause —
worth knowing so the next reader does not re-derive them as suspects: `/` was precached and
therefore served from cache without ever asking the server, and `/password` in the same manifest
made the worker's install fail outright for anybody signed out. Both are covered above.

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

Until 2026-09-08, `/` required a session and `middleware.ts` redirected anybody without one to
`/login` — so the sign-in form was also the product's only public page, carrying the hero, the
three demo bands, eleven features and twenty-two FAQ answers. `publicRoutes.ts` had recorded
that as an open problem beside its own entry for months. It is split now:

- **`/` serves two audiences from one URL.** `app/(home)/layout.tsx` decides: no session →
  `Landing` (the public home, `app/(home)/Landing.tsx`); a session → `page.tsx`, the reader's
  own songbooks, unchanged.
- **`/login` is the sign-in card**, back inside the `(auth)` group with the four other narrow
  sign-in pages, having left it only because it used to be 70rem wide.
- **`/home` is the same landing page at a URL that ignores the session** (`app/home/page.tsx`,
  added 2026-09-11), so the public home can be read without signing out of the app to see it.
  It renders `(home)/Landing` directly with no branch of any kind — not a redirect or a rewrite
  to `/`, which cannot work: the request would reach `(home)/layout.tsx` still carrying the
  session cookie and be served the app. Its row in `publicRoutes.ts` is `indexable: false` and
  the page adds a `robots` `noindex` of its own, because the two flags answer different
  questions — one stops this site advertising the URL, the other stops a crawler that arrived
  from a pasted link putting a byte-identical duplicate of `/` in front of the same search
  intent. Nothing links to it, by design: it is a tool for whoever works on the page.
- **The two public bars are deliberately not the same bar.** `PublicHeader` draws the app's
  own chrome and, per `Home.dc.html`, carries no sections at all — theme, «Pricing», «Sign
  in», «Start free». `SiteHeader` draws the paper surface the blog and the tools share and
  does carry them, from `lib/publicNav.ts`, collapsing into `PublicNavMenu` below 48rem. Two
  components because `SiteHeader`'s `--blog-*` tokens are scoped to `.blog`/`.tool-page` and
  cannot leave them. Blog and tools are reachable from every page through `Footer`'s row.

Four things here are expensive to get wrong, and none of them fails loudly:

- **The branch in `(home)/layout.tsx` has three outcomes, not two.** `hasDatabase` false makes
  `currentUser()` null, and reading that as "a visitor" serves the marketing page at `/` on
  every `npm run dev` with no `DATABASE_URL` — the normal way to work locally — leaving the
  home screen unreachable. The `hasDatabase` gate wraps the whole decision for that reason.
  The same three outcomes are why the render and `generateMetadata` share one `audience()`
  helper: written out twice, the metadata got two of the three and local dev rendered the app
  under the landing page's title.
- **`/` is the first dual-audience path**, so `publicRoutes.ts` answers three questions rather
  than two: session-free (the guard), indexable (the sitemap), and `isOutsideAppPath` — which
  `FeedbackProvider` asks. Adding `/` to the list and stopping there takes the feedback bubble
  off the app's own home screen for every signed-in reader, and looks correct to anybody who
  checks it signed out. A second dual-audience path goes in `DUAL_AUDIENCE_PATHS`, not into a
  predicate as a string.
- **`ANONYMOUS_HEADER` on an anonymous `/` is what keeps the marketing page out of the app's
  cache.** `sw.ts` gives `/` its own `NetworkFirst` rule and `rejectUnauthenticated` refuses
  anything carrying that header, so a browser that visits while signed out never files the
  *marketing page* under `/` and is never served it as the app's home afterwards. The
  middleware's `SESSION_FREE_PATHS` branch is conditional (`if (request.auth) return`)
  precisely so this holds; do not "simplify" it to the unconditional shape `/follow` uses.
- **`/` is deliberately not precached** (changed 2026-09-09; `scripts/precache-routes.ts` now
  lists only `/password` and the manifest). Serwist registers its `PrecacheRoute` before
  anything in `runtimeCaching` and answers from the cache without asking the network, so a
  device that installed while signed in kept that reader's home under `/` for good: the session
  really ended — cookie cleared, every other page redirecting to `/login` — and `/` alone went
  on showing the app, which is indistinguishable from a logout that failed. That was the bug.
  The replacement rule is `NetworkFirst`, has no `ExpirationPlugin` (the installed app's
  `start_url` must open offline however long it has been), and matches **navigations only** —
  an RSC fetch for `/` carries a body that is not HTML and must keep falling through to the RSC
  rules. What is still unfixed: offline and signed out, the stored copy is the last signed-in
  home, because nothing clears this device's caches on sign-out.
- **Every precached URL must be fetchable by a stranger, and no page is one.** This is the
  half that made the bug above self-sealing, so it is worth more care than it looks. The
  worker's `install` fetches every manifest entry with `credentials: 'same-origin'`; a
  session-gated URL answers a redirect to `/login` for a browser with no session,
  `rejectUnauthenticated` refuses a redirected response, `cachePut` returns false and
  `PrecacheStrategy` throws — and since Serwist awaits every entry together, **one such entry
  fails the whole install**, so the new worker is discarded and the old one serves for ever.
  There is no error to find: no failed request, just a worker that never changes. It bit for
  real on 2026-09-09 — removing `/` from the list shipped and fixed nothing on anybody's
  device, because `/password` was still listed and a *signed-out* reader is both the one
  carrying the stale home and the one who cannot install the worker that would replace it.
  `scripts/precache-routes.ts` is down to `/manifest.webmanifest` for that reason. Check any
  candidate before adding it: `curl -sSI -o /dev/null -w '%{http_code} %{num_redirects}'
  https://strumfolio.com<path>` must say `200 0`. And note what this retires — `sw.ts`'s old
  "registration only happens behind the gate, so a valid cookie exists at install time" is
  true of the first registration and false of every **update**, which the browser starts by
  itself on any navigation in scope.
- **`lead_attribution.landing_page` changes meaning on the cutover date**: `/login` before,
  `/` after, for the same visits. No backfill, by decision. `attribution/CLAUDE.md` carries
  the date.

`manifest.ts` keeps `start_url: '/'`, so the installed app whose session has lapsed would open
onto the marketing page; `StandaloneRedirect` sends it to `/login` instead. Done client-side on
purpose — nothing in a request says whether the browser is running the page as an installed app,
and the server-side alternative (`start_url: '/?app=1'`) would need a branch in the middleware
for a cosmetic redirect. It used to have a sharper objection than that — the parameter landed on
the one URL the service worker precached — which the line above retired. That component's
comment has the whole argument.

**It is rendered by `(home)/layout.tsx`'s landing branch, not by `Landing`**, which is where it
sat until `/home` arrived. Its whole argument is about that one URL, so riding along inside the
component would have followed the page to `/home` and bounced the installed app away from the
URL whose only promise is to show the landing page unconditionally.

`SignOutButton` ends at `/login`; `deleteMyAccount` ends at `/`, because there is no account
left to sign in to.

## The registration notice names a person, and three texts have to agree

`registrationNotice()` (`src/lib/telegram/registrationNotice.ts`) sends the registrant's **email
address, plus their name when one is known**, to a private Telegram chat, and carries no link.
Between 2026-09-03 and 2026-09-11 it took no parameters and named nobody, precisely so no caller
could hand it an address; that was reversed on request, because the notice is read on a phone away
from a signed-in browser and «something happened, go and look» is not worth a notification.

**It is personal data leaving the EEA, so the Privacy Policy carries it in three places and all
three move together**: §2 says what the message contains, the processors list names Telegram
FZ-LLC and what it receives, and §5 states that it is established in the UAE, covered by no
adequacy decision and not certified under the Data Privacy Framework, with an opt-out by email.
Change the notice text and those three are wrong — the rule the booklet override and the install
row already live under. Telegram offers no Chapter V safeguard to sign, which is why §5 states the
position rather than claiming one; if that exposure is ever judged too high, the fix is to stop
sending the field, not to soften the sentence.

The three callers (`auth.ts`, `verify/actions.ts`, `accounts/actions.ts`) each pass the very
`{firstName, lastName} | undefined` they already build for `provisionAccount`, from one local
`registeredName`, so the notification cannot describe a different person than the row it announces.

## A session no longer outlives its account

**`currentUser()` now asks the database whether the account still exists**, and that reverses a
property this repo used to state as a feature: it was deliberately query-free — `auth()` reads the
JWT cookie, `readAccountCookie` a cookie, `roleOf` the environment. Everything in that chain is
pure, so `roleOf` answered `admin` for a reader looking at the account named by their own email
whether or not a row backed it. **Deleting somebody's account removed their rows and left their
browser signed in for the rest of the ninety-day cookie, with every write still permitted.**
`deleteMyAccount` hid it by calling `signOut`; `deleteAccount` — an operator removing *somebody
else's* account — cannot reach that browser at all. Reproduced and fixed 2026-09-11.

- **Two halves, and only one of them is automatic.** `currentUser()` answering `null` closes the
  writes everywhere at once, because every write funnels through `permit()`. Getting the reader
  off the screen is `requireAccount()` (`lib/auth/session.ts`), and that has to be *called* — the
  pages read `currentUser` to scope their data, not as a gate.
- **`middleware.ts` cannot do this**, which is why it is not there: it runs on the edge, where
  this app's Postgres driver does not reach — the same constraint that makes `rememberUrlCoupon`
  a client effect. The only universal gate in the app is the one that cannot ask the question.
- **`src/lib/auth/gatedRoutes.test.ts` is what stops a new route forgetting.** It walks
  `src/app/**/page.tsx`, skips what `publicRoutes.ts` calls session-free plus a named exempt set,
  and fails when a page has no `requireAccount` in itself or in a layout above it. It earned its
  place immediately: it caught `/brand`, `/help/chordpro` and `/songs/[slug]/edit` — the editor —
  in the same commit that added it.
- **Put the call in a layout wherever the segment has a `loading.tsx`** (`(home)` and
  `songbooks/[slug]` are the two). A `redirect()` thrown from inside a page's own async body is
  not a redirect once Suspense is streaming a shell around it; `(home)/layout.tsx` carries that
  scar in full.
- **A global owner is exempt**, the same exemption `isAdmitted` already stated: their admission
  comes from `ALLOWED_EMAILS` rather than a row, and they may be standing inside a customer's
  account they have just deleted from that very screen.
- **`accountExists` fails open** — no database configured, or a read that throws, both answer
  "exists". Answering "gone" on a blip would sign out every reader of the app at once, which is
  far worse than a deleted account surviving a few more minutes. Memoized with React `cache()`,
  the first use of it here, so the several `currentUser()` calls one request makes cost one query.

## Everything this app stores in a browser is scoped to one account

**Every `localStorage` key here must be built by `keyFor` (`src/lib/storage/scope.ts`), never
written as a constant.** The keys used to be constants — `songs:songbooks`, `songs:edits`,
`songs:prefs` — so each said *what* was stored and never *whose* it was, and nothing emptied
any of them at sign-out or when a second account signed in on the same browser. The next reader
inherited the previous one's songbook names, and in `songs:edits` their words and chords.

It was visible rather than merely latent, and the mechanism is worth knowing because it makes
any repeat of it look like a rendering glitch: `SongbookProvider` seeds its state from the
server snapshot — which is correct and account-scoped — and then **replaces it in a
`useLayoutEffect`, which runs before the browser paints**, with whatever is in the cache, while
`refresh()` in an ordinary `useEffect` puts it right one round trip later. So the wrong
repertoire is what a reader actually sees for the width of a fetch, after which it corrects
itself and leaves nothing to find. Reported as «per un attimo si vedono i miei canzonieri».

- **The tag comes from a cookie, not a prop.** `middleware.ts` computes it on every signed-in
  request (`accountScopeTag` over `currentAccountFor`) and sets `songbook-scope`, which is the
  one cookie here that is deliberately **not** `httpOnly` — the page's own script is the
  consumer. It authorises nothing: the server scopes every read by `accountOwnerEmail`
  regardless, so forging it buys a browser only its own cache back. A prop was rejected because
  `PrefsProvider` alone is mounted on about twenty pages, and one omission would silently fall
  back to an unscoped key — the bug again, on one page, invisibly.
- **Recomputed every signed-in request, not only when the cookie is missing.** That is what
  makes a global owner switching into a customer's account switch caches too, with no second
  place to keep in step; `writeAccountCookie` stays a cookie write and nothing more.
- **No tag means no cache at all, never an unscoped one.** Every store refuses to read *and* to
  write when `keyFor` answers null. The server-rendered snapshot is always present and always
  right, so the cost is a cache miss.
- **`mayAccess` and `currentAccountFor` live in `lib/accounts/scope.ts`**, not in
  `accounts/current.ts` where they were written and from where they are still re-exported:
  `middleware.ts` needs them and runs on the edge runtime, where `next/headers` — which
  `current.ts` imports — cannot follow. One copy of the rule, or the tag would name a different
  account than the session does.
- **`songs:theme` is exempt and must stay exempt** (`DEVICE_KEYS`). The theme belongs to the
  device, not to whoever is signed in, and it is read by the inline script in `app/layout.tsx`
  before React exists — purging it would flash the whole app to the other theme on every change
  of account.
- **Two defences, because either alone fails where the other holds.** The keys are scoped, so
  another account's cache cannot be *read*; and the whole area plus every Cache Storage entry is
  emptied when the tag changes (`purgeIfForeign`, called from `keyFor` itself so there is no
  mount to forget) and again at sign-out (`StorageCleanup` on `/login`, armed by the sign-out
  action deleting the scope cookie), so another account's words do not *linger* in devtools on a
  shared machine.
- **The service worker's page caches have the same shape and are handled by clearing, not
  scoping**: `rejectUnauthenticated` only refuses anonymous and redirected responses, so a
  signed-in reader's rendered screens are stored under plain URL keys. `sw.ts` recorded «nothing
  evicts it when a session ends» as understood-and-accepted; that reasoning covered offline and
  not the case where a second account signs in on the device.

Verified before/after in a real browser on 2026-09-11 with a planted foreign cache: the other
account's songbook name was visible with the unscoped store and absent at all forty samples
across the flash window with the scoped one.

## Adding the app to the home screen

The hamburger's "Add to home screen" row (`src/lib/install/`, `InstallPanel.tsx`) is one row
with two behaviours, and three facts about it are easy to break from far away:

- **It is absent inside the installed app**, and that is the first thing to check when it
  looks missing rather than the cache or the deploy: `display-mode: standalone` (and iOS'
  `navigator.standalone`) means the app is already there, so the row has nothing to do. It
  cost a full round of deploy-side diagnosis once — production was serving the right commit
  and `beforeinstallprompt` was firing; the phone was simply opened from its home-screen
  icon. `/app-settings` answers that question directly, in `DeviceLaunchCheck`'s own line:
  «opened from the Home Screen» or «in a browser tab».
- **Three surfaces say this out loud and must agree**: the row itself, `/help` §7, and the
  public FAQ answer on installing, which is now on `/` (`app/(home)/Landing.tsx`) rather than
  on `/login`. Change one and the other two are wrong — the same rule the booklet's own
  override already lives under.
- **`beforeinstallprompt` is captured by an inline script in `app/layout.tsx`**, not by a
  listener in an effect: it fires once, and on a warm cache it fires before React hydrates,
  so an effect misses it exactly on the fastest loads. Its `preventDefault()` is required —
  without it Chromium adds its own install infobar beside our row. That call now runs on
  every page, landing pages included, so **Chromium's automatic infobar is suppressed
  site-wide**; the browser's own ⋮ → "Install app" and the desktop omnibox icon still work.
- **A visitor still has no way to install, and that is now a decision rather than an
  absence.** It used to hold because `/login` and `PublicHeader` had no hamburger to put the
  row in. `PublicHeader` has one since the public site grew a navigation
  (`PublicNavMenu`), so the row *could* go there and deliberately does not: installing is a
  gesture for somebody who has an account, not for somebody deciding whether to get one.
  Note what this costs, since it is invisible — `preventDefault()` on
  `beforeinstallprompt` runs site-wide (above), so a visitor gets neither our row nor
  Chromium's own infobar, and on iOS there is no infobar to get. Re-open the question by
  putting the row in the public menu, not by weakening that `preventDefault()`.
