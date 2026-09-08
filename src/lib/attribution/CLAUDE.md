# Attribution (`src/lib/attribution/`) — where a lead came from, and the four seams that record it

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

Campaign parameters, click ids, referring host and landing page, captured for an address the
first time it is given and frozen when it becomes an account. One row per lead in
`lead_attribution`, read on `/accounts/[email]`'s Identity tab and in aggregate on `/leads`.

## The four seams, and what happens if one is dropped

`coupons/CLAUDE.md` says of its three: «Drop the third and every email/password sign-up is
recorded as having seen nothing.» Here there are **four**, and dropping one does not fail
anything — it silently removes a whole sign-up path from the numbers.

1. **`register()`** (`lib/register/actions.ts`) — inserts the open row from the cookie, in the
   same action that writes `pendingRegistrations`.
2. **`verifyEmail()`** (`lib/verify/actions.ts`) — fills the pointer and freezes, after
   `provisionAccount`.
3. **`confirmPendingRegistration()`** (`lib/accounts/actions.ts`) — the admin screen's own
   confirmation, which calls `provisionAccount` itself. **The seam the coupon ledger has no
   equivalent of**: without it every account created by hand keeps a null pointer and vanishes
   from every read, all of which ask by the id.
4. **`signIn` callback** (`auth.ts`) — the Google path, which has no pending registration at
   all, so it is both halves at once and is **gated on `created`**, the same boolean the welcome
   email uses.

**Only seams 1 and 4 read the cookie**, and that asymmetry is not something to tidy up:

- seam 3 runs in the **operator's** browser, so reading the cookie there would attribute the
  lead to whatever campaign the admin last clicked;
- seam 2 runs in the reader's own browser but often **not the same device** — a verification
  link is very frequently opened elsewhere — so it must not depend on finding a cookie.

Every seam swallows and logs its own failures. A registration or a sign-in must succeed even if
this bookkeeping trips: a lead with no attribution is a hole in a statistic, a registration lost
to a marketing insert is a customer.

## The touch rules, and the bug rule 2 exists to prevent

`touch.ts` owns all of it, is covered by `npm test`, and must stay **edge-safe** — no
`@/lib/db`, no `next/server`, no Node built-in — because `middleware.ts` imports it and the edge
has no database (the reason `rememberUrlCoupon` is a client effect) and no `node:crypto` (the
scar `accounts/current.ts` carries).

1. Any `utm_*` or click id is **always a new touch**: fills the first if empty, always replaces
   the last.
2. An external `Referer` with no parameters fills **only the first touch, only when empty**.
3. Anything else is not a touch.
4. `/verify`, `/forgot-password` and `/reset-password` are **never** a touch, whatever they
   carry. Not «no email link counts» — a newsletter link is an email we sent, carries `utm_*`,
   and is meant to count.

**Rule 2 is a designed-out bug, not caution.** After a Google sign-in the browser returns with
`Referer: accounts.google.com`, and Paddle's checkout does the same. Were any external referer a
touch, every Google sign-in would rewrite that reader's attribution to «google / referral» and
erase the campaign that actually brought them, with nothing failing to say so.

`DENIED_REFERER_HOSTS` therefore exists, and **`google.com` is deliberately not in it** — organic
search is a real answer; only the OAuth host is ours. It is a constant and there is no
alternative: `app_settings` is in the database and this runs on the edge, and an env var is baked
in at build time, so changing one needs the manual `vercel redeploy` the root `CLAUDE.md` records
as blocked by the auto-mode classifier. **A host missing from that list breaks nothing and says
nothing**; it quietly dirties the first touch of readers who had none. Write the reason beside any
new entry so the next person does not prune it.

`/follow/<token>` collapses to `/follow` and, untagged, is named `strum-together` / `referral` —
the word-of-mouth channel. `overwrites: false`, like every untagged arrival, so a leader inviting
the same friend to four rehearsals cannot overwrite the campaign that friend arrived from.

## The middleware has six exits and every landing one must carry the cookie

One `withAttribution` helper called at each exit rather than five copies of a `cookies.set`, and
the rule survives the change that removed its own illustration.

It read: **`/` requires a session**, so `strumfolio.com/?utm_source=…` — the most ordinary
campaign URL there is — reaches the *redirect* branch, and the redirect does not carry the query
string. **`/` is public since 2026-09-08** (`app/(home)/layout.tsx` serves the landing page to
anybody with no session), so that URL now lands in the `SESSION_FREE_PATHS` branch with its
parameters intact and gets its cookie there. Verified with a real GET, not by reading the code.

The redirect branch still exists for every path that does need one — a bookmarked song, a shared
songbook link — and a campaign can point at a deep link as easily as at the home page, so it
still has to carry the cookie. Nothing to relax; only the example changed.

Two gates, both deliberate: **GET only** (a Server Action POSTs to the page's own URL, and
Next.js copies the `Set-Cookie` onto the *request* — the scar the `/follow` device-id branch
already carries) and **no session only**, which is what lets the `SESSION_FREE_PATHS` branch go
on returning `undefined` for a signed-in reader and leaves the cacheability of their `/pricing`
copy untouched.

None of this has automated coverage — `npm test` is `node:test` over pure functions and there is
no integration runner here — so verify it by hand against dev, with **GET and not `curl -sI`**,
which sends HEAD and is refused by the method gate:

```bash
# Grep for the cookie by name, never for `set-cookie`: NextAuth puts `authjs.csrf-token` and
# `authjs.callback-url` on these responses whatever this module does, so the loose grep is
# never empty and reads as a rule-4 violation that is not there. (It said `grep -i set-cookie`
# with «must be empty» beside it until somebody ran it.)
curl -s -D - -o /dev/null 'http://localhost:3000/?utm_source=x&utm_campaign=y' | grep -c songbook-attribution   # 1
curl -s -D - -o /dev/null 'http://localhost:3000/verify?token=abc'             | grep -c songbook-attribution   # 0
curl -s -D - -o /dev/null 'http://localhost:3000/forgot-password'              | grep -c songbook-attribution   # 0
```

## `landing_page` means two different things either side of 2026-09-08

Before that date `/` redirected to `/login`, so virtually every row records `/login` as the
landing path — the page the visitor actually got. `/` is the landing page itself now, so rows
written after it record `/`. Same visits, same behaviour, different value: the step in any
`GROUP BY landing_page` on `/leads` is this change and not a change in where readers arrive.

No backfill, by decision, and nothing in code to fix — `normalizeLandingPath` already keeps `/`
among its `WHOLE_PATHS`.

## Two invariants of the row

- **`last_*` is entirely null when it would repeat `first_*`.** So `last_touch_at IS NULL` is the
  whole test for «one provenance, ever», and no read compares ten columns to find out. Writing a
  last touch equal to the first would break every screen's «arrived once» wording.
- **`frozen_at` is final.** Before it the last touch still moves — somebody who registers, never
  verifies and returns months later from another campaign has not been acquired yet. After it
  nothing writes the row again, and `lead_attribution_open` no longer sees it, which is what lets
  a later registration on the same address get a row of its own instead of overwriting a
  customer's.

## What `/leads` must never do

Group by the campaign columns and print only that. Every account created before `0045` has no
row and never will (no backfill, by decision), as does every sign-up whose browser carried
nothing — so a bare `GROUP BY` drops both in silence and the early months read as though nobody
ever arrived. The **«No attribution recorded»** line is not decoration; it is what makes the
totals add up.

And it has **no denominator**: visits are Vercel Web Analytics', not this repo's, because the
middleware that reads the parameters runs where there is no database to count into. The page says
so out loud rather than printing a rate against an invented denominator — the same discipline that
makes `/accounts` show «—» instead of a reassuring value.
