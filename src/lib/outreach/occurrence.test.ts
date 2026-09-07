import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { cadenceLabel, occurrenceKeyFor, occurrenceLabel } from './occurrence'

describe('which occurrence an action is claiming', () => {
  it('gives a one-shot action the same key forever', () => {
    const first = occurrenceKeyFor('once', new Date('2026-09-07T10:00:00Z'))
    const later = occurrenceKeyFor('once', new Date('2031-01-01T00:00:00Z'))
    assert.equal(first, 'once')
    assert.equal(later, 'once')
  })

  it('gives a yearly action one key per calendar year', () => {
    assert.equal(occurrenceKeyFor('yearly', new Date('2026-03-14T08:00:00Z')), '2026')
    assert.equal(occurrenceKeyFor('yearly', new Date('2026-12-31T22:00:00Z')), '2026')
    assert.equal(occurrenceKeyFor('yearly', new Date('2027-01-01T02:00:00Z')), '2027')
  })

  /*
   * The reason the key is a year and not a date: two runs a few hours apart either side of
   * midnight in Rome must still name the same occurrence, or the unique index lets a yearly
   * action out twice in one evening. Rome is UTC+1 on 31 December, so 23:30 local is 22:30 UTC
   * of the same day — and the two only diverge for the hour after local midnight, where either
   * answer is a correct one.
   */
  it('does not split one year in two around New Year', () => {
    const romeEvening = new Date('2026-12-31T22:30:00Z')
    const romeMidnightPassed = new Date('2026-12-31T23:30:00Z')
    assert.equal(occurrenceKeyFor('yearly', romeEvening), occurrenceKeyFor('yearly', romeMidnightPassed))
  })
})

describe('how an occurrence reads on screen', () => {
  it('spells the one-shot key out', () => {
    assert.equal(occurrenceLabel('once'), 'once ever')
  })

  it('prints a year as itself', () => {
    assert.equal(occurrenceLabel('2026'), '2026')
  })

  /* A row minted under a cadence this deploy no longer has still has to print as something,
     and the only honest something is the stored string. */
  it('prints an unrecognised key as itself rather than guessing', () => {
    assert.equal(occurrenceLabel('2026-W12'), '2026-W12')
  })

  it('names the cadence itself', () => {
    assert.equal(cadenceLabel('once'), 'Once per account')
    assert.equal(cadenceLabel('yearly'), 'Once a year')
  })
})
