import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  NOTIFY_DEFAULTS,
  NOTIFY_EVENTS,
  isNotifyEvent,
  notifyKey,
  readBooleanSetting,
  writeBooleanSetting,
} from './types'

describe('readBooleanSetting', () => {
  it('reads the two values it writes', () => {
    assert.equal(readBooleanSetting('on', false), true)
    assert.equal(readBooleanSetting('off', true), false)
  })

  /*
   * The case this function exists for. Every one of these is a cell that could genuinely turn
   * up — a row from an older shape, a hand-edited value, a column that came back null — and
   * every one of them must leave the switch where the default put it. Falling to `false` here
   * would stop notifications with nothing anywhere saying so.
   */
  it('falls back to the default rather than to false on anything unrecognised', () => {
    for (const raw of [null, undefined, '', 'true', 'false', 'ON', '1', '0', 'yes', ' on ']) {
      assert.equal(readBooleanSetting(raw, true), true, `${JSON.stringify(raw)} with default true`)
      assert.equal(readBooleanSetting(raw, false), false, `${JSON.stringify(raw)} with default false`)
    }
  })

  it('round-trips through writeBooleanSetting', () => {
    for (const value of [true, false]) {
      assert.equal(readBooleanSetting(writeBooleanSetting(value), !value), value)
    }
  })
})

describe('the notify switches', () => {
  /*
   * Not a taste being pinned, but the migration story: `app_settings` does not exist until the
   * migration is applied, and `loadNotifySettings` answers with these. If any of them were
   * false, applying the code before the migration would silently switch a notification off.
   */
  it('all default to on, which is what the app did before there were switches', () => {
    for (const event of NOTIFY_EVENTS) {
      assert.equal(NOTIFY_DEFAULTS[event], true, event)
    }
  })

  it('has a default for every event and no extras', () => {
    assert.deepEqual(Object.keys(NOTIFY_DEFAULTS).sort(), [...NOTIFY_EVENTS].sort())
  })

  it('keys every switch under its own prefix, so a later setting family cannot collide', () => {
    const keys = NOTIFY_EVENTS.map(notifyKey)
    assert.deepEqual(keys, [
      'notify.registration',
      'notify.purchase',
      'notify.downgrade',
      'notify.cancellation',
      'notify.kept_current',
    ])
    assert.equal(new Set(keys).size, keys.length)
  })

  it('recognises only the listed events as form values', () => {
    for (const event of NOTIFY_EVENTS) assert.equal(isNotifyEvent(event), true)
    for (const other of ['', 'Registration', 'notify.purchase', 'refund', 'toString']) {
      assert.equal(isNotifyEvent(other), false, other)
    }
  })
})
