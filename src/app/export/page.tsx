import type { Metadata } from 'next'

import { ExportScreen } from '@/components/ExportScreen'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'

export const metadata: Metadata = { title: 'Export' }

/**
 * A static shell, like Password and Accounts: whether this reader may export is a fact
 * about their role, which arrives after mount (see `RoleProvider`'s own comment), so
 * there is nothing here for a build to bake in.
 */
export default function ExportPage() {
  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="export" />

      <main className="mx-auto max-w-4xl px-4 pb-12 pt-3">
        <ExportScreen />

        <Footer />
      </main>
    </PrefsProvider>
  )
}
