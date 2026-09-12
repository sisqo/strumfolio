/**
 * The Paddle SDK client, built per call.
 *
 * A plain module rather than part of either `'use server'` file that needs it: those may only
 * export async functions, and this is a synchronous factory two of them share — the same
 * constraint `testCard.ts` and `redeemable.ts` already live under.
 *
 * Built per call rather than once at module scope so `PADDLE_API_KEY` is read fresh, the way
 * `resolve.ts` reads its flags. A missing key answers `null` instead of throwing at import
 * time, which would take down every route that happens to share the bundle rather than the one
 * action that needed a key.
 */

import { Environment, Paddle } from '@paddle/paddle-node-sdk'

export function paddleClient(): Paddle | null {
  const key = process.env.PADDLE_API_KEY
  if (!key) return null

  return new Paddle(key, {
    environment:
      process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? Environment.production : Environment.sandbox,
  })
}
