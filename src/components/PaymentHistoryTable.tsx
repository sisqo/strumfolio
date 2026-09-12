import { euro } from '@/lib/plans/prices'
import { formatPlanDate } from '@/lib/plans/subscriptionCopy'
import { PLAN_LABEL } from '@/lib/plans/types'
import type { PaymentHistoryLine } from '@/lib/plans/history'

/** One history line as a reader or an operator would say it — never the raw event type. */
function describeEvent(line: PaymentHistoryLine): string {
  const plan = line.plan !== null ? PLAN_LABEL[line.plan] : 'an unknown plan'
  const cycleWord = line.cycle === 'year' ? 'yearly' : line.cycle === 'month' ? 'monthly' : null

  switch (line.action) {
    case 'purchase':
      return cycleWord === null ? `Purchased ${plan}` : `Purchased ${plan} (${cycleWord})`
    case 'scheduled_change':
      return line.plan === 'free' ? 'Scheduled: cancel at period end' : `Scheduled: move to ${plan} at period end`
    /* No period was left to wait for — see `MockEventAction`'s own comment on why this is not
       the same row as a scheduled cancellation with `plan: 'free'`. */
    case 'cancelled_now':
      return 'Cancelled — back on Free'
    case 'force_expired':
      return `Expired now (test) — was ${plan}`
    case 'kept_current':
      return `Kept ${plan}, cleared a scheduled change`

    /* Paddle's own events. `started` and `activated` arrive within the same second of a first
       purchase and say different things — one is the subscription existing, the other it being
       live — so they are not collapsed into one line. */
    case 'payment':
      return cycleWord === null ? `Paid for ${plan}` : `Paid for ${plan} (${cycleWord})`
    case 'started':
      return `Subscription started — ${plan}`
    case 'activated':
      return `Subscription activated — ${plan}`
    case 'changed':
      return `Subscription changed — ${plan}`
    case 'cancelled':
      return `Subscription cancelled — was ${plan}`
    case 'past_due':
      return `Payment failed — ${plan} in grace`
    case 'paused':
      return `Subscription paused — ${plan}`
    case 'resumed':
      return `Subscription resumed — ${plan}`

    default:
      return 'Event'
  }
}

/**
 * The payment history, shared verbatim between the reader's own `/billing` and the admin's
 * per-account panel on `/accounts` — one rendering of one row shape (`PaymentHistoryLine`,
 * `lib/plans/history.ts`), fed by two different, separately-authorized reads. No fetching
 * here: the caller already has its rows by the time this renders.
 *
 * `dates` and `look` are the two things the two callers disagree about, and both are real
 * disagreements rather than preferences. `/accounts` writes every date as an ISO day (`dayOf`, `accounts/read.ts`)
 * because an operator reading a control panel is comparing and copying them; `/billing` writes
 * dates the way a reader would say them (`formatPlanDate`) — and this table sits directly under
 * the sentence that does, so «Standard, active until 22 September 2026» over a row dated
 * «2026-08-23» was two date formats a centimetre apart on one screen.
 *
 * `look` is the same shape of disagreement about the frame: `Account Detail.dc.html` draws this
 * as a ledger — tracked uppercase headers a size down, the amount hung on the right edge, one
 * hairline per row — inside a card that is already a size smaller than `/billing`'s. A prop
 * rather than restyling in place, because this component is shared verbatim and «make the
 * operator's table match its mock» must not silently redraw the customer's own billing page.
 */
export function PaymentHistoryTable({
  lines,
  dates = 'iso',
  look = 'billing',
}: {
  lines: PaymentHistoryLine[]
  /** `iso` for the operator screen, `plain` for the customer's own — see above. */
  dates?: 'iso' | 'plain'
  /** `ledger` for `/accounts/[email]`'s Payments tab, `billing` for the customer's own — see above. */
  look?: 'billing' | 'ledger'
}) {
  if (lines.length === 0) return <p className="text-sm text-muted">Nothing yet.</p>

  const ledger = look === 'ledger'

  return (
    <div className="overflow-x-auto">
      <table className={ledger ? 'acct-ledger' : 'w-full text-left text-sm'}>
        <thead>
          <tr className={ledger ? undefined : 'text-muted'}>
            <th className={ledger ? undefined : 'py-1.5 pr-3 font-normal'}>Date</th>
            <th className={ledger ? undefined : 'py-1.5 pr-3 font-normal'}>Event</th>
            <th className={ledger ? undefined : 'py-1.5 font-normal'}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr
              key={line.id}
              className={ledger ? undefined : 'border-t'}
              style={ledger ? undefined : { borderColor: 'var(--surface-2)' }}
            >
              <td className={ledger ? undefined : 'whitespace-nowrap py-1.5 pr-3'}>
                {/* The operator's column carries the minute as well as the day: a first purchase
                    fires three events inside the same second, and a ledger that prints only the
                    date makes them look like three unrelated things that happened «that day». */}
                {dates === 'plain'
                  ? formatPlanDate(line.occurredAt)
                  : line.occurredAt.toISOString().slice(0, 16).replace('T', ' ')}
              </td>
              <td className={ledger ? undefined : 'py-1.5 pr-3'}>{describeEvent(line)}</td>
              {/* A row with no amount is a plan change, not money: the mock greys the whole
                  cell, which is the one thing that tells the two kinds of row apart at a glance. */}
              <td
                className={
                  ledger
                    ? line.amount === null
                      ? 'is-faint'
                      : undefined
                    : 'whitespace-nowrap py-1.5'
                }
              >
                {/*
                  * The listino struck before the amount taken, and the code under it — the same
                  * "was, now" order the cards on /pricing use. Without this a reduced line reads
                  * as a plain €24.49 with nothing to say why, which is the one question a
                  * payment history exists to answer.
                  *
                  * Every figure comes from the event's own payload, never re-derived from
                  * `PRICES` — see `logMockEvent`'s `amount`. A later re-price cannot rewrite a
                  * line that has already happened.
                  */}
                {line.fullAmount !== null && line.fullAmount !== line.amount && (
                  <>
                    <span className="sr-only">Was </span>
                    <s className={ledger ? 'acct-ledger-was' : 'mr-1 text-muted'}>{euro(line.fullAmount)}</s>
                    <span className="sr-only">, now </span>
                  </>
                )}
                {line.amount !== null ? euro(line.amount) : '—'}
                {line.couponCode !== null && (
                  <span className={ledger ? 'acct-ledger-coupon' : 'block text-[0.75rem] text-muted'}>
                    {line.couponCode}
                    {line.couponPercent !== null && ` −${line.couponPercent}%`}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
