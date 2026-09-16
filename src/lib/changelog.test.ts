import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { COPYRIGHT_YEAR, CURRENT_VERSION, KIND_LABEL, RELEASES, releaseAnchor, releaseDate } from './changelog'

describe('releaseDate', () => {
  it('renders a day, a month and a year', () => {
    assert.equal(releaseDate('2026-09-12'), '12 September 2026')
    assert.equal(releaseDate('2026-01-05'), '5 January 2026')
    assert.equal(releaseDate('2025-12-31'), '31 December 2025')
  })

  /*
   * The reason this function exists instead of a `toLocaleDateString` call, and the reason got
   * sharper when it started printing days: a bare date is parsed as UTC midnight, so
   * `new Date('2026-09-12')` is the evening of the 11th anywhere behind Greenwich — every date
   * off by one, not just the first of a month. Nothing about this implementation can do that,
   * and these cases are here so nobody "simplifies" it back into one that can.
   */
  it('does not shift the day, wherever it is read', () => {
    assert.equal(releaseDate('2026-08-01'), '1 August 2026')
    assert.equal(releaseDate('2026-01-01'), '1 January 2026')
    assert.equal(releaseDate('2026-09-12'), '12 September 2026')
  })

  it('drops the leading zero from the day', () => {
    assert.equal(releaseDate('2026-09-02'), '2 September 2026')
  })

  it('hands back anything it cannot read, rather than throwing', () => {
    for (const raw of ['', 'soon', '2026-08', '2026-13-01', '26-08-22']) {
      assert.equal(releaseDate(raw), raw)
    }
  })
})

describe('releaseAnchor', () => {
  /* `#v1.2` parses as `#v1` plus a class `.2` in a CSS selector — see the function's comment. */
  it('builds a fragment with no dot in it', () => {
    assert.equal(releaseAnchor('1.2'), 'v1-2')
    assert.equal(releaseAnchor('2.0'), 'v2-0')
    assert.equal(releaseAnchor('10.11'), 'v10-11')
  })

  it('gives every release its own fragment', () => {
    const anchors = RELEASES.map((release) => releaseAnchor(release.version))
    assert.equal(new Set(anchors).size, anchors.length)
  })
})

describe('RELEASES', () => {
  it('has at least one release, with every field filled in', () => {
    assert.ok(RELEASES.length >= 1)
    for (const release of RELEASES) {
      assert.match(release.version, /^\d+\.\d+$/, `version ${release.version}`)
      assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/, `date of ${release.version}`)
      assert.ok(release.title.length > 0, `title of ${release.version}`)
      assert.ok(release.highlights.length > 0, `highlights of ${release.version}`)
    }
  })

  /*
   * The kind is what the page prints in front of the sentence, so a typo'd one renders as an
   * empty label beside a highlight that then starts further right than its neighbours — wrong
   * in a way that reads as a styling accident rather than as a mistake in the data.
   */
  it('gives every highlight a known kind and a sentence', () => {
    for (const release of RELEASES) {
      for (const highlight of release.highlights) {
        assert.ok(highlight.kind in KIND_LABEL, `unknown kind "${highlight.kind}" in ${release.version}`)
        assert.ok(highlight.text.trim().length > 0, `blank highlight in ${release.version}`)
      }
    }
  })

  it('names every version exactly once', () => {
    const versions = RELEASES.map((release) => release.version)
    assert.equal(new Set(versions).size, versions.length)
  })

  /* The page renders the array as it stands, so the order in the file *is* the order on screen. */
  it('is newest first, by date', () => {
    const dates = RELEASES.map((release) => release.date)
    assert.deepEqual(dates, [...dates].sort().reverse())
  })

  /*
   * One release a week, declared on a Saturday — the cadence this file's header sets out. A
   * quiet week is allowed to publish nothing, so the gaps are not checked; the day is, because
   * a date landing on a Wednesday means somebody dated an entry by hand and got it wrong.
   *
   * `Date.UTC` rather than `new Date(iso)` for the same reason `releaseDate` parses by hand:
   * the bare string would be read as UTC midnight and then rendered in local time.
   */
  it('dates every release on a Saturday', () => {
    for (const release of RELEASES) {
      const [year, month, day] = release.date.split('-').map(Number)
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
      assert.equal(weekday, 6, `${release.version} (${release.date}) is not a Saturday`)
    }
  })
})

/*
 * What the footer prints, on every page. These exist so that "ship a release" stays a single
 * edit to `RELEASES`: if either of these ever had to be bumped by hand alongside it, the number
 * in the corner of the site would eventually disagree with the top of the changelog, and nobody
 * would notice until a customer quoted one of them back.
 */
describe('what the footer prints', () => {
  it('shows the newest release as the current version', () => {
    assert.equal(CURRENT_VERSION, RELEASES[0].version)
  })

  it('takes the copyright year from the newest release, not from a clock', () => {
    assert.equal(COPYRIGHT_YEAR, RELEASES[0].date.slice(0, 4))
    assert.match(COPYRIGHT_YEAR, /^\d{4}$/)
  })
})
