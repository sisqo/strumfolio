import { PublicHeader } from '@/components/PublicHeader'

/**
 * Adds `PublicHeader` above `/changelog` without touching its own `<main>` — the shape
 * `brand/layout.tsx`, `pricing/layout.tsx` and `login/layout.tsx` all take, and for the same
 * reason: one page, one width, nothing to share it with.
 *
 * The brand mark stays (unlike `/brand`, which draws its own lockups a few dozen pixels below):
 * this page is a column of prose, so the mark in the corner is the only way home on it.
 */
export default function ChangelogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* 56rem, matching this page's own `<main>` — and every other page that is not a landing
          page. It said 48rem for a day, and before that named `/brand` as a 70rem counterexample
          it never was; both are gone now that one number covers the lot. */}
      <PublicHeader width="56rem" links={[{ href: '/pricing', label: 'Pricing' }]} />
      {children}
    </>
  )
}
