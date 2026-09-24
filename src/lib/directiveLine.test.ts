import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseChordPro } from './chordpro'
import { matchDirective } from './directiveLine'
import { fromSource, toSource } from './editor/document'

// The expression `matchDirective` replaced. Correct and exponential; kept here only as the
// oracle, on inputs short enough for it to finish.
const OLD = /^\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:-!?[a-zA-Z0-9_-]*)?)\s*(?:[:\s]\s*(.*?)\s*)?\}$/

function oracle(line: string): [string, string, string | undefined] | null {
  const m = OLD.exec(line)
  return m === null ? null : [m[0], m[1], m[2]]
}

describe('matchDirective', () => {
  it('answers what the old expression answered', () => {
    const cases = [
      '{title: Song}', '{t:Song}', '{title Song}', '{soc}', '{ soc }', '{soc }', '{soc :}',
      '{c:  forte  }', '{comment Repeat ad lib}', '{comment-!guitar: no capo}', '{!foo}',
      '{a-}', '{a-b-c: x}', '{name } x}', '{name:: x}', '{name  :x}', '{}', '{:}', '{ }',
      '{1a}', '{a(b)}', '{a:x\ry}', '{a:\rx}', '{a: x\r}', 'soc}', '{soc', '{a:x}}', '{{a}}',
      '{meta artist Foo}', '{x_songbook: A}', '{a\tb}', '{\u00a0a: b\u00a0}',
    ]
    for (const line of cases) assert.deepEqual(matchDirective(line), oracle(line), line)
  })

  it('agrees with the old expression on random short lines', () => {
    const alphabet = ['{', '}', ':', ' ', ' ', '\t', 'a', 'Z', '_', '1', '-', '!', 'x', '\r', '[', 'é']
    let seed = 7
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648)
    for (let n = 0; n < 20000; n++) {
      const length = next() % 12
      let line = next() % 4 === 0 ? '' : '{'
      for (let k = 0; k < length; k++) line += alphabet[next() % alphabet.length]
      if (next() % 3 !== 0) line += '}'
      assert.deepEqual(matchDirective(line), oracle(line), JSON.stringify(line))
    }
  })

  it('takes linear time on a line that opens and never closes, or closes after many spaces', () => {
    const lines = [
      '{Intro' + ' '.repeat(800) + '[Am] [G]',
      '{a:' + ' '.repeat(800),
      '{a' + ' '.repeat(5000) + 'x' + ' '.repeat(5000) + '}',
      '{a' + ' '.repeat(10000) + '}',
    ]
    for (const line of lines) {
      const started = performance.now()
      matchDirective(line)
      assert.ok(performance.now() - started < 50, JSON.stringify(line.slice(0, 12)))
    }
  })

  it('keeps both parsers fast on the song that used to hang them', () => {
    for (const spaces of [300, 800]) {
      const source = '{title: T}\n{Intro' + ' '.repeat(spaces) + '[Am] [G]\nword'
      let started = performance.now()
      parseChordPro(source)
      assert.ok(performance.now() - started < 50, `reader, ${spaces}`)
      started = performance.now()
      assert.equal(toSource(fromSource(source)), source)
      assert.ok(performance.now() - started < 50, `editor, ${spaces}`)
    }
  })
})
