# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository. See also the top-level `/home/user/git/CLAUDE.md` for cross-project conventions
(new-project setup, DNS on `sisqo.dev`, the GitHub/Vercel `sisqo` account) — those apply here
too and are not repeated below.

## What this is

Strumfolio — a private, invite-only PWA for reading a musician's own lyrics/chords on stage:
zoom, auto-scroll, transposition, capo, offline. Next.js 15 App Router, React 19, TypeScript,
Tailwind v3, Postgres on Neon via Drizzle ORM, NextAuth v5, Serwist for the service worker.
Deployed on Vercel (`sisqo` account), production at https://strumfolio.com. Full product
framing lives in `PRODUCT.md`, the visual language in `DESIGN.md`, and the running log of
decisions in `PLAN.md` — including plans/pricing/payments (v3.6), the mandatory
plan-choice gate (v3.7), the `/accounts` admin surface (v3.8), and `/emails` (v3.9). See
`PLAN.md`'s own top note for the versions after v3.3 it does *not* yet cover.

## Commands

```bash
npm run dev       # next dev, http://localhost:3000
npm test          # tsx --test over every src/**/*.test.ts and scripts/**/*.test.ts
npm run lint      # eslint
npm run build     # tsx scripts/precache-routes.ts, then next build
npm run db:migrate  # tsx scripts/migrate.ts — applies drizzle/*.sql to $DATABASE_URL
npm run db:generate # drizzle-kit generate, after changing src/lib/db/schema.ts
npm run seed      # tsx scripts/seed.ts
```

Without `DATABASE_URL` set, the app reads songs straight from `content/` — the normal way to
work locally; no database is needed to see the app run. `npm test` is plain `node:test` over
pure functions only — there is no React component test runner in this repo, so logic worth
testing belongs in a plain module (see `src/lib/plans/testCard.ts` next to `checkout.ts` for
why: a `'use server'` module may only export async functions, so a synchronous check or
constant that needs testing lives in a plain sibling file instead).

## Before pushing: verify against the committed snapshot, not the working tree

Always run the full check — `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build` —
against what was actually **committed**, not the working tree, right before `git push`:

```bash
SCRATCH=/tmp/claude-*/…/scratchpad/push-check   # anywhere outside the repo
rm -rf "$SCRATCH" && mkdir -p "$SCRATCH"
git archive HEAD | tar -x -C "$SCRATCH"
ln -s "$(pwd)/node_modules" "$SCRATCH/node_modules"
cd "$SCRATCH" && npx tsc --noEmit && npm test && npm run build
```

A working-tree build (even an `rsync`'d copy) can pass while the actual commit is broken if a
file was edited after `git add` and never re-staged. This happened once for real: a commit
that deleted `LightThemeOnly.tsx` still imported and rendered it on `/login`, discovered only
by `git show HEAD:path | grep` on the pushed commit, and fixed in a follow-up commit. Doing
the `git archive HEAD` check first is what would have caught it before the push.

Push once verified — don't wait for a separate "go ahead" on the push step itself for an
ordinary forward commit. This does not relax the usual rules: stage explicit paths (never
`git add -A`), confirm `gh auth status` shows the `sisqo` account, and still treat genuinely
destructive git operations (force-push, `reset --hard`, amending a pushed commit) as needing
explicit confirmation first.

## Dev server / build collision

Every `next dev` in this repo — regardless of port (3000, 3001, 3002…) — binds to the same
`.next` directory. A second `next dev`, or a `npm run build` run while one is live, corrupts
whichever was already serving: stale HTML referencing 404ing chunk hashes, or a React Client
Manifest error, sometimes surviving even `rm -rf .next`. Check `ss -ltnp | grep 300` before
running a build for verification — if a dev server owns port 3000, either verify a different
way or be ready to `rm -rf .next` and restart it afterward (`nohup npm run dev > log 2>&1 &
disown`). This machine tends to accumulate orphaned `next dev` processes across sessions;
clean up your own before leaving.

## Migrating the production database: `vercel env pull --environment=production` looks like it works but doesn't

Confirmed 2026-08-22, applying migration `0027`: this account's Vercel CLI token can read
**Development** secrets fine (`vercel env pull --environment=development` returns real values),
but pulling **Production** returns a real file with every real secret present as a literal
empty string (`DATABASE_URL=""`, `AUTH_SECRET=""`, all of them) — only Vercel's own
auto-populated system vars (`VERCEL_ENV`, `VERCEL_OIDC_TOKEN`, …) come through non-empty. The
command exits 0 and looks identical to a successful pull; nothing in its output says access was
refused. `vercel whoami` still shows the correct `sisqo` account, and `vercel env ls
production` still lists every variable as present — this is a read-permission restriction on
decrypting Production values specifically through this CLI session, not a missing variable, a
wrong account, or a bug in the pull itself. Don't waste time re-authenticating or re-linking the
project over this; nothing about the setup is broken.

Practical effect: an agent cannot obtain a working `DATABASE_URL` for production this way, so it
cannot run `npm run db:migrate` against production on its own. The person driving the CLI (who
has whatever additional permission the token lacks) has to do it, with one care taken so it
never touches the **development** config a local `npm run dev` still needs afterward:

```bash
vercel env pull --environment=production /tmp/strumfolio-prod.env   # never .env.local
export DATABASE_URL_UNPOOLED=$(grep '^DATABASE_URL_UNPOOLED=' /tmp/strumfolio-prod.env | cut -d= -f2- | tr -d '"')
npm run db:migrate
unset DATABASE_URL_UNPOOLED
rm /tmp/strumfolio-prod.env
```

This works without ever editing `.env.local` because of two things already in this repo:
`scripts/load-env.ts` sets each variable with `??=`, so a value already exported in the shell
always wins over whatever `.env.local` says; and `scripts/migrate.ts` itself promotes
`DATABASE_URL_UNPOOLED` to `DATABASE_URL` right before connecting, unconditionally, if that
variable is set. Exporting just `DATABASE_URL_UNPOOLED` for the one command is enough to point
that single migration run at production while every other file on disk stays pointed at dev.

## Domain, email, CAPTCHA and OAuth: six independent places, six different access methods

The production domain moved twice on 2026-08-21 (`songbook.sisqo.dev` →
`strumfolio.sisqo.dev` → `strumfolio.com`, the last one a real purchased domain on the
Vercel registrar). Each move touches six separate systems, each configured a different
way — a future domain change needs all six again, not just the DNS/Vercel part. Google
OAuth was the one missed during the 2026-08-21 move itself (caught and fixed 2026-08-22,
a day later, once Google sign-in started failing on the new domain) — treat this list as
the checklist next time, not just a record of what happened:

- **Vercel** (project domains + DNS zone) — fully API/CLI-automatable: `vercel dns add`,
  and `POST`/`DELETE` on `/v9/projects/<id>/domains` for attaching/detaching a hostname to
  the project. `strumfolio.com`'s zone lives on Vercel's own nameservers, so this repo's
  agent can add DNS records for it directly, the same as for a `sisqo.dev` subdomain.
- **Resend** (`RESEND_FROM`'s sending domain) — automatable with `RESEND_API_KEY` from
  `.env.local`. Its DKIM/SPF verification lives on a **dedicated `send.<domain>`
  subdomain that Resend itself requires** (e.g. `send.strumfolio.com`), never the apex —
  so it coexists with ImprovMX's own apex-level MX/TXT below without conflict. Don't
  "simplify" either set of records thinking they're redundant with the other; they answer
  different questions (who may send as this domain, vs. where mail sent *to* this domain
  goes).
- **ImprovMX** (inbox forwarding for `info@<domain>`, the four legal pages' `CONTACT`) —
  DNS-only from here: adding the MX/TXT records makes the domain *routable* to ImprovMX,
  but the actual "forward to my real inbox" rule lives in ImprovMX's own dashboard, behind
  no credential available in this repo or to any agent. Confirm the alias is live with a
  real test send (`POST /emails` on the Resend API, `from` the verified domain, then check
  `last_event` on the returned id) rather than assuming DNS alone is enough.
- **Cloudflare Turnstile** (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, the CAPTCHA on registration
  and password recovery) — a per-widget **hostname allowlist** set in the Cloudflare
  dashboard (Turnstile → the widget → Settings → Hostname Management), entirely separate
  from DNS or Vercel. The site key itself does not change when the domain does; only the
  allowlist does. No Cloudflare API credential is available in this repo — this one is a
  manual dashboard step every time, with no way for an agent to verify or automate it.
- **Gmail "Invia messaggi come" (reply-as `info@<domain>`)** — separate from ImprovMX's
  inbound forwarding: to let the human actually *reply* from Gmail so it shows as
  `info@<domain>` (not the personal Gmail address), Gmail is configured with a custom SMTP
  relay via Resend (`smtp.resend.com:587`, user `resend`, password a dedicated Resend API
  key with `permission: sending_access` scoped to that domain's `domain_id` — deliberately
  not the app's own `RESEND_API_KEY`, so rotating one never breaks the other). Not ImprovMX's
  own SMTP, which is a paid add-on; ImprovMX's free tier only forwards inbound. This only
  works because the domain is already Resend-verified for sending (see above) — no new DNS.
  The credential lives in Gmail's own account settings, not in this repo or any env var, so
  it has to be redone by hand on every domain move, same as Turnstile's allowlist.
- **Google OAuth** (`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, the "Sign in with Google"
  provider in `src/auth.ts`) — the client ID/secret themselves don't change with the
  domain, but the OAuth 2.0 Client's **Authorized redirect URIs** (and Authorized
  JavaScript origins) in Google Cloud Console → APIs & Services → Credentials do: they
  must list `https://<domain>/api/auth/callback/google` for whichever domain is current,
  or Google rejects the callback with `Error 400: redirect_uri_mismatch` — no code-side
  symptom, no log in this repo, it fails entirely inside Google's own redirect. Dashboard-
  only, same as Turnstile's allowlist; no credential in this repo automates it, and
  `gcloud` has no command for editing a Web-application OAuth client's redirect URIs (that
  API isn't exposed — Console UI only). To check without logging into Google: build the
  real authorization URL NextAuth would send (`client_id` + `redirect_uri` from a
  `POST /api/auth/signin/google` against the live site — see git history around
  2026-08-22 for the exact curl sequence) and fetch it anonymously; Google returns a
  normal sign-in page if the redirect URI is registered, and an immediate
  `Error 400: redirect_uri_mismatch` page (no login required to see it) if not — this
  distinguishes the two without needing real Google credentials.

`AUTH_URL` is deliberately **not set** in Production (removed 2026-08-21, was pinned to
the old domain and caused cross-domain login redirects). NextAuth v5 derives the origin
from the request's `Host` header instead (`trustHost`, automatic on Vercel), which is what
lets every domain attached to the project work correctly on its own — re-adding it would
undo that and should only happen if the request host ever stops being trustworthy (e.g.
behind a proxy that rewrites it).

## Plans, entitlements and the mock checkout (`src/lib/plans/`)

- `types.ts` — `Plan`, `PLANS` (the limits table), `PLAN_RANK` (generosity order, not price).
- `prices.ts` — what each paid plan costs (`PRICES`, `LIFETIME`); deliberately separate from
  `types.ts` because a price changes on a different clock than a limit does.
- `entitlements.ts` — `resolveSubscription`/`liveSubscription`: pure functions that collapse a
  scheduled downgrade/cancellation the instant `now` passes its date. Called at every read
  site instead of a cron job — there is no background job anywhere in this repo.
- `checkout.ts` (`'use server'`) — the mock checkout: `mockPurchase`, `mockCancel`,
  `clearPendingChange`, `forceExpireNow` (test-only). Writes the same `plan`/`planStatus`/
  `planExpiresAt`/`pendingPlan`/`pendingCycle` columns a real Paddle webhook will one day
  write, and logs every mutation to `paddle_events` (`history.ts`) under an `eventType`
  prefixed `mock.` — the same table and reading code a real integration will reuse.
- `resolve.ts` — two env-driven feature flags, read fresh at call time (no caching): 
  `plansEnforced()` (`SONGBOOK_PLANS=on`) gates whether limits are actually enforced;
  `mockCheckoutEnabled()` (`SONGBOOK_MOCK_CHECKOUT=on`) gates whether `/checkout` and the
  "Choose <plan>" buttons on `/pricing` are live. **Neither is a security boundary** — while
  the mock checkout is on, any signed-in reader can give their own account any plan for free.
  Both are currently `on` in Vercel production; that's why `/pricing` shows working buy
  buttons and why a stale "not on sale yet" notice was a real bug, not just a copy nit.
- `testCard.ts` — the mock checkout's own "processor": `isAcceptedTestCard` accepts only
  `4111 1111 1111 1111` (digits compared, formatting ignored); every other number declines
  client-side in `CheckoutScreen.tsx`, before `mockPurchase` is ever called.
- `SONGBOOK_FORCE_PLAN` — a separate, deliberately risky local-only escape hatch (forces every
  read to one plan); never meant to run in production.

## Design fidelity from Claude Design handoffs

Design mocks arrive in the Parallels shared folder `/media/psf/Download/songbook/` (macOS
host; not under `~/git`, not in this repo). It's a Claude Design handoff bundle: `README.md`
plus `project/<Name>.dc.html` (an HTML/CSS prototype with inline styles), `support.js`, and a
rendered `.thumbnail` preview. Read the `.dc.html` file directly rather than rendering it —
every pixel value (font sizes, radii, spacing, colors) is in the inline styles. When asked to
implement a redesign, match it **literally** — exact font sizes, exact card/table structure,
exact copy — rather than preserving prior "more accurate" wording; ask before quietly keeping
something the mock removed, but default to matching the mock over defending the status quo.

`DESIGN.md`'s frontmatter and prose are the living design-token source (colors, radius scale,
typography) — kept in sync by hand with what the app actually ships, including the current
font (Outfit, replacing DM Sans as of August 2026).

Chromium here is a snap and cannot write into `/tmp/claude-*` — pass `--screenshot=` a path
under `$HOME` (e.g. `~/songbook-shots`) if a visual comparison is ever needed.

## A known, understood data quirk

Accounts created before commit `02ac495` ("Niente più ospiti", 2026-08-14) — from the era of
shared accounts with view-only member roles — can get stuck unable to edit their own account.
The current permission code (`src/lib/roles.ts`, `src/lib/accounts/current.ts`) is correct and
tested; the failure is leftover data on those specific old rows, not a logic bug. Fix is to
delete and recreate the account from the Accounts admin page, not to debug the permission
code again.
