import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { acceptsVersionHeader, handleMessage, METHOD_NOT_FOUND, type Server } from './protocol'

const server: Server = {
  instructions: 'test',
  tools: [{ name: 'echo', title: 'Echo', description: 'echo', inputSchema: { type: 'object' } }],
  resources: [{ uri: 'strumfolio://x', name: 'x', title: 'X', description: 'x', mimeType: 'text/markdown', text: '# x' }],
  async callTool(name, args) {
    if (args.boom === true) throw new Error('boom')
    return { text: `${name}:${JSON.stringify(args)}`, data: args }
  },
}

const call = (method: string, params?: Record<string, unknown>) =>
  handleMessage(server, { jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) })

describe('handleMessage', () => {
  it('echoes a supported protocol version and falls back to the latest otherwise', async () => {
    const known = (await call('initialize', { protocolVersion: '2025-06-18' })) as { result: { protocolVersion: string } }
    assert.equal(known.result.protocolVersion, '2025-06-18')
    const unknown = (await call('initialize', { protocolVersion: '1900-01-01' })) as { result: { protocolVersion: string } }
    assert.equal(unknown.result.protocolVersion, '2025-11-25')
  })

  it('answers no notification', async () => {
    assert.equal(await handleMessage(server, { jsonrpc: '2.0', method: 'notifications/initialized' }), null)
  })

  it('lists the tools and calls one, with the answer as text and as data', async () => {
    const list = (await call('tools/list')) as { result: { tools: { name: string }[] } }
    assert.deepEqual(list.result.tools.map((tool) => tool.name), ['echo'])

    const result = (await call('tools/call', { name: 'echo', arguments: { a: 1 } })) as {
      result: { content: { text: string }[]; structuredContent: unknown; isError: boolean }
    }
    assert.equal(result.result.content[0].text, 'echo:{"a":1}')
    assert.deepEqual(result.result.structuredContent, { a: 1 })
    assert.equal(result.result.isError, false)
  })

  it('turns a throwing tool into a tool error, never a crash or a leaked message', async () => {
    const result = (await call('tools/call', { name: 'echo', arguments: { boom: true } })) as {
      result: { content: { text: string }[]; isError: boolean }
    }
    assert.equal(result.result.isError, true)
    assert.equal(result.result.content[0].text.includes('boom'), false)
  })

  it('refuses an unknown tool and an unknown method', async () => {
    assert.ok('error' in (await call('tools/call', { name: 'nope', arguments: {} }))!)
    const unknown = (await call('sampling/createMessage')) as { error: { code: number } }
    assert.equal(unknown.error.code, METHOD_NOT_FOUND)
  })

  it('reads a resource', async () => {
    const read = (await call('resources/read', { uri: 'strumfolio://x' })) as { result: { contents: { text: string }[] } }
    assert.equal(read.result.contents[0].text, '# x')
  })
})

describe('acceptsVersionHeader', () => {
  it('accepts the legacy revisions and a missing header, and refuses the modern one', () => {
    assert.equal(acceptsVersionHeader(null), true)
    assert.equal(acceptsVersionHeader('2025-06-18'), true)
    assert.equal(acceptsVersionHeader('2026-07-28'), false)
  })
})
