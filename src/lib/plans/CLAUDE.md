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
