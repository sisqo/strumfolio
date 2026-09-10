import { Footer } from '@/components/Footer'
import { PublicHeader } from '@/components/PublicHeader'

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
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* 56rem, matching this shell's own `<main className="... max-w-4xl ...">` below — the one
          width every page outside the landing pages now shares. These four briefly stayed at
          48rem while the app widened around them, on the argument that a document somebody
          reads end to end wants a reading measure rather than a screen's column; the argument
          lost to the one that matters more here, which is that a reader moving between pages
          should not watch the mark in the corner change place. */}
      <PublicHeader width="56rem" links={[{ href: '/pricing', label: 'Pricing' }]} />

      <main className="mx-auto max-w-4xl px-5 pb-16 pt-8 sm:pt-12">
        <article className="legal-content mt-6">{children}</article>

        <Footer />
      </main>
    </>
  )
}
