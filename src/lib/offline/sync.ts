'use server'

/**
 * What a signed-in reader's device should have cached for offline use — computed fresh
 * per reader, unlike the old build-time precache list this replaces (v3.0).
 *
 * Songs and songbooks stopped being safe to bake into one shared, build-time manifest
 * the moment they became private per account: that manifest was one list, identical for
 * every device, with no reader to check it against. This is the opposite shape — asked
 * by `OfflineSync` after the reader is already known, over their **current** account,
 * the same one Home is showing them right now (v3.1). Not every account they could open:
 * with collaborators gone the only reader who could ever open more than one is a global
 * owner, and precaching every account in the installation onto one admin's phone is not
 * "offline support", it is downloading everyone else's repertoire without asking.
 */

import { auth } from '@/auth'
import { currentAccountFor, readAccountCookie } from '@/lib/accounts/current'
import { normalizeEmail } from '@/lib/allowlist'
import { listSongbooksForAccount, listSongsForAccount } from '@/lib/data/db'
import { hasDatabase } from '@/lib/db/client'

/** `null` when nobody is signed in, which `OfflineSync` must tell apart from an empty repertoire. */
export async function listOfflineRoutes(): Promise<string[] | null> {
  if (!hasDatabase) return []

  const session = await auth()
  const email = session?.user?.email
  if (!email) return null
  const normalized = normalizeEmail(email)

  const raw = process.env.ALLOWED_EMAILS
  const requested = await readAccountCookie()
  const account = currentAccountFor(normalized, raw, requested)

  const [songbooks, songs] = await Promise.all([
    listSongbooksForAccount(account),
    listSongsForAccount(account),
  ])

  const routes: string[] = []
  for (const songbook of songbooks) routes.push(`/songbooks/${songbook.slug}`)
  for (const song of songs) routes.push(`/songs/${song.slug}`)
  return routes
}
