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
    case 'force_expired':
      return `Expired now (test) — was ${plan}`
    case 'kept_current':
      return `Kept ${plan}, cleared a scheduled change`
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
 * `dates` is the one thing the two callers disagree about, and it is a real disagreement rather
 * than a preference. `/accounts` writes every date as an ISO day (`dayOf`, `accounts/read.ts`)
 * because an operator reading a control panel is comparing and copying them; `/billing` writes
 * dates the way a reader would say them (`formatPlanDate`) — and this table sits directly under
 * the sentence that does, so «Standard, active until 22 September 2026» over a row dated
 * «2026-08-23» was two date formats a centimetre apart on one screen.
 */
export function PaymentHistoryTable({
  lines,
  dates = 'iso',
}: {
  lines: PaymentHistoryLine[]
  /** `iso` for the operator screen, `plain` for the customer's own — see above. */
  dates?: 'iso' | 'plain'
}) {
  if (lines.length === 0) return <p className="text-sm text-muted">Nothing yet.</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-muted">
            <th className="py-1.5 pr-3 font-normal">Date</th>
            <th className="py-1.5 pr-3 font-normal">Event</th>
            <th className="py-1.5 font-normal">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-t" style={{ borderColor: 'var(--surface-2)' }}>
              <td className="whitespace-nowrap py-1.5 pr-3">
                {dates === 'plain' ? formatPlanDate(line.occurredAt) : line.occurredAt.toISOString().slice(0, 10)}
              </td>
              <td className="py-1.5 pr-3">{describeEvent(line)}</td>
              <td className="whitespace-nowrap py-1.5">{line.amount !== null ? euro(line.amount) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
