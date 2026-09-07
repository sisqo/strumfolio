import { seenSpan } from '@/lib/coupons/discount'
import { VIEW_STANDING_LABEL } from '@/lib/coupons/types'
import type { CouponViewLine } from '@/lib/coupons/views'

/**
 * Which coupons this account has been *shown*, on the Payments tab beside the ledger of what
 * it actually paid.
 *
 * The two answer different questions and the difference is the reason this card exists: the
 * ledger records discounts given, and until `coupon_views` nothing recorded discounts *shown*
 * — a reader who clicked an advertisement, saw a struck price and closed the tab left no trace
 * anywhere but their own browser's cookie. This is the surface where «saw FOUNDER30 on the
 * 3rd, never used it» becomes a sentence somebody can act on.
 *
 * A server component with no control in it, the whole tab's arrangement: what an operator does
 * next is a decision, and this page's summary strip and cards deliberately hold no button that
 * would take it for them.
 *
 * **Three states and none collapses into another.** `null` is «could not read», the empty list
 * is «nothing was ever shown», and a list is a list — the rule `rateLimitStatusFor` states for
 * its own cell, and the reason this card prints a failure rather than an empty one: "nothing is
 * wrong" and "could not tell" are opposite answers on the one screen built to be believed.
 */
export function CouponsSeenCard({ lines }: { lines: CouponViewLine[] | null }) {
  return (
    <div className="acct-card">
      <h2 className="acct-card-title">Coupons seen</h2>

      {lines === null ? (
        <p className="text-sm text-muted">Could not read which coupons this account has seen.</p>
      ) : lines.length === 0 ? (
        <p className="text-sm text-muted">No coupon has ever been shown to this account.</p>
      ) : (
        <ul className="acct-seen-log">
          {/* Keyed by the code: one row per campaign per account is what `coupon_views_once`
              guarantees, so no two lines here can carry the same one. */}
          {lines.map((line) => (
            <li key={line.code}>
              <span className="acct-seen-when">{seenSpan(line.firstSeenAt, line.lastSeenAt)}</span>
              <span className="acct-seen-what">
                <strong className="font-medium">{line.code}</strong> · {line.campaignName}
              </span>
              {/*
                * `Redeemed` / `Not redeemed` / `Missed` — the campaign's five states collapsed
                * to the one question being asked (`viewStanding`). The chip is the answer an
                * operator scans the column for, so it is last and it is the only thing here
                * that carries a shape of its own.
                */}
              <span className="meta-chip">{VIEW_STANDING_LABEL[line.standing]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
