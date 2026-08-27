import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { FOREIGN_KEY_VIOLATION, hasPostgresCode } from './pgError'

/**
 * The one thing `seatDevice` cannot get wrong quietly: telling «the leader pressed Stop while
 * this device was mid-join» apart from a real fault. Answer false on the first and it rethrows,
 * handing a thrown server action to every phone polling at that moment; answer true on the
 * second and a poll that cannot write comes to mean «the broadcast ended».
 */
describe('hasPostgresCode', () => {
  it('reads the code off the error itself — what every driver does today', () => {
    assert.equal(hasPostgresCode({ code: FOREIGN_KEY_VIOLATION }, FOREIGN_KEY_VIOLATION), true)
  })

  it('finds it one level down, which is what the walk is insurance against', () => {
    const wrapped = new Error('transaction failed', { cause: { code: FOREIGN_KEY_VIOLATION } })
    assert.equal(hasPostgresCode(wrapped, FOREIGN_KEY_VIOLATION), true)
  })

  it('refuses a different code rather than any code at all', () => {
    // `23505` is unique_violation. Answering true here would turn every constraint failure in
    // the seat into «the broadcast ended».
    assert.equal(hasPostgresCode({ code: '23505' }, FOREIGN_KEY_VIOLATION), false)
  })

  it('refuses the things a thrown value can actually be', () => {
    for (const thrown of [null, undefined, 'a string', 42, new Error('no code at all'), {}]) {
      assert.equal(hasPostgresCode(thrown, FOREIGN_KEY_VIOLATION), false)
    }
  })

  /*
   * The bound, tested from the side that would hang rather than the side that would miss: a
   * `cause` that points back at itself is a legal object graph, and an unbounded walk over it
   * never returns. In a server action that is not a wrong answer, it is a request that hangs
   * until the platform kills it — which is why `MAX_CAUSE_DEPTH` exists and why this test is
   * the one that would fail loudly (by never finishing) if somebody removed it.
   */
  it('terminates on a cause chain that points back at itself', () => {
    const cyclic: { code: string; cause?: unknown } = { code: 'nope' }
    cyclic.cause = cyclic

    assert.equal(hasPostgresCode(cyclic, FOREIGN_KEY_VIOLATION), false)
  })

  it('terminates on a chain of two that point at each other', () => {
    const first: { cause?: unknown } = {}
    const second: { cause?: unknown } = { cause: first }
    first.cause = second

    assert.equal(hasPostgresCode(first, FOREIGN_KEY_VIOLATION), false)
  })

  /*
   * The cost of the bound, stated as a test so it is a decision rather than a surprise: a real
   * code buried deeper than `MAX_CAUSE_DEPTH` is not found. Nothing produces a chain that deep
   * — postgres.js throws unwrapped, so today's depth is one — and a finite bound that can miss
   * beats an unbounded walk that can hang.
   */
  it('gives up past the depth bound rather than walking forever', () => {
    let deep: unknown = { code: FOREIGN_KEY_VIOLATION }
    for (let i = 0; i < 20; i += 1) deep = { cause: deep }

    assert.equal(hasPostgresCode(deep, FOREIGN_KEY_VIOLATION), false)
  })
})
