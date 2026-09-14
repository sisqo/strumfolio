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

    /*
     * Money going back. **None of these names a plan**, and that is the payload rather than a
     * style: an adjustment carries transaction items, not prices, so there is no `custom_data`
     * stamp to read and `plan` is always null here — «Refunded an unknown plan» is what naming
     * one would produce.
     *
     * «Requested» and «Refunded» are deliberately two different rows for one refund: Paddle
     * creates them `pending_approval` and approves them separately, and a request drawn as a
     * repayment would tell somebody they had their money back before they did.
     */
    case 'refund_pending':
      return 'Refund requested — waiting for approval'
    case 'refunded':
      return 'Refunded'
    case 'refund_rejected':
      return 'Refund request declined'
    /* Not a repayment to a card: a balance held against what is billed next. */
    case 'credited':
      return 'Credited to your account'
    case 'chargeback':
      return 'Charged back through the bank'
    case 'reversed':
      return 'Reversed'

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
 *
 * **The two looks have since converged and are still two**, which is worth saying so nobody
 * merges them: `Billing.dc.html` gives the customer's table the same tracked headers and the
 * same right-hung amount, so the remaining differences are the card they sit in and the date
 * format. That is not enough to share a class with `/accounts`, whose own mock sets the whole
 * table a size down inside a smaller card — and the two mocks are separate drawings that can
 * move apart again.
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
      <table className={ledger ? 'acct-ledger' : 'w-full border-collapse text-left text-sm'}>
        <thead>
          {/* `Billing.dc.html`'s own header: a size down, tracked and upper-cased, in the
              quieter of the two inks — so the three words read as column names rather than as
              the first row of the table. */}
          <tr className={ledger ? undefined : 'text-[0.75rem] uppercase tracking-[0.03em] text-faint'}>
            <th className={ledger ? undefined : 'pb-2 pr-3 pt-3 font-medium'}>Date</th>
            <th className={ledger ? undefined : 'pb-2 pr-3 pt-3 font-medium'}>Event</th>
            <th className={ledger ? undefined : 'pb-2 pt-3 text-right font-medium'}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className={ledger ? undefined : 'border-t border-line-soft'}>
              <td className={ledger ? undefined : 'whitespace-nowrap py-2.5 pr-3 text-muted'}>
                {/*
                  * **Both columns carry the minute, and the customer's one earns it too.** The
                  * operator's always has: a first purchase fires three events inside the same
                  * second, and a ledger printing only the date makes them look like three
                  * unrelated things that happened «that day». `Billing.dc.html` writes the
                  * customer's the same way — «14 September 2026, 09:14» — and on a screen that
                  * now lists every subscription event beside the payments, a column of identical
                  * dates is exactly that same illegibility one screen over.
                  *
                  * The day is still `formatPlanDate`, so the format agreement with the sentence
                  * at the top of the page survives: the time is appended to it, not instead of
                  * it. Client-rendered either way — `BillingScreen` fetches on mount — so the
                  * local time here is nobody's hydration mismatch.
                  */}
                {dates === 'plain'
                  ? `${formatPlanDate(line.occurredAt)}, ${line.occurredAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
                  : line.occurredAt.toISOString().slice(0, 16).replace('T', ' ')}
              </td>
              <td className={ledger ? undefined : 'py-2.5 pr-3 font-medium'}>{describeEvent(line)}</td>
              {/* A row with no amount is a plan change, not money: the mock greys the whole
                  cell, which is the one thing that tells the two kinds of row apart at a glance. */}
              <td
                className={
                  ledger
                    ? line.amount === null
                      ? 'is-faint'
                      : undefined
                    : 'whitespace-nowrap py-2.5 text-right font-medium tabular-nums'
                }
              >
                {/*
                  * The listino struck before the amount taken, and the code under it — the same
                  * "was, now" order the cards on /pricing use. Without this a reduced line reads
                  * as a plain €24.49 with nothing to say why, which is the one question a
                  * payment history exists to answer.
                  *
                  * Every figure comes from the event's own payload, never re-derived from
                  * `PRICES` — see `readLine`'s `amount`. A later re-price cannot rewrite a
                  * line that has already happened.
                  */}
                {line.fullAmount !== null && line.fullAmount !== line.amount && (
                  <>
                    <span className="sr-only">Was </span>
                    <s className={ledger ? 'acct-ledger-was' : 'mr-1 text-muted'}>{euro(line.fullAmount)}</s>
                    <span className="sr-only">, now </span>
                  </>
                )}
                {/* A minus on what went back, so a refund is not read as a second charge sitting
                    under the first — the two figures are otherwise identical and adjacent. */}
                {line.amount !== null ? `${line.moneyBack ? '−' : ''}${euro(line.amount)}` : '—'}
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
