import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { countTestAccounts, readShowTest, splitTestAccounts } from './testFilter'

const rows = ['a@x.it', 'qa@strumfolio.test', 'b@x.it', 'me@strumfolio.com']
const id = (row: string) => row
const tests = new Set(['qa@strumfolio.test', 'me@strumfolio.com'])

describe('readShowTest', () => {
  it('shows test accounts only for ?test=1', () => {
    assert.equal(readShowTest('1'), true)
    assert.equal(readShowTest(undefined), false)
    assert.equal(readShowTest(''), false)
    assert.equal(readShowTest('true'), false)
  })
})

describe('splitTestAccounts', () => {
  it('hides test accounts by default and counts them', () => {
    assert.deepEqual(splitTestAccounts(rows, id, tests, false), { shown: ['a@x.it', 'b@x.it'], hidden: 2 })
  })

  it('shows every row when asked', () => {
    assert.deepEqual(splitTestAccounts(rows, id, tests, true), { shown: rows, hidden: 0 })
  })

  it('hides nothing when the column could not be read', () => {
    assert.deepEqual(splitTestAccounts(rows, id, null, false), { shown: rows, hidden: 0 })
  })

  it('counts only what the search already narrowed to', () => {
    const searched = rows.filter((row) => row.includes('strumfolio'))
    assert.deepEqual(splitTestAccounts(searched, id, tests, false), { shown: [], hidden: 2 })
  })
})

describe('countTestAccounts', () => {
  it('counts the test rows, and none when unreadable', () => {
    assert.equal(countTestAccounts(rows, id, tests), 2)
    assert.equal(countTestAccounts(rows, id, null), 0)
  })
})
