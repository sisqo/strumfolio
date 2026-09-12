# Plans, entitlements and the mock checkout (`src/lib/plans/`)

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

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

## What Paddle already decides, and what it does not yet

The sandbox catalogue exists since 2026-09-12 — the ids, the tax argument and the three MCP
servers are in the root `CLAUDE.md`, because losing them costs more than a path lookup. Two
consequences land in *this* directory:

- **`paddleId` holds the *live* price id and only that** (decided 2026-09-12). One string
  cannot carry two environments, and the sandbox ids are the wrong half to keep: the
  verification script the field exists for would then interrogate the sandbox catalogue from
  production — the id-shaped-string-that-resolves-to-nothing failure the empty string was
  chosen over `'pri_TODO'` to prevent. All seven are still `''` because no live catalogue
  exists yet, and a *sandbox* checkout reads its ids from the environment rather than from
  here. What the decision costs is nothing on the verification side and one env lookup on the
  checkout side, which is the cheaper end of the trade.
- **`catalogue.ts` is that verification, and `scripts/verify-paddle-catalogue.ts` runs it.**
  The comparison is pure and tested (`catalogue.test.ts`), so the rules live somewhere `npm
  test` can reach them; the script is fetching and printing. It checks more than the amount,
  because the amount is not the only way a shown price and a charged price come apart — a
  price that stopped being tax-inclusive charges the listino *plus* VAT with every amount
  still matching, which is the case the tests single out. **Exit 2 means nothing was
  verified**, the state a live run is in today: an all-unwired run must not be reportable as
  agreement. Sandbox is matched on the `{plan, cycle}` stamped into each price's
  `custom_data`, so `--sandbox` needs no ids and no configuration — and since this repo holds
  no Paddle credential, the catalogue is fetched through the MCP server and handed over with
  `--from`.
- **Coupons have no counterpart in Paddle at all.** `discountedAmount` (`lib/coupons/`)
  reproduces all seven figures of the commercial deck's promo column, and not one of them is
  backed by a Paddle Discount object. That is the same shown-price-versus-charged-price
  invariant the listino itself now satisfies — measured, in the root section — left unsatisfied
  one level down: a live campaign changes what `/pricing` says and nothing whatsoever about
  what a real checkout would take. Harmless only while the mock checkout is the only checkout,
  and the first thing to settle after the catalogue, before any Paddle checkout goes in front
  of a reader.
