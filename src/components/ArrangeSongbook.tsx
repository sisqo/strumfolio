'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { useSongbooks } from '@/components/SongbookProvider'
import {
  IconChevronDown,
  IconGrip,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@/components/icons'
import { topBarBottom } from '@/components/topBarBottom'
import {
  type ArrangeRow,
  type ArrangedSection,
  type Band,
  arrangementKey,
  arrangementOf,
  moveItem,
  moveSongTo,
  moveToSlot,
  nudgeSong,
  placeAtSlot,
  rowsOf,
  sameMembers,
} from '@/lib/songbooks/order'
import { useRowDrag } from '@/lib/songbooks/useRowDrag'
import { writeMessage, type WriteFailure } from '@/lib/songbooks/types'
import type { LimitFacts } from '@/lib/plans/types'
import type { SongIndexRow } from '@/lib/search-index'

/** One key per drawn row, so a ref survives the rows moving under it. */
function keyOf(row: ArrangeRow): string {
  return row.kind === 'song' ? `song:${row.slug}` : `${row.kind}:${row.sectionId}`
}

/**
 * A songbook with its divisions in your hands: the order of the sections, the order of
 * the songs, and which section each song is in.
 *
 * Dragging is done with pointer events rather than the HTML drag-and-drop API, which does
 * not exist on a touchscreen — and a touchscreen is where this app is used. The same
 * handles answer the arrow keys when they have focus, so a songbook can be arranged
 * without a pointer at all; dragging alone would have made this the one thing in the app
 * a keyboard cannot do.
 *
 * **A song crosses a heading by being carried over it.** One gesture for two things —
 * where the song sits and which section it is in — because they are one fact. The
 * arithmetic for it is in `lib/songbooks/order.ts` and under test there: which gap between
 * rows the finger is in, and what place that gap means, are the two things a screenshot
 * cannot check. The pointer side — capture, and the page scrolling itself while the finger
 * is parked near an edge, which is how a song travels further than the screen is tall — is
 * `useRowDrag`.
 *
 * The bands are measured once, when the drag starts, and the layout each move produces is
 * computed from the layout as it was *then* — not from the previous move's result. So the
 * same finger position always means the same arrangement, and a slow drag cannot
 * accumulate a different answer than a fast one.
 */
export function ArrangeSongbook({
  songbookSlug,
  rows: songs,
  onDone,
  onApplied,
}: {
  songbookSlug: string
  /** Every song, in the order the index holds them; the layout is read off these. */
  rows: SongIndexRow[]
  onDone: () => void
  /** A saved order, flattened, for the list around this one to adopt. */
  onApplied: (slugs: string[]) => void
}) {
  const state = useSongbooks()
  const { assignments, divisionsOf } = state

  const divisions = useMemo(() => divisionsOf(songbookSlug), [divisionsOf, songbookSlug])
  const nameById = useMemo(
    () => new Map(divisions.map((section) => [section.id, section.name])),
    [divisions],
  )
  const titleBySlug = useMemo(
    () => new Map(songs.map((song) => [song.slug, song])),
    [songs],
  )

  /** What the database is known to hold, as far as this screen has been told. */
  const server = useMemo(
    () => arrangementOf(divisions, songs, assignments),
    [divisions, songs, assignments],
  )

  const [layout, setLayout] = useState<ArrangedSection[]>(server)
  const [dragging, setDragging] = useState<
    { kind: 'song'; slug: string } | { kind: 'section'; id: number } | null
  >(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [removing, setRemoving] = useState<number | null>(null)
  const [destination, setDestination] = useState('')
  /** Set once "Delete everything instead" is tapped, to ask for it a second time. */
  const [purging, setPurging] = useState<number | null>(null)
  const [newName, setNewName] = useState('')

  const elements = useRef(new Map<string, HTMLLIElement>())
  /**
   * The layout as it was when the drag began, and what was grabbed. Every move is computed
   * from this, never from the previous move's result; the bands measured against it live in
   * `drag`, and are not measured again either — see `slotAt` for why.
   */
  const start = useRef<{
    layout: ArrangedSection[]
    rows: ArrangeRow[]
    held: { kind: 'song'; slug: string } | { kind: 'section'; id: number }
  } | null>(null)
  /**
   * The last layout a drag produced. Saved on release instead of `layout`, which can be a
   * render behind it: a move made by the frame loop, not by an event, is not flushed before
   * the pointer-up that follows.
   */
  const latest = useRef<ArrangedSection[]>(server)
  /**
   * Where the grabbed section's header sat just before a section drag collapses every
   * other one out from under it. See the `useLayoutEffect` below for what this is for.
   */
  const anchor = useRef<number | null>(null)
  /** Saves run one after another, so the last layout let go is the last one written. */
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const drag = useRowDrag({
    onSlot: (slot) => {
      const from = start.current
      if (from === null) return

      const held = from.held
      let next = from.layout
      if (held.kind === 'song') {
        const place = placeAtSlot(from.rows, held.slug, slot)
        if (place !== null) next = moveSongTo(from.layout, held.slug, place)
      } else {
        const index = from.layout.findIndex((group) => group.sectionId === held.id)
        if (index !== -1) next = moveToSlot(from.layout, index, slot)
      }

      latest.current = next
      setLayout(next)
    },
    onRelease: () => {
      // A section drag released before its layout effect could arm has no start and no
      // layout of its own yet; `latest` would still hold a previous drag's result, so it
      // must not be saved. `start` is the tell, read before it is cleared.
      const dragged = start.current !== null
      setDragging(null)
      start.current = null
      if (dragged) save(latest.current)
    },
    coveredAbove: topBarBottom,
  })

  /*
   * Adopt the songbook again when its parts change under us — an import, a song moved
   * out, a section removed on another device — but keep the local order while they are the
   * same parts. Comparing membership rather than order is what makes that possible: the
   * order on screen is deliberately ahead of the order the server has been told about.
   */
  useEffect(() => {
    setLayout((current) => {
      const sameSections = sameMembers(
        current.map((group) => group.sectionId),
        server.map((group) => group.sectionId),
      )
      const sameSongs = sameMembers(
        current.flatMap((group) => group.slugs),
        server.flatMap((group) => group.slugs),
      )

      if (sameSections && sameSongs) return current

      /*
       * Whatever is being dragged might be exactly what just left — a section removed,
       * or its last song moved out, from another device. A drag like that can never be
       * released the ordinary way: the release ends the drag through the window listeners,
       * but a row that has vanished emits no release of its own. Left alone, `dragging`
       * would stay set forever, and every song and "Empty" placeholder would stay hidden
       * for the rest of the visit — so its drag is cancelled here.
       */
      const stillThere =
        dragging === null
          ? true
          : dragging.kind === 'section'
            ? server.some((group) => group.sectionId === dragging.id)
            : server.some((group) => group.slugs.includes(dragging.slug))

      if (!stillThere) {
        drag.cancel()
        setDragging(null)
        start.current = null
      }

      return server
    })
  }, [server, dragging, drag])

  const rows = useMemo(() => rowsOf(layout), [layout])

  const save = (next: ArrangedSection[]) => {
    if (arrangementKey(next) === arrangementKey(server)) return

    setError(null)
    queue.current = queue.current.then(async () => {
      try {
        const result = await state.arrange(songbookSlug, next)
        if (result.ok) {
          onApplied(next.flatMap((group) => group.slugs))
          return
        }

        setError(writeMessage(result))
        // Back to the layout the database is known to hold.
        setLayout(server)
      } catch {
        setError(writeMessage({ reason: 'failed' }))
        setLayout(server)
      }
    })
  }

  /*
   * The one site that cannot hand its result straight to `writeMessage`: `action` is typed
   * structurally so that any section write can be passed to it, which leaves `reason`
   * optional — and testing `result.reason !== undefined` narrows that expression without
   * narrowing the object it came from, so the object itself is not assignable. `limit` is
   * carried in the structural type and forwarded by hand so that a wrapper this generic
   * cannot be the thing that loses one — today every action passed here is gated only by
   * `editRepertoire` and can answer nothing but `frozen`, which has no cap to lose, so the
   * forwarding is for the section cap that does not exist yet rather than for a live case.
   */
  const run = async (action: () => Promise<{ ok: boolean; reason?: WriteFailure; limit?: LimitFacts }>) => {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      if (!result.ok && result.reason !== undefined) {
        setError(writeMessage({ reason: result.reason, limit: result.limit }))
      }
      return result.ok
    } catch {
      setError(writeMessage({ reason: 'failed' }))
      return false
    } finally {
      setBusy(false)
    }
  }

  /** In page coordinates — see `Band` for why not the viewport's. */
  const bandOf = (key: string): Band => {
    const rect = elements.current.get(key)?.getBoundingClientRect()
    const top = (rect?.top ?? 0) + window.scrollY
    return { top, bottom: top + (rect?.height ?? 0) }
  }

  /** In viewport coordinates: for comparing where a row is on screen before and after a scroll. */
  const screenTop = (key: string): number =>
    elements.current.get(key)?.getBoundingClientRect().top ?? 0

  const beginSong = (event: React.PointerEvent<HTMLButtonElement>, slug: string) => {
    start.current = { layout, rows, held: { kind: 'song', slug } }
    latest.current = layout
    drag.begin(event)
    drag.arm(rows.map((row) => bandOf(keyOf(row))))
    setDragging({ kind: 'song', slug })
  }

  /**
   * Starting a section drag also collapses every section down to its header row (see the
   * render below), so the finger can see — and reach — the whole stack of sections at once
   * instead of scrolling through songs it isn't allowed to touch right now. That collapse
   * happens through React, not here, so this handler cannot measure bands itself: the DOM
   * it would read from is still the tall, pre-collapse one, since a state update doesn't
   * take effect until after this synchronous handler returns. The measurement is deferred
   * to the `useLayoutEffect` below, which runs once the collapsed layout has actually been
   * painted into the DOM.
   */
  const beginSection = (event: React.PointerEvent<HTMLButtonElement>, id: number) => {
    // Where this header sits *before* the collapse the effect below is about to cause —
    // read now, on the DOM as it still is, because a moment from now every other section
    // will have moved and this row along with them.
    anchor.current = screenTop(`section:${id}`)
    // Left null, and `drag` left unarmed, so a stray move in the gap before the effect
    // below runs has nothing to work from; `latest` set to the current layout so a release
    // in that same gap saves nothing new rather than a previous drag's result.
    start.current = null
    latest.current = layout
    drag.begin(event)
    setDragging({ kind: 'section', id })
  }

  /*
   * Measures the bands for a section drag once the collapsed, header-only layout has been
   * committed to the DOM but before the browser paints it — the same moment `beginSection`
   * itself cannot reach, since it fires synchronously inside `onPointerDown`, before React
   * has re-rendered anything.
   *
   * Collapsing every section down to its header does not just shrink them — it moves them,
   * the grabbed one included, unless it happened to be first. The finger has not moved at
   * all yet, but the row underneath it has: `slotAt`'s whole premise, that the finger
   * starts in a gap around the row it grabbed, would already be false on the very first
   * pointer event. So before measuring anything, this scrolls by exactly however far the
   * grabbed header moved, putting it back where the finger still is — which is what makes
   * the collapse read as the songs vanishing rather than as the section jumping.
   *
   * That scroll can be clamped — there may be nowhere further up to scroll into — so the
   * fix does not stop at the `scrollBy`. Whatever gap it could not close is measured
   * afterwards, on screen, and folded into every band as one flat offset, so the
   * coordinates used for hit-testing agree with where the grabbed row actually ended up
   * even on a page that could not fully compensate.
   *
   * Once corrected this way, a section's band is simply its own header row's rect — no more
   * reaching from a group's first row to its last, because collapsed there is nothing else
   * in a group left to reach across.
   */
  useLayoutEffect(
    () => {
      if (dragging?.kind !== 'section') return
      // The drag can already be over — released within the frame before this effect ran —
      // in which case there is nothing left to arm.
      if (!drag.active) return

      const before = anchor.current
      const collapsedTop = screenTop(`section:${dragging.id}`)

      if (before !== null) window.scrollBy({ top: collapsedTop - before, behavior: 'instant' })

      const settledTop = screenTop(`section:${dragging.id}`)
      const offset = before === null ? 0 : before - settledTop

      start.current = { layout, rows, held: { kind: 'section', id: dragging.id } }
      latest.current = layout
      drag.arm(
        layout.map((group) => {
          const band = bandOf(`section:${group.sectionId}`)
          return { top: band.top + offset, bottom: band.bottom + offset }
        }),
      )
    },
    // Deliberately not exhaustive: `layout` and `rows` are read once and then meant to go
    // stale for the rest of the drag, exactly like `beginSong`'s bands do — only a *new*
    // drag (a fresh `dragging` object) should take a fresh reading. Depending on `layout`
    // too would re-measure after every move this same drag causes, which is the "bands
    // measured again mid-drag" bug this whole file is written to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragging],
  )

  const arrowKeys = (event: React.KeyboardEvent, act: (delta: number) => void) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    // Or the page scrolls instead of the row moving.
    event.preventDefault()
    act(event.key === 'ArrowUp' ? -1 : 1)
  }

  const others = (id: number) => divisions.filter((section) => section.id !== id)

  /*
   * Mid-section-drag, every row but the headers drops out here, so the eye sees exactly the
   * stack of sections it is reordering and nothing it would have to scroll past to reach
   * the next one.
   */
  const drawn = dragging?.kind === 'section' ? rows.filter((row) => row.kind === 'section') : rows

  return (
    <div className="card pt-2.5">
      {error !== null && (
        <p className="notice notice-error mx-2.5 mb-2.5" role="alert">
          {error}
        </p>
      )}

      <ul>
        {drawn.map((row) => {
          const key = keyOf(row)

          if (row.kind === 'section') {
            const name = nameById.get(row.sectionId) ?? ''
            const held = layout.find((group) => group.sectionId === row.sectionId)?.slugs ?? []
            const isRenaming = renaming === row.sectionId
            const isRemoving = removing === row.sectionId
            const place = layout.findIndex((group) => group.sectionId === row.sectionId)

            return (
              <li
                key={key}
                ref={(element) => {
                  if (element === null) elements.current.delete(key)
                  else elements.current.set(key, element)
                }}
                className={`row px-2.5 ${
                  dragging?.kind === 'section' && dragging.id === row.sectionId
                    ? 'row-dragging'
                    : ''
                }`}
              >
                {isRenaming ? (
                  <>
                    <input
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setRenaming(null)
                      }}
                      aria-label={`New name for ${name}`}
                      className="form-field flex-1"
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy || draft.trim() === ''}
                      onClick={async () => {
                        if (await run(() => state.renameSection(row.sectionId, draft))) {
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
                    <button
                      type="button"
                      className="drag-handle"
                      onPointerDown={(event) => beginSection(event, row.sectionId)}
                      onKeyDown={(event) =>
                        arrowKeys(event, (delta) => {
                          const next = moveItem(layout, place, place + delta)
                          if (next === layout) return
                          setLayout(next)
                          save(next)
                        })
                      }
                      aria-label={`Move section ${name}: ${place + 1} of ${layout.length}`}
                    >
                      <IconGrip size={17} />
                    </button>

                    <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                    <span className="count-badge">{held.length}</span>

                    <button
                      type="button"
                      className="icon-button"
                      disabled={busy}
                      onClick={() => {
                        setRenaming(row.sectionId)
                        setDraft(name)
                        setRemoving(null)
                        setError(null)
                      }}
                      aria-label={`Rename ${name}`}
                    >
                      <IconPencil size={17} />
                    </button>
                    {/* Red while its own question is open, so it is clear whose it is. */}
                    <button
                      type="button"
                      className={isRemoving ? 'icon-button is-danger' : 'icon-button'}
                      disabled={busy}
                      onClick={() => {
                        setRemoving(isRemoving ? null : row.sectionId)
                        setDestination(String(others(row.sectionId)[0]?.id ?? ''))
                        setPurging(null)
                        setRenaming(null)
                        setError(null)
                      }}
                      aria-label={`Remove ${name}`}
                      aria-expanded={isRemoving}
                    >
                      <IconTrash size={17} />
                    </button>
                  </>
                )}
              </li>
            )
          }

          if (row.kind === 'gap') {
            return (
              <li
                key={key}
                ref={(element) => {
                  if (element === null) elements.current.delete(key)
                  else elements.current.set(key, element)
                }}
                className="row row-nested text-sm text-muted"
              >
                {/* A line to aim at: a section with no row could never be filled. */}
                Empty. Drag a song here.
              </li>
            )
          }

          const song = titleBySlug.get(row.slug)
          const inside = layout.find((group) => group.sectionId === row.sectionId)?.slugs ?? []

          return (
            <li
              key={key}
              ref={(element) => {
                if (element === null) elements.current.delete(key)
                else elements.current.set(key, element)
              }}
              className={`row row-nested ${
                dragging?.kind === 'song' && dragging.slug === row.slug ? 'row-dragging' : ''
              }`}
            >
              <button
                type="button"
                className="drag-handle"
                onPointerDown={(event) => beginSong(event, row.slug)}
                onKeyDown={(event) =>
                  arrowKeys(event, (delta) => {
                    const next = nudgeSong(layout, row.slug, delta)
                    if (arrangementKey(next) === arrangementKey(layout)) return
                    setLayout(next)
                    save(next)
                  })
                }
                aria-label={`Move ${song?.title ?? row.slug}: ${
                  inside.indexOf(row.slug) + 1
                } of ${inside.length} in ${nameById.get(row.sectionId) ?? ''}`}
              >
                <IconGrip size={17} />
              </button>

              {/*
                * Title only, one line: arranging is moving, not reading, and dropping the
                * artist lets the row shrink to a single line so many more songs fit at once
                * (see `.row-nested`). The artist is back on the reading list, where it
                * helps tell two songs of the same name apart.
                */}
              <span className="min-w-0 flex-1 truncate">{song?.title ?? row.slug}</span>
            </li>
          )
        })}
      </ul>

      {removing !== null && (
        <div className="panel mx-2.5 mb-2.5 p-3.5 text-sm">
          {(() => {
            const id = removing
            const name = nameById.get(id) ?? ''
            const held = layout.find((group) => group.sectionId === id)?.slugs.length ?? 0
            const elsewhere = others(id)

            if (held === 0) {
              return (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1">Remove &quot;{name}&quot;? It&apos;s empty.</span>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={busy}
                    onClick={async () => {
                      if (await run(() => state.removeSection(id, null))) setRemoving(null)
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

            // A second tap of "Delete everything instead", asked once more because
            // nothing here destroys anything quietly.
            if (purging === id) {
              return (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1">
                    Delete &quot;{name}&quot; and all {held} {held === 1 ? 'song' : 'songs'} in
                    it? This can&apos;t be undone.
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={busy}
                    onClick={async () => {
                      if (await run(() => state.purgeSection(id))) {
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

            if (elsewhere.length === 0) {
              return (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1">
                    Contains {held} {held === 1 ? 'song' : 'songs'} and there&apos;s no other
                    section to move them to.
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setPurging(id)}
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
                  <span className="sr-only">Destination section</span>
                  <select
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    className="picker-select"
                  >
                    {elsewhere.map((section) => (
                      <option key={section.id} value={String(section.id)}>
                        {section.name}
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
                    if (await run(() => state.removeSection(id, Number(destination)))) {
                      setRemoving(null)
                    }
                  }}
                >
                  Move and remove
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => setPurging(id)}
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

      <form
        className="flex gap-2 px-2.5 pb-3.5"
        onSubmit={async (event) => {
          event.preventDefault()
          if (await run(() => state.addSection(songbookSlug, newName))) setNewName('')
        }}
      >
        <label className="flex-1">
          <span className="sr-only">New section name</span>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New section"
            className="form-field"
          />
        </label>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || newName.trim() === ''}>
          <IconPlus size={16} />
          Add
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-[1.125rem] pb-4">
        <button type="button" className="btn btn-sm" onClick={onDone}>
          Done
        </button>
        {/*
          * The layout is this screen's own, and it is saved as soon as a row lands. What
          * waits for a rebuild is the pair of arrows inside a song, and the section named
          * in its header, which come from the pages themselves.
          */}
        <span className="text-xs text-muted">
          Saved right away. The arrows inside the song follow it after the next rebuild.
        </span>
      </div>
    </div>
  )
}
