'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { IconInfo } from '@/components/icons'
import { PaymentHistoryTable } from '@/components/PaymentHistoryTable'
import {
  clearPendingChange,
  loadCheckoutStatus,
  loadFreezeState,
  loadMyPaymentHistory,
  mockCancel,
  type MockSubscriptionState,
} from '@/lib/plans/checkout'
import type { PaymentHistoryLine } from '@/lib/plans/history'
import { cancelQuestion, discountLine, lastPaymentLine, subscriptionStatusLine } from '@/lib/plans/subscriptionCopy'
import { LIMIT_MESSAGE, PLAN_LABEL, type Plan } from '@/lib/plans/types'

type Status =
  | { state: 'loading' }
  | { state: 'unavailable'; reason: string }
  | {
      state: 'ready'
      current: MockSubscriptionState
      live: Plan | null
      history: PaymentHistoryLine[]
      /*
       * Whether the *history* read failed on its own, while the subscription read beside it
       * succeeded — two reads, and until v3.13 only one of them could be reported. A failure
       * became `history: []`, which `PaymentHistoryTable` prints as «Nothing yet.»: on the one
       * screen whose job is to be the record of what was charged, a read that did not happen
       * looked exactly like a customer who had never paid. The subscription half is what
       * decides whether the page renders at all, so this is a flag on a ready page rather than
       * a fourth state.
       */
      historyFailed: boolean
      /**
       * Whether the repertoire is over this plan's limits — `loadFreezeState`'s own answer, and
       * the one thing on this screen that is about the songs rather than about the money. It
       * belongs here because this is the screen a downgrade or a lapse sends somebody to, and
       * the freeze is what a downgrade or a lapse actually *does* to them; up to now it was
       * discoverable only by trying to save something and being refused.
       *
       * `false` when the read failed, deliberately — see `loadFreezeState`'s own comment on
       * failing open.
       */
      frozen: boolean
    }

/**
 * Whether "Cancel my plan" is worth offering — `mockCancel`'s own three refusals, asked here
 * one step earlier so the button is absent rather than present and futile.
 *
 * Reads `live`, never `status`, for the reason `loadCheckoutStatus` returns it at all: a plan
 * that lapsed by date still says `active` in its column, and this screen used to hand that
 * account a Cancel button which answered "Nothing to do here right now."
 *
 * `pendingPlan !== 'free'` where this used to demand `pendingPlan === null`: a cancellation
 * already scheduled has nothing left to cancel, but a *downgrade* already scheduled does — and
 * making that customer press "Keep Premium" first, with no word saying so, was a two-step path
 * out of a plan dressed up as a missing button. `mockCancel` overwrites the pending downgrade
 * with `'free'`, which is exactly what pressing Cancel means.
 */
function canCancel(current: MockSubscriptionState, live: Plan | null): boolean {
  return live !== null && live !== 'free' && live !== 'lifetime' && current.pendingPlan !== 'free'
}

/**
 * The one hub for a plan already bought: what it is, what it is about to become, the
 * payment history, and the controls to cancel it or undo a scheduled change. Choosing a
 * *different* plan is deliberately not answered here: that is `/pricing`'s own comparison
 * table and `/checkout/[plan]`'s buy flow, and reproducing that table here would be the exact
 * duplication `PLAN.md` (v3.6) decided against.
 *
 * **`forceExpireNow` is deliberately not reachable from this screen**, though the server
 * action still exists for scripts and tests. It used to sit here behind nothing but the words
 * "test only" — and with `SONGBOOK_MOCK_CHECKOUT` on in production, that put "expire my plan
 * right now" in front of every paying customer, on the one screen they visit to manage what
 * they paid for. A label is not a permission: an owner who needs to exercise the freeze path
 * calls the action directly instead.
 *
 * Reachable from `UserMenu`'s Settings screen, as a plain link — the same way "Change
 * password" already leaves that panel for its own dedicated page instead of trying to fit
 * inline.
 */
export function BillingScreen() {
  const [status, setStatus] = useState<Status>({ state: 'loading' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  /**
   * Whether this visit arrived asking to cancel (`?cancel=1`), kept apart from
   * `confirmingCancel` because it has to survive the case that one cannot represent: the ask
   * being **refusable**. `canCancel` is false for an account whose cancellation is already
   * scheduled, and /pricing's Free card links here whenever the subscription is a paid one — so
   * that reader tapped "Switch to Free", landed here, and met a screen where nothing at all
   * responded to the tap. Something has to answer, and this is what remembers that a question
   * was asked.
   */
  const [cancelAsked, setCancelAsked] = useState(false)

  const refresh = () => {
    void Promise.all([loadCheckoutStatus(), loadMyPaymentHistory(), loadFreezeState()]).then(
      ([checkoutResult, historyResult, freezeResult]) => {
        if (!checkoutResult.ok) {
          setStatus({
            state: 'unavailable',
            reason:
              checkoutResult.reason === 'disabled'
                ? 'Billing is not switched on right now.'
                : checkoutResult.reason === 'no-session'
                  ? 'Sign in to see your plan.'
                  : 'No database is configured, so there is nothing to read.',
          })
          return
        }
        setStatus({
          state: 'ready',
          current: checkoutResult.current,
          live: checkoutResult.live,
          history: historyResult.ok ? historyResult.history : [],
          historyFailed: !historyResult.ok,
          frozen: freezeResult.ok && freezeResult.frozen,
        })
      },
    )
  }

  useEffect(() => {
    refresh()

    /*
     * `?cancel=1` — the hand-off from /pricing's own Free card, which used to call `mockCancel`
     * itself behind a second, dateless question of its own (see that card's comment). It links
     * here instead, and this is what makes the hand-off a single tap rather than a hunt: the
     * question `cancelQuestion` words, with the day the plan actually stops in it, is already
     * open on arrival.
     *
     * Harmless when it does not apply. The confirmation only renders inside `canCancel`, so a
     * free account, a lifetime one or a lapsed one that arrives with this param sees exactly
     * what it would have seen without it.
     *
     * `URLSearchParams(window.location.search)` rather than `useSearchParams()`, the same
     * reading `ThanksScreen` does of `?preview=` and for the same reason: the hook would force
     * this screen into a Suspense boundary for a param most of its visitors never carry.
     */
    if (new URLSearchParams(window.location.search).get('cancel') !== null) {
      setConfirmingCancel(true)
      setCancelAsked(true)
    }
  }, [])

  /*
   * `said` is a function of the result, not a fixed string: `mockCancel` now reports whether
   * the cancellation was scheduled for a period end or applied at once (a plan with no
   * `planExpiresAt` has no period end to wait for), and telling somebody their plan "cancels
   * once the period already paid for ends" when it has just ended is the kind of small lie this
   * screen is here to avoid.
   */
  const run = async (
    action: () => Promise<{ ok: true; effect?: 'immediate' | 'scheduled' } | { ok: false; reason: string }>,
    said: (result: { effect?: 'immediate' | 'scheduled' }) => string,
  ) => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await action()
      if (!result.ok) {
        setError(result.reason === 'not-applicable' ? 'Nothing to do here right now.' : "That didn't go through. Try again.")
        return
      }
      setDone(said(result))
      refresh()
    } catch {
      setError("That didn't go through. Try again.")
    } finally {
      setBusy(false)
      /* Whatever happened, the question has been answered: collapse the confirmation rather
         than leave a second «Cancel it» under a line reporting the first one. `cancelAsked`
         goes with it, or a cancellation that has just gone through would be met by the "already
         set to end" line below, directly under the `done` line saying so. */
      setConfirmingCancel(false)
      setCancelAsked(false)
    }
  }

  /* Narrowed once so the two things read out of a ready status can be computed above the JSX,
     the same shape `CheckoutScreen` uses. */
  const ready = status.state === 'ready' ? status : null
  const payment = ready === null ? null : lastPaymentLine(ready.current, ready.history)
  /*
   * The coupon still in force, and what the price goes back to when it ends.
   *
   * `fullAmount` from the ledger and not from `PRICES`: what a price reverts to is what the
   * listino said on the day of the purchase, and a later re-price must not rewrite it. The
   * same purchase row `lastPaymentLine` above quotes, so the two lines can never describe
   * different transactions.
   */
  const discount =
    ready === null
      ? null
      : discountLine(
          ready.current.discount,
          ready.history.find((line) => line.action === 'purchase' && line.plan === ready.current.plan)?.fullAmount ??
            null,
        )

  return (
    <>
      <header className="mb-[1.125rem]">
        <h1 className="screen-title">Billing</h1>
        <p className="mt-2 text-sm leading-[1.45] text-muted">
          What this account has bought, and the history of it.
        </p>
      </header>

      {status.state === 'loading' && <p className="mt-4 text-sm text-muted">One moment…</p>}
      {status.state === 'unavailable' && (
        <p className="notice notice-error mt-4" role="alert">
          {status.reason}
        </p>
      )}

      {status.state === 'ready' && (
        <>
          {/* `role="status"` beside the error's own `role="alert"`: a scheduled cancellation
              changes nothing on the screen except this line, so without it the one reader who
              cannot see it was told when an action failed and never when it worked. */}
          {done !== null && (
            <p className="notice mt-4" role="status">
              {done}
            </p>
          )}
          {error !== null && (
            <p className="notice notice-error mt-4" role="alert">
              {error}
            </p>
          )}

          <div className="card p-4 sm:p-5 mt-4">
            <h2 className="section-title">This account&apos;s plan</h2>
            <p className="mt-1.5 text-sm text-muted">{subscriptionStatusLine(status.current, status.live)}</p>
            {/* What was paid and for which period — see `lastPaymentLine`, and its own comment
                on why this comes out of the ledger rather than a column. Absent, rather than
                hedged, whenever there is no purchase row to quote. */}
            {payment !== null && <p className="mt-1 text-sm text-muted">{payment}</p>}
            {/* Under what was paid, because it explains that figure — a reader who sees €24.49
                beside a €34.99 listino has one question, and this is its answer. */}
            {discount !== null && <p className="mt-1 text-sm text-muted">{discount}</p>}

            {/*
              * The freeze, said before it bites. Inside the plan card rather than at the top of
              * the screen because it is a consequence of the plan named two lines above it — a
              * downgrade or a lapse is what puts an account here — and reading it directly under
              * that sentence is what makes the two one fact instead of two.
              *
              * `LIMIT_MESSAGE.frozen` verbatim, never a second sentence of its own: the modal
              * that appears when a save is refused says exactly this, and a banner that worded
              * it differently would leave a reader wondering whether they had two problems.
              *
              * **No link to /pricing, deliberately** — the same rule `PlanUpgradeModal` follows
              * for this one reason among its four (`canUpgrade` is false only here): the way out
              * of a freeze is a deletion the customer can make for nothing, and pointing them at
              * a price list would be both the wrong remedy and an expensive one.
              */}
            {status.frozen && (
              <p className="notice notice-accent mt-3" role="status">
                <IconInfo />
                <span>{LIMIT_MESSAGE.frozen}</span>
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {status.current.pendingPlan !== null && (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => void run(clearPendingChange, () => `Kept — staying on ${PLAN_LABEL[status.current.plan]}.`)}
                >
                  Keep {PLAN_LABEL[status.current.plan]}
                </button>
              )}

              <Link href="/pricing" className="btn btn-sm">
                Change plan
              </Link>

              {/*
                * Two presses since v3.13, and the same shape the Free card on `/pricing` now
                * uses — `SongForm`'s own delete pattern, which is this codebase's answer to a
                * destructive act. `btn-quiet` was the whole of the protection before: one press
                * ended a paid plan, and the only account of what had happened arrived
                * afterwards, in the `done` line above. The question names the plan and says
                * *when* it stops, because those are the two things the reader is deciding
                * between, and the button below could only be pressed before knowing either.
                */}
              {canCancel(status.current, status.live) &&
                (confirmingCancel ? (
                  <>
                    {/* `cancelQuestion`, not written inline: the sentence has a rule in it — a
                        `grace` row never gets a date — and a rule belongs somewhere a test can
                        hold it. See its own comment. */}
                    <span className="self-center text-sm text-muted">{cancelQuestion(status.current)}</span>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={busy}
                      onClick={() =>
                        void run(mockCancel, (result) =>
                          result.effect === 'immediate'
                            ? 'Cancelled — this account is back on Free.'
                            : 'Scheduled — this plan cancels once the period already paid for ends.',
                        )
                      }
                    >
                      Cancel it
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      disabled={busy}
                      onClick={() => setConfirmingCancel(false)}
                    >
                      Keep it
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    disabled={busy}
                    onClick={() => setConfirmingCancel(true)}
                  >
                    Cancel my plan
                  </button>
                ))}
            </div>

            {/*
              * The answer to a tap that would otherwise land on nothing. /pricing's Free card
              * links here with `?cancel=1` whenever the subscription is a paid plan, and
              * `canCancel` says no in states that card cannot see — chiefly a cancellation
              * *already* scheduled, which is reachable in production: press "Switch to Free"
              * twice, from two different tabs, or come back to the page a day later. Without
              * this the second press produced a navigation and then silence.
              *
              * Two sentences, not one per refusal. The first names the one state a reader
              * actually arrives in and points at the button that undoes it, which is the only
              * useful thing to say. The second defers to `subscriptionStatusLine` two lines up
              * rather than guessing which of the remaining cases this is — lapsed, expired,
              * lifetime, already free — because that sentence is already correct for every one
              * of them, and a second attempt at it here is a second chance to get it wrong.
              */}
            {cancelAsked && !canCancel(status.current, status.live) && (
              <p className="notice mt-3" role="status">
                {status.current.pendingPlan === 'free'
                  ? `This plan is already set to end, so there is nothing left to cancel — «Keep ${PLAN_LABEL[status.current.plan]}» above calls it off.`
                  : 'There is nothing to cancel on this account — the line above says where this plan stands.'}
              </p>
            )}

          </div>

          <div className="card p-4 sm:p-5 mt-4">
            <h2 className="section-title">Payment history</h2>
            <div className="mt-2">
              {/* A read that failed says so. `PaymentHistoryTable`'s own empty state («Nothing
                  yet.») is a statement about the account, and making a failure borrow it told
                  a paying customer their payments had never happened. */}
              {status.historyFailed ? (
                <p className="notice notice-error text-sm" role="alert">
                  This account&apos;s payment history could not be read just now. Nothing is wrong with the
                  plan itself — reload to try again.
                </p>
              ) : (
                <PaymentHistoryTable lines={status.history} dates="plain" />
              )}
            </div>
          </div>
        </>
      )}

      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/pricing" className="text-accent hover:underline">
          Back to plans
        </Link>
      </p>
    </>
  )
}
