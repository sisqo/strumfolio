'use client'

import { useRouter } from 'next/navigation'

import { setAccountTest } from '@/lib/accounts/actions'
import { TEST_ACCOUNT_MESSAGE } from '@/lib/accounts/types'
import { useAdminAction } from '@/lib/accounts/useAdminAction'
import { useOnline } from '@/lib/useOnline'

/**
 * Marks or unmarks a test account, on the Identity tab because it answers «who is this
 * account». A plain toggle like `SuspendAccountRow`: it changes only what `/accounts` lists, so
 * one more click undoes it and a confirm step would buy nothing.
 */
export function TestAccountRow({ ownerEmail, isTest }: { ownerEmail: string; isTest: boolean }) {
  const router = useRouter()
  const online = useOnline()
  const { busy, error, run } = useAdminAction(
    () => setAccountTest(ownerEmail, !isTest),
    TEST_ACCOUNT_MESSAGE,
    () => router.refresh(),
  )

  return (
    <div className="acct-row">
      <div className="acct-row-text">
        <span className="acct-row-title">{isTest ? 'Test account' : 'Not a test account'}</span>
        <span className="acct-row-note">
          {isTest
            ? 'Hidden from the Accounts list unless you ask to see test accounts. Everything else treats it as a real account.'
            : 'Mark it to hide it from the Accounts list unless you ask to see test accounts. Nothing else about the account changes.'}
        </span>
        {error && (
          <p className="notice notice-error mt-2 text-sm" role="alert">
            {error}
          </p>
        )}
      </div>
      <button type="button" className="acct-pill" disabled={!online || busy} onClick={() => void run()}>
        {isTest ? 'Unmark test account' : 'Mark as test account'}
      </button>
    </div>
  )
}
