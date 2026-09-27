import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { columnLines, HANDLERS, serverFor, TOOLS } from './tools'

describe('the tools', () => {
  it('include nothing that deletes, by decision', () => {
    for (const tool of TOOLS) assert.equal(/delete|remove|purge|drop/i.test(tool.name), false, tool.name)
  })

  it('are all dispatched — a listed tool the switch forgot would answer «unknown»', async () => {
    assert.deepEqual(Object.keys(HANDLERS).sort(), TOOLS.map((tool) => tool.name).sort())
    const server = serverFor(0)
    const unknown = await server.callTool('not_a_tool', {})
    assert.equal(unknown.text.startsWith('Unknown tool'), true)
  })

  it('finds the field lines a column takes', () => {
    assert.deepEqual(columnLines('{title: X}\n{key: G}\n[C]la\n{artist: Y}'), ['{title: X}', '{artist: Y}'])
  })
})
