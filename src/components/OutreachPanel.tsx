import { IconCake, IconGift, IconSend, IconVoucher } from '@/components/icons'
import { occurrenceLabel } from '@/lib/outreach/occurrence'
import type { OutreachRow } from '@/lib/outreach/read'
import { OUTREACH, STATUS_LABEL, readOutreachKind } from '@/lib/outreach/types'
import type { OutreachStatus } from '@/lib/outreach/types'

/**
 * The Outreach tab on `/accounts/[email]`: every action the platform has ever aimed at this
 * account, and how each one ended.
 *
 * **A log and nothing else** (`Account Detail.dc.html`), which is a narrowing — this panel used
 * to carry the controls that ran an action by hand, `Run now`, `Skip` and `Run everything due`,
 * above a list of what had happened before. What that costs is worth stating plainly, because
 * the comment it replaces claimed the opposite. `HANDLERS` is still all `null`
 * (`lib/outreach/CLAUDE.md`), so every one of those buttons could only ever answer «not built
 * yet»; and the one outreach message this app really sends, `gift_notice`, is composed on the
 * Plan & gift tab by `sendGiftNotice` and merely *recorded* here — it carries
 * `trigger: 'elsewhere'` and never had a run button on this tab at all. So no message that can
 * be sent today lost the surface that sends it. What did go is `skipOutreach`: recording «we
 * were allowed to and chose not to» is a first-class outcome this deploy can still store and no
 * longer offers any way to write.
 *
 * A server component with no control in it — the whole tab's arrangement, and the one
 * `CouponsSeenCard` is already built on: what an operator does next is a decision, and nothing
 * on this page takes it for them.
 *
 * Note what the narrowing means for `history`: it is now **every row on file**, the current
 * occurrence included. It used to exclude the rows the removed section drew, and with that
 * section gone the exclusion would have hidden this year's greeting from the only table that
 * lists it.
 */

const STATUS_CLASS: Record<OutreachStatus, string> = {
  /* Plain `.badge`, which is the accent: the one outcome that is finished with. */
  done: 'badge',
  /* `--danger`, the same borrowed colour `plan-badge-unchosen` uses for the other thing on
     these screens that needs looking at. */
  failed: 'badge plan-badge-unchosen',
  suppressed: 'badge plan-badge-none',
  pending: 'badge plan-badge-free',
}

/**
 * A mark per kind for the Action column (`Account Detail.dc.html`) — a gift, a cake, a voucher.
 * Keyed by `OutreachKind` and reached only through `readOutreachKind`, never by the stored
 * string: a row naming a kind this deploy no longer declares is a real possibility (the table
 * prints its raw name for exactly that reason), and indexing this with it would be an
 * `undefined` rendered as a blank circle.
 */
const KIND_ICON = {
  gift_notice: IconGift,
  birthday_greeting: IconCake,
  upgrade_voucher: IconVoucher,
} as const

/** The date a row is filed under: when it settled if it ever did, otherwise when it was claimed. */
function rowDate(row: OutreachRow): string {
  return (row.lastAttemptAt ?? row.createdAt).slice(0, 10)
}

/**
 * The faint line under the action's name. `detail` is what a settled row says about itself and
 * `reason` what a skipped or a failed one says; a row never usefully carries both, and detail
 * wins. Who triggered it is appended rather than given a column: the mock draws none for it,
 * and «by whom» is audit, read once, never compared down a page. A row a schedule wrote names
 * nobody, which is why `'system'` prints nothing.
 */
function subLine(row: OutreachRow): string | null {
  const said = row.detail ?? row.reason
  const who = row.triggeredBy === null || row.triggeredBy === 'system' ? null : `by ${row.triggeredBy}`
  if (said === null) return who
  return who === null ? said : `${said} · ${who}`
}

export function OutreachPanel({ history }: { history: OutreachRow[] }) {
  return (
    <div className="acct-card">
      <h2 className="acct-card-title">Earlier occurrences</h2>
      {history.length === 0 ? (
        <p className="text-sm text-muted">Nothing has ever been aimed at this account.</p>
      ) : (
        <table className="acct-log">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Action</th>
              <th scope="col">Occurrence</th>
              <th scope="col">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => {
              const kind = readOutreachKind(row.kind)
              /* A row naming a kind this deploy no longer declares still has a date, an
                 occurrence and an outcome worth reading, so it gets the neutral mark rather
                 than no row — and its stored name, since rewriting that would invent history. */
              const Mark = kind === null ? IconSend : KIND_ICON[kind]
              const said = subLine(row)
              return (
                <tr key={row.id}>
                  <td>{rowDate(row)}</td>
                  <td>
                    <span className="acct-log-what">
                      <span className="acct-log-mark" aria-hidden>
                        <Mark size={13} />
                      </span>
                      <span className="min-w-0">
                        {kind === null ? row.kind : OUTREACH[kind].label}
                        {said !== null && <span className="acct-log-detail">{said}</span>}
                      </span>
                    </span>
                  </td>
                  {/* Which occurrence of it — «plus:2026-12-31», «2025», «once ever». Its own
                      column since the redesign: it is the value that says whether two rows are
                      about the same thing, which inside a sentence it did not answer. */}
                  <td className="acct-log-key">{occurrenceLabel(row.occurrenceKey)}</td>
                  <td>
                    <span className={STATUS_CLASS[row.status]}>{STATUS_LABEL[row.status]}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
