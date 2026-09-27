/**
 * The MCP wire protocol, hand-written and stateless — JSON-RPC in, JSON-RPC out, no I/O.
 *
 * **Legacy era only, deliberately** (the `initialize` handshake, revisions up to `2025-11-25`).
 * The `2026-07-28` revision drops the handshake for per-request `_meta`; a dual-era client that
 * tries a modern request here gets a `400` with no modern error body, which the spec's own
 * compatibility matrix names as the signal to fall back to `initialize`. So every client in use
 * in September 2026 works, and a modern-only client does not until this learns `server/discover`.
 *
 * Stateless in the transport's sense too: no `Mcp-Session-Id`, so every POST stands alone and
 * the handler can run on any Vercel instance. `initialize` answers but remembers nothing, and a
 * `tools/call` with no `initialize` before it is served the same way.
 *
 * No SDK: the part of the protocol a tools-and-resources server speaks is six methods, and a
 * pure function is what `npm test` can cover — this repo has no way to test a route handler.
 */

export const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const
const LATEST = SUPPORTED_VERSIONS[0]

export const SERVER_INFO = { name: 'strumfolio', title: 'Strumfolio', version: '1.0.0' }

export interface ToolDefinition {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean }
}

export interface ToolOutcome {
  /** What the model reads. */
  text: string
  /** The same answer as data, for a client that reads `structuredContent`. */
  data?: unknown
  isError?: boolean
}

export interface ResourceDefinition {
  uri: string
  name: string
  title: string
  description: string
  mimeType: string
  text: string
}

export interface Server {
  instructions: string
  tools: readonly ToolDefinition[]
  resources: readonly ResourceDefinition[]
  callTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome>
}

type Id = string | number

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: Id | null
  method: string
  params?: Record<string, unknown>
}

export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: Id; result: unknown }
  | { jsonrpc: '2.0'; id: Id | null; error: { code: number; message: string; data?: unknown } }

export const PARSE_ERROR = -32700
export const INVALID_REQUEST = -32600
export const METHOD_NOT_FOUND = -32601
export const INVALID_PARAMS = -32602
export const INTERNAL_ERROR = -32603

function fail(id: Id | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

/** Whether a `MCP-Protocol-Version` header is one this server speaks. Absent is `2025-03-26`,
 *  which predates the header, and is accepted as such. */
export function acceptsVersionHeader(header: string | null): boolean {
  return header === null || (SUPPORTED_VERSIONS as readonly string[]).includes(header)
}

function isRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Record<string, unknown>
  return (
    message.jsonrpc === '2.0' &&
    typeof message.method === 'string' &&
    (message.params === undefined || (typeof message.params === 'object' && message.params !== null && !Array.isArray(message.params)))
  )
}

/**
 * One JSON-RPC message. `null` for a notification, which gets no answer (the route replies
 * 202), and also for a response the client sent, which this server never asked for.
 */
export async function handleMessage(server: Server, message: unknown): Promise<JsonRpcResponse | null> {
  if (!isRequest(message)) {
    const looksLikeResponse =
      typeof message === 'object' && message !== null && ('result' in message || 'error' in message)
    return looksLikeResponse ? null : fail(null, INVALID_REQUEST, 'Invalid request')
  }

  const { id, method } = message
  if (id === undefined || id === null) return null
  if (typeof id !== 'string' && typeof id !== 'number') return fail(null, INVALID_REQUEST, 'Invalid id')

  const params = message.params ?? {}

  switch (method) {
    case 'initialize': {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : null
      const protocolVersion =
        asked !== null && (SUPPORTED_VERSIONS as readonly string[]).includes(asked) ? asked : LATEST
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: server.instructions,
        },
      }
    }

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} }

    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: server.tools } }

    case 'tools/call': {
      const name = params.name
      const args = params.arguments ?? {}
      if (typeof name !== 'string' || typeof args !== 'object' || args === null || Array.isArray(args)) {
        return fail(id, INVALID_PARAMS, 'tools/call needs a name and an arguments object')
      }
      if (!server.tools.some((tool) => tool.name === name)) return fail(id, INVALID_PARAMS, `Unknown tool: ${name}`)

      try {
        const outcome = await server.callTool(name, args as Record<string, unknown>)
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: outcome.text }],
            ...(outcome.data === undefined ? {} : { structuredContent: outcome.data }),
            isError: outcome.isError === true,
          },
        }
      } catch (error) {
        console.error(`mcp tool ${name} failed`, error)
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: 'Something went wrong on Strumfolio. Try again.' }], isError: true },
        }
      }
    }

    case 'resources/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          resources: server.resources.map(({ uri, name, title, description, mimeType }) => ({
            uri,
            name,
            title,
            description,
            mimeType,
          })),
        },
      }

    case 'resources/templates/list':
      return { jsonrpc: '2.0', id, result: { resourceTemplates: [] } }

    case 'resources/read': {
      const resource = server.resources.find((candidate) => candidate.uri === params.uri)
      if (resource === undefined) return fail(id, INVALID_PARAMS, 'Unknown resource')
      return {
        jsonrpc: '2.0',
        id,
        result: { contents: [{ uri: resource.uri, mimeType: resource.mimeType, text: resource.text }] },
      }
    }

    default:
      return fail(id, METHOD_NOT_FOUND, `Method not found: ${method}`)
  }
}
