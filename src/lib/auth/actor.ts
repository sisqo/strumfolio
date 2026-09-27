/**
 * Who is acting when the request carries an AI token instead of a session cookie.
 *
 * The MCP route (`app/api/mcp/route.ts`) resolves a bearer token to one account and runs each
 * tool inside `runAsToken`. `currentUser`, `accessTo` and `permitOn` (`auth/session.ts`) read
 * this first, so every existing action — its freeze, its caps, its suspension check, its
 * revalidation — answers for the token exactly as it would for that account's own browser,
 * with no second copy of any gate.
 *
 * **`auth()` is deliberately not overridden.** Anything that reads the session directly —
 * about thirty operator actions, all of them `isOwner` checks — sees nobody and refuses, and
 * that is the direction wanted: a token never carries a global owner's powers, not even an
 * owner's own token. For the same reason the override answers the token's own account and
 * never passes through `roleOf`, which would grant an owner every account.
 *
 * `AsyncLocalStorage` scopes the actor to the async work of one tool call, so nothing leaks to
 * another request.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

export interface TokenActor {
  tokenId: number
  accountId: number
  /** Normalized, the form `accessTo` compares against. */
  accountOwnerEmail: string
}

const store = new AsyncLocalStorage<TokenActor>()

export function runAsToken<T>(actor: TokenActor, work: () => Promise<T>): Promise<T> {
  return store.run(actor, work)
}

export function tokenActor(): TokenActor | undefined {
  return store.getStore()
}
