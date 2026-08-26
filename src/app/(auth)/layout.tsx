import { PublicHeader } from '@/components/PublicHeader'

/**
 * The shell shared by the four narrow sign-in-adjacent pages — register, forgot/reset
 * password, email verification — where `/login` (the full landing page, 70rem) does not:
 * see that page's own `layout.tsx` for why it moved out of this group. 48rem, the one width
 * every non-landing page in the app shares — the bar just holds the theme switch here, since
 * each page centers its own `max-w-sm` card independently of it.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* No mark in the bar: every page under here opens with `AuthLockup`'s own. */}
      <PublicHeader width="48rem" brand={false} />
      {children}
    </>
  )
}
