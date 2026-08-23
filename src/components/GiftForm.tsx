'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { IconChevronDown } from '@/components/icons'
import { setGrant } from '@/lib/accounts/actions'
import { GRANT_MESSAGE, MAX_GRANT_NOTE } from '@/lib/accounts/types'
import type { AccountPlanLine } from '@/lib/accounts/read'
import type { GrantResult } from '@/lib/accounts/types'
import { PLAN_LABEL, PLAN_RANK, PLAN_VALUES, type Plan } from '@/lib/plans/types'
import { useOnline } from '@/lib/useOnline'

/**
 * The plans an operator may give. `free` is excluded and that is a rule, not a shortening of
 * the list: rank 0 can never beat a live subscription, and against a dead one it resolves to
 * the same `free` the account already had, so it would be a gift that says something was given
 * and changes nothing. Taking a gift away is `Remove gift`. Derived from `PLAN_VALUES` rather
 * than typed out so a sixth plan appears here the day it is added, and `setGrant` refuses
 * `free` server-side too — a `<select>` is a suggestion to a browser, not a guarantee about an
 * action anything holding the session cookie can call.
 */
const GIVEABLE = PLAN_VALUES.filter((plan) => plan !== 'free')

/**
 * The write half of the plan section on `/accounts/[email]` — giving an account a plan by
 * hand, or taking the gift back. The four read-only sentences beside it (subscription, gift,
 * audit, in force) are rendered directly by the detail page from `lib/accounts/planText.ts`;
 * this component only ever submits.
 *
 * Always visible, unlike the old `AccountPlanButton` this replaces (PLAN.md, v3.8):
 * the detail page is already the explicit choice to look at one account, so there is no "most
 * rows are never opened" cost to avoid by hiding this behind a trigger.
 */
export function GiftForm({ ownerEmail, plan }: { ownerEmail: string; plan: AccountPlanLine }) {
  const router = useRouter()
  const online = useOnline()
  /*
   * Prefilled from what the account already holds, which is what makes editing the note
   * without moving the date possible — the reason this is a date field and not a "1 month /
   * 1 year" duration picker: a duration re-derives the end from `now` at every save, so fixing
   * a typo in the reason would silently extend the gift.
   */
  // `'free'` is storable in `granted_plan` but not giveable, so it must not seed the picker: a
  // `value` with no matching `<option>` shows the first one while state still says `free`, and
  // `Give` would then be refused for a plan nobody chose.
  const [giving, setGiving] = useState<string>(
    plan.grantedPlan !== null && plan.grantedPlan !== 'free' ? plan.grantedPlan : 'premium',
  )
  const [until, setUntil] = useState(plan.grantedUntilOn ?? '')
  const [note, setNote] = useState(plan.grantedNote ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  /*
   * Lifetime means "no end" on every screen that renders it, so it gets no date field at all
   * rather than one whose value would be honoured and then contradict the word beside it —
   * `validateGrant` refuses the combination server-side for the same reason. The typed date is
   * kept in state, not cleared: switching to Lifetime and back should not silently discard what
   * an operator had already entered.
   */
  const endless = giving === 'lifetime'

  /*
   * A gift only ever does anything when it *outranks* the live subscription — `planStateFor`
   * gives a rank tie to the subscription, deliberately, so "same plan as they already pay for"
   * changes nothing. Said out loud here because the save otherwise succeeds in silence and
   * leaves an operator wondering whether it worked; not refused, because a gift below the
   * current subscription is a legitimate floor for when that subscription lapses.
   */
  const inert =
    plan.subscriptionPlan !== null && PLAN_RANK[giving as Plan] <= PLAN_RANK[plan.subscriptionPlan]

  const run = async (action: () => Promise<GrantResult>, said: string, saved?: () => void) => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await action()
      if (result.ok) {
        setDone(said)
        saved?.()
        // The four sentences beside this form are server-rendered, so only a refresh can
        // make them agree with what was just written.
        router.refresh()
      } else {
        setError(GRANT_MESSAGE[result.reason])
      }
    } catch {
      setError(GRANT_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {error && (
        <p className="notice notice-error mb-2.5" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="notice notice-accent mb-2.5" role="status">
          {done}
        </p>
      )}

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void run(
            // `endless` sends no date at all, rather than whatever is still held in state from
            // before the picker moved to Lifetime — which `validateGrant` would refuse.
            () => setGrant(ownerEmail, { plan: giving, until: endless || until === '' ? null : until, note }),
            'Gift given.',
          )
        }}
      >
        <label className="picker picker-raised">
          <span className="sr-only">Plan to give</span>
          <select value={giving} onChange={(event) => setGiving(event.target.value)} className="picker-select">
            {GIVEABLE.map((name) => (
              <option key={name} value={name}>
                {PLAN_LABEL[name]}
              </option>
            ))}
          </select>
          <IconChevronDown size={14} />
        </label>

        {!endless && (
          <input
            type="date"
            value={until}
            onChange={(event) => setUntil(event.target.value)}
            aria-label="Gift ends on"
            className="form-field"
          />
        )}

        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why — a refund, a review, a friend"
          aria-label="Why this was given"
          className="form-field min-w-0 flex-1"
          // The client half of a rule `setGrant` also enforces: an attribute is a hint to a
          // form, not a guarantee about a server action.
          maxLength={MAX_GRANT_NOTE}
        />

        <button
          type="submit"
          className="btn btn-primary btn-sm"
          // Disabled while the reason is empty *and* refused server-side as `note-required`:
          // both layers ask, for the reason `DeleteAccountButton` gives about its retype.
          disabled={!online || busy || note.trim().length === 0}
        >
          Give
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          // No retype-to-confirm: that net is for the irreversible cascades, which destroy
          // songs. A gift is three fields and fifteen seconds to re-enter.
          disabled={!online || busy || plan.grantedPlan === null}
          /*
           * The reason belonged to the gift that has just been taken away, so it is cleared
           * with it: left in the field, it would be re-submitted as the reason for the *next*
           * gift by anyone who pressed Give afterwards. The date and the picker are left
           * alone — they are a starting point, not a record of anything.
           */
          onClick={() => void run(() => setGrant(ownerEmail, null), 'Gift removed.', () => setNote(''))}
        >
          Remove gift
        </button>
      </form>

      {inert && plan.subscriptionPlan !== null && (
        <p className="notice notice-accent mt-2.5" role="status">
          <span>
            This account already pays for {PLAN_LABEL[plan.subscriptionPlan]}, so a gift of{' '}
            {PLAN_LABEL[giving as Plan]} changes nothing while that subscription is live. It takes over only
            once the subscription lapses.
          </span>
        </p>
      )}

      <p className="mt-2 text-[0.8125rem] text-muted">
        {endless
          ? 'Lifetime never ends, so there is no date to set.'
          : 'Leave the date empty for a gift that never ends.'}
      </p>
    </div>
  )
}
