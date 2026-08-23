import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { validateGrant } from './grant'
import { MAX_GRANT_NOTE } from './types'
import type { GrantInput } from './types'

/** Midday, so "today" and "yesterday" are unambiguous either side of it. */
const NOW = new Date('2026-08-20T12:00:00Z')

function input(overrides: Partial<GrantInput> = {}): GrantInput {
  return { plan: 'premium', until: '2026-12-31', note: 'Reviewed us on the forum.', ...overrides }
}

describe('the plan a grant may name', () => {
  it('takes the three dated paid plans', () => {
    for (const plan of ['standard', 'plus', 'premium']) {
      const checked = validateGrant(input({ plan }), NOW)
      assert.equal(checked.ok, true, plan)
      assert.equal(checked.ok && checked.plan, plan)
    }
  })

  it('takes lifetime, but only without an end date', () => {
    const checked = validateGrant(input({ plan: 'lifetime', until: null }), NOW)

    assert.equal(checked.ok, true)
    assert.equal(checked.ok && checked.plan, 'lifetime')
    assert.equal(checked.ok && checked.until, null)
  })

  /*
   * The row is storable and `liveGrant` would expire it exactly on time — which is the trap,
   * not the safeguard: "Lifetime" means never-ends on every screen that renders it, so the
   * honest reading of the stored row contradicts itself ("Gift — Lifetime until 31 December").
   */
  it('refuses lifetime with an end date rather than honouring a contradiction', () => {
    assert.deepEqual(validateGrant(input({ plan: 'lifetime', until: '2026-12-31' }), NOW), {
      ok: false,
      reason: 'lifetime-with-date',
    })
  })

  /* An empty string is what a form posts for an untouched date field, and must read as "no end"
     here exactly as it does for every other plan — not as a date that happens to be blank. */
  it('takes lifetime with an empty date string, the shape an untouched field posts', () => {
    assert.equal(validateGrant(input({ plan: 'lifetime', until: '' }), NOW).ok, true)
  })

  /*
   * The whole reason this validates with `includes` instead of `readPlan`: `readPlan('premuim')`
   * is `'free'`, so the lenient route would have answered ok, written a live grant of nothing,
   * and told the operator the gift landed.
   */
  it('refuses a misspelling instead of reading it as free', () => {
    const checked = validateGrant(input({ plan: 'premuim' }), NOW)

    assert.deepEqual(checked, { ok: false, reason: 'invalid-plan' })
  })

  it('refuses free, which would be a gift that changes nothing', () => {
    assert.deepEqual(validateGrant(input({ plan: 'free' }), NOW), { ok: false, reason: 'invalid-plan' })
  })

  it('refuses an empty plan, the shape a form posts when nothing was picked', () => {
    assert.deepEqual(validateGrant(input({ plan: '' }), NOW), { ok: false, reason: 'invalid-plan' })
  })
})

describe('the day a gift ends', () => {
  /*
   * The end of the day, not its start: `liveGrant` compares with strict `>`, so midnight would
   * end the gift on the morning of the date the operator typed. And the ISO day has to come
   * back out unchanged, because that same string refills the date field on the next open.
   */
  it('normalizes a bare day to the end of it, in UTC, and round-trips', () => {
    const checked = validateGrant(input({ until: '2026-09-30' }), NOW)

    assert.equal(checked.ok, true)
    assert.ok(checked.ok && checked.until !== null)
    assert.equal(checked.ok && checked.until?.toISOString(), '2026-09-30T23:59:59.999Z')
    assert.equal(checked.ok && checked.until?.toISOString().slice(0, 10), '2026-09-30')
  })

  it('accepts no date at all as a gift with no end', () => {
    assert.equal(validateGrant(input({ until: null }), NOW).ok, true)
    const checked = validateGrant(input({ until: null }), NOW)
    assert.equal(checked.ok && checked.until, null)
  })

  /* An empty date input posts '' rather than null, and it means the same thing. */
  it('reads an empty string the same way', () => {
    const checked = validateGrant(input({ until: '' }), NOW)

    assert.equal(checked.ok, true)
    assert.equal(checked.ok && checked.until, null)
  })

  it('accepts today, because end-of-day today is still ahead', () => {
    assert.equal(validateGrant(input({ until: '2026-08-20' }), NOW).ok, true)
  })

  it('refuses yesterday, which liveGrant would make inert the instant it was written', () => {
    assert.deepEqual(validateGrant(input({ until: '2026-08-19' }), NOW), { ok: false, reason: 'invalid-date' })
  })

  /*
   * `new Date('2026-02-31T23:59:59.999Z')` is not NaN — it is the 3rd of March. Without the
   * round-trip check this would be accepted and the gift would quietly end on a day nobody
   * chose.
   */
  it('refuses a day that does not exist rather than rolling it over', () => {
    assert.deepEqual(validateGrant(input({ until: '2026-02-31' }), NOW), { ok: false, reason: 'invalid-date' })
  })

  it('refuses anything that is not a calendar day', () => {
    for (const until of ['2026-13-01', 'tomorrow', '31/12/2026', '2026-12-31T00:00:00Z', '2026-9-30']) {
      assert.deepEqual(validateGrant(input({ until }), NOW), { ok: false, reason: 'invalid-date' }, until)
    }
  })
})

describe('the reason a gift was given', () => {
  it('is required when setting', () => {
    assert.deepEqual(validateGrant(input({ note: '' }), NOW), { ok: false, reason: 'note-required' })
    assert.deepEqual(validateGrant(input({ note: '   ' }), NOW), { ok: false, reason: 'note-required' })
  })

  it('is stored trimmed', () => {
    const checked = validateGrant(input({ note: '  a refund  ' }), NOW)

    assert.equal(checked.ok && checked.note, 'a refund')
  })

  it('takes exactly the maximum and refuses one more', () => {
    const exact = validateGrant(input({ note: 'x'.repeat(MAX_GRANT_NOTE) }), NOW)
    assert.equal(exact.ok, true)
    assert.equal(exact.ok && exact.note?.length, MAX_GRANT_NOTE)

    assert.deepEqual(validateGrant(input({ note: 'x'.repeat(MAX_GRANT_NOTE + 1) }), NOW), {
      ok: false,
      reason: 'note-too-long',
    })
  })
})

describe('clearing a gift', () => {
  /*
   * Nothing to validate: null is the clear, and the note is deliberately not carried on this
   * path — see `validateGrant`'s own comment on what a withdrawal does and does not record.
   */
  it('needs no plan, no date and no reason', () => {
    assert.deepEqual(validateGrant(null, NOW), { ok: true, plan: null, until: null, note: null })
  })
})

describe('purity', () => {
  it('answers differently for two different nows and mutates neither argument', () => {
    const typed = input({ until: '2026-08-20' })
    const snapshot = { ...typed }

    assert.equal(validateGrant(typed, NOW).ok, true)
    assert.deepEqual(validateGrant(typed, new Date('2026-08-21T12:00:00Z')), {
      ok: false,
      reason: 'invalid-date',
    })
    assert.deepEqual(typed, snapshot)
  })
})
