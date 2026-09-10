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
      {/* 48rem, matching this page's own `<main>`: a reading column, kept where it was when the
          app's screens widened to 56rem. `/brand` — named here as the wide counterexample back
          when this said 70rem, which it never was — is one of the screens that widened. */}
      <PublicHeader width="48rem" links={[{ href: '/pricing', label: 'Pricing' }]} />
      {children}
    </>
  )
}
