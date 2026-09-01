/**
 * `forceExpireNow`'s result-to-copy map, kept out of `checkout.ts` itself: that file is
 * `'use server'`, which may only export async functions — a plain object export breaks
 * every action bundled alongside it (`invalid-use-server-value`). Same reason `testCard.ts`
 * sits beside `checkout.ts` rather than inside it.
 */

import type { MockCheckoutFailure } from './checkout'

export const FORCE_EXPIRE_MESSAGE: Record<MockCheckoutFailure, string> = {
  disabled: 'Mock checkout is off in this deployment.',
  'no-session': 'No session for this account.',
  'no-database': 'No database configured: nothing to expire.',
  'invalid-plan': 'Nothing to expire.',
  'not-applicable': 'Already free, already lifetime, or already expired.',
  'not-allowed': 'Only a global owner may force an expiry.',
  failed: 'Save failed. Please try again.',
}
