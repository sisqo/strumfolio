import Link from 'next/link'

import { Footer } from '@/components/Footer'
import { TopBar } from '@/components/TopBar'
import { IconChevronLeft } from '@/components/icons'

/**
 * Shown while `page.tsx` resolves the slug and re-reads the songbook (also
 * `force-dynamic`). Same reasoning as `(home)/loading.tsx`: `TopBar` and the
 * back link render for real, since neither needs the data this page is waiting on.
 *
 * The bones echo `SongbookSongs`'s own shapes (the icon+title header, a
 * `.card-stack` of section cards) so the swap-in doesn't jump.
 */
export default function Loading() {
  return (
    <>
      <TopBar current="songbooks" />

      <main className="mx-auto max-w-4xl px-4 pb-12 pt-3" aria-busy="true">
        <span className="sr-only" role="status">
          Loading songbook…
        </span>

        <Link href="/" className="back-plain mb-3.5">
          <IconChevronLeft size={15} />
          Songbooks
        </Link>

        <div className="screen-header">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="skeleton h-11 w-11 flex-none rounded-[var(--r-lg)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="skeleton h-[1.875rem] w-48" aria-hidden />
              <div className="skeleton mt-3 h-[0.9375rem] w-32" aria-hidden />
            </div>
          </div>
        </div>

        <ul className="card-stack mt-4">
          {[0, 1].map((section) => (
            <li key={section} className="card p-2">
              <div className="flex items-center gap-3 px-2.5 py-2">
                <span className="skeleton h-4 w-32" aria-hidden />
              </div>
              <ul>
                {[0, 1, 2].map((row) => (
                  <li key={row} className="row">
                    <span className="skeleton h-4 w-6" aria-hidden />
                    <span className="skeleton h-4 flex-1" aria-hidden />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <Footer />
      </main>
    </>
  )
}
