import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

/**
 * `CASES.md` is an index from the analysis document's own case numbering to the code and the
 * checks, and this is what stops it becoming the thing this repository deleted fourteen of.
 *
 * **The PLAN files did not fail by being wrong on the day they were written.** They failed by
 * drifting: every line reference stale, ten of them still claiming a shipped feature "non è
 * ancora scritta". A table of cases citing tests is exactly that shape of document, so it gets
 * the defence `gatedRoutes.test.ts` already uses on a different kind of forgetting — the claim
 * is checked by the build rather than by whoever remembers to.
 *
 * Three things are asserted, and the second is the one with teeth:
 *
 * - **Every case is there.** The forty-one ids are written out below rather than counted, so
 *   deleting a row fails instead of quietly leaving a case uncovered and a table that still
 *   looks complete.
 * - **Every test cited exists, under that exact name.** Rename a test and this says so. Without
 *   it a citation rots into a sentence that reads like coverage and names nothing.
 * - **No verification cell is vague.** Both columns are a closed vocabulary, so "nobody has ever
 *   checked E7" has to be written as `mai` and cannot hide as an empty cell or a hopeful word.
 */
const CASES = join(process.cwd(), 'src/lib/plans/CASES.md')
const TESTS = join(process.cwd(), 'src/lib/plans')

/** The case numbering of `strumfolio-upgrade-downgrade-paddle.md`, written out on purpose. */
const EXPECTED_IDS = [
  ...['A1', 'A2', 'A3', 'A4'],
  ...['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11'],
  ...['C1', 'C2', 'C3', 'C4', 'C5', 'C6'],
  ...['D1', 'D2', 'D3'],
  ...['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11'],
  ...['F1', 'F2', 'F3', 'F4', 'F5', 'F6'],
]

/** Anything in a verification cell that is not a citation of a test. */
const PLAIN_VERDICTS = /^(—|mai|n\/d|sandbox \d{4}-\d{2}-\d{2}|browser \d{4}-\d{2}-\d{2})$/

interface CaseRow {
  id: string
  test: string
  live: string
}

/**
 * The case rows of the document — the ones whose first cell is a case id, which is what tells
 * them apart from the legend table above them without either having to be marked.
 */
function caseRows(): CaseRow[] {
  const rows: CaseRow[] = []

  for (const line of readFileSync(CASES, 'utf8').split('\n')) {
    if (!line.startsWith('|')) continue

    /* A markdown row is `| a | b | … |`, so the split has an empty cell at each end. */
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
    if (cells.length !== 5) continue
    if (!/^[A-F]\d{1,2}$/.test(cells[0])) continue

    rows.push({ id: cells[0], test: cells[3], live: cells[4] })
  }

  return rows
}

/**
 * Whether a test of that exact name exists in that file. Matched against the source rather than
 * run: this is checking that a citation still points at something, and `npm test` is already
 * running the test itself two files away.
 */
function testExists(file: string, name: string): boolean {
  let source: string
  try {
    source = readFileSync(join(TESTS, file), 'utf8')
  } catch {
    return false
  }

  return source.includes(`it('${name}'`) || source.includes(`describe('${name}'`)
}

describe('CASES.md', () => {
  it('carries every case of the analysis document, once each', () => {
    assert.deepEqual(
      caseRows().map((row) => row.id),
      EXPECTED_IDS,
    )
  })

  /*
   * The citation check, and the reason this file exists. A test name is prose and gets reworded;
   * the citation then points at nothing and the row goes on claiming coverage, which is worse
   * than a row that admits it has none.
   */
  it('cites only tests that exist, under the name it gives them', () => {
    const cited = caseRows().flatMap((row) =>
      row.test
        .split(' · ')
        .map((entry) => ({ id: row.id, entry: entry.replace(/`/g, '').trim() }))
        .filter(({ entry }) => !PLAIN_VERDICTS.test(entry)),
    )

    /* A document where nothing resolves would pass every assertion below by vacuity. */
    assert.ok(cited.length >= 20, `only ${cited.length} tests cited`)

    for (const { id, entry } of cited) {
      const cite = /^([\w.-]+\.test\.ts) › (.+)$/.exec(entry)
      assert.ok(cite, `${id}: «${entry}» is neither a verdict nor a «file.test.ts › name» citation`)
      assert.ok(testExists(cite[1], cite[2]), `${id}: no test called «${cite[2]}» in ${cite[1]}`)
    }
  })

  /* An empty cell is how a case nobody has ever checked stops looking like one. */
  it('says in plain words whether anybody has watched each case happen', () => {
    for (const row of caseRows()) {
      assert.ok(
        PLAIN_VERDICTS.test(row.live.replace(/`/g, '').trim()),
        `${row.id}: «${row.live}» is not one of the verdicts CASES.md allows`,
      )
    }
  })
})
