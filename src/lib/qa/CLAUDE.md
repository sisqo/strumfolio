# `/qa`: the passwordless test sign-in

Loaded when working under `src/lib/qa/`. It is an authentication bypass, so the root `CLAUDE.md` repeats its two guards.

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
