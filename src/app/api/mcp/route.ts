/**
 * The MCP endpoint: an AI assistant's way into one account's songbooks (`lib/mcp/`).
 *
 * `POST` only — Streamable HTTP, answered with plain JSON and no session, so any instance can
 * serve any call. Authenticated by a personal token in `Authorization: Bearer`, never by the
 * session cookie, which is why `middleware.ts` lets this path through untouched: without that
 * line every call would be redirected to `/login`, the Paddle webhook's old trap.
 *
 * Off unless `STRUMFOLIO_MCP=on`, answering 404 as though it did not exist — the switch the
 * beta ships behind. Every call then, in this order: a live token (one 401 for every reason,
 * so the endpoint says nothing about which tokens exist), the rate limit, and — inside the
 * token's actor, so it is that account's plan — `refused.aiAccess`, which suspends the tools
 * of an account that dropped to Free without deleting its tokens.
 */

import { runAsToken } from '@/lib/auth/actor'
import { entitlementsOf } from '@/lib/plans/resolve'
import { checkRateLimit } from '@/lib/rateLimit'
import { mcpEnabled } from '@/lib/mcp/enabled'
import { acceptsVersionHeader, handleMessage, PARSE_ERROR, SUPPORTED_VERSIONS, type Server } from '@/lib/mcp/protocol'
import { resolveToken } from '@/lib/mcp/tokens'
import { serverFor } from '@/lib/mcp/tools'

/** Per token. Generous for an assistant working through a songbook, tight for a runaway loop. */
const CALLS_PER_MINUTE = 120

const PLAN_REQUIRED =
  'Strumfolio: reaching your songbooks from an AI assistant needs the Standard plan or above. Your tokens are kept, and work again as soon as the plan is back.'

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  })
}

function rpcError(status: number, code: number, message: string, headers: Record<string, string> = {}): Response {
  return json({ jsonrpc: '2.0', id: null, error: { code, message } }, status, headers)
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization')
  const match = header?.match(/^Bearer\s+(\S+)$/i)
  return match ? match[1] : null
}

/** The same server with every tool answering the plan sentence — so the assistant can connect,
 *  list what exists and tell its user why nothing works, instead of failing at the door. */
function suspended(server: Server): Server {
  return { ...server, callTool: async () => ({ text: PLAN_REQUIRED, isError: true }) }
}

export async function POST(request: Request): Promise<Response> {
  if (!mcpEnabled()) return new Response('Not found', { status: 404 })

  const secret = bearer(request)
  const token = secret === null ? null : await resolveToken(secret)
  if (token === null) {
    return rpcError(401, -32001, 'A valid Strumfolio token is required: create one in Strumfolio, menu → AI assistants.', {
      'www-authenticate': 'Bearer realm="strumfolio"',
    })
  }

  /* A modern-era (per-request `_meta`) client is sent back to `initialize` by a plain 400 — see
     `protocol.ts`. */
  if (!acceptsVersionHeader(request.headers.get('mcp-protocol-version'))) {
    return new Response(`Unsupported MCP protocol version. Supported: ${SUPPORTED_VERSIONS.join(', ')}`, { status: 400 })
  }

  if (!(await checkRateLimit(`mcp:${token.tokenId}`, CALLS_PER_MINUTE, 60_000))) {
    return rpcError(429, -32002, 'Too many calls. Wait a minute and try again.', { 'retry-after': '60' })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return rpcError(400, PARSE_ERROR, 'Parse error')
  }

  return runAsToken(token, async () => {
    const entitlements = await entitlementsOf(token.accountOwnerEmail)
    const base = serverFor(token.accountId)
    const server = entitlements.refused.aiAccess === null ? base : suspended(base)

    const messages = Array.isArray(payload) ? payload : [payload]
    const answers = []
    for (const message of messages) {
      const answer = await handleMessage(server, message)
      if (answer !== null) answers.push(answer)
    }

    if (answers.length === 0) return new Response(null, { status: 202 })
    return json(Array.isArray(payload) ? answers : answers[0])
  })
}

/* No server-initiated stream and no session to end. */
export function GET(): Response {
  return new Response(mcpEnabled() ? 'Method not allowed' : 'Not found', {
    status: mcpEnabled() ? 405 : 404,
    headers: { allow: 'POST' },
  })
}

export const DELETE = GET
