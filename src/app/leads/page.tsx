import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'
import { channelLabel, conversionPercent } from '@/lib/attribution/format'
import { leadRollup, openLeads } from '@/lib/attribution/read'
import type { RollupBasis } from '@/lib/attribution/read'

export const metadata: Metadata = { title: 'Leads' }

/** Rendered per request, like `/accounts`: these counts change with every registration. */
export const dynamic = 'force-dynamic'

/** How many open leads the list below the rollup shows before it stops. */
const OPEN_LEADS_SHOWN = 25

/**
 * The two groupings, as a list so the markup below derives from it — the reason
 * `AdminPanel.ENTRIES` is a list too: with the labels and the hrefs written out twice, adding a
 * third basis means remembering a second place, and forgetting it is invisible.
 */
const BASES: readonly { basis: RollupBasis; href: string; label: string }[] = [
  { basis: 'first', href: '/leads', label: 'First touch' },
  { basis: 'last', href: '/leads?basis=last', label: 'Last touch' },
]

/**
 * Which arrival the rollup groups by, from `?basis=`.
 *
 * A URL parameter and not client state, the arrangement `/accounts/[email]`'s tabs already use:
 * it keeps this a server component, makes the toggle a link, and makes a particular view of the
 * numbers something you can send somebody.
 */
function readBasis(params: Record<string, string | string[] | undefined>): RollupBasis {
  return params.basis === 'last' ? 'last' : 'first'
}

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * How each channel is doing — the screen the whole attribution feature exists to fill.
 *
 * `notFound()` rather than a role notice, like every other owner-only page here: "this does not
 * exist" and "this is not yours" should look identical from outside. `isOwner` is re-checked by
 * each read as well; hiding the menu entry is a courtesy, never the fence.
 *
 * **The denominator is deliberately absent, and the page says so rather than implying it has
 * one.** Visits are counted by Vercel Web Analytics and by nothing in this repo — the middleware
 * that reads the campaign parameters runs on the edge, where there is no database to count into.
 * So a conversion rate here is accounts over *leads this repo knows about*, which is a real
 * number and not the one an advertising platform means by that phrase. Printing a rate against
 * an invented denominator would make this screen believable and wrong, which is the failure
 * `/accounts` avoids by showing an em dash instead of a reassuring value.
 */
export default async function LeadsPage({ searchParams }: Props) {
  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) notFound()

  const basis = readBasis(await searchParams)
  const [rollup, open] = await Promise.all([leadRollup(basis), openLeads(OPEN_LEADS_SHOWN)])

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="leads" />

      <main className="mx-auto max-w-4xl px-4 pb-12 pt-3.5">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">Leads</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">
            Where the people who signed up came from, grouped by channel. A lead is an address that has been given —
            a registration begun, or a first sign-in — so these are conversions from leads, not from visits.{' '}
            <strong className="font-medium">Visits are counted by Vercel Web Analytics, not here.</strong>
          </p>
        </header>

        {/*
          * First touch against last touch, as two links rather than a control: the first answers
          * "what brings people here" and the second "what closes them", and for a product with a
          * blog and free tools those are routinely different channels.
          */}
        <nav className="accounts-tabs" aria-label="Group by">
          {BASES.map((option) => {
            const active = basis === option.basis
            return (
              <Link
                key={option.basis}
                href={option.href}
                className={`accounts-tab${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {option.label}
              </Link>
            )
          })}
        </nav>

        {rollup === null ? (
          /* The failure is printed, never an empty table: "no campaign has ever brought anybody"
             and "could not read" are opposite answers on a screen built to be believed. */
          <p className="text-sm text-muted">Could not read the channels.</p>
        ) : (
          <div className="accounts-table">
            <div className="accounts-grid is-leads accounts-table-head" role="row">
              <span>Channel</span>
              <span>Open</span>
              <span>Accounts</span>
              <span>Paying</span>
              <span>Conv.</span>
            </div>

            {rollup.rows.map((row) => {
              const rate = conversionPercent(row.accounts, row.pending)
              return (
                <div key={channelLabel(row)} className="accounts-grid is-leads accounts-row" role="row">
                  <span className="accounts-email">{channelLabel(row)}</span>
                  <span className="accounts-status is-nums">{row.pending}</span>
                  <span className="accounts-status is-nums">{row.accounts}</span>
                  <span className="accounts-status is-nums">{row.paying}</span>
                  {/* An em dash and not 0% for a channel with nothing in it: it has not
                      converted badly, it has not been measured. */}
                  <span className="accounts-status is-nums">{rate === null ? '—' : `${rate}%`}</span>
                </div>
              )
            })}

            {/*
              * The row a GROUP BY would have dropped in silence, and the reason it is here at
              * all: every account created before this feature shipped has no attribution and
              * never will, by decision — so without this line the totals would not add up and
              * the early months would read as though nobody had ever arrived.
              */}
            {rollup.unattributed.accounts > 0 && (
              <div className="accounts-grid is-leads accounts-row" role="row">
                <span className="accounts-email text-muted">No attribution recorded</span>
                <span className="accounts-status is-nums">0</span>
                <span className="accounts-status is-nums">{rollup.unattributed.accounts}</span>
                <span className="accounts-status is-nums">{rollup.unattributed.paying}</span>
                <span className="accounts-status is-nums">—</span>
              </div>
            )}

            {rollup.rows.length === 0 && rollup.unattributed.accounts === 0 && (
              <div className="accounts-grid is-leads accounts-row" role="row">
                <span className="accounts-email text-muted">Nothing recorded yet.</span>
              </div>
            )}
          </div>
        )}

        {rollup !== null && rollup.unattributed.accounts > 0 && (
          <p className="mt-2.5 text-[0.8125rem] leading-[1.5] text-faint">
            Accounts under <em>No attribution recorded</em> either predate this feature — nothing is ever backfilled —
            or arrived with no campaign and no referring page.
          </p>
        )}

        {/*
          * The open leads themselves, because "Open" is a number somebody will want to look
          * behind: an address that arrived from a campaign and stopped at the verification email
          * is a different problem from a campaign that brings nobody.
          */}
        <section className="mt-7">
          <h2 className="section-title">Open leads</h2>
          <p className="mt-1 text-sm text-muted">
            Registrations begun and never completed, newest first. The verification link expires after 24 hours; the
            record itself stays until it is removed by hand.
          </p>

          {open === null ? (
            <p className="mt-3.5 text-sm text-muted">Could not read the open leads.</p>
          ) : open.length === 0 ? (
            <p className="mt-3.5 text-sm text-muted">No registration is waiting.</p>
          ) : (
            <div className="accounts-table mt-3.5">
              <div className="accounts-grid is-pending accounts-table-head" role="row">
                <span>Email</span>
                <span>Arrived</span>
                <span>Channel</span>
                <span />
              </div>
              {open.map((lead) => (
                <div key={lead.email} className="accounts-grid is-pending accounts-row" role="row">
                  <span className="accounts-email">{lead.email}</span>
                  <span className="accounts-status is-nums">
                    {lead.line.first.at === null ? '—' : lead.line.first.at.toISOString().slice(0, 10)}
                  </span>
                  <span className="accounts-status">{channelLabel(lead.line.first)}</span>
                  <span className="flex justify-end">
                    {/* The one place an operator can act on it: `/accounts` is where a pending
                        registration is confirmed by hand, and that button lives there. */}
                    <Link href="/accounts#pending" className="text-sm underline underline-offset-2">
                      Manage
                    </Link>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <Footer />
      </main>
    </PrefsProvider>
  )
}
