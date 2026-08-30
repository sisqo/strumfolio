'use client'

import { BookletPanel } from '@/components/BookletPanel'
import { useRole } from '@/components/RoleProvider'

/**
 * Hidden until a role arrives that can use it — the same "hide until known" reasoning
 * `ExportScreen` states and every other `useRole` gate follows: `loadBooklet` goes through
 * `editableSongbook`, so a viewer is refused anyway, and there is nothing to show anybody
 * before the role is known either.
 *
 * Note what this deliberately does **not** gate on: the plan. The booklet is a paid feature and
 * `loadBooklet` refuses `plan-required` on its own, which `BookletPanel` turns into
 * `FeaturePaywallModal` — a refusal that explains itself and offers a way to `/pricing`. Hiding
 * the page from a free account instead would leave them a menu entry leading nowhere, or no
 * entry at all and no idea the feature exists; the plan matrix on `/pricing` is where a plan's
 * contents are argued, not the menu.
 */
export function BookletScreen() {
  const { known, mayEdit } = useRole()
  if (!known || !mayEdit) return null

  return (
    <>
      <header className="mb-[1.125rem]">
        <h1 className="screen-title">Printable booklet</h1>
        <p className="mt-2 text-sm leading-[1.45] text-muted">
          Turn a songbook into a PDF laid out for paper — a cover, an index, and one song a
          page, ready to print and hand round.
        </p>
      </header>

      <BookletPanel />
    </>
  )
}
