/**
 * The three rules that decide how a Strum Together broadcast counts the devices following
 * it: how long a device holds its place, how often it may say it is still there, and
 * whether one more is let in.
 *
 * Pure, and split from `./session` exactly the way `plans/entitlements.ts` is split from
 * `plans/resolve.ts`: this file has no clock, no database, no `process.env` and no
 * `'use server'`, so every boundary below can be tested at the second rather than
 * described through a mock. `now` is a parameter for the reason `entitlementsFor` gives
 * for taking one — a function that reads its own clock cannot be tested at a boundary
 * without fake timers, at which point the test stops describing the rule.
 *
 * No `'use server'` here for a second, harder reason: this module is imported by
 * `middleware.ts`, which runs on the edge runtime, and a `'use server'` module may only
 * export async functions. Nothing here may ever grow an import of `@/lib/db/client` —
 * that is the same fence `accounts/current.ts` keeps around itself, for the same v2.2
 * reason, and `DEVICE_COOKIE` living here is what stops the cookie's name from being
 * spelled twice: once where it is minted (middleware) and once where it is read
 * (`session.ts`). Two spellings of a cookie name is a feature that counts nobody and
 * reports no error at all.
 */

/**
 * The name of the cookie that carries a follower's opaque device id.
 *
 * Plain, with no `__Secure-` prefix and no environment in it, matching `songbook-account`
 * (`accounts/current.ts`) — the prefix is mandatory only where a library derives a key
 * from the cookie's name, and a name that changes with `NODE_ENV` is one more thing to get
 * wrong on the one deployment nobody can debug from a laptop.
 */
export const DEVICE_COOKIE = 'songbook-device'

/**
 * How long a device keeps its slot after its last heartbeat.
 *
 * Two minutes, not one: browsers throttle timers in a hidden tab to roughly one tick a
 * minute, so a phone that locks its screen for a song is still inside this window and
 * keeps its place — which is the decided behaviour, and halving this would evict exactly
 * the phone the decision was written to protect. The price, paid knowingly, is that a tab
 * nobody will ever look at again also holds its slot until it is closed; nothing in this
 * feature evicts anybody.
 */
export const DEVICE_STALE_SECONDS = 120

/**
 * How stale a device's `last_seen_at` must be before a poll is allowed to refresh it.
 *
 * The whole point of the number: a guest polls every 4 s (`POLL_MS` in `FollowSession`),
 * and on Neon a write per poll is compute paid for nothing. At 30 s the write happens on
 * the first poll past the threshold — about one every 32 s, so roughly one write per eight
 * polls — and a device that is heartbeating at all can never drift within a factor of four
 * of `DEVICE_STALE_SECONDS`, which is what makes the slot safe rather than merely cheap.
 * Shortening `POLL_MS` is what would turn this from a seven-in-eight saving into a smaller
 * one; the two constants are a pair even though they live in different files.
 */
export const HEARTBEAT_SECONDS = 30

/**
 * Whether a device that was last seen at `lastSeenAt` still holds its slot at `now`.
 *
 * This predicate **is** the rule, and the `DELETE` of lapsed rows in `session.ts` is only
 * hygiene: the count that decides a refusal carries the same 120 s comparison in SQL even
 * though the sweep has just run, because the two can race and only one of them is the
 * definition. Inclusive at the boundary — exactly 120 s still holds — because a slot is
 * released by silence, and the instant the timer names is not yet silence.
 *
 * Note the two clocks, deliberately. `last_seen_at` is written with Postgres' `now()` while
 * this comparison happens against Node's, so a few seconds of skew between the app server
 * and Neon costs one heartbeat sent early or late. Doing it in SQL instead would cost the
 * round trip the single-select poll exists to avoid, and no rule here is sharp enough for a
 * few seconds of skew to change an answer: the closest call is 30 s against a 120 s window.
 * Skew of that whole 30 s is a different matter, and `needsHeartbeat` says what it does.
 */
export function holdsSlot(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() <= DEVICE_STALE_SECONDS * 1000
}

/**
 * The instant a `last_seen_at` has to be at or after for its device to still hold a slot —
 * the same rule as `holdsSlot`, expressed as a cutoff so that SQL can compare against it.
 *
 * This exists so the 120 s is written **once**. The rule is asked in three places that must
 * never disagree: `holdsSlot`, in JavaScript, for the device doing the polling; the `WHERE`
 * of the count that decides a refusal; and the `WHERE` of the sweep that deletes lapsed
 * rows. Build all three from here and the day somebody tunes the window they all move
 * together — write the interval into a SQL string instead and the cap and the sweep come to
 * mean different things by "fresh".
 *
 * A `Date` rather than a `now() - interval '120 seconds'` fragment, deliberately, and it
 * decides which clock the comparison uses. Rows are *written* with Postgres' `now()`, which
 * is server-authoritative and monotone with the database; every *comparison* is made against
 * this, computed from Node's clock. So there is exactly one reading clock and one writing
 * clock rather than a mix that differs per call site, and skew between the app server and
 * Neon costs at most a heartbeat sent early or late — no rule here is sharp enough for a few
 * seconds to change an answer. The rejected alternative was interpolating the interval into
 * the SQL, which also has to answer for `$1 * interval '1 second'` failing type inference on
 * an untyped parameter.
 */
export function staleBefore(now: Date): Date {
  return new Date(now.getTime() - DEVICE_STALE_SECONDS * 1000)
}

/**
 * Whether this poll should refresh `last_seen_at`, or leave the row alone and cost nothing.
 *
 * Read off the stored timestamp and nothing the client sent — no elapsed-ms, no
 * `shouldHeartbeat` flag, no timestamp of its own — so there is no input a guest could lie
 * about to make the throttle write more often, and no per-tab bookkeeping either: two tabs
 * are one device by design, and a client-side throttle would be per-tab and would double
 * the writes the throttle exists to prevent.
 *
 * This is the one rule in the file where the two clocks *can* change the answer, and it is
 * worth stating against what `holdsSlot` and `staleBefore` say about themselves: rows are
 * written with Postgres' `now()` and compared against Node's, so skew larger than
 * `HEARTBEAT_SECONDS` does not shift this boundary, it removes it — 30 s of app-server lag
 * makes every poll look due and turns the throttle off, and 30 s the other way makes no poll
 * look due and turns the heartbeat off, which costs devices their slots. Nothing here defends
 * against that, deliberately: two servers half a minute apart is an operational fault, and the
 * fix is the clock, not a fudge factor that would hide it. `DEVICE_STALE_SECONDS`, at four
 * times this, is what keeps the *slot* safe while the throttle merely gets cheaper or dearer.
 */
export function needsHeartbeat(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= HEARTBEAT_SECONDS * 1000
}

/**
 * Whether one more device may join a broadcast that is currently held by `held` others.
 *
 * `enforced` is a parameter rather than something inferred from `max`, and that is the one
 * line where the `SONGBOOK_PLANS` switch shows in this feature: `UNGATED.limits.devices` is
 * 100, so a bare `held < max` would refuse the 101st guest of an installation that enforces
 * nothing at all. With the switch off the cap must refuse **nobody** — while the row is
 * still written, the heartbeat still runs and the peak is still recorded, because counting
 * is measurement and not a limit. That asymmetry is the reason `deviceCapOf` returns
 * `enforced` as its own field instead of a number that has to be interpreted.
 *
 * `held` counts the **other** devices — the caller excludes the joining device's own row, and
 * the leader's own is never a row at all, because the leader is playing inside the app and
 * never opens the follow link. So `standard`'s 1 is a duo and `plus`' 3 is a quartet.
 *
 * Free's 0 is reachable here, which is worth saying because the obvious argument that it is
 * not — free cannot start a broadcast (`PlanLimits.mayLead`), so there is no session of its to
 * refuse from — holds only at the moment a broadcast *starts*. A broadcast already running
 * when the subscription lapses is deliberately never interrupted, so it keeps playing while
 * its cap becomes free's, and this then refuses everybody. `seatDevice` tells that refusal
 * apart from an ordinary full house, because the guest's screen must not promise a place that
 * cannot free up.
 */
export function admits(held: number, max: number, enforced: boolean): boolean {
  return !enforced || held < max
}
