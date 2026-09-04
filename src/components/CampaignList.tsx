'use client'

import { useState } from 'react'

import { CampaignForm } from '@/components/CampaignForm'
import type { EditableCampaign } from '@/components/CampaignForm'
import { IconInfo } from '@/components/icons'
import { setDefaultCampaign } from '@/lib/coupons/actions'
import { CAMPAIGN_FAILURE_MESSAGE, STATUS_LABEL } from '@/lib/coupons/types'
import type { CampaignStatus } from '@/lib/coupons/types'
import { useOnline } from '@/lib/useOnline'

/**
 * One campaign as `/coupons` shows it — everything the server already computed, flattened to
 * strings and numbers.
 *
 * Dates arrive as ISO strings rather than `Date`s. RSC would serialize a `Date` correctly, so
 * this is not a limitation being worked around: it is that every one of these is *displayed*,
 * and `CampaignForm` wants them as `datetime-local` values anyway — a `Date` here would be
 * converted twice, once in each direction, for no reader's benefit.
 */
export interface CampaignRow extends EditableCampaign {
  status: CampaignStatus
  /** How long the default campaign has been running, in days — `null` for every other row. */
  defaultForDays: number | null
  /** True for an active campaign with no end date: the one thing this screen has to make loud. */
  endless: boolean
  limitLabel: string
}

const STATUS_CLASS: Record<CampaignStatus, string> = {
  active: 'badge plan-badge-paid',
  scheduled: 'badge plan-badge-unchosen',
  exhausted: 'badge plan-badge-unchosen',
  expired: 'badge plan-badge-unchosen',
  archived: 'badge plan-badge-unchosen',
}

/**
 * The list, with a form that opens in place.
 *
 * One expanded row at a time, by id: two open forms are two sets of unsaved edits, and the one
 * that gets saved is whichever button was pressed last, which is not a decision anybody made.
 */
export function CampaignList({ campaigns }: { campaigns: CampaignRow[] }) {
  const online = useOnline()
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleDefault = async (row: CampaignRow) => {
    setBusy(true)
    setError(null)
    try {
      const result = await setDefaultCampaign(row.id, !row.isDefault)
      if (!result.ok) setError(CAMPAIGN_FAILURE_MESSAGE[result.reason])
    } catch {
      setError(CAMPAIGN_FAILURE_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {error !== null && (
        <p className="notice notice-error mb-2.5" role="alert">
          {error}
        </p>
      )}

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating((open) => !open)}>
          {creating ? 'Cancel' : 'New campaign'}
        </button>
      </div>

      {creating && (
        <section className="card mb-2.5 p-4">
          <h2 className="section-title mb-2.5">New campaign</h2>
          <CampaignForm campaign={null} onDone={() => setCreating(false)} />
        </section>
      )}

      {campaigns.length === 0 ? (
        <p className="text-sm text-muted">No campaigns yet.</p>
      ) : (
        <ul className="card-stack">
          {campaigns.map((row) => (
            <li key={row.id} className="card px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {row.code}
                    <span className="ml-2 font-normal text-muted">{row.name}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.8125rem] text-muted">
                    <span className={STATUS_CLASS[row.status]}>{STATUS_LABEL[row.status]}</span>
                    <span className="meta-chip">−{row.discountPercent}%</span>
                    <span className="meta-chip">
                      {row.discountMonths === '' ? 'forever' : `${row.discountMonths} mo`}
                    </span>
                    <span className="meta-chip">{row.limitLabel}</span>
                    {row.appliesToLifetime && <span className="meta-chip">+ Lifetime</span>}
                    {row.isDefault && (
                      <span className="badge plan-badge-paid">
                        ?promo=1
                        {/* The counter the plan asks for: an operator has to be able to see at a
                            glance how long the default campaign has been exposed to every paid
                            visitor, because that is the fact the struck-price defence rests on. */}
                        {row.defaultForDays !== null && ` · ${row.defaultForDays}d`}
                      </span>
                    )}
                  </span>
                </span>

                <span className="flex flex-none gap-2">
                  {row.status !== 'archived' && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={!online || busy}
                      onClick={() => void toggleDefault(row)}
                    >
                      {row.isDefault ? 'Unset default' : 'Make default'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setOpenId((current) => (current === row.id ? null : row.id))}
                  >
                    {openId === row.id ? 'Close' : 'Edit'}
                  </button>
                </span>
              </div>

              {/*
                * Enforcement by visibility, in place of the constraint that was deliberately not
                * added: `expires_at` stays nullable, so a campaign can quietly become the
                * permanent price — which is exactly what makes a struck listino contestable.
                * Nothing stops it; this makes it impossible not to notice.
                */}
              {row.endless && (
                <p className="notice notice-accent mt-2.5" role="status">
                  <IconInfo />
                  <span>
                    No end date. This campaign keeps discounting until somebody archives it — and while it runs, the
                    full price is not what that audience ever sees.
                  </span>
                </p>
              )}

              {openId === row.id && (
                <div className="mt-3 border-t border-edge pt-3">
                  <CampaignForm campaign={row} onDone={() => setOpenId(null)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
