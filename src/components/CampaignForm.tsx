'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { IconInfo } from '@/components/icons'
import { archiveCampaign, createCampaign, updateCampaign } from '@/lib/coupons/actions'
import type { CampaignInput } from '@/lib/coupons/actions'
import { discountCycles, discountedAmount } from '@/lib/coupons/discount'
import {
  CAMPAIGN_FAILURE_MESSAGE,
  CHANNEL_LABEL,
  COUPON_CHANNELS,
  COUPON_ENTRIES,
  ENTRY_LABEL,
  normalizeCode,
  readMonths,
} from '@/lib/coupons/types'
import { euro, LIFETIME, PRICES } from '@/lib/plans/prices'
import { useOnline } from '@/lib/useOnline'

/** The row this form edits, or `null` when it is creating one. */
export interface EditableCampaign extends CampaignInput {
  id: string
  redeemed: number
}

const EMPTY: CampaignInput = {
  name: '',
  code: '',
  channel: 'paid',
  notes: '',
  discountPercent: '30',
  discountMonths: '3',
  appliesToLifetime: false,
  startsAt: '',
  expiresAt: '',
  usageLimitSubscription: '500',
  usageLimitLifetime: '',
  entry: 'both',
  isDefault: false,
}

/**
 * A `<datetime-local>` value from a `Date`, in the browser's own zone.
 *
 * Deliberately not ISO with a `Z`: the operator is scheduling a campaign against the clock on
 * the wall in front of them, and an input that shows UTC would make «starts at 9am» mean 10 or
 * 11 depending on the season. The action parses it back with `new Date(...)`, which reads a
 * zone-less local string as local — so the round trip agrees with what was typed.
 */
function localValue(iso: string): string {
  if (iso === '') return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * The two warnings the plan asks for — and they are warnings, not validations, because both
 * describe something an operator may legitimately want.
 *
 * The first is the most surprising thing in the whole design and the reason it is shown beside
 * the field rather than in a document: **the number typed here is in months, and the yearly
 * cycle rounds up to whole years**, so `1` discounts a full first year. Somebody filling this
 * in without being told would set 3 expecting a quarter and give away twelve months on every
 * annual sale. The second is the reference document's own «questo blocca il prezzo per N anni»,
 * at the threshold where it starts to matter.
 */
function monthsWarnings(raw: string): string[] {
  const parsed = readMonths(raw)
  if (!parsed.ok) return []
  if (parsed.months === null) {
    return ['Blank means the discount never lapses — every renewal stays at the reduced price, for good.']
  }

  const years = discountCycles(parsed.months, 'year') ?? 0
  const out: string[] = [
    `On the monthly cycle this is ${parsed.months} ${parsed.months === 1 ? 'month' : 'months'}. On the yearly cycle it rounds up to ${years} full ${years === 1 ? 'year' : 'years'} — always in the customer’s favour.`,
  ]
  if (parsed.months > 12) {
    out.push(`This holds the price for ${years} years on the yearly cycle. That is a long commitment to make now.`)
  }
  return out
}

/**
 * Create or edit one campaign.
 *
 * Only `@/lib/coupons/types` and `@/lib/plans/prices` are value-imported — never `read.ts`,
 * which touches the database, for the reason `PricingPlans.tsx`' header spells out. `actions.ts`
 * is `'use server'`, so importing it costs an RPC reference rather than the module, exactly as
 * `GiftForm` imports `setGrant`.
 *
 * The guardrails an operator meets here are the ones that protect people who already redeemed:
 * the discount is frozen once anybody has, and a ceiling cannot drop below the count. Both are
 * enforced in the action — this only says so beforehand, so a refusal is never a surprise.
 */
export function CampaignForm({ campaign, onDone }: { campaign: EditableCampaign | null; onDone?: () => void }) {
  const router = useRouter()
  const online = useOnline()
  const [form, setForm] = useState<CampaignInput>(
    campaign === null
      ? EMPTY
      : { ...campaign, startsAt: localValue(campaign.startsAt), expiresAt: localValue(campaign.expiresAt) },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [confirmingArchive, setConfirmingArchive] = useState(false)

  const set = <K extends keyof CampaignInput>(key: K, value: CampaignInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const redeemed = campaign?.redeemed ?? 0
  const percentLocked = redeemed > 0
  const warnings = monthsWarnings(form.discountMonths)

  /*
   * What this campaign would actually charge, on the two prices an operator is most likely to
   * be reasoning about. Computed with the same function the pricing page uses, so the preview
   * cannot flatter the real figure — and it is the fastest way to catch a percentage typed with
   * the decimal point in the wrong place.
   */
  const preview = (() => {
    const percent = form.discountPercent
    /* `discountedAmount` returns the amount unchanged for a percentage it cannot read, so a
       half-typed «3.» on the way to «30» previews the full price rather than blanking. */
    const at = (amount: string) => `${euro(amount)} → ${euro(discountedAmount(amount, percent))}`
    const lines = [
      `Standard monthly ${at(PRICES.standard.month.amount)}`,
      `Premium yearly ${at(PRICES.premium.year.amount)}`,
    ]
    if (form.appliesToLifetime) lines.push(`Lifetime ${at(LIFETIME.amount)}`)
    return lines
  })()

  const submit = async () => {
    setBusy(true)
    setError(null)
    setDone(null)

    try {
      const result = campaign === null ? await createCampaign(form) : await updateCampaign(campaign.id, form)
      if (result.ok) {
        setDone(campaign === null ? `Created ${normalizeCode(form.code)}.` : `Saved ${normalizeCode(form.code)}.`)
        router.refresh()
        onDone?.()
      } else {
        setError(CAMPAIGN_FAILURE_MESSAGE[result.reason])
      }
    } catch {
      setError(CAMPAIGN_FAILURE_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  const archive = async () => {
    if (campaign === null) return
    setBusy(true)
    setError(null)
    try {
      const result = await archiveCampaign(campaign.id)
      if (result.ok) {
        setDone(`Archived ${campaign.code}.`)
        setConfirmingArchive(false)
        router.refresh()
        onDone?.()
      } else {
        setError(CAMPAIGN_FAILURE_MESSAGE[result.reason])
      }
    } catch {
      setError(CAMPAIGN_FAILURE_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      {error !== null && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {done !== null && (
        <p className="notice notice-success" role="status">
          {done}
        </p>
      )}

      <div className="flex flex-wrap gap-2.5">
        <label className="min-w-0 flex-1 basis-56">
          <span className="mb-1 block text-[0.8125rem] text-muted">Internal name</span>
          <input
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="Launch Q4 — Google Ads"
            className="form-field w-full"
          />
        </label>

        <label className="min-w-0 basis-40">
          <span className="mb-1 block text-[0.8125rem] text-muted">Public code</span>
          <input
            value={form.code}
            onChange={(event) => set('code', event.target.value.toUpperCase())}
            placeholder="FOUNDER30"
            maxLength={24}
            className="form-field w-full uppercase"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>

        <label className="min-w-0 basis-40">
          <span className="mb-1 block text-[0.8125rem] text-muted">Channel</span>
          <select value={form.channel} onChange={(event) => set('channel', event.target.value)} className="form-field w-full">
            {COUPON_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {CHANNEL_LABEL[channel]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <label className="min-w-0 basis-32">
          <span className="mb-1 block text-[0.8125rem] text-muted">Discount %</span>
          <input
            value={form.discountPercent}
            onChange={(event) => set('discountPercent', event.target.value)}
            inputMode="decimal"
            disabled={percentLocked}
            className="form-field w-full"
          />
        </label>

        <label className="min-w-0 basis-32">
          <span className="mb-1 block text-[0.8125rem] text-muted">Months</span>
          <input
            value={form.discountMonths}
            onChange={(event) => set('discountMonths', event.target.value)}
            inputMode="numeric"
            placeholder="forever"
            className="form-field w-full"
          />
        </label>

        <label className="min-w-0 flex-1 basis-48">
          <span className="mb-1 block text-[0.8125rem] text-muted">Reachable by</span>
          <select value={form.entry} onChange={(event) => set('entry', event.target.value)} className="form-field w-full">
            {COUPON_ENTRIES.map((entry) => (
              <option key={entry} value={entry}>
                {ENTRY_LABEL[entry]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {percentLocked && (
        <p className="notice notice-accent" role="status">
          <IconInfo />
          <span>
            {/* Said here as well as refused in the action, because a disabled field with no
                explanation reads as a bug. The remedy is named, since «you cannot» without
                «instead, do this» is where an operator gets stuck. */}
            {redeemed} {redeemed === 1 ? 'account has' : 'accounts have'} redeemed this campaign, so the discount is
            frozen at {form.discountPercent}% — what they were promised has to stay what they were promised. To change
            the rate, archive this and make a new campaign.
          </span>
        </p>
      )}

      {warnings.map((warning) => (
        <p key={warning} className="notice notice-accent" role="status">
          <IconInfo />
          <span>{warning}</span>
        </p>
      ))}

      <div className="flex flex-wrap gap-2.5">
        <label className="min-w-0 flex-1 basis-52">
          <span className="mb-1 block text-[0.8125rem] text-muted">Starts</span>
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(event) => set('startsAt', event.target.value)}
            className="form-field w-full"
          />
        </label>

        <label className="min-w-0 flex-1 basis-52">
          <span className="mb-1 block text-[0.8125rem] text-muted">Ends</span>
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(event) => set('expiresAt', event.target.value)}
            className="form-field w-full"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <label className="min-w-0 flex-1 basis-44">
          <span className="mb-1 block text-[0.8125rem] text-muted">Subscription limit</span>
          <input
            value={form.usageLimitSubscription}
            onChange={(event) => set('usageLimitSubscription', event.target.value)}
            inputMode="numeric"
            placeholder="no limit"
            className="form-field w-full"
          />
        </label>

        <label className="min-w-0 flex-1 basis-44">
          <span className="mb-1 block text-[0.8125rem] text-muted">Lifetime limit</span>
          <input
            value={form.usageLimitLifetime}
            onChange={(event) => set('usageLimitLifetime', event.target.value)}
            inputMode="numeric"
            placeholder={form.appliesToLifetime ? 'required' : 'not used'}
            disabled={!form.appliesToLifetime}
            className="form-field w-full"
          />
        </label>
      </div>

      <label className="row cursor-pointer items-center">
        <input
          type="checkbox"
          role="switch"
          className="toggle-switch"
          checked={form.appliesToLifetime}
          onChange={(event) => set('appliesToLifetime', event.target.checked)}
        />
        <span className="min-w-0">
          <span className="block text-[0.9375rem] text-ink">Covers the Lifetime</span>
          <span className="mt-0.5 block text-[0.8125rem] leading-[1.45] text-muted">
            {/* Names what off means, because off is the default and the deck treats leaving it
                off as a lever rather than an omission. */}
            Off by default: a discount on a subscription costs a few months, one on the Lifetime costs for ever.
            Leaving it off is how the Lifetime stays at full price while everything else is on offer.
          </span>
        </span>
      </label>

      <label className="row cursor-pointer items-center">
        <input
          type="checkbox"
          role="switch"
          className="toggle-switch"
          checked={form.isDefault}
          onChange={(event) => set('isDefault', event.target.checked)}
        />
        <span className="min-w-0">
          <span className="block text-[0.9375rem] text-ink">The ?promo=1 campaign</span>
          <span className="mt-0.5 block text-[0.8125rem] leading-[1.45] text-muted">
            One at a time. This is what <code>strumfolio.com/pricing?promo=1</code> resolves to, so the advertising
            URL never changes when the campaign rotates.
          </span>
        </span>
      </label>

      <label>
        <span className="mb-1 block text-[0.8125rem] text-muted">Notes</span>
        <textarea
          value={form.notes}
          onChange={(event) => set('notes', event.target.value)}
          rows={2}
          placeholder="Why this campaign exists, for whoever reads it in six months. Partner name goes here too."
          className="form-field w-full"
        />
      </label>

      <div className="card p-3">
        <p className="text-[0.8125rem] font-medium text-ink">At {form.discountPercent || '0'}%</p>
        <ul className="mt-1 flex flex-col gap-0.5 text-[0.8125rem] text-muted">
          {preview.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={!online || busy}>
          {campaign === null ? 'Create campaign' : 'Save changes'}
        </button>

        {/*
          * Two presses, the pattern this codebase uses for anything that cannot be undone —
          * and this one genuinely cannot: a campaign is never deleted, only archived, and an
          * archived code may never be reused. The question names both consequences, because
          * they are the two things being decided and the button alone could name neither.
          */}
        {campaign !== null &&
          (confirmingArchive ? (
            <>
              <span className="self-center text-sm text-muted">
                Archive {campaign.code}? No new redemptions, the code can never be reused, and anybody already on the
                discount keeps it until it runs out.
              </span>
              <button type="button" className="btn btn-danger btn-sm" disabled={!online || busy} onClick={() => void archive()}>
                Archive it
              </button>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setConfirmingArchive(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setConfirmingArchive(true)}>
              Archive
            </button>
          ))}
      </div>
    </form>
  )
}
