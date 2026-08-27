/**
 * The one function that answers every limit question.
 *
 * This is to the plans what `isAllowed`/`roleOf` is to access, and for the same reason: a
 * write that checked one half of a question and not the other is the failure mode, so
 * there is one place that answers all of it at once. The shape that enforces it is
 * `refused` — seven precomputed reasons, one per gate in scope. A gate is then
 * `if (ent.refused.createSong !== null) return { ok: false, reason: ent.refused.createSong }`
 * and it *cannot* forget the freeze, because the freeze is already folded into the field it
 * reads. Six predicate functions would have left every call site free to check the cap and
 * not the freeze; that is the version of this file that would have shipped a bug.
 *
 * `now` is a parameter and is never read inside — the same discipline `roleOf` follows with
 * the allowlist string. Every rule here is a date comparison, and a function that reads its
 * own clock cannot be tested at a boundary without fake timers, which is the point at which
 * the test stops describing the rule and starts describing the mock. The invariant is stated
 * as a rule rather than as a count, because a count goes stale the next time anything asks
 * this feature a question: **nothing in this file or in `types.ts` ever reads a clock**, and
 * every caller passes the instant in. The clock is read at the edges, once per operation, and
 * every edge that does so is a caller of this file — today `entitlementsOf` (`resolve.ts`,
 * the gate), `listAccountPlans` (`accounts/read.ts`, one instant for the whole `/accounts`
 * list, so no two rows can disagree across an expiry boundary), `setGrant`
 * (`accounts/actions.ts`, one instant shared by the validation and `grantedAt`), and now
 * `checkout.ts`'s own reads and writes (`loadCheckoutStatus`, `mockPurchase`, `mockCancel`,
 * `forceExpireNow`), each resolving a scheduled change through `resolveSubscription` at its
 * own single instant. A reader auditing "where does this feature read the clock" should grep
 * `new Date()` and trust the rule, not this list.
 *
 * Generosity between the subscription and the manual grant is evaluated **per instant**,
 * never blended: at a given `now` the entitlements are the limits of the higher-ranked side
 * that is still live, and `until` is that side's own date column. The rejected alternative —
 * take the higher plan and the later date independently — turns a one-month standard gift
 * sitting on top of a premium subscription that expires tomorrow into *premium until the
 * gift's end*, which is years of the paid plan given away by a rounding of two facts into
 * one. That leak is exactly what the separate grant columns exist to prevent, so folding
 * them back together here would undo the schema.
 *
 * `UNGATED` reproduces **today's** behaviour rather than the best plan's. The difference is
 * one field — the booklet's brand line — and it is the whole promise of the off switch; see
 * its own comment.
 */

import type { BillingPeriod } from './prices'
import { PLANS, PLAN_RANK } from './types'
import type { LimitReason, Plan, PlanLimits, PlanStatus, RepertoireCounts } from './types'

/**
 * The subscription half of an `accounts` row — everything `liveSubscription` and
 * `resolveSubscription` need, and nothing a manual grant ever touches. Split out from
 * `StoredPlan` so those two functions can be called with exactly this much, rather than with
 * a full `StoredPlan` carrying two grant fields they would have to be handed as filler
 * (`grantedPlan: null, grantedUntil: null`) to satisfy a wider type they never read.
 */
export interface SubscriptionColumns {
  /** What they bought, as stored — `accounts.plan`, through `readPlan`. */
  plan: Plan
  /**
   * `accounts.planExpiresAt`. **Null means never**: it is what `free` and `lifetime` both
   * carry, and reading it the other way round expires every account in the installation.
   */
  expiresAt: Date | null
  /** `accounts.planStatus`, through `readPlanStatus`. */
  status: PlanStatus
  /**
   * `accounts.pendingPlan`, through `readPendingPlan` (`types.ts`) — never through `readPlan`,
   * whose fallback to `'free'` would be read here as a scheduled cancellation. Null means
   * nothing is scheduled: `expiresAt` will simply lapse the subscription to nothing, the
   * behaviour this file always had before a pending change existed.
   */
  pendingPlan: Plan | null
  /**
   * `accounts.pendingCycle`, through `readPendingCycle` (`prices.ts`). Meaningless, and
   * always null in practice, whenever `pendingPlan` is null or `'free'`.
   */
  pendingCycle: BillingPeriod | null
}

/** The whole of one `accounts` row that this feature reads: the subscription, plus the gift. */
export interface StoredPlan extends SubscriptionColumns {
  /** A manual gift, in its own columns so a renewal webhook can never overwrite it. */
  grantedPlan: Plan | null
  /** `accounts.grantedUntil`. Null means the gift never runs out. */
  grantedUntil: Date | null
}

/**
 * What is reported back about the plan itself. No gate in this run consults it: it exists
 * so that a later /account screen and any log line have one place to read the answer from,
 * instead of each re-deriving "so what plan are they actually on" from the raw columns.
 */
export interface PlanState {
  /** What they bought — still reported once it has lapsed, because nothing is ever deleted. */
  plan: Plan
  /** Whose limits actually apply at `now`: `free` once everything has lapsed. */
  effectivePlan: Plan
  status: PlanStatus
  /** Which of the two sides supplied `effectivePlan`; `none` when neither is live. */
  source: 'subscription' | 'grant' | 'none'
  /** When the winning side runs out: null for lifetime, an open grant, or nothing live. */
  until: Date | null
}

export interface Entitlements {
  /** null only in `UNGATED`: with enforcement off nobody has a plan to report. */
  state: PlanState | null
  limits: PlanLimits
  /** Over the caps: only deletions are allowed until the repertoire fits again. */
  frozen: boolean
  /** Per gate: null when it may proceed, otherwise why it may not. */
  refused: {
    createSongbook: LimitReason | null
    createSong: LimitReason | null
    editRepertoire: LimitReason | null
    lead: LimitReason | null
    booklet: LimitReason | null
    ukulele: LimitReason | null
    featureRequest: LimitReason | null
  }
}

/**
 * Already past the cap — which creation can never cause, since creation is capped, so this
 * only ever follows a downgrade or an expiry. Strictly greater, and that is not a rounding
 * detail: holding exactly the cap is the legal steady state of a full account, and a `>=`
 * here would freeze every account that is merely full and refuse edits to songs it was
 * always entitled to.
 */
function over(cap: number | null, held: number): boolean {
  return cap !== null && held > cap
}

/** No room for one more. `>=`, where `over` uses `>`: at exactly the cap you may edit but not add. */
function atCap(cap: number | null, held: number): boolean {
  return cap !== null && held >= cap
}

/**
 * Collapses a scheduled downgrade or cancellation into the plain shape `liveSubscription`
 * already knew how to read, once its date has actually passed — the one place that rule
 * lives, so every reader of the row (the gate, `/accounts`, the checkout screen) sees the
 * same answer instead of three that can drift apart. Pure, like everything else in this
 * file: `now` is a parameter, nothing here is written back.
 *
 * Three ways `pendingPlan` never fires, all deliberate rather than incidental:
 *
 * Not `active`. `grace` ignores dates entirely for the same reason `liveSubscription` always
 * has — a failing card is virtually always already past period end, and a pending change
 * firing mid-retry would revoke or downgrade the exact customer `grace` exists to protect. It
 * does keep *reporting* the pending change, though, so the screens can still show it and offer
 * to undo it; only `expired` drops it, being already the end of the road, where a pending
 * change would be resolving a subscription that is not live to resolve anything from.
 *
 * No `expiresAt`. `free` and `lifetime` both carry a null expiry, which means never — there
 * is no date for a pending change to fire on, so one is never written for either (see
 * `mockPurchase`/`mockCancel`, `checkout.ts`).
 *
 * `now` has not reached `expiresAt` yet. The row still reads exactly as it did before any
 * change was scheduled — `plan`/`status`/`expiresAt` pass through untouched — with
 * `pendingPlan`/`pendingCycle` carried alongside so a caller can still say "premium until 12
 * June, then standard" ahead of the date, which is the whole reason they are returned here
 * rather than only consumed.
 *
 * Once due, this resolves in **one step**, never a recursion: the returned row already has
 * `pendingPlan: null`, so a second call sees nothing left to resolve. And `expiresAt: null`
 * on the resolved side is deliberate, not a gap — the "new" plan does not get an invented
 * next renewal date, because nothing in this mock models renewals for any plan; it simply
 * stays in force until something else changes the row, the same as every plan `mockPurchase`
 * has ever written.
 */
export function resolveSubscription(stored: SubscriptionColumns, now: Date): SubscriptionColumns {
  /*
   * `grace` never *fires* a pending change — that is the whole point of the status, and the
   * early return here is what guarantees it, since every date comparison lives below this
   * line. But it does keep reporting one, which `expired` below deliberately does not.
   *
   * The difference matters for exactly one screen: `/billing` renders its "Keep <plan>"
   * button only when the *resolved* `pendingPlan` is non-null, so nulling it here used to hide
   * both the news of a scheduled downgrade and the only way to undo it, from the customer
   * whose card is failing — the one moment they are most likely to be reconsidering. The raw
   * column still held the change the whole time; only the resolved view of it disappeared.
   *
   * Unreachable today: nothing in this repo writes `grace` (`mockCancel` schedules, it does
   * not fail a payment), so this is groundwork for the real webhook rather than a fix for
   * anything a reader can currently reach.
   */
  if (stored.status === 'grace') return stored

  if (stored.status !== 'active') {
    return { plan: stored.plan, status: stored.status, expiresAt: stored.expiresAt, pendingPlan: null, pendingCycle: null }
  }

  if (stored.expiresAt === null || stored.pendingPlan === null) return stored
  if (now.getTime() < stored.expiresAt.getTime()) return stored

  return { plan: stored.pendingPlan, status: 'active', expiresAt: null, pendingPlan: null, pendingCycle: null }
}

/**
 * The subscription's plan if it is live at `now`, otherwise null.
 *
 * Two ways to be dead and they are not symmetric. `expired` is authoritative even against
 * a future date: refunds and chargebacks exist, and a stored `expired` is something a
 * webhook deliberately wrote. A date in the past also ends it even while the status still
 * says `active`, because the date decays on its own and the status only changes when
 * something writes it — trusting the status alone would make a webhook that never arrived
 * look like a permanent free upgrade.
 *
 * That last rule puts a requirement on the future Paddle webhook, worth stating here
 * because it is unguessable from the outside: a renewal landing *after* period end
 * downgrades a paying customer for that window, so the webhook must write the new
 * `expiresAt` at or before period end. `grace` is the mechanism for "the date has passed
 * and they are still good", which is exactly why `grace` ignores dates entirely — by the
 * time a card has failed the paid period is virtually always already over, so requiring a
 * future date would make `grace` unreachable in practice and revoke the plan of the one
 * customer it was invented to protect.
 *
 * Reads through `resolveSubscription` first, so a downgrade or cancellation scheduled ahead
 * of time applies itself the moment its date passes, with no separate write and no cron —
 * see that function's own comment. Exported for `checkout.ts`'s `mockPurchase`/`mockCancel`,
 * which need this exact "what is actually live right now" answer to decide whether a
 * purchase is an upgrade (immediate) or a downgrade (scheduled), never `planStateFor`'s
 * blended `effectivePlan` — a manual grant must never be mistaken for the subscription it
 * sits beside.
 */
export function liveSubscription(stored: SubscriptionColumns, now: Date): Plan | null {
  const resolved = resolveSubscription(stored, now)
  if (resolved.status === 'expired') return null
  if (resolved.status === 'grace') return resolved.plan
  if (resolved.expiresAt === null) return resolved.plan
  return resolved.expiresAt.getTime() > now.getTime() ? resolved.plan : null
}

/**
 * The gift's plan if it is live at `now`, otherwise null.
 *
 * The grant has no status of its own, deliberately: `grace` and `expired` are billing
 * states and a gift is not billed. The only thing that can end a grant is `grantedUntil`,
 * so no billing event can reach it — which is the entire reason it lives in its own
 * columns rather than in `plan`/`planExpiresAt`.
 */
function liveGrant(stored: StoredPlan, now: Date): Plan | null {
  if (stored.grantedPlan === null) return null
  if (stored.grantedUntil === null) return stored.grantedPlan
  return stored.grantedUntil.getTime() > now.getTime() ? stored.grantedPlan : null
}

/**
 * Which of the two sides is in force at `now`, and therefore what this account's plan is
 * called — the whole of the generosity rule and nothing else.
 *
 * Extracted from `entitlementsFor`, which now calls it and keeps every other line, for the
 * operator screen on `/accounts`: that screen has to name the winning side per row and has no
 * question about caps to ask. The rejected alternative was to call
 * `entitlementsFor(stored, now, { songbooks: 0, songs: 0 })` there and read only `.state`, and
 * it fails in the way that is hardest to notice later — the `Entitlements` it hands back
 * carries `frozen: false` and six `refused: null` that are artefacts of the fabricated counts,
 * on the one screen whose whole purpose is to be trusted. Feeding it *real* counts instead is
 * two `count()` queries per row of a list of every account in the installation.
 *
 * The consequence worth stating, because it is the point of the move: this is now the single
 * definition of which side wins, so a change to the tie rule — today strictly greater rank,
 * i.e. a tie goes to the subscription — reaches the gates and the screen in one edit. A
 * second copy of that rule on the screen is a copy that disagrees the first time either is
 * touched.
 *
 * `now` is a parameter here for the same reason it is one on `entitlementsFor`: every rule
 * below is a date comparison, and the one `new Date()` of the gate path lives in `resolve.ts`.
 * The screen's own clock is read once per request in `accounts/read.ts` and passed in.
 */
export function planStateFor(stored: StoredPlan, now: Date): PlanState {
  /*
   * The subscription side's own facts, resolved once here — a scheduled downgrade that has
   * already fired must report the plan it became and no invented date for it, never the
   * pre-change plan against a `planExpiresAt` that has already gone by. `subscription` still
   * calls `liveSubscription` directly rather than reading `resolved` back out, because that
   * is a "is it live at all" question this resolved triple alone cannot answer any cheaper.
   */
  const resolved = resolveSubscription(stored, now)
  const subscription = liveSubscription(stored, now)
  const grant = liveGrant(stored, now)

  /*
   * A rank tie goes to the subscription. The limits are identical either way, so this only
   * decides which name is reported and which date is shown — and what a customer would be
   * told they have is the plan they are paying for.
   */
  const grantWins = grant !== null && (subscription === null || PLAN_RANK[grant] > PLAN_RANK[subscription])
  const winner: Plan | null = grantWins ? grant : subscription

  return {
    // `resolved.plan`, not `stored.plan`: identical to it whenever nothing is pending or
    // nothing has fired yet, which is every case this field's own doc comment already
    // covers ("still reported once it has lapsed") — and the *new* plan once a scheduled
    // downgrade has actually taken effect, which is the one case that needed this fixed.
    plan: resolved.plan,
    effectivePlan: winner ?? 'free',
    status: resolved.status,
    source: winner === null ? 'none' : grantWins ? 'grant' : 'subscription',
    // The winning side's own column, never the later of the two — see the header's
    // no-blending rule, of which this line is the other half. `resolved.expiresAt` on the
    // subscription branch for the same reason as `plan` above.
    until: winner === null ? null : grantWins ? stored.grantedUntil : resolved.expiresAt,
  }
}

export function entitlementsFor(stored: StoredPlan, now: Date, counts: RepertoireCounts): Entitlements {
  const state = planStateFor(stored, now)
  const limits = PLANS[state.effectivePlan]
  const frozen = over(limits.songbooks, counts.songbooks) || over(limits.songs, counts.songs)

  return {
    state,
    limits,
    frozen,
    refused: {
      createSongbook: frozen ? 'frozen' : atCap(limits.songbooks, counts.songbooks) ? 'songbook-limit' : null,
      createSong: frozen ? 'frozen' : atCap(limits.songs, counts.songs) ? 'song-limit' : null,
      editRepertoire: frozen ? 'frozen' : null,
      /*
       * The freeze deliberately does not reach these three. Leading a Strum Together,
       * printing a booklet and picking an instrument are not changes to the repertoire, and
       * the freeze is a rule about the repertoire — the same line `PLAN.md` (v2.1) draws
       * under "Le preferenze non sono modifiche", extended to its end: that passage lists
       * the reader's five display choices (transposition, capo, scroll speed, text size,
       * notation) and these three are not in it, but they are the same kind of thing — what
       * one person does with the songs on their own screen, or on a stage, leaving every row
       * exactly as it was. So a frozen standard account can still broadcast and still print,
       * and a free
       * account is refused all three by its plan, which is a different sentence with a
       * different remedy.
       */
      lead: limits.mayLead ? null : 'plan-required',
      booklet: limits.booklet === 'no' ? 'plan-required' : null,
      ukulele: limits.ukulele ? null : 'plan-required',
      /*
       * The fourth of the same kind, and outside the freeze for the same reason: asking
       * for a feature is not a change to the repertoire. `'no'` is the whole of the
       * refusal — `yes` and `priority` are admitted identically here, since what separates
       * them is the order somebody answers in and not whether the request may be sent.
       */
      featureRequest: limits.featureRequests === 'no' ? 'plan-required' : null,
    },
  }
}

/**
 * What every account gets while `SONGBOOK_PLANS` is absent or not `on`.
 *
 * Not `PLANS.premium`, and the single difference is `booklet: 'branded'` — which is not an
 * oversight and must never be "upgraded" to `'custom'`. Every booklet this app has ever
 * printed carries the «Printed with Strumfolio» line (`booklet/document.tsx`), so with the
 * switch off `bookletBrandLine` has to keep answering true. The switch promises exactly one
 * thing — absent the flag, behaviour is bit-for-bit what it is today — and "most generous"
 * would break that promise on the one field where today and the best plan disagree. This is
 * a constant rather than a function so a test can assert it field by field, and so the
 * resolver's four early exits all return the same object.
 *
 * `state: null` says nobody has a plan, because nothing is being enforced. That is why the
 * field is nullable at all: inventing a `lifetime` state here would be a lie that a later
 * /account screen would render verbatim, and `state !== null` is already exactly
 * "enforcement is on", so there is no second flag to contradict it.
 */
export const UNGATED: Entitlements = {
  state: null,
  limits: {
    songbooks: null,
    songs: null,
    ukulele: true,
    featureRequests: 'priority',
    smartCapo: true,
    booklet: 'branded',
    mayLead: true,
    devices: 100,
  },
  frozen: false,
  refused: {
    createSongbook: null,
    createSong: null,
    editRepertoire: null,
    lead: null,
    booklet: null,
    ukulele: null,
    featureRequest: null,
  },
}

/**
 * Whether the printed booklet carries the «Printed with Strumfolio» footer line.
 *
 * The one thing anything reads off `BookletTier` in this run, and it travels to the browser
 * on `loadBooklet`'s result rather than being re-derived there: the PDF is rendered
 * client-side, so a client-side answer would be both a second round trip and a soft gate a
 * devtools user could flip. The server decides what the document says about itself.
 */
export function bookletBrandLine(entitlements: Entitlements): boolean {
  return entitlements.limits.booklet === 'branded'
}
