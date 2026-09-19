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
`CLAUDE.md`, which loads only when Claude works under that directory. **The last two rows are
neither**: `CASES.md` and `INTEGRATION-TESTS.md` are documents rather than rule files — nothing
loads them automatically, and they are listed here because this table is the index of where
everything that is not in this file has gone. Open them by name when the work is theirs.

| File | Covers |
|---|---|
| `src/lib/db/CLAUDE.md` | numeric keys, the four tables still keyed by an email, why `db:generate` is broken |
| `src/lib/plans/CLAUDE.md` | plans, entitlements, the mock checkout and its two env flags, which Paddle id the code holds, and how the catalogue is verified |
| `src/lib/coupons/CLAUDE.md` | campaigns, `liveDiscount`, and what a coupon is not allowed to decide |
| `src/lib/accounts/CLAUDE.md` | the admin surface, names, the newsletter preference, the old-account quirk |
| `src/lib/music/CLAUDE.md` | the song chips, alternate chord shapes, German and Nashville notation |
| `src/lib/import/CLAUDE.md` | the fifteen extensions, how PDF and Word are read, and what the importer refuses to guess |
| `src/lib/booklet/CLAUDE.md` | why the PDF prints the written key, and the one way to override it |
| `src/lib/outreach/CLAUDE.md` | actions the platform aims at a reader, and why one can never happen twice |
| `src/lib/courtesy/CLAUDE.md` | the two founder emails, legitimate interest vs. newsletter consent, the stateless unsubscribe link |
| `src/lib/attribution/CLAUDE.md` | where a lead came from, the four seams that record it, and the touch rules |
| `src/lib/plans/CASES.md` | the forty-one plan-change cases by their analysis-document number: what each does, which test covers it, and whether anybody has ever watched it happen |
| `INTEGRATION-TESTS.md` | the live runs — which environment and why not the other two, why they are driven through a real signed-in Chrome and photographed step by step, the throwaway users, the sandbox card, how a Paddle transaction settles an argument between the screen and the charge, and where the screenshots go |

**Anything that scopes by directory can be missed by a command that edits no file**, so the
four facts whose absence is expensive are repeated here rather than left behind a path:

- **`db:generate` does not run**, and every migration since `0024` is written by hand — the
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

### Preview is a third database, and until 2026-09-12 it was nothing at all

The section heading above says two databases; there are three. `neon-byzantium-harbor`
(`ep-blue-mode-avih2w94`, Postgres 18.6) was created on 2026-09-12 with
`vercel integration add neon -e preview --plan free_v3 -m region=iad1 -m auth=false`, connected
to **Preview only**, so sandbox purchases have somewhere to land that is neither production nor
the dev snapshot of it. The integration writes `DATABASE_URL` itself, which is the point: no
connection string passes through a person or a shell on the way in.

**Preview had never been configured**, and the bullet above claiming `strumfolio-db-dev` serves
"local/preview work" was true of local and aspirational about preview: the environment had no
`DATABASE_URL` and no `AUTH_SECRET`, so every preview deployment ran with no database at all.
It now carries its own `AUTH_SECRET`, `ALLOWED_EMAILS` and `SONGBOOK_PLANS=on`.

**Schema changes ship three times, and nothing here can run the third.** The bullet above says
migrations ship against dev and against production; preview is a third database with a third
`__drizzle_migrations`, and no deploy step applies anything to it — `vercel.json` is four words
and `build` is `precache-routes` plus `next build`.

**The preview has the same `prod-url` arrangement now, and it is empty until somebody fills it.**
`~/.config/strumfolio/preview-url` is the gemello of `prod-url` — it reads
`STRUMFOLIO_PREVIEW_DATABASE_URL` out of `preview-db.env`, refuses anything that is not
`ep-blue-mode-avih2w94`, refuses the pooled endpoint, and prints nothing otherwise; its
missing-file error *is* the instruction for creating it. That indirection is the whole point:
the string is pasted once, by hand, into a file outside the repo, and every migration after that
is `DATABASE_URL_UNPOOLED="$(~/.config/strumfolio/preview-url)" npm run db:migrate` with the
secret never passing through a shell history, a transcript or `.env.local`. What cannot happen
is an agent *fetching* it: `vercel env pull --environment=preview` is refused by Claude Code's
auto-mode classifier, the same refusal `vercel redeploy` gets, and routing around that is not
the fix — being handed access and taking it are different things.

Until that file exists, a migration the preview needs is a step for whoever owns that
environment, and the code reading the new column must not be deployed there expecting to find
it: the symptom is not a missing feature but `column "…" does not exist` thrown out of the page
that reads it — measured on 2026-09-15, when `/billing` sat on «One moment…» for exactly that
reason. Rehearse against dev first, and against production too — `BEGIN; \i drizzle/00xx.sql;
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

The payment processor. Nothing in the app talks to it yet — the mock checkout still writes the
columns a real webhook will write (`plans/CLAUDE.md`) — but the sandbox catalogue exists since
2026-09-12 and the facts below are the ones that cost something to rediscover.

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

**The seven ids live in `PADDLE_PRICE_IDS`, not in `paddleId`, and that reverses what
`paddlePrices.ts` and `plans/CLAUDE.md` describe as the plan.** Writing them into `prices.ts`
was tried the same day and reverted within the hour, because the committed id wins **in every
environment**: `paddlePriceId` consults the environment only where `paddleId` is empty, so the
moment all seven are filled the *preview* deployment stops reading its sandbox ids and starts
naming live prices at the sandbox API — killing the one environment where a purchase can be
tested at all, which is what `INTEGRATION-TESTS.md` is built on. The original comment reasoned
about production alone and never about the same code running elsewhere.

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

**And the reader has to be told, which /pricing stopped doing for four months.** The claim was
true in the code, true in Paddle and measured in the table above, and between the v3.4 redesign
(`134c043`, which dropped `BILLING_NOTE` along with everything else the mock does not draw) and
2026-09-17 it was written **nowhere a visitor could see** — the page printed «€34.99» and left
«plus whatever your country adds» to be ruled out by reaching the checkout and looking. Those are
two different offers, so this is not a missing disclaimer but a missing half of the price.
`TAX_NOTE` (`prices.ts`, beside `euro()` and the table that makes the claim true) is the fix, and
it is deliberately **repeated beside every number** rather than written once under the grid: a
reader compares one column against another and never reads a price list top to bottom.

**Beside and not under, which is why it is abbreviated.** It shipped as «Tax included» on a line
of its own for a day and was moved onto the price's own line on request — «€3.49 /mo Tax incl.».
That position answers the question a reader is actually asking, and it will not hold eleven
characters: a plan card's content box is about 140px at the four-column desktop layout, so «Tax
included» pushes «€9.99/mo» past the edge where «Tax incl.» fits with room to spare. Verified at
1280, 1024, 820 and 390px, on both cycles, with and without a coupon: one line everywhere, and
`white-space: nowrap` means the phrase can only ever break *before* «Tax», never between the two
words. A line of its own was also the worse place on its own merits — a card is a flex column
with a `0.75rem` gap, so it sat as far from the number as the audience sentence did, and on a
discounted card the coupon caption came between them.

So the tax claim is now printed in **six** places and they move together — the rule this file
already states about the booklet override, the install row and the Telegram notice. On /pricing:
the four plan cards (`.plan-price-tax`, absent on Free, which has no price to tax), the
comparison table's header (`.plan-table-tax`, inside `.plan-table-price` rather than after it,
since that one is `display: block` and a sibling would start its own line) and the Lifetime panel
(`.lifetime-tax`). In
`PaddleCheckout`: `footNote`'s «Tax included, in euro.» on a first purchase, and the same
sentence under a **plan change**, which had been quoting two amounts about to be charged and
saying nothing about either — added the same day, and kept out of `footNote` itself because that
string also names a cycle and a renewal date, which on a change is exactly what the calendar
above it decides. And § 7 of the Terms of Service, which words it the long way («VAT or any other
applicable sales tax — the amount shown is the amount charged») and is the one that has to stay
true if the others are ever reworded.

**«Tax», never «VAT»**, wherever it is printed, and the stop in «incl.» is part of the string
rather than styling — «Tax incl» reads as a word somebody cut off. Paddle is the merchant of record and collects
whatever the reader's own jurisdiction levies, so «VAT included» is simply false for an American
one. The Italian shorthand this was reported in («i prezzi sono tutti vat included») is the fact,
not the wording.

**Two of the three facts `BILLING_NOTE` carried are still gone, and that stays a decision.** No
free trial needs no line — the Free card says the plan has no end date, which is what a trial
claim would be denying, and no price carries a `trial_period` (above). The bank's cut on a
non-euro card is in Terms § 7 and nowhere on /pricing; the comment in `pricing/page.tsx` that
called it «not stated anywhere else on the site either» was wrong on that point and has been
corrected rather than acted on.

Everything else about the catalogue is checked by `scripts/verify-paddle-catalogue.ts`, which
compares it against `PRICES` row by row — `--sandbox` matches on the stamped `custom_data` and
needs no ids, and since no Paddle credential lives in this repo the catalogue is fetched
through the MCP server and passed in with `--from`. `plans/CLAUDE.md` has the rest.

Three more properties of that catalogue, each of which is a decision rather than a default:

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

The inline checkout frame is Paddle's, inside our card. What the *code* controls is in
`PaddleCheckout.tsx` — `theme` pinned to `light` (see below), `variant: 'one-page'`, `frameStyle`
with a transparent background and no border, `showAddDiscounts: false`. Everything else is
**`/checkout-settings#Inline`** — the documentation calls it «Branded inline checkout» and there
is **no page by that name**: it is the Inline tab of Checkout Settings, verified 2026-09-16
against the dashboard's own navigation, so do not go hunting for a second screen. Five sections
(Overall, Buttons, Inputs, Links, Messages), living in the Paddle account rather than in this
repo.

**The trap, and it is the whole of this section: an *unset* colour follows the theme, a *set* one
does not — and pressing Save sets every colour in the editor, including the ones nobody touched
and the ones somebody has just emptied.** There is no per-theme palette. What that means in practice was measured on
2026-09-15: after the first save the dark checkout's labels, its typed text and the selected
country all turned near-black on near-black, because `#2B2A35` — Paddle's *light* default — had
been written into the fields as an explicit value. The white text that used to appear in dark
was not a setting; it was the absence of one.

**A cleared field cannot be saved, and that is the whole mechanism.** Emptying one gets the
value out of the *editor* — it goes back to showing its default hex in grey with an empty
swatch, where a set one is dark text with the colour filled in — and then **Save writes the
default into it as an explicit value**. Measured properly on 2026-09-16, which is what this
paragraph used to get wrong: nine colours were emptied (the five in Inputs, the four in
Messages), saved, and the page reloaded. Every one came back explicit — `Label color` `#2B2A35`,
`Placeholder` `#9393A8`, `Font` `#2B2A35`, `Border` `#D2D4DE`, `Checkbox background` `#FFFFFF`,
and both message pairs `#EBECF0`/`#FFFFFF`. So there is no way through this editor to *persist*
an unset colour once anything has been saved.

**One detail in that is a trap of its own**: the grey hint shown in an empty field is not
always the value Save writes. `Label color` displayed `#9393A8` while empty and was saved as
`#2B2A35`. Read the hint as «something will be written here», never as «this is what you will
get».

**An earlier note here blamed the wrong thing and is retracted.** It said that branding the
checkout at all makes Paddle stop giving the labels their dark palette, whether or not `Label
color` holds a value. There is no such rule: what happens is only ever the sentence above, and
the labels stayed unreadable after a clear because the clear never survived the Save.

**`Reset` is «revert to the last published settings», not «restore Paddle's defaults»** — its
own confirmation dialog says so, and adds that Paddle's defaults are used only if nothing was
ever published. So it undoes unsaved edits and is safe to press; it is not a way back to an
unbranded checkout, and a previous note here calling it a bulk clear was wrong.

**Which is what settles «keep only the orange button and let the rest follow the theme»**, the
obvious idea and a good one: it cannot be persisted. Clear the neutrals, keep the accent, press
Save, and the neutrals come back as Paddle's own light-theme hexes. And since those defaults
are themselves light values, a «cleared» configuration is not an adaptive one — it is Paddle's
light palette, with the dark form exactly as broken as it is with ours. Clearing buys nothing,
which is why the Strumfolio palette was put back the same day rather than left half-undone.

**A dark palette does not exist to be found, and that is a fact about the editor rather than a
thing we failed to locate.** Checked 2026-09-16 against both the reference and the dashboard
itself: the «Brand inline checkout» page lists the same five sections and never mentions a
theme, and the editor carries no light/dark selector, no preview toggle and no second palette
anywhere. What it *can* colour is foreground only —

| Section | Colours it holds |
|---|---|
| Overall | focus shadow, focus border (plus font family, checkout padding, `Max width (px)` 643) |
| Buttons | primary and secondary fill, text, border, hover |
| Inputs | label, placeholder, input text, input border, **checkbox background** (`Label position: Left`) |
| Links | link and hover |
| Messages | footer and coupon-notice **border and background** — not their text |

— and the checkbox background is the **only** background field in the whole editor. **The ground
is not settable, and neither is the heading «Please enter your details», the helper line under
it, the footer's «Sold by Paddle…», nor the text inside the message containers.** Those five
follow `theme`, so they are light on a dark ground and dark on a light one whatever the branding
says.

**Which makes pinning the theme the only coherent state, not a defeat.** One colour cannot be
legible on two grounds — the decisive pair is that the input *text* colour is settable and the
input *background* is not — so the palette fixes the ground, and `theme` has to match the ground
the palette was chosen against. Branding and theme-switching are mutually exclusive here by
construction. Nor is «drop the branding and let the theme follow» the other half of a choice: the
card would have to go back to `--surface`, and Paddle's own light form on our warm off-white is
the complaint the inline work started from.

**So the app's theme gives way, and `PaddleCheckout` pins the form to `light`.** A single
palette chosen against a single known background is right by construction, and it is the only
arrangement here in which every value in that dashboard can simply be one of `DESIGN.md`'s light
tokens. The cost is visible and was chosen knowingly — in the dark theme the payment form is a
light panel inside a dark page — and it buys one thing back: the frame used to be re-opened on
every change of theme, throwing away a half-typed card number, and a form that never changes
theme never needs that.

**The card under the frame is `bg-white`, and it is the only hard-coded colour in this app.**
`frameStyle` keeps the frame transparent, so that element is the ground Paddle draws on; it was
`--surface`, which is `#181b21` in the dark theme and would put black label text on a near-black
panel. It is not our surface any more, it is Paddle's, and calling it `--surface` would claim a
relationship to our theme that no longer exists.

**Every value in the dashboard is then one of `DESIGN.md`'s light tokens**, which is the whole
dividend of pinning the theme — there is one background to be right against, so nothing is a
compromise and nothing has to be left to Paddle:

- **Overall** — focus border and shadow `#97490f`; checkout padding **off**, so the frame has no
  gutter of its own inside `.card`'s `1.375rem` (this is why `frameStyle` says `min-width: 286px`
  — 286 is the padding-off minimum, 312 the padding-on one).
- **Buttons** — primary height 44, radius 45 (**the field caps at 45**, which on a 44px button is
  already `--r-pill`), background `#97490f`, hover `#884311` (`color-mix(--accent 88%, --ink)`),
  font 15px `#fffaf4`, and the primary **border** set to the same two so the 1px is invisible —
  the default is Paddle green and it draws a ring around the fill. Secondary: height 40 and
  radius 45 only — every one of its colours is cleared.
- **Inputs** — label `#5c626c` (`--muted`), typed text `#16181d` (`--ink`), placeholder
  `#8d939c` (`--faint`), border `#e6e3dc` (`--line-soft`); radius 18 (`--r-lg`), height 50,
  border width 1, **font size 16**. That last one is not styling: 16px is what stops iOS zooming
  the viewport when a field takes focus, exactly as `.form-field`'s own comment says, and it
  applies inside the iframe too.
- **Links** — `#97490f` and `#884311`, the accent and its hover.
- **Messages** — container radius 18, border `#e6e3dc`, background `#f1efe9` (`--surface-3`), for
  both the checkout footer and the coupon notice.

Two things that cannot follow us at all, worth knowing before anybody tries again: **the font**
(the picker offers Arial, Helvetica Neue, Lato, Lucida Grande, Verdana and Georgia — Outfit is
not among them, so Lato stays, and changing it buys nothing), and **the selected payment-method
tab's green outline**, which the editor does not expose.

**Sandbox and live are separate accounts, so this is configured twice** — the sandbox is done,
the live is not, and it belongs with the catalogue and the notification destination in the list
below. And since the values are copies of `DESIGN.md`'s tokens held outside this repo, a change
to `--accent`, `--r-lg` or `--r-pill` makes them wrong with nothing to catch it: the same
«change one place and the others are wrong» this file states about the booklet override and the
install row.

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
  **not** `PADDLE_API_KEY`, which this route deliberately does not hold.

### Changing plan: Paddle cannot schedule one, so the app makes it look as if it could

`subscriptions.update` replaces a subscription's items **immediately** — only the billing can be
deferred, through `proration_billing_mode` — and `scheduled_change` models `cancel`, `pause` and
`resume` and nothing else. There is therefore no way to say «move this to Standard when the year
runs out». What is done instead: the items move now under `do_not_bill`, which charges and
credits nothing and leaves the billing period alone, and a `custom_data` stamp carries the date
the reader keeps their old plan until, which the webhook turns into `pendingPlan`. No cron and
no renewal-time write. **What decides the timing is which way the money goes, not which way the
plan goes: a change that would hand money back waits, and only a change that collects money
happens now** — so a drop in tier waits, and so does any move onto monthly billing while a year
is paid for, even one that raises the tier (B7). Two proration modes in the whole app, and no
third. `plans/CLAUDE.md` carries the rest, including the six measurements that
settle it: `scheduled_change: null` may not travel with any other field; a subscription carrying
a scheduled change keeps it through an items change and quietly moves its date (the reason the
app clears first, restated on 2026-09-14 after the refusal this file used to claim turned out not
to happen); a nested object inside `custom_data`
comes back verbatim; **`do_not_bill` preserves the period only while the frequency is
unchanged**, restarting it on any change of cycle; `next_billed_at` — the repair for that —
is ignored beside an items change and refused alone, so it is always a second call; and **the pin
puts the date back but not the invoice**, so after a change of cycle Paddle credits nothing for
what was paid and every later change is priced at the full new price — while a change of cycle on
a freshly bought subscription prorates normally (€96.50 of €99.99, measured 2026-09-14). Which
means neither «same cycle» nor «change of cycle» predicts the credit, and one uncredited reading
is unexplained even by the restarted period; the screen therefore reads `update_summary.credit`
and infers nothing. `plans/CLAUDE.md` has all six measurements.

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

**Its signing secret was never read.** It was created through the MCP with code that returns
every field except `endpoint_secret_key`, so the value lives only inside Paddle and has to be
copied from the dashboard — Developer Tools → Notifications — into Production's
`PADDLE_NOTIFICATION_WEBHOOK_SECRET` by hand. That is the same arrangement `prod-url` exists for,
applied to a secret an agent would otherwise have printed into a transcript.

**Still to do before any of this takes money in production**: the live inline checkout carries
none of the branding above (the values are in the section that describes them), and Production has
no `PADDLE_*` variables at all — `PADDLE_PRICE_IDS` included, since that is where the live ids
live. Note the order that follows from the destination already being active: it will refuse every
delivery with a 401 until that secret is in Production, and a refused delivery is retried for
three days. Nothing can be delivered before the first live purchase, which the domain gate below
makes impossible, so the window is safe rather than lucky — but the secret belongs in Production
before anything is ever bought.

**One gate sits in front of every one of them: the live domain must be approved.**
`strumfolio.com` was submitted on 2026-09-19 — `chedom_01m2we9rfyfcy7jtwpnr90rcvm`,
`pending_review`, readable from here with `client.checkoutDomains.get`, so the status needs no
browser. Approval is what unlocks the **default payment link**, a field in Checkout Settings →
General whose own text reads «a default payment link is required to create a transaction».
`startPaddleCheckout` creates one on **every** view of `/checkout/[plan]`, so until that field
holds a value nothing is sellable at all, whatever else is configured.

**And the field fails silently until then**, which is the half worth not rediscovering: typing a
URL into it and pressing Save answers «Checkout settings saved», persists every other change made
on that same form, and leaves the field **empty on reload**, with no error anywhere. Measured
2026-09-19. Read it as «the domain is not approved yet», not as a typo in the URL.

So the live `PADDLE_*` variables and any code change that depends on them ship **together, after
approval** — never the variables after the push. `/pricing` reads `paddleCheckoutEnabled()` at
module scope, so they are baked at build time, and adding one later needs the `vercel redeploy`
that the auto-mode classifier blocks.

Two more things the dashboard holds that are decisions rather than defaults, both set 2026-09-19.
**Sales tax settings** is «Price includes tax»: it was «Automatic based on location», i.e. the
`location` mode this file forbids by name, which mattered not for the seven prices — each states
`tax_mode: internal` for itself — but for the next price created without the field. And
**«Display discount field on the checkout» is off**: `PaddleCheckout` already passes
`showAddDiscounts: false`, but the account default is a second door, and a code typed into
Paddle's own field attaches a discount without passing `redeemableCouponFor` — no row in
`coupon_redemptions`, no campaign ceiling applied, none of the three `accounts.coupon*` columns
written.

### Coupons are Paddle Discounts, and a coupon never causes a sale at full price

Since 2026-09-14 a campaign in `lib/coupons/` has real Paddle Discount entities behind it
(`paddleDiscount.ts` translates, `paddleDiscountSync.ts` writes them on every create and edit),
and the checkout attaches one by its `dsc_…` id. Four things about it are expensive to
rediscover; `coupons/CLAUDE.md` has the rest.

- **The refusal was narrowed, not lifted, and the narrow form is the invariant** — and it takes
  *two* questions to keep, which is what a real defect found on 2026-09-15 established.
  `coupon-unsupported` answers the first: «a coupon is in play and this exact plan and cycle have
  no `dsc_…`» — a sync that never ran, one Paddle refused, a campaign covering no Lifetime, a
  cycle whose three prices could not all be named. All of those sell nothing.

  The second is **may this account still redeem it at all**, and the screen was not asking it.
  `/checkout/[plan]` decided what to show from `activeCoupon` alone, which knows about campaigns
  and nothing about ceilings, windows or previous redemptions; the charge went through
  `redeemableCouponFor`, which asks all three and answers `null` — and a `null` coupon does not
  trip the guard, so the sale proceeded at the listino. A reader who had spent COUPON30 on a
  subscription **was shown the Lifetime at €139.99 while the transaction the server made carried
  `discount_id: null` and `total: 19999`**: sixty euro more than advertised, the gap this
  paragraph exists to deny, arriving through the door left open for a *tampered* `?coupon=`
  (where showing a discount and not honouring it is the safe direction). Evidence in
  `/media/psf/Download/strumfolio-qa-2026-09-15/06-lifetime-scontato/`.

  Fixed the same day: `couponRefusalFor` puts `redeemability` on the display path beside the
  write path, the ticket comes down where the coupon will not be honoured, and
  `couponRefusedNotice` says why in one sentence that ends «The price above is the usual one.»
  Two silences are deliberate and tested — a campaign that simply does not reach this plan, which
  `appliedCopy` already words, and a coupon table that could not be read, where the charge gives
  up the same way so the two still agree. **`changePaddlePlan` still refuses any redeemable coupon outright**, deliberately:
  a recurring discount survives a plan change on its own, so what is left is a code never
  redeemed, and the two sentences that say what a change costs know nothing about discounts.

  **`recurring_transaction_details` ignores a subscription's discount and `next_transaction`
  applies it**, which is the field that decides whether a discounted reader is quoted the
  listino. Measured 2026-09-16 on four sandbox subscriptions: Premium monthly carrying a
  recurring 30% reads `total 999` / `discount 0` in the first and `total 699` / `discount 246`
  in the second, and Standard monthly `349`/`0` against `244`/`86`. The documentation calls the
  first «what the customer can expect to be billed», which is true of everything except the
  discount. `nextChargeOf` reads `next_transaction`; reading the neighbouring field instead
  would put the listino in front of somebody who is being charged 30% less — the
  shown-price/charged-price gap this file already guards twice.

  **A change of *cycle* stops the discount being applied, and `/billing` went on promising it.**
  Each Discount entity is `restrict_to` its own cycle's three prices, so a tier change within a
  cycle keeps it — Standard → Premium monthly previews `699` with `discount 246` — while moving
  the same subscription to a yearly price comes back `discount: null` and `total 9999`, the full
  listino. `nextChargeOf` is right on both counts, since the branch that quotes `PRICES` is
  exactly the change-of-cycle one. What was wrong was one screen further on:
  `accounts.discount_ends_at` is computed at redemption and read back from nowhere, so
  `discountLine` kept telling that reader «COUPON30 −30% until 16 September 2027» over a
  subscription Paddle had stopped discounting. The direction is the dangerous one — a benefit
  they redeemed, silently lost — and it was reachable, because `changePaddlePlan`'s
  `coupon-unsupported` guard asks `redeemableCouponFor`, which excludes a coupon already spent:
  it never fires for the one reader who actually holds a live discount.

  **Fixed 2026-09-16 by letting Paddle veto the columns, never replace them.**
  `paddleDiscountState` (`paddleAccount.ts`) answers `carried`, `dropped` or `unknown`, and
  `discountStillLive` (`coupons/discount.ts`, pure and tested) takes the line down on `dropped`
  alone. Four properties of that shape are the whole of it, and each is a decision:
  **`unknown` keeps the discount** — Paddle unconfigured, no subscription, a read that threw —
  because a stale line for one read is a smaller wrong than taking away something somebody
  redeemed, the asymmetry `accountExists` already argues for. **Paddle is asked only when there
  is a line to take down, and only on `/billing`** — no reader without a coupon pays a round
  trip, the loader still renders where Paddle is not configured at all, and `loadPurchaseSummary`
  is left alone because `/thanks` never prints the line and does not deserve a Paddle call in the
  critical path of the screen that loads right after a card is charged. **Never for a Lifetime**, since
  `paddle_subscription_id` means «has had a subscription», not «has one», and judging a one-off
  purchase's coupon against a dead subscription is exactly how this would come back. And **it
  does not read Paddle's `ends_at`**: that is the half measured to agree, and the fix stays on
  the half measured not to. The operator screens (`/coupons`, `/accounts/[email]`) still read the
  columns in the clear, deliberately — the defect is about what a *customer* is promised, and a
  Paddle call per row on a list is not the price of showing an operator what the row says.

  **Measured by `subscriptions.preview`, not by an executed update**, and it says only that
  Paddle stops *applying* the discount — whether moving back to monthly would restore it is not
  measured and not assumed, which is also why the repair is a veto rather than a rewrite.
- **A campaign needs more than one Discount entity because `maximum_recurring_intervals` counts
  billing periods**, while `coupon_campaigns.discount_months` is one figure in months — three
  months is `3` monthly and `1` yearly, and one entity cannot hold both. Two entities, three when
  the campaign covers the Lifetime, each `restrict_to` its own cycle's three prices, all derived
  from the single row. **`restrict_to` is all-or-nothing per kind**: a discount restricted to two
  of three prices attaches to the third's transaction, matches no item and charges full price,
  with no error anywhere — so a kind whose every price cannot be named is not created at all.
- **Measured against the sandbox on 2026-09-14**, both halves, because a field accepted is not a
  field applied — `tax_mode`'s own lesson. 30% restricted to Standard monthly turned €3.49 into
  €2.44, the cent-for-cent figure `discountedAmount` computes from the commercial deck's table;
  and three intervals attached to a monthly subscription came back `starts_at 2026-10-13` /
  `ends_at 2027-01-13`, three whole months, which is `discountEnd`'s arithmetic. That is why
  `accounts.discount_ends_at` is computed once at redemption rather than read back from Paddle.
- **`coupon_redemptions` got its writer back in the same commit**, which was the standing
  condition: anything that starts selling at a discount without that insert silently uncaps every
  campaign ceiling. **The insert is also the clock.** Paddle carries a transaction's `custom_data`
  onto the subscription it opens, so the campaign stamp arrives again on every renewal; the
  unique index taking a row exactly once is what separates the first payment from the ninetieth,
  and the three `accounts.coupon*` columns are written only when it did. They are *cleared* by a
  purchase carrying no coupon — `isNewPurchase` reads Paddle's `origin` to tell a purchase from a
  renewal, and clearing on a renewal would take a live discount away at the first period.

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

## `/qa` signs somebody in without a password, and must never exist in production

`app/qa/page.tsx` makes an already-verified account and issues its session cookie in one click —
no verification email, no password typed, no Telegram notice — because everything worth testing
here is behind a session and every ordinary way in needs a real inbox, an OAuth redirect URI no
preview has, or a form filled by hand. It is an authentication bypass, so it is fenced by two
independent guards that live in `lib/qa/entry.ts`, pure and covered by `npm test`:

- **Where it may run**: `qaAllowed` is an *allowlist* — `VERCEL_ENV` absent (local), `preview`,
  or `development`. The obvious spelling, `VERCEL_ENV !== 'production'`, reads the same and fails
  **open**: a renamed environment or a value nobody anticipated would be admitted. `VERCEL_ENV`
  and not `NODE_ENV`, for `forcedPlanNotice`'s reason — `NODE_ENV` is `production` on previews too.
- **Who it may be**: `isQaEmail`, anchored at both ends against `@strumfolio.test`. RFC 2606
  reserves `.test`, so no real person can own one and no mail to one can be delivered. This is the
  guard that matters locally, where `DATABASE_URL` points at a database holding the 2026-08-29
  copy of production — real addresses and real password hashes.

**Both guards are on the first lines of `lib/qa/actions.ts`, not only in the page.** A Server
Action is addressable by its action id over `POST` whatever its page renders, so guarding only in
`page.tsx` would hide the form in production and leave a live passwordless sign-in behind it.

Three more things worth not re-deriving:

- **A `credentials` row is what "already verified" means** in this codebase — one only ever exists
  for an address that has been through `/verify` — so writing it is the whole of the verification,
  and it is what keeps `/login` testable by hand with `QA_PASSWORD`.
- **The account cookie is deleted when the session is issued**, and that is not tidiness.
  `currentAccountFor` falls back to the reader's own account for a cookie they may not open, which
  self-heals for an ordinary QA account and **not** for one added to `ALLOWED_EMAILS`: a global
  owner may open anybody's, so a leftover cookie would land the new session inside the previous
  account with nothing looking wrong.
- **No QA account can be a global owner from here.** `isOwner` reads `ALLOWED_EMAILS` and nothing
  at runtime can write it, so `/coupons`, `/accounts` and `/leads` stay shut. `QA_OWNER_EMAIL`
  (`qa-owner@strumfolio.test`) exists so there is one stable string to paste into that variable by
  hand — `.env.local` locally (remember `vercel env pull` and `vercel integration add` both rewrite
  that file wholesale), Vercel's Preview environment for the preview.

Its `publicRoutes.ts` row is unconditional and the page 404s in production instead, so the one
list keeps giving both its readers the same answer.

**What to do with it once you are in is `INTEGRATION-TESTS.md`**, at the root: the environment a
live run belongs on, how it is driven — a real Chrome that is already signed in, `claude
--chrome`, every step photographed — the coupon to apply and why the same one twice on one
account is a case rather than a mistake, the sandbox card, the Paddle calls that decide who is
right when the screen and the charge disagree, and the shape of the folder the screenshots go
into. That page exists **because** an agent may not type a password into a field: it is not a
convenience, it is the only way one gets inside the app at all. `npm test`
and a run of that kind answer different questions — the second is what found the €139.99/€199.99
gap that every pure test passed straight through.

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
