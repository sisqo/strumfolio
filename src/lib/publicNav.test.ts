import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { NAV_SECTIONS, navSectionsExcept } from './publicNav'

describe('navSectionsExcept', () => {
  it('keeps every section on a page that is not one of them', () => {
    assert.deepEqual(navSectionsExcept(), NAV_SECTIONS)
    assert.equal(navSectionsExcept().length, 3)
  })

  /** The dead-control rule: a bar never links to the page it is standing on. */
  it('drops the section the page itself is', () => {
    for (const section of NAV_SECTIONS) {
      const rest = navSectionsExcept(section.label)
      assert.equal(rest.length, NAV_SECTIONS.length - 1)
      assert.equal(
        rest.some((entry) => entry.label === section.label),
        false,
        `${section.label} should not link to itself`,
      )
    }
  })

  /**
   * A label that names no section leaves the row alone rather than silently emptying it — the
   * failure mode of matching on paths instead would be a bar with a hole in it on every
   * article, since `/blog/<slug>` is not `/blog`.
   */
  it('ignores a label that is not a section', () => {
    assert.deepEqual(navSectionsExcept('Changelog'), NAV_SECTIONS)
  })
})
