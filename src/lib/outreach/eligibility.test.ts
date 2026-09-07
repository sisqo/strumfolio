import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { eligibilityFor } from './eligibility'
import type { OutreachFacts } from './eligibility'
import { OUTREACH } from './types'
import type { OutreachDefinition } from './types'

/** A subscribed, unsuspended, free account — the shape every case below varies one field of. */
function facts(overrides: Partial<OutreachFacts> = {}): OutreachFacts {
  return { suspended: false, newsletterSubscribed: true, effectivePlan: 'free', ...overrides }
}

function definition(overrides: Partial<OutreachDefinition> = {}): OutreachDefinition {
  return { ...OUTREACH.birthday_greeting, ...overrides }
}

describe('suspension', () => {
  it('refuses whatever the action is', () => {
    const checked = eligibilityFor(definition(), facts({ suspended: true }))
    assert.equal(checked.eligible, false)
    assert.equal(checked.eligible === false && checked.reason, 'suspended')
  })

  /* Reported before consent and audience: a suspended account has one reason worth reading, and
     it is the one that covers every action rather than this one. */
  it('is reported ahead of every other reason', () => {
    const checked = eligibilityFor(
      definition({ audience: 'with_paid_plan' }),
      facts({ suspended: true, newsletterSubscribed: false }),
    )
    assert.equal(checked.eligible === false && checked.reason, 'suspended')
  })
})

describe('consent', () => {
  it('lets a subscribed reader through', () => {
    assert.equal(eligibilityFor(definition(), facts()).eligible, true)
  })

  it('refuses an email action to somebody not subscribed', () => {
    const checked = eligibilityFor(definition({ channel: 'email' }), facts({ newsletterSubscribed: false }))
    assert.equal(checked.eligible === false && checked.reason, 'no-consent')
  })

  /*
   * The load-bearing direction of the whole module: a preference that could not be read must
   * not resolve to "subscribed". `readBooleanSetting` argues the generous direction for a
   * notification switch, and the argument inverts here — what would quietly happen is marketing
   * mail sent without verified consent.
   */
  it('refuses when consent could not be read at all, and says so', () => {
    const checked = eligibilityFor(definition({ channel: 'email' }), facts({ newsletterSubscribed: null }))
    assert.equal(checked.eligible === false && checked.reason, 'consent-unknown')
  })

  /* An in-app notice is not marketing mail: no subscription governs it, and an unreadable
     newsletter row must not hide it either. */
  it('does not ask about the newsletter for an in-app action', () => {
    assert.equal(eligibilityFor(definition({ channel: 'in_app' }), facts({ newsletterSubscribed: false })).eligible, true)
    assert.equal(eligibilityFor(definition({ channel: 'in_app' }), facts({ newsletterSubscribed: null })).eligible, true)
  })
})

describe('audience', () => {
  it('takes everybody when the action says so', () => {
    for (const plan of ['free', 'standard', 'plus', 'premium', 'lifetime'] as const) {
      assert.equal(eligibilityFor(definition({ audience: 'everyone' }), facts({ effectivePlan: plan })).eligible, true, plan)
    }
  })

  it('keeps an upgrade offer away from an account already paying', () => {
    const offer = definition({ audience: 'without_paid_plan' })
    assert.equal(eligibilityFor(offer, facts({ effectivePlan: 'free' })).eligible, true)
    const checked = eligibilityFor(offer, facts({ effectivePlan: 'plus' }))
    assert.equal(checked.eligible === false && checked.reason, 'wrong-audience')
  })

  /* A Lifetime is bought, so it is paid — the one plan whose name does not say so. */
  it('counts a lifetime as a paid plan', () => {
    const checked = eligibilityFor(definition({ audience: 'without_paid_plan' }), facts({ effectivePlan: 'lifetime' }))
    assert.equal(checked.eligible === false && checked.reason, 'wrong-audience')
    assert.equal(eligibilityFor(definition({ audience: 'with_paid_plan' }), facts({ effectivePlan: 'lifetime' })).eligible, true)
  })

  /*
   * The plan asked about is `planStateFor`'s effective one, gift included — which is what makes
   * this case answerable at all: a free account holding a gifted Premium is a paying account for
   * an upgrade offer's purposes, and `read.ts` is where the gift is resolved into this field.
   */
  it('is answered from the plan in force, not the plan bought', () => {
    const checked = eligibilityFor(definition({ audience: 'without_paid_plan' }), facts({ effectivePlan: 'premium' }))
    assert.equal(checked.eligible === false && checked.reason, 'wrong-audience')
  })
})

describe('the two declared actions', () => {
  it('sends a birthday greeting to any subscribed account', () => {
    assert.equal(eligibilityFor(OUTREACH.birthday_greeting, facts({ effectivePlan: 'premium' })).eligible, true)
  })

  it('offers an upgrade only below a paid plan', () => {
    assert.equal(eligibilityFor(OUTREACH.upgrade_voucher, facts()).eligible, true)
    assert.equal(eligibilityFor(OUTREACH.upgrade_voucher, facts({ effectivePlan: 'standard' })).eligible, false)
  })
})
