'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { GiftNoticeModal } from '@/components/GiftNoticeModal'
import { IconGift } from '@/components/icons'
import { setGrant } from '@/lib/accounts/actions'
import { worthAnnouncing } from '@/lib/accounts/giftNotice'
import type { GiftSnapshot } from '@/lib/accounts/giftNotice'
import { giftActive, giftDetail, giftHeadline } from '@/lib/accounts/planText'
import { GRANT_MESSAGE, MAX_GRANT_NOTE } from '@/lib/accounts/types'
import type { AccountPlanLine } from '@/lib/accounts/read'
import type { GrantResult } from '@/lib/accounts/types'
import { postDate } from '@/lib/blog/date'
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
 * **One card, read top to bottom** (`Account Detail.dc.html`): a head stating the gift on file,
 * with its audit and its two actions, over the body that changes it. They were a strip and a
 * separate card with a 12px gap between them, which drew them as two unrelated things — and
 * they are one thing read twice, since the body's three fields are what the head was made from.
 * They could not be two components either way: they share the error and confirmation notices,
 * the single `router.refresh()` that makes the head agree with what was just written, and the
 * rule that removing a gift clears the reason field with it.
 *
 * The head's two sentences come from `planText.ts` (`giftHeadline`, `giftDetail`) rather than
 * being written here, for that module's own reason: they have to keep agreeing with what the
 * list says about the same account. It reaches this client component because its only import
 * of `read.ts` is a type, which compiles away.
 *
 * Guided rather than free-entry: the plan picker is a segmented control instead of a
 * `<select>`, and the date field gains duration-preset buttons. Neither changes what gets
 * submitted — `{plan, until, note}` is exactly the same shape as before, and
 * `validateGrant`/`setGrant` are untouched.
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
  /**
   * The gift the confirmation dialog is open about, or null while it is closed.
   *
   * The gift itself and not a boolean, because the dialog is opened from two places that know
   * different things: a save has just written a gift this component's `plan` prop does not
   * describe yet, while `Send the notice` on the strip is about the one already on file. Both
   * hand over the same two facts, so the dialog never has to ask which door it came through.
   */
  const [notice, setNotice] = useState<{ planLabel: string; endsOn: string | null } | null>(null)

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
        // The head above this form and the summary strip above the tabs are all
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

      <div className="acct-gift">
        {/* Absent only for an account nothing was ever gifted — there is no head to draw about
            a decision nobody has taken. A withdrawn gift still gets one: `giftDetail` carries
            the audit of who took it away, which has nowhere else to go on this page. */}
        {headline !== null && (
          <div className="acct-gift-head">
            <span className="acct-row-lead" aria-hidden>
              <IconGift size={17} />
            </span>
            <div className="acct-row-text">
              <span className="acct-row-title">{headline}</span>
              {detail !== null && <span className="acct-row-note">{detail}</span>}
            </div>
            {/*
              * Only while the gift is actually in force — `source === 'grant'` is
              * `planStateFor`'s own answer, so this hides for a gift a live subscription
              * outranks and for one whose date has passed, which are exactly the two states
              * `sendGiftNotice` refuses as `nothing-to-announce`. One predicate on both sides,
              * rather than a button that opens a dialog whose Send would be turned down.
              *
              * It says nothing about whether the notice has already gone out, by decision: the
              * head stays the record of the *gift*. An operator who presses twice is told so
              * by the action, which is the only moment that answer is worth having.
              */}
            {giftActive(plan) && plan.grantedPlan !== null && (
              <button
                type="button"
                className="acct-pill"
                disabled={!online || busy}
                onClick={() =>
                  setNotice({
                    planLabel: PLAN_LABEL[plan.grantedPlan as Plan],
                    endsOn: plan.grantedUntilOn === null ? null : postDate(plan.grantedUntilOn),
                  })
                }
              >
                Send the notice
              </button>
            )}
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
          className="acct-gift-body"
          onSubmit={(event) => {
            event.preventDefault()
            /*
             * Both snapshots are taken here, before anything is awaited, and the first of them
             * has to be: `run` ends in `router.refresh()`, which re-renders the server component
             * above and hands this one a `plan` prop already carrying the gift that was just
             * written. Read afterwards, `before` would be the new gift, `worthAnnouncing` would
             * compare it with itself, and the dialog would simply never open.
             */
            const before: GiftSnapshot = { plan: plan.grantedPlan, untilOn: plan.grantedUntilOn }
            // `endless` sends no date at all, rather than whatever is still held in state from
            // before the picker moved to Lifetime — which `validateGrant` would refuse.
            const givenUntil = endless || until === '' ? null : until

            void run(
              () => setGrant(ownerEmail, { plan: giving, until: givenUntil, note }),
              'Gift given.',
              () => {
                /*
                 * Two conditions, and neither is about the save having worked. `inert` is this
                 * account's own state — a live subscription of equal or higher rank means the
                 * reader gains nothing today — and `worthAnnouncing` is about the change: a
                 * corrected reason, a shortened date or a lower plan all save perfectly well and
                 * are nobody's news. Silence here is the common case, deliberately.
                 */
                if (inert || !worthAnnouncing(before, { plan: giving as Plan, untilOn: givenUntil })) return
                setNotice({
                  planLabel: PLAN_LABEL[giving as Plan],
                  endsOn: givenUntil === null ? null : postDate(givenUntil),
                })
              },
            )
          }}
        >
          {/* Only when there is no head above to have said it — the head carries the gift's
              own heading, and a second title under it would name the same thing twice. */}
          {headline === null && <h3 className="acct-card-title">Give a plan</h3>}

          {/* Labels beside their fields on a fixed column, not over them: three rows of
              label-over-field is a tall card for what is one decision, where beside them the
              three read as one sentence with three blanks in it. */}
          <div className="acct-rows">
            <span className="acct-label" id="gift-plan-label">
              Plan
            </span>
            {/*
              * One track, four options, the chosen one lifted onto white — a segmented control
              * rather than four bordered boxes (`Account Detail.dc.html`). Still a radiogroup:
              * only the drawing changed, and a picker where exactly one answer stands is what
              * those roles are for. `aria-labelledby` rather than the `aria-label` this carried,
              * now that the visible word «Plan» beside it is the group's own label.
              */}
            <div role="radiogroup" aria-labelledby="gift-plan-label" className="acct-seg">
              {GIVEABLE.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={giving === name}
                  onClick={() => setGiving(name)}
                  className={name === giving ? 'acct-seg-option is-on' : 'acct-seg-option'}
                >
                  {PLAN_LABEL[name]}
                </button>
              ))}
            </div>

            <label className="acct-label" htmlFor="gift-ends-on">
              Ends on
            </label>
            {endless ? (
              <p className="acct-hint">Lifetime never ends, so there is no date to set.</p>
            ) : (
              <div>
                <input
                  id="gift-ends-on"
                  type="date"
                  value={until}
                  onChange={(event) => setUntil(event.target.value)}
                  className="acct-field is-nums is-date"
                />
                <p className="acct-hint">
                  {showPresets ? 'Leave it empty for a gift that never ends.' : 'Type a new date to extend.'}
                </p>
              </div>
            )}

            <label className="acct-label" htmlFor="gift-reason">
              Reason
            </label>
            <div>
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

          {/* Below the label grid rather than in the value column they write into: the date
              field is 168px, which five durations cannot sit beside without wrapping into a
              stack taller than the field itself. */}
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

          {/*
            * The caveat stands on the closing line beside Save rather than under the picker it
            * is about, because it is a caveat on *pressing that button* and is read in the
            * second before pressing it.
            *
            * `is-end` when there is none, and that is not cosmetic: this row is
            * `space-between`, so an absent left half would leave Save in the middle and make it
            * jump to the right edge as the picker moves in and out of `inert`.
            */}
          <div className={inert && plan.subscriptionPlan !== null ? 'acct-actions' : 'acct-actions is-end'}>
            {inert && plan.subscriptionPlan !== null && (
              <p className="acct-status" role="status">
                This account already pays for {PLAN_LABEL[plan.subscriptionPlan]}, so a gift of{' '}
                {PLAN_LABEL[giving as Plan]} changes nothing while that subscription is live.
              </p>
            )}
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
      </div>

      {/* Outside the form on purpose: it is opened *after* a submit has already settled, and a
          dialog nested in the form it followed would submit that form again on Enter. */}
      {notice !== null && (
        <GiftNoticeModal
          ownerEmail={ownerEmail}
          planLabel={notice.planLabel}
          endsOn={notice.endsOn}
          onClose={() => setNotice(null)}
          onSent={(said) => {
            setError(null)
            setDone(said)
          }}
        />
      )}
    </>
  )
}
