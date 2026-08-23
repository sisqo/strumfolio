import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'

export const metadata: Metadata = { title: 'Pages' }

/** Nothing here reads from the database, but the owner check itself depends on the request, same as `/emails`. */
export const dynamic = 'force-dynamic'

interface PageLink {
  href: string
  label: string
  description: string
}

interface PageGroup {
  title: string
  note: string
  links: PageLink[]
}

/**
 * Pages a global owner needs to open directly and nothing else in the app links to — starting
 * with the thank-you preview (see `ThanksScreen`'s own comment on what `?preview=<plan>` does
 * and how `loadThanksPreview` gates it). A plain literal list rather than anything generated:
 * each entry here is a page somebody decided was worth a bookmark, not every route the app
 * happens to have. `Footer` already covers the ones every reader can already find — legal
 * pages, `/brand`, `/changelog` — so those have no reason to repeat here.
 *
 * Grouped rather than one flat list, now that there is more than one kind of "hard to reach":
 * a step in the purchase flow (reachable, just several taps away), an email link's own valid
 * state (`/emails`'s sample links show only the invalid one, on purpose), and a `/login` notice
 * that only ever appears after a real failure. The distinction matters for upkeep: the sign-in
 * states below are already wired to plain query params `/login` has read for a while — nothing
 * new to keep working — while the email-link previews depend on `?preview=1` staying gated on
 * `isOwner` in `/verify` and `/reset-password` themselves.
 */
const GROUPS: PageGroup[] = [
  {
    title: 'Purchase flow',
    note: 'Reachable normally, just several taps behind /pricing — bookmarked here so checking one plan does not mean re-clicking through all four.',
    links: [
      {
        href: '/thanks?preview=premium',
        label: 'Thank-you page',
        description:
          'What a purchase lands on. Sample data for every plan, switchable once open — no purchase, mock or real, required.',
      },
      {
        href: '/checkout/standard',
        label: 'Checkout — Standard',
        description: 'The mock checkout screen for this plan.',
      },
      {
        href: '/checkout/plus',
        label: 'Checkout — Plus',
        description: 'Same screen, the Plus plan.',
      },
      {
        href: '/checkout/premium',
        label: 'Checkout — Premium',
        description: 'Same screen, the Premium plan.',
      },
      {
        href: '/checkout/lifetime',
        label: 'Checkout — Lifetime',
        description: 'Same screen, the one-time Lifetime purchase — no billing cycle to switch.',
      },
    ],
  },
  {
    title: 'Email links',
    note: '/emails shows every template, but its own sample link carries a token that matches nothing on purpose — these two carry the same fake address (`SAMPLE_EMAIL`) into the one state that link can never reach.',
    links: [
      {
        href: '/verify?preview=1',
        label: 'Verify email — valid link',
        description: '"Ready to confirm", with the real button — not the "invalid or expired" state /emails shows.',
      },
      {
        href: '/reset-password?preview=1',
        label: 'Reset password — valid link',
        description: '"Ready to set a new password", the matching state for the reset link.',
      },
    ],
  },
  {
    title: 'Sign-in states',
    note: '/login already reads these query params for real notices — nothing new here to keep working, just links nobody had saved.',
    links: [
      {
        href: '/login?failed=1',
        label: 'Login — wrong password',
        description: '"Wrong email or password."',
      },
      {
        href: '/login?error=AccessDenied',
        label: 'Login — Google rejected',
        description: 'The one message specific to a Google sign-in failure.',
      },
      {
        href: '/login?error=CredentialsSignin',
        label: 'Login — generic sign-in error',
        description: 'Every other NextAuth error code lands on this same message.',
      },
      {
        href: '/login?reset=1',
        label: 'Login — password changed',
        description: 'The success notice shown right after a real password reset.',
      },
    ],
  },
]

/**
 * A global-owner-only index of the pages above. `notFound()` rather than a role notice, the
 * same reasoning as every other owner-only page in this app (`/accounts`, `/emails`): "this
 * does not exist" and "this is not yours" should look identical from outside.
 */
export default async function PagesPage() {
  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) notFound()

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="pages" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">Pages</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">
            Screens and states worth opening directly, that a normal visit would otherwise take
            several steps — or a real failure — to ever land on.
          </p>
        </header>

        {GROUPS.map((group, index) => (
          <section key={group.title} className={index === 0 ? '' : 'mt-9'}>
            <h2 className="group-label">{group.title}</h2>
            <p className="mt-1.5 text-[0.8125rem] leading-[1.5] text-muted">{group.note}</p>

            <ul className="card-stack mt-3">
              {group.links.map((link) => (
                <li key={link.href} className="card flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block">{link.label}</span>
                    <span className="mt-1 block text-[0.8125rem] text-muted">{link.description}</span>
                  </span>
                  <Link href={link.href} className="btn btn-sm">
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <Footer />
      </main>
    </PrefsProvider>
  )
}
