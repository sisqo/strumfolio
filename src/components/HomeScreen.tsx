'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useDeferredValue, useMemo, useState } from 'react'

import { useSongbooks } from '@/components/SongbookProvider'
import { useRole } from '@/components/RoleProvider'
import { PlanUpgradeModal, type PlanNotice } from '@/components/PlanUpgradeModal'
import { SampleSongbookModal } from '@/components/SampleSongbookModal'
import { SongRow } from '@/components/SongRow'
import {
  IconBooks,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconGrip,
  IconInfo,
  IconOffline,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
} from '@/components/icons'
import { type AccountSummary, listAllAccounts } from '@/lib/accounts/read'
import type { RecentSong } from '@/lib/data/db'
import { loadSongIndex } from '@/lib/library/actions'
import { mergeIndex } from '@/lib/library/overlay'
import { useLiveIndex } from '@/lib/library/useLiveSongs'
import { LIMIT_MESSAGE, type LimitReason } from '@/lib/plans/types'
import { clearRecentlyOpened } from '@/lib/prefs/actions'
import { copySongbook } from '@/lib/songbooks/actions'
import { countBySlug, songbooksOf, writeMessage, type WriteResult } from '@/lib/songbooks/types'
import type { SongIndexEntry } from '@/lib/search-index'

import { ArrangeSongbooks } from './ArrangeSongbooks'

/**
 * The first screen: the songbooks, and a way to search across all of them.
 *
 * A songbook is a link, not a drawer. It used to open in place, and the list of songs
 * appeared underneath — which meant the one thing this screen is for, choosing a
 * songbook, left you still on this screen with your songs in a fold. Now it leads to
 * the songbook's own page: one destination per tap, a back button that means
 * something, and a URL that can be shared and precached.
 *
 * Searching is the exception and stays here, because a search is not about one
 * songbook. It replaces the list with matches from everywhere, each saying where it
 * lives, and the list comes back when the box is emptied.
 */
export function HomeScreen({
  songs: baked,
  recentlyPlayed,
  frozen,
}: {
  songs: SongIndexEntry[]
  /** This reader's own last-opened songs, most recent first — empty for nobody yet. */
  recentlyPlayed: RecentSong[]
  /**
   * Whether this account's repertoire is over its plan's caps, decided by the server (see the
   * page's own comment). A prop and not a read from here, for the reason `Viewer` is one on
   * /pricing: a client-side answer is «no» until it resolves, and «no» is the reassuring half
   * of this particular question.
   */
  frozen: boolean
}) {
  const state = useSongbooks()
  const { songbooks, sections, assignments, nameOf, online } = state
  const { mayEdit, isGlobalOwner } = useRole()

  const [songs, setSongs] = useLiveIndex(baked)
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const [mode, setMode] = useState<'list' | 'organizing'>('list')

  /*
   * Create, rename and remove, lifted here from the retired `/songbooks` page.
   *
   * Same fields, same wrapper, same rule about removal never destroying anything: a
   * songbook holding songs asks where to move them first, same as it did there. What
   * moved is only the page this lives on — the interaction itself is copied, not
   * reinvented, so an editor who knew the old screen needs nothing new to learn.
   */
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * A refusal by the plan rather than by a permission gets its own dialog instead of the
   * inline `error` notice above — see `PlanUpgradeModal`'s own comment on why. Membership in
   * `LIMIT_MESSAGE` is what tells the two apart, both here and in `toggleCopy`'s handler
   * below, so a fifth `LimitReason` lands here automatically rather than in the notice.
   */
  const [planNotice, setPlanNotice] = useState<PlanNotice | null>(null)
  /** Slug of the songbook `addSample` (below) just created, while its confirmation modal is open. */
  const [sampleAdded, setSampleAdded] = useState<string | null>(null)

  /*
   * Clearing "Recently played" keeps its own pair rather than borrowing the `busy`/`error`
   * above: those belong to the songbook create/rename/remove flow, and sharing them would grey
   * out those controls while a list of shortcuts was being forgotten, and report this failure
   * inside their notice. `online` comes from `useSongbooks` above — one source for the whole
   * screen — and `router.refresh()` is what re-reads `recentlyPlayed`, which arrives as a prop
   * from the server and so cannot update itself.
   */
  const router = useRouter()
  const [clearing, setClearing] = useState(false)
  const [clearFailed, setClearFailed] = useState(false)

  const clearRecent = async () => {
    setClearing(true)
    setClearFailed(false)
    try {
      const result = await clearRecentlyOpened()
      if (result.ok) router.refresh()
      else setClearFailed(true)
    } catch {
      setClearFailed(true)
    } finally {
      setClearing(false)
    }
  }
  const [newName, setNewName] = useState('')
  /** The create form is a reveal under the header's own "New songbook", not a
      fixture at the foot of the list — closed again once a songbook is made. */
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const [destination, setDestination] = useState('')
  /** Set once "Delete everything instead" is tapped, to ask for it a second time. */
  const [purging, setPurging] = useState<string | null>(null)

  /*
   * Copying a songbook into another account — a **global owner** power, not an editor
   * one (see `copySongbook`'s own comment on why), so kept apart from `run`/`busy`/
   * `error` above rather than folded into them: it acts on an account that is not the
   * one this screen is reading from, and its own panel needs a list of destinations no
   * other action here has any reason to fetch.
   */
  const [copying, setCopying] = useState<string | null>(null)
  const [copyTargets, setCopyTargets] = useState<AccountSummary[] | null>(null)
  const [copyDestination, setCopyDestination] = useState('')
  const [copyBusy, setCopyBusy] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [copyDone, setCopyDone] = useState<string | null>(null)

  const toggleCopy = async (slug: string) => {
    if (copying === slug) {
      setCopying(null)
      return
    }

    setCopying(slug)
    setRenaming(null)
    setRemoving(null)
    setCopyError(null)
    setCopyDone(null)
    setCopyTargets(null)
    setCopyDestination('')

    try {
      setCopyTargets((await listAllAccounts()) ?? [])
    } catch {
      setCopyTargets([])
    }
  }

  const run = async (
    action: () => Promise<WriteResult>,
    /** Called in place of the inline notice when the refusal turns out to be a plan one — the
        one hook a caller has to also close whatever panel would otherwise sit under the dialog
        with nothing left to try, like `state.create`'s own submit handler below does. */
    onPlanLimited?: () => void,
  ) => {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      if (!result.ok) {
        if (Object.hasOwn(LIMIT_MESSAGE, result.reason)) {
          // Guarded by the membership check above: every key of `LIMIT_MESSAGE` is a
          // `LimitReason`, which `Object.hasOwn` itself does not tell the compiler.
          setPlanNotice({ reason: result.reason as LimitReason, limit: result.limit })
          onPlanLimited?.()
        } else {
          setError(writeMessage(result))
        }
      }
      return result.ok
    } catch {
      setError(writeMessage({ reason: 'failed' }))
      return false
    } finally {
      setBusy(false)
    }
  }

  /**
   * The empty-state "Add example songbook" button: not routed through `run` above,
   * because that helper reports only whether the write succeeded, and this one needs
   * the new songbook's own slug to name in `SampleSongbookModal`. On success it also
   * re-reads the live song index — the same fix `SongbookSongs.tsx`'s `refreshRows`
   * applies after a paste-import — since eight new songs otherwise have no way to
   * patch themselves into `songs` without a reload.
   *
   * Stays on this screen rather than navigating to the new songbook: the list is what
   * the reader had open, and a redirect away from it the moment it stops being empty
   * would take over the one screen they were looking at with no way back to it short
   * of a second navigation. `sampleAdded` opens the modal instead, which leaves that
   * choice — open it now, or later from the list — to them.
   */
  const addSample = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await state.addSample()
      if (result.ok) {
        try {
          const live = await loadSongIndex()
          if (live !== null) setSongs(mergeIndex(baked, live))
        } catch {
          // Offline or signed out: the new songbook still shows what it was created with.
        }
        setSampleAdded(result.slug)
        return
      }
      if (Object.hasOwn(LIMIT_MESSAGE, result.reason)) {
        setPlanNotice({ reason: result.reason as LimitReason, limit: result.limit })
      } else {
        setError(writeMessage(result))
      }
    } catch {
      setError(writeMessage({ reason: 'failed' }))
    } finally {
      setBusy(false)
    }
  }

  const others = (slug: string) => songbooks.filter((entry) => entry.slug !== slug)

  /*
   * Counted from the songbook layer's own `assignments`, not from `groups` below.
   *
   * `groups[].count` comes from the live song index, refreshed on its own schedule; this
   * comes from the same `state` the remove action itself checks against. The two agree
   * almost always, but the moment they don't, this is the one that decides whether
   * "Remove" tries to delete a songbook that still holds something — and `on delete
   * restrict` is the guarantee either way, so a stale badge next to a correct decision
   * is a cosmetic gap, not a broken one.
   */
  const counts = countBySlug(state)

  const results = useMemo(() => {
    const needle = deferred.trim().toLowerCase()
    if (needle === '') return []

    // Every term must appear somewhere, so "certe notti" and "notti certe" match.
    const terms = needle.split(/\s+/)
    const found = songs.filter((song) => terms.every((term) => song.haystack.includes(term)))

    /*
     * Alphabetical, whatever order the songbooks are in.
     *
     * Inside a songbook the saved order is the point; across songbooks it is not an
     * order at all — matches would arrive as every songbook's first song, then every
     * second, which is nobody's idea of a result list.
     */
    return [...found].sort((one, other) => one.title.localeCompare(other.title, 'it'))
  }, [songs, deferred])

  /**
   * Which songbook each song is in, by way of its section.
   *
   * A map rather than a walk per song: the answer is two lookups, and this screen asks
   * it once per song for the counts and again for every search result.
   */
  const homeOf = useMemo(() => {
    const songbookById = new Map(
      sections.map((section) => [section.id, section.songbookSlug]),
    )
    return (slug: string) => songbookById.get(assignments[slug] ?? -1) ?? null
  }, [sections, assignments])

  /**
   * The songbooks with their counts.
   *
   * There used to be a group of unfiled songs after them, for songs whose songbook was
   * null. That state no longer exists — the column is `not null`, and a song's songbook
   * now comes from its section — so the group went with it rather than being carried
   * around as a case nobody would ever see.
   */
  const groups = useMemo(
    () =>
      songbooksOf(state).map((songbook) => ({
        slug: songbook.slug,
        name: songbook.name,
        count: songs.filter((song) => homeOf(song.slug) === songbook.slug).length,
      })),
    [songs, state, homeOf],
  )

  const searching = deferred.trim() !== ''

  return (
    <div>
      {/*
        * Hidden while arranging: typing here would flip `searching` true and swap
        * the drag list out from under a reorder in progress — the same reasoning
        * that already keeps the notices and the create form out of that mode.
        */}
      {mode !== 'organizing' && (
        <label className="search-field block">
          <span className="sr-only">Search songs</span>
          <IconSearch />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, artist, or lyrics"
            autoComplete="off"
            className="form-field"
          />
        </label>
      )}

      {searching ? (
        <>
          <p className="mb-1 mt-6 px-1 text-xs text-muted" aria-live="polite">
            {`${results.length} of ${songs.length}`}
          </p>

          {results.length === 0 ? (
            <p className="mt-8 text-center text-sm text-muted">No songs found.</p>
          ) : (
            /* Matches from anywhere belong to each other, so they share one card. */
            <ul className="row-list card">
              {results.map((song) => (
                <li key={song.slug}>
                  <SongRow song={song} under={nameOf(homeOf(song.slug))} />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : mode === 'organizing' ? (
        <ArrangeSongbooks rows={groups} onDone={() => setMode('list')} />
      ) : (
        <>
          <div className="screen-header mt-8">
            <div className="min-w-0">
              <h1 className="screen-title">Your songbooks</h1>
              <p className="screen-subtitle">
                <span>
                  {groups.length} {groups.length === 1 ? 'songbook' : 'songbooks'}
                </span>
                <span className="screen-subtitle-dot" aria-hidden />
                <span>
                  {songs.length} {songs.length === 1 ? 'song' : 'songs'}
                </span>
              </p>
            </div>

            {mayEdit && (
              <div className="screen-header-actions">
                {/*
                  * `disabled`, not hidden, when offline — same pattern as "New
                  * songbook" beside it, so the two don't answer the same condition
                  * two different ways. `groups.length > 1` still hides it outright:
                  * that's not a connection problem, there's structurally nothing to
                  * arrange with zero or one songbook.
                  */}
                {groups.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={!online}
                    onClick={() => setMode('organizing')}
                  >
                    <IconGrip size={16} />
                    Arrange
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!online}
                  onClick={() => {
                    setCreating(!creating)
                    setNewName('')
                  }}
                  aria-expanded={creating}
                >
                  <IconPlus size={16} />
                  New songbook
                </button>
              </div>
            )}
          </div>

          {creating && (
            <form
              className="panel mt-4 flex flex-wrap items-center gap-2 p-3.5"
              onSubmit={async (event) => {
                event.preventDefault()
                if (await run(() => state.create(newName), () => setCreating(false))) {
                  setNewName('')
                  setCreating(false)
                }
              }}
            >
              <label className="min-w-0 flex-1">
                <span className="sr-only">New songbook name</span>
                <input
                  autoFocus
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setCreating(false)
                  }}
                  placeholder="Songbook name"
                  className="form-field"
                />
              </label>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={busy || newName.trim() === ''}
              >
                Create
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
            </form>
          )}

          {/*
            * Offline and error notices for the management block below, raised above both
            * the list and the empty state: a failed create shows up even with zero
            * songbooks, and "can only be viewed" is the reason the icons on every row
            * are about to be disabled, so it belongs before them, not after.
            */}
          {mayEdit && !online && (
            <p className="notice notice-accent mt-4">
              <IconOffline />
              Without a connection, songbooks can only be viewed. They&apos;re a shared structure,
              so changes require a connection.
            </p>
          )}

          {mayEdit && error !== null && (
            <p className="notice notice-error mt-4" role="alert">
              {error}
            </p>
          )}

          {/*
            * The freeze, said where the songs are rather than only where the plan is. This is
            * the state a downgrade or a plan lapsing on its own leaves behind — everything
            * still readable, nothing editable, only deletions accepted — and until now it
            * reached no screen at all: a reader met it as `PlanUpgradeModal` the first time
            * they tried to save, which is after the decision they would have made differently.
            *
            * Beside the offline notice above it because the two say the same *kind* of thing —
            * why the icons on every row below are about to refuse — and for the same reason it
            * sits before the list rather than after it.
            *
            * Gated on `mayEdit`, like both notices above: somebody who cannot edit this account
            * anyway is not being stopped by the freeze, and the sentence would name a limit
            * that is not the one in their way.
            *
            * `LIMIT_MESSAGE.frozen` verbatim and no link to /pricing — the same two rules
            * `/billing`'s own copy of this notice follows; see it for why buying is the wrong
            * remedy to offer here.
            */}
          {mayEdit && frozen && (
            <p className="notice notice-accent mt-4" role="status">
              <IconInfo />
              <span>{LIMIT_MESSAGE.frozen}</span>
            </p>
          )}

          {groups.length === 0 ? (
            /*
              * An empty library, said differently depending on `mayEdit`. Telling someone
              * who cannot edit to create a songbook from a menu entry their access does not
              * draw would send them hunting for something that is not there — and the
              * action behind it would refuse them anyway. The editor's copy used to point
              * at a menu; now "New songbook" is in the header just above.
              *
              * The second option below is offered on exactly this condition — zero
              * songbooks — rather than on any notion of a "new" account: it is the same
              * offer, unlocked again, for an account that empties itself out later.
              */
            <div className="mt-8 text-center">
              <p className="text-sm text-muted">
                {mayEdit
                  ? 'No songbook yet. Create one with "New songbook" above, or start from an example.'
                  : 'No songbook yet. When one arrives, it will appear here.'}
              </p>
              {mayEdit && (
                <button
                  type="button"
                  className="btn btn-sm mt-3"
                  disabled={busy || !online}
                  onClick={addSample}
                >
                  <IconBooks size={16} />
                  Add example songbook
                </button>
              )}
            </div>
          ) : (
            <ul className="row-list card mt-4">
              {groups.map((group) => {
                const isRenaming = renaming === group.slug
                const isRemoving = removing === group.slug
                const isCopying = copying === group.slug

                return (
                  <li key={group.slug}>
                    {/*
                      * Used to be one <Link> wrapping the whole row. An icon-button can't
                      * nest inside an <a>, so the link is now one flex child among others
                      * instead of the row itself — same href, same look, just no longer
                      * the element everything else lives inside of.
                      */}
                    <div className="flex items-center gap-1 pr-1">
                      {isRenaming ? (
                        <>
                          <div className="row min-w-0 flex-1">
                            <span className="row-icon" aria-hidden>
                              <IconBooks size={19} />
                            </span>
                            <input
                              autoFocus
                              value={draft}
                              onChange={(event) => setDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') setRenaming(null)
                              }}
                              aria-label={`New name for ${group.name}`}
                              className="form-field min-w-0 flex-1"
                            />
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy || draft.trim() === ''}
                            onClick={async () => {
                              if (await run(() => state.rename(group.slug, draft))) {
                                setRenaming(null)
                              }
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn btn-quiet btn-sm"
                            onClick={() => setRenaming(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <Link href={`/songbooks/${group.slug}`} className="row min-w-0 flex-1">
                            <span className="row-icon" aria-hidden>
                              <IconBooks size={19} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{group.name}</span>
                              <span className="row-count">
                                {group.count} {group.count === 1 ? 'song' : 'songs'}
                              </span>
                            </span>
                            <IconChevronRight size={18} className="text-faint" />
                          </Link>

                          {mayEdit && (
                            <>
                              <button
                                type="button"
                                className="icon-button"
                                disabled={!online || busy}
                                onClick={() => {
                                  setRenaming(group.slug)
                                  setDraft(group.name)
                                  setRemoving(null)
                                  setCopying(null)
                                  setError(null)
                                }}
                                title="Rename"
                                aria-label={`Rename ${group.name}`}
                              >
                                <IconPencil size={17} />
                              </button>
                              {/*
                                * A global-owner power over two accounts at once
                                * (`copySongbook`'s own comment on why), so shown only to one —
                                * nobody else has a second account to copy into anyway. The
                                * cross-account destination picker underneath is unchanged;
                                * only what this button is called changed, to say what it does
                                * rather than how — the account it lands in is chosen next.
                                */}
                              {isGlobalOwner && (
                                <button
                                  type="button"
                                  className="icon-button"
                                  disabled={!online}
                                  onClick={() => void toggleCopy(group.slug)}
                                  title="Duplicate"
                                  aria-label={`Duplicate ${group.name}`}
                                  aria-expanded={isCopying}
                                >
                                  <IconCopy size={17} />
                                </button>
                              )}
                              {/*
                                * Turns red when its own confirmation is open, so it is clear
                                * which row the question below the list belongs to.
                                */}
                              <button
                                type="button"
                                className={isRemoving ? 'icon-button is-danger' : 'icon-button'}
                                disabled={!online || busy}
                                onClick={() => {
                                  setRemoving(isRemoving ? null : group.slug)
                                  setDestination(others(group.slug)[0]?.slug ?? '')
                                  setPurging(null)
                                  setRenaming(null)
                                  setCopying(null)
                                  setError(null)
                                }}
                                title="Delete"
                                aria-label={`Remove ${group.name}`}
                                aria-expanded={isRemoving}
                              >
                                <IconTrash size={17} />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>

                    {isRemoving && (
                      <div className="panel mx-2 mb-2 p-3.5 text-sm">
                        {(() => {
                          const held = counts[group.slug] ?? 0

                          if (held === 0) {
                            return (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="flex-1">
                                  Remove &quot;{group.name}&quot;? It&apos;s empty.
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  disabled={busy}
                                  onClick={async () => {
                                    if (await run(() => state.remove(group.slug, null))) {
                                      setRemoving(null)
                                    }
                                  }}
                                >
                                  Remove
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-quiet btn-sm"
                                  onClick={() => setRemoving(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            )
                          }

                          // A second tap of "Delete everything instead", asked once more
                          // because nothing here destroys anything quietly.
                          if (purging === group.slug) {
                            return (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="flex-1">
                                  Delete &quot;{group.name}&quot; and all {held}{' '}
                                  {held === 1 ? 'song' : 'songs'} in it? This can&apos;t be undone.
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  disabled={busy}
                                  onClick={async () => {
                                    if (await run(() => state.purge(group.slug))) {
                                      setRemoving(null)
                                      setPurging(null)
                                    }
                                  }}
                                >
                                  Delete everything
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-quiet btn-sm"
                                  onClick={() => setPurging(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            )
                          }

                          if (others(group.slug).length === 0) {
                            return (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="flex-1">
                                  Contains {held} {held === 1 ? 'song' : 'songs'} and there&apos;s
                                  no other songbook to move them to.
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  onClick={() => setPurging(group.slug)}
                                >
                                  Delete everything
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-quiet btn-sm"
                                  onClick={() => setRemoving(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            )
                          }

                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex-1">
                                Contains {held} {held === 1 ? 'song' : 'songs'}. Move them to:
                              </span>
                              <label className="picker picker-raised">
                                <span className="sr-only">Destination songbook</span>
                                <select
                                  value={destination}
                                  onChange={(event) => setDestination(event.target.value)}
                                  className="picker-select"
                                >
                                  {others(group.slug).map((entry) => (
                                    <option key={entry.slug} value={entry.slug}>
                                      {entry.name}
                                    </option>
                                  ))}
                                </select>
                                <IconChevronDown size={14} />
                              </label>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                disabled={busy || destination === ''}
                                onClick={async () => {
                                  if (await run(() => state.remove(group.slug, destination))) {
                                    setRemoving(null)
                                  }
                                }}
                              >
                                Move and remove
                              </button>
                              <button
                                type="button"
                                className="btn btn-quiet btn-sm"
                                onClick={() => setPurging(group.slug)}
                              >
                                Delete everything instead
                              </button>
                              <button
                                type="button"
                                className="btn btn-quiet btn-sm"
                                onClick={() => setRemoving(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          )
                        })()}
                      </div>
                    )}

                    {isCopying && (
                      <div className="panel mx-2 mb-2 p-3.5 text-sm">
                        {copyDone !== null ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="flex-1">{copyDone}</span>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => setCopying(null)}
                            >
                              Close
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            {copyError !== null && (
                              <p className="notice notice-error w-full" role="alert">
                                {copyError}
                              </p>
                            )}
                            <span className="flex-1">Copy &quot;{group.name}&quot; into:</span>
                            {copyTargets === null ? (
                              <span className="text-muted">Loading accounts…</span>
                            ) : copyTargets.length === 0 ? (
                              <span className="text-muted">No other account exists yet.</span>
                            ) : (
                              <>
                                <label className="picker picker-raised">
                                  <span className="sr-only">Destination account</span>
                                  <select
                                    value={copyDestination}
                                    onChange={(event) => setCopyDestination(event.target.value)}
                                    className="picker-select"
                                  >
                                    <option value="" disabled>
                                      Choose an account
                                    </option>
                                    {copyTargets.map((account) => (
                                      <option key={account.ownerEmail} value={account.ownerEmail}>
                                        {account.ownerEmail}
                                      </option>
                                    ))}
                                  </select>
                                  <IconChevronDown size={14} />
                                </label>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={copyBusy || copyDestination === ''}
                                  onClick={async () => {
                                    setCopyBusy(true)
                                    setCopyError(null)
                                    try {
                                      const result = await copySongbook(group.slug, copyDestination)
                                      if (result.ok) {
                                        setCopyDone(
                                          'Copied. It will appear there after the next rebuild.',
                                        )
                                      } else {
                                        /*
                                         * Not the upgrade dialog, on purpose: a plan refusal here
                                         * belongs to the *destination* account, not to this global
                                         * owner, so "Upgrade to continue" and a link to /pricing
                                         * would send the wrong person to buy the wrong thing. The
                                         * inline message already names the right cap without
                                         * implying it is this owner's to fix by paying.
                                         */
                                        setCopyError(writeMessage(result))
                                      }
                                    } catch {
                                      setCopyError(writeMessage({ reason: 'failed' }))
                                    } finally {
                                      setCopyBusy(false)
                                    }
                                  }}
                                >
                                  Copy
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              className="btn btn-quiet btn-sm"
                              onClick={() => setCopying(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {/*
            * A shortcut back into whatever this reader was reading last, not a
            * replacement for browsing — so it follows the songbooks rather than
            * leading them, and says nothing when there is nothing to say yet (a
            * fresh account, or one where nothing has been opened).
            */}
          {recentlyPlayed.length > 0 && (
            <section className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="section-title">Recently played</h2>
                {/*
                  * No confirmation in front of it, on the same reasoning `GiftForm`'s "Remove
                  * gift" states for having none: the retype net is for the cascades that destroy
                  * songs. This forgets an ordering hint, and opening a song puts it back — see
                  * `clearRecentlyOpened`, which nulls one column and never deletes the row the
                  * reader's key, capo and note live on.
                  *
                  * Offline it is disabled rather than hidden: the list beside it is still there
                  * to be read, so a control that vanished with the signal would read as a
                  * feature that had been taken away.
                  */}
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={!online || clearing}
                  onClick={() => void clearRecent()}
                >
                  <IconTrash size={14} />
                  {clearing ? 'Clearing…' : 'Clear'}
                </button>
              </div>

              {clearFailed && (
                <p className="notice notice-error mt-2" role="alert">
                  Could not clear the list. Try again.
                </p>
              )}

              <ul className="row-list card mt-2">
                {recentlyPlayed.map((song) => (
                  <li key={song.slug}>
                    <SongRow song={song} under={song.songbookName} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {planNotice !== null && (
        <PlanUpgradeModal notice={planNotice} onClose={() => setPlanNotice(null)} />
      )}

      {sampleAdded !== null && (
        <SampleSongbookModal slug={sampleAdded} onClose={() => setSampleAdded(null)} />
      )}
    </div>
  )
}
