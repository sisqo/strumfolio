import { Footer } from '@/components/Footer'
import { TopBar } from '@/components/TopBar'

/**
 * Shown while `page.tsx` re-runs its auth check and database reads (it's
 * `force-dynamic`, so every navigation here pays that round-trip). `TopBar` renders
 * for real — it reads `RoleProvider`, which lives in the root layout and never
 * unmounts between navigations, so the header doesn't flash away and back.
 *
 * The bones echo `HomeScreen`'s own shapes (search field, screen-header,
 * `.row-list.card`) so the swap-in doesn't jump.
 *
 * Lives under the `(home)` route group — not `src/app/` directly — so this
 * Suspense boundary covers only `/`. A `loading.tsx` at the segment root would
 * wrap every nested route too (`/export`, `/accounts`, `/login`, `/songs/[slug]`,
 * …), most of which aren't this list at all.
 */
export default function Loading() {
  return (
    <>
      <TopBar current="songs" />

      <main className="mx-auto max-w-4xl px-4 pb-12 pt-3" aria-busy="true">
        <span className="sr-only" role="status">
          Loading your songbooks…
        </span>

        <h1 className="sr-only">Home</h1>

        <div className="skeleton h-[3.25rem] rounded-[var(--r-lg)]" aria-hidden />

        <div className="screen-header mt-8">
          <div className="min-w-0">
            <div className="skeleton h-[1.875rem] w-40" aria-hidden />
            <div className="skeleton mt-3 h-[0.9375rem] w-52" aria-hidden />
          </div>
        </div>

        <ul className="row-list card mt-4">
          {[0, 1, 2, 3, 4].map((row) => (
            <li key={row} className="flex items-center gap-3 px-3.5 py-3">
              <span className="skeleton h-10 w-10 flex-none rounded-[var(--r-md)]" aria-hidden />
              <span className="skeleton h-4 flex-1" aria-hidden />
            </li>
          ))}
        </ul>

        <Footer />
      </main>
    </>
  )
}
