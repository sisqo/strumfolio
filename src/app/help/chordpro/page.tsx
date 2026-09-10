import type { Metadata } from 'next'
import Link from 'next/link'

import { ChordProGuide } from '@/components/ChordProGuide'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { IconChevronLeft } from '@/components/icons'

export const metadata: Metadata = { title: 'ChordPro format' }

/**
 * A reference, not a tutorial — `/help` teaches the app in five minutes; this page
 * exists so a specific directive or edge case has a stable place to be looked up,
 * linked to from the import screen and handed to an AI doing the converting instead.
 */
export default function ChordProHelpPage() {
  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="help" />

      <main className="mx-auto max-w-4xl px-4 pb-12 pt-3">
        <Link href="/help" className="back-plain mb-3.5">
          <IconChevronLeft size={15} />
          Help
        </Link>

        <ChordProGuide />

        <Footer />
      </main>
    </PrefsProvider>
  )
}
