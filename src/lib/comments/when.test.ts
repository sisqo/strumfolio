import assert from 'node:assert/strict'
import { test } from 'node:test'

import { whenOf } from './when'

const NOW = Date.parse('2026-08-30T12:00:00.000Z')
const days = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

test('the same day reads as today', () => {
  assert.equal(whenOf(days(0), NOW), 'today')
})

test('one day back is named rather than counted', () => {
  assert.equal(whenOf(days(1), NOW), 'yesterday')
})

test('inside a month it counts days', () => {
  assert.equal(whenOf(days(3), NOW), '3 days ago')
  assert.equal(whenOf(days(29), NOW), '29 days ago')
})

test('past a month the date itself is the useful fact', () => {
  // The exact wording is the locale's; what matters is that it stopped counting.
  assert.ok(!whenOf(days(30), NOW).includes('ago'))
})

test('an unreadable timestamp says nothing rather than NaN', () => {
  assert.equal(whenOf('not a date', NOW), '')
})

test('a clock skewed into the future does not produce a negative count', () => {
  assert.equal(whenOf(days(-2), NOW), 'today')
})
