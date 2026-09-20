import { Footer } from '@/components/Footer'
import { PublicHeader } from '@/components/PublicHeader'
import { publicBarFor } from '@/lib/publicBar'

/**
 * The shell shared by the four legal pages — Privacy, Terms, Cookies, Copyright
 * (`middleware.ts` lists all four as reachable with no session). None of the app's
 * own chrome belongs here: no `TopBar`, no menu built for a signed-in reader mid-song.
 * These are read by people who may never sign in at all — a visitor deciding whether
 * to register, a store reviewer, a data protection authority — so the only navigation
 * is `PublicHeader`'s own brand mark, the way back to the one page that is reachable
 * the same way, plus the one control every page needs regardless of who is reading it:
 * the theme switch. It replaces the bespoke «← Strumfolio» link this shell used to draw
 * for itself, which said the same thing in a second way.
 *
 * **These four stopped being prerendered when the bar learned who is reading**, and that is
 * the trade rather than a regression: `publicBarFor` reads the session, which is a dynamic
 * API, so Next renders them per request. They hold no database read and no cookie of their
 * own, so what it costs is a render of static prose — measured against the alternative, which
 * was offering «Sign in» to somebody already signed in on the four pages most likely to be
 * opened from inside the app.
 */
export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const bar = await publicBarFor({ links: [{ href: '/pricing', label: 'Pricing' }] })

  return (
    <>
      {/* 56rem, matching this shell's own `<main className="... max-w-4xl ...">` below — the one
          width every page outside the landing pages now shares. These four briefly stayed at
          48rem while the app widened around them, on the argument that a document somebody
          reads end to end wants a reading measure rather than a screen's column; the argument
          lost to the one that matters more here, which is that a reader moving between pages
          should not watch the mark in the corner change place. */}
      <PublicHeader width="56rem" {...bar} />

      <main className="mx-auto max-w-4xl px-5 pb-16 pt-8 sm:pt-12">
        <article className="legal-content mt-6">{children}</article>

        <Footer />
      </main>
    </>
  )
}
