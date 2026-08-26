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
      {/* 48rem, matching this shell's own `<main className="... max-w-3xl ...">` below — the
          one width every non-landing page in the app shares. */}
      <PublicHeader width="48rem" />

      <main className="mx-auto max-w-3xl px-5 pb-16 pt-8 sm:pt-12">
        <article className="legal-content mt-6">{children}</article>

        <Footer />
      </main>
    </>
  )
}
