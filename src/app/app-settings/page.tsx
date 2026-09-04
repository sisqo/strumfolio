import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AppSettingsForm } from '@/components/AppSettingsForm'
import { DeviceLaunchCheck } from '@/components/DeviceLaunchCheck'
import { Footer } from '@/components/Footer'
import { LifetimeOnSaleForm } from '@/components/LifetimeOnSaleForm'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'
import { loadSettingAuthor } from '@/lib/settings/actions'
import { loadLifetimeOnSale, loadNotifySettings } from '@/lib/settings/read'
import { LIFETIME_ON_SALE_KEY, NOTIFY_EVENTS, NOTIFY_LABEL, notifyKey } from '@/lib/settings/types'

export const metadata: Metadata = { title: 'App settings' }

/**
 * Per request, never prerendered — the same reason `/accounts` and `/emails` say so, one degree
 * sharper here: a settings panel built at deploy time would show whatever the switches said
 * then and go on showing it, which is precisely the "the screen says saved and nothing
 * changed" trap that `/pricing`'s build-time `CHECKOUT_LIVE` is a real instance of.
 */
export const dynamic = 'force-dynamic'

/**
 * Settings for the whole installation, as opposed to the reading preferences every reader has
 * of their own — those live in the user menu's own Settings, which is why this route is
 * `/app-settings` and not `/settings`: two things called Settings in the same header would be
 * a coin flip for whoever is looking for one of them.
 *
 * Two families of switch now: the Telegram notifications this screen was built for, and
 * whether the Lifetime plan is in the catalogue — which arrived with coupons, when
 * `LIFETIME.closesOn` was removed from `prices.ts` and the offer needed something other than a
 * date compiled into the code to close it. What decides whether something
 * belongs here is not "is it configuration" but **"is it a secret"**: the bot token, the API
 * keys, the database URL and `ALLOWED_EMAILS` all stay in the environment, and none of them is
 * a candidate later either. A screen that can display a credential in order to edit it is a
 * screen that can leak one, and today nothing in this app can read those values back out at
 * all. `ALLOWED_EMAILS` has a second reason on top of that, in `allowlist.ts`' own words: kept
 * where the app cannot edit it, it makes locking yourself out impossible and keeps an owner in
 * even when the database is unreachable.
 *
 * `notFound()` rather than a role notice, like every other owner-only page here — "this does
 * not exist" and "this is not yours" should look identical from outside.
 */
export default async function AppSettingsPage() {
  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) notFound()

  const [{ settings, available }, lifetimeOnSale] = await Promise.all([
    loadNotifySettings(),
    loadLifetimeOnSale(),
  ])

  /*
   * `loadSettingAuthor` takes the row key rather than a notify event, since the Lifetime
   * switch is not one — so `notifyKey` is applied here, at the one place that knows these
   * particular keys are notification keys.
   */
  const authored: { label: string; key: string }[] = [
    ...NOTIFY_EVENTS.map((event) => ({ label: NOTIFY_LABEL[event], key: notifyKey(event) })),
    { label: 'Lifetime in the catalogue', key: LIFETIME_ON_SALE_KEY },
  ]
  const authors = await Promise.all(authored.map((entry) => loadSettingAuthor(entry.key)))

  /* Only the switches somebody has actually touched have an author; the rest are untouched
     defaults, and saying "never changed" for each of them would be five lines of nothing. */
  const touched = authored
    .map((entry, index) => ({ label: entry.label, author: authors[index] }))
    .filter((entry) => entry.author !== null)

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="app-settings" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">App settings</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">
            Settings for the whole installation, not for your own reading. Tokens and keys are deliberately not here —
            they stay in the deployment&apos;s environment.
          </p>
        </header>

        <section className="card mb-5 p-4">
          <h2 className="section-title mb-1">Telegram notifications</h2>
          <p className="mb-3 text-[0.8125rem] leading-[1.45] text-muted">
            Which events send a message to the bot. Switching one off stops that message and nothing else.
          </p>

          <AppSettingsForm initial={settings} available={available} />
        </section>

        {/*
          * Above "This device" rather than below it: this one changes what strangers see on a
          * public page, and that outranks a diagnostic about the phone in the owner's hand.
          */}
        <section className="card mb-5 p-4">
          <h2 className="section-title mb-1">Lifetime</h2>
          <p className="mb-3 text-[0.8125rem] leading-[1.45] text-muted">
            Whether the pay-once plan is still for sale. This used to be a date in the code, which took the offer
            off the page on the first deploy after that day rather than on the day itself.
          </p>

          <LifetimeOnSaleForm initial={lifetimeOnSale} />
        </section>

        {/*
          * Not a setting — nothing here is stored or changed — but it belongs on this screen
          * rather than a page of its own: it answers a question only the owner ever asks, about
          * the device in their hand, and it exists because the iOS launch screens shipped
          * correct and still showed a blank on a real phone. See `DeviceLaunchCheck` on why the
          * answer has to be computed there and not here.
          */}
        <section className="card mb-5 p-4">
          <h2 className="section-title mb-1">This device</h2>
          <p className="mb-3 text-[0.8125rem] leading-[1.45] text-muted">
            Whether iOS has a launch screen for the phone or tablet you are reading this on.
          </p>
          <DeviceLaunchCheck />
        </section>

        {touched.length > 0 && (
          <section className="card p-4">
            <h2 className="section-title mb-2.5">Last changed</h2>
            <ul className="flex flex-col gap-1.5 text-sm text-muted">
              {touched.map(({ label, author }) => (
                <li key={label}>
                  {label} — {author?.at.slice(0, 16).replace('T', ' ')}
                  {author?.by !== null && author?.by !== undefined ? ` by ${author.by}` : ''}
                </li>
              ))}
            </ul>
          </section>
        )}

        <Footer />
      </main>
    </PrefsProvider>
  )
}
