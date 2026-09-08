import { channelLabel } from '@/lib/attribution/format'
import type { AttributionRead, TouchLine } from '@/lib/attribution/read'

/**
 * Where this account came from, on the Identity tab.
 *
 * A server component with no control in it, the whole tab's arrangement: what an operator does
 * with the answer is a decision, and this page deliberately holds no button that would take it
 * for them.
 *
 * **Three states and none collapses into another** — the rule `CouponsSeenCard` next door states
 * for itself and `rateLimitStatusFor` states for its cell. A failed read prints that it failed;
 * an account with no row prints that nothing was recorded, and names the two ordinary reasons,
 * because on this screen "nothing is wrong" and "could not tell" are opposite answers.
 *
 * **The reader never sees any of this.** It lives here and on `/leads`, both owner-only, and
 * nowhere in the app a customer can reach — the same treatment `sign_ins` and `coupon_views`
 * already get. How somebody exercises their right of access to it is Privacy Policy section 7's
 * business, not a screen's.
 */
export function AttributionCard({ read }: { read: AttributionRead }) {
  return (
    <div className="acct-card">
      <h2 className="acct-card-title">Where they came from</h2>

      {!read.ok ? (
        <p className="text-sm text-muted">Could not read where this account came from.</p>
      ) : read.line === null ? (
        <p className="text-sm text-muted">
          Nothing was recorded — either this account predates attribution, or it arrived with no campaign and no
          referring page.
        </p>
      ) : (
        <dl className="acct-attribution">
          <TouchRow
            label={read.line.last === null ? 'Arrived from' : 'First arrival'}
            touch={read.line.first}
          />
          {/*
            * Only when there really are two. `last_touch_at IS NULL` is the schema's own
            * invariant for "one provenance, ever", so an account that arrived once says
            * "Arrived from" and nothing more — rather than printing the same channel twice
            * under two headings, which reads as though something changed.
            */}
          {read.line.last !== null && <TouchRow label="Most recent arrival" touch={read.line.last} />}
        </dl>
      )}
    </div>
  )
}

/** One arrival: the channel, then the landing page, the click id and the date under it. */
function TouchRow({ label, touch }: { label: string; touch: TouchLine }) {
  return (
    <>
      <dt className="acct-cell-label">{label}</dt>
      <dd>
        <span className="font-medium">{channelLabel(touch)}</span>
        <span className="acct-attribution-meta">
          {touch.landingPath !== null && <span>{touch.landingPath}</span>}
          {/* The referring host, only when it says something the channel does not already. */}
          {touch.refererHost !== null && touch.refererHost !== touch.source && <span>via {touch.refererHost}</span>}
          {/* Named by network, which is what makes it reconcilable against that network's own dashboard. */}
          {touch.clickIdKind !== null && <span>{touch.clickIdKind}</span>}
          {touch.at !== null && <span className="is-nums">{touch.at.toISOString().slice(0, 10)}</span>}
        </span>
      </dd>
    </>
  )
}
