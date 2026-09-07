import assert from 'node:assert/strict'
import { test } from 'node:test'

import { PAYWALL_FEATURES, paywallBody, paywallPrimaryLabel, paywallTitle } from './paywall'
import { PLAN_LABEL } from './types'

/**
 * The drift guard: this is the assertion that actually earns its keep as the map grows.
 * `entitlements.ts`'s `refused` has eight fields; only these four ever resolve to
 * `'plan-required'` (`createSongbook`/`createSong`/`editRepertoire` only ever answer
 * `frozen` or a numbered cap, and `lead` now answers null on every plan). A fifth gate landing
 * there with no matching entry here is exactly the drift `PAYWALL_FEATURES` exists to prevent.
 *
 * `lead` was here until free started leading a Strum Together session with one follower. It
 * came out rather than being relabelled because no `minPlan` could be written for it honestly
 * — see `paywall.ts` — and `entitlements.test.ts` pins the other side of that, asserting no
 * plan refuses leading at all.
 */
test('PAYWALL_FEATURES covers exactly the four plan-required gates', () => {
  assert.deepEqual(Object.keys(PAYWALL_FEATURES).sort(), [
    'booklet',
    'bookletCustomFooter',
    'featureRequest',
    'ukulele',
  ])
})

/*
 * No exceptions, where there used to be exactly one: `lead`'s "Strum Together" was a proper
 * noun the rest of the app capitalizes, declared here and in `PaywallFeature.label`'s own
 * comment. A future proper-noun feature may claim the same exemption — the pair of declarations
 * is what stops it from being a licence to capitalize anything.
 */
test('every label is lowercase with no leading article', () => {
  for (const [key, { label }] of Object.entries(PAYWALL_FEATURES)) {
    assert.equal(label, label.toLowerCase(), `${key}'s label must be stored lowercase`)
    assert.doesNotMatch(label, /^(a|an|the)\s/i, `${key}'s label must carry no article`)
  }
})

test('no label uses "plus" as a word, which would collide with the Plus plan name', () => {
  for (const [key, { label }] of Object.entries(PAYWALL_FEATURES)) {
    assert.doesNotMatch(label, /\bplus\b/i, `${key}'s label must not use "plus"`)
  }
})

test('the plan name appears in the title and the primary label, worded exactly once each', () => {
  for (const { minPlan } of Object.values(PAYWALL_FEATURES)) {
    const planName = PLAN_LABEL[minPlan]
    assert.equal(paywallTitle(minPlan), `Included in ${planName}`)
    assert.equal(paywallPrimaryLabel(minPlan), `See ${planName}`)
  }
})

test('the body never names any plan at all, including its own minimum', () => {
  for (const { label } of Object.values(PAYWALL_FEATURES)) {
    const body = paywallBody(label)
    for (const planName of Object.values(PLAN_LABEL)) {
      assert.doesNotMatch(body, new RegExp(`\\b${planName}\\b`), `body must not name "${planName}": ${body}`)
    }
  }
})
