'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { IconCheck, IconGift } from '@/components/icons'
import { setGrant } from '@/lib/accounts/actions'
import { giftDetail, giftHeadline } from '@/lib/accounts/planText'
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
 * `free` server-side too — a card is a suggestion to a browser, not a guarantee about an
 * action anything holding the session cookie can call.
 */
const GIVEABLE = PLAN_VALUES.filter((plan) => plan !== 'free')

/** `YYYY-MM-DD` for `months` from today — what a duration preset writes into the date field. */
function inMonths(months: number): string {
  const date = new Date()
  date.setUTCMonth(date.getUTCMonth() + months)
  return date.toISOString().slice(0, 10)
}

interface DurationPreset {
  label: string
  /** `null` means "no end date" — clears the field rather than computing one. */
  months: number | null
}

const DURATION_PRESETS: DurationPreset[] = [
  { label: '1 month', months: 1 },
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '1 year', months: 12 },
  { label: 'No end date', months: null },
]

const NOTE_CHIPS = ['Refund', 'Positive review', 'Friend or family', 'Beta tester']

/**
 * The gift half of `/accounts/[email]`'s Plan & gift tab: what is written down now, and the
 * form that changes it.
 *
 * **Two blocks, one component** (`Account Detail.dc.html`). The mock separates the gift that
 * exists — a strip carrying its own audit and a `Remove gift` on the right — from the card
 * that edits it, and they cannot be two components: they share the error and confirmation
 * notices, the single `router.refresh()` that makes the strip agree with what was just
 * written, and the rule that removing a gift clears the reason field with it.
 *
 * The strip's two sentences come from `planText.ts` (`giftHeadline`, `giftDetail`) rather than
 * being written here, for that module's own reason: they have to keep agreeing with what the
 * list says about the same account. It reaches this client component because its only import
 * of `read.ts` is a type, which compiles away.
 *
 * Guided rather than free-entry: the plan picker is chips instead of a `<select>`, and the date
 * field gains duration-preset buttons. Neither changes what gets submitted — `{plan, until,
 * note}` is exactly the same shape as before, and `validateGrant`/`setGrant` are untouched.
 */
export function GiftForm({ ownerEmail, plan }: { ownerEmail: string; plan: AccountPlanLine }) {
  const router = useRouter()
  const online = useOnline()
  /*
   * Prefilled from what the account already holds, which is what makes editing the note
   * without moving the date possible — the reason this is a date field and not only a "1
   * month / 1 year" duration picker: a duration re-derives the end from `now` at every save,
   * so fixing a typo in the reason would silently extend the gift. The preset buttons below
   * only ever *write once* into this same field, on click — they are not a second source of
   * truth for what gets submitted.
   */
  // `'free'` is storable in `granted_plan` but not giveable, so it must not seed the picker: a
  // `value` with no matching chip would leave nothing selected while state still says `free`,
  // and saving would then be refused for a plan nobody chose.
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
   * Duration presets only make sense while there is nothing to accidentally extend
   * Once a gift already exists, reopening this
   * form (say, to fix the note) must not offer a button that recomputes "1 year from now"
   * and silently prolongs it. An operator who genuinely wants to extend an existing gift
   * types the new date by hand; the presets return once the gift is removed. This is also
   * why the mock draws none: it is drawn in the gift-exists state.
   */
  const showPresets = plan.grantedPlan === null

  /*
   * A gift only ever does anything when it *outranks* the live subscription — `planStateFor`
   * gives a rank tie to the subscription, deliberately, so "same plan as they already pay for"
   * changes nothing. Said out loud here because the save otherwise succeeds in silence and
   * leaves an operator wondering whether it worked; not refused, because a gift below the
   * current subscription is a legitimate floor for when that subscription lapses.
   *
   * About the plan *selected right now*, which is what makes it this component's business and
   * not `planText.ts`'s: `giftDetail` answers the same question about the gift already saved.
   */
  const inert = plan.subscriptionPlan !== null && PLAN_RANK[giving as Plan] <= PLAN_RANK[plan.subscriptionPlan]

  const headline = giftHeadline(plan)
  const detail = giftDetail(plan)

  const run = async (action: () => Promise<GrantResult>, said: string, saved?: () => void) => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await action()
      if (result.ok) {
        setDone(said)
        saved?.()
        // The strip above this form and the summary cells above the tabs are all
        // server-rendered, so only a refresh can make them agree with what was just written.
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
    <>
      {error && (
        <p className="notice notice-error text-sm" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="notice notice-accent text-sm" role="status">
          {done}
        </p>
      )}

      {/* Absent only for an account nothing was ever gifted — there is no strip to draw about
          a decision nobody has taken. A withdrawn gift still gets one: `giftDetail` carries
          the audit of who took it away, which has nowhere else to go on this page. */}
      {headline !== null && (
        <div className="acct-row">
          <span className="acct-row-lead" aria-hidden>
            <IconGift size={17} />
          </span>
          <div className="acct-row-text">
            <span className="acct-row-title">{headline}</span>
            {detail !== null && <span className="acct-row-note">{detail}</span>}
          </div>
          {plan.grantedPlan !== null && (
            <button
              type="button"
              className="acct-pill"
              // No retype-to-confirm: that net is for the irreversible cascades, which destroy
              // songs. A gift is three fields and fifteen seconds to re-enter.
              disabled={!online || busy}
              /*
               * The reason belonged to the gift that has just been taken away, so it is cleared
               * with it: left in the field, it would be re-submitted as the reason for the *next*
               * gift by anyone who saved afterwards. The date and the picker are left
               * alone — they are a starting point, not a record of anything.
               */
              onClick={() => void run(() => setGrant(ownerEmail, null), 'Gift removed.', () => setNote(''))}
            >
              Remove gift
            </button>
          )}
        </div>
      )}

      <form
        className="acct-card"
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
        <h3 className="acct-card-title">{plan.grantedPlan === null ? 'Give a plan' : 'Change the gift'}</h3>

        <div className="acct-field-group">
          <span className="acct-label">Plan</span>
          <div role="radiogroup" aria-label="Plan to give" className="acct-plans">
            {GIVEABLE.map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={giving === name}
                onClick={() => setGiving(name)}
                className={name === giving ? 'acct-plan-option is-on' : 'acct-plan-option'}
              >
                {PLAN_LABEL[name]}
                {name === giving && <IconCheck size={14} />}
              </button>
            ))}
          </div>
          {inert && plan.subscriptionPlan !== null && (
            <p className="acct-status" role="status">
              This account already pays for {PLAN_LABEL[plan.subscriptionPlan]}, so a gift of{' '}
              {PLAN_LABEL[giving as Plan]} changes nothing while that subscription is live.
            </p>
          )}
        </div>

        <div className="acct-gift-grid">
          <div>
            <label className="acct-label" htmlFor="gift-ends-on">
              Ends on
            </label>
            {endless ? (
              <p className="acct-hint is-tall">Lifetime never ends, so there is no date to set.</p>
            ) : (
              <>
                <input
                  id="gift-ends-on"
                  type="date"
                  value={until}
                  onChange={(event) => setUntil(event.target.value)}
                  className="acct-field is-nums"
                />
                <p className="acct-hint">
                  {showPresets ? 'Leave it empty for a gift that never ends.' : 'Type a new date to extend.'}
                </p>
              </>
            )}
          </div>
          <div>
            <label className="acct-label" htmlFor="gift-reason">
              Reason
            </label>
            <input
              id="gift-reason"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why — a refund, a review, a friend"
              className="acct-field"
              // The client half of a rule `setGrant` also enforces: an attribute is a hint to a
              // form, not a guarantee about a server action.
              maxLength={MAX_GRANT_NOTE}
            />
            <span className="acct-chips">
              {NOTE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="acct-chip"
                  onClick={() => note.trim() === '' && setNote(chip)}
                >
                  {chip}
                </button>
              ))}
            </span>
          </div>
        </div>

        {/* Below the two columns rather than under the date field they write into: the mock's
            "Ends on" column is 168px, which five durations cannot sit on without wrapping into
            a stack taller than the field itself. */}
        {showPresets && !endless && (
          <span className="acct-chips" role="group" aria-label="Duration preset">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="acct-chip"
                onClick={() => setUntil(preset.months === null ? '' : inMonths(preset.months))}
              >
                {preset.label}
              </button>
            ))}
          </span>
        )}

        <div className="acct-actions is-end">
          <button
            type="submit"
            className="acct-save"
            // Disabled while the reason is empty *and* refused server-side as `note-required`:
            // both layers ask, for the reason `DeleteAccountRow` gives about its retype.
            disabled={!online || busy || note.trim().length === 0}
          >
            {plan.grantedPlan === null ? 'Give the gift' : 'Save the gift'}
          </button>
        </div>
      </form>
    </>
  )
}
