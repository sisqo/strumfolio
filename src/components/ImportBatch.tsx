'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { IconCheck, IconClose, IconInfo, IconPlus } from '@/components/icons'
import { saveSong, songHeadroom } from '@/lib/import/actions'
import type { PreparedSong } from '@/lib/import/prepare'
import { saveMessage, type Decision, type Headroom } from '@/lib/import/types'
import { LIMIT_MESSAGE } from '@/lib/plans/types'

const FORMAT_LABEL: Record<string, string> = {
  chordpro: 'already ChordPro',
  'chords-above': 'chords above lyrics, converted',
  'lyrics-only': 'no chords found',
}

/**
 * Above this many songs the list stops being the thing to read.
 *
 * Twenty songs pasted from a chord site is a list somebody actually checks row by row,
 * and that checking is the whole point of showing it. Two hundred out of an archive is
 * not: nobody reads two hundred rows, so a screen that insists on them is a screen that
 * gets scrolled past to the button — which turns the preview from a safeguard into an
 * obstacle. Past the threshold the counts lead and the list follows, still one click
 * away for anybody who wants it.
 *
 * Fifty is a judgement, not a measurement, and `PLAN-import.md` records it as one.
 */
const SUMMARY_THRESHOLD = 50

/** What to do about a song that is already in the repertoire. */
type Policy = 'skip' | 'replace' | 'add'

const POLICY_LABEL: Record<Policy, string> = {
  skip: 'skip the ones already present',
  replace: 'replace the ones already present',
  add: 'add them anyway, as duplicates',
}

type Outcome =
  | { state: 'waiting' }
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'skipped'; existing: string }
  /**
   * Refused by the plan — a cap, or a frozen repertoire. Its own state rather than a
   * `failed` with a different message, because the difference is whether pressing Retry
   * can do anything: it cannot, and a row left in `attempts` would put that button back in
   * front of somebody and count them into "Retry with 4 songs".
   */
  | { state: 'refused'; message: string }
  | { state: 'failed'; message: string }

interface Row extends PreparedSong {
  include: boolean
  outcome: Outcome
}

/**
 * Already in the database, one way or another.
 *
 * A run that half worked has to be repeatable — that is the point of saying which
 * row failed — and repeating it must not write the ones that succeeded a second
 * time. Rows past this line also stop taking edits: the song exists now, and the
 * editor is where it changes.
 */
const settled = (row: Row) =>
  row.outcome.state === 'saved' || row.outcome.state === 'skipped' || row.outcome.state === 'refused'

/**
 * Several songs from one paste, shown before any of them is saved.
 *
 * The list is the point: the cut into songs and the reading of each heading are
 * guesses, and a paste of twenty songs is where a guess going wrong is most
 * expensive to undo. So every song arrives with its title and artist editable and
 * its words one tap away, and nothing is written until the button is pressed.
 *
 * Saved one at a time, in order, on purpose. Two saves at once would each read the
 * list of taken slugs before the other had written, and two songs would end up
 * asking for the same one. It also means each row can say what happened to it,
 * which is what makes a partial failure — three saved, one already there, one
 * refused — something you can act on rather than one summary line.
 */
export function ImportBatch({
  songs,
  songbookSlug,
  songbookName,
  sectionId,
  sectionName,
  online,
  onDone,
  onReset,
}: {
  songs: PreparedSong[]
  /** Where all of them go: chosen once, at the top of the screen. */
  songbookSlug: string
  songbookName: string
  /**
   * And into which section of it, chosen in the same breath — the fallback
   * for a row that names none of its own; see `row.declaresSection` in `run`.
   */
  sectionId: number | null
  sectionName: string | null
  online: boolean
  /**
   * Called once the run is over, so the screen can refresh what it shows. The argument
   * is whether every included row is now settled — nothing left that a retry could
   * still fix — which is what lets the caller tell "done, move on" apart from "some
   * rows still need another try": `false` while a failed row remains, even if every
   * other row in the batch saved.
   */
  onDone: (allSettled: boolean) => Promise<void>
  onReset: () => void
}) {
  const [rows, setRows] = useState<Row[]>(
    songs.map((song) => ({ ...song, include: true, outcome: { state: 'waiting' } })),
  )
  const [policy, setPolicy] = useState<Policy>('skip')
  const [busy, setBusy] = useState(false)
  const [ran, setRan] = useState(false)
  /**
   * How far a long run has got, so the wait is legible rather than merely long.
   *
   * `total` is captured when the run starts and not read off `attempts`: rows settle as
   * the loop goes, so `attempts.length` shrinks under it — a counter reading off that
   * would climb towards a number that is walking away from it, «5 of 200» becoming
   * «5 of 195» with nothing having gone wrong.
   */
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [headroom, setHeadroom] = useState<Headroom | null>(null)
  const [showAll, setShowAll] = useState(false)

  const attempts = rows.filter((row) => row.include && !settled(row))
  const untitled = attempts.filter((row) => row.title.trim() === '').length
  const done = ran && !busy && attempts.length === 0

  /*
   * Asked once, before anything is written, and only for a run big enough for the answer
   * to matter. On a free account a 212-song archive would otherwise be refused on rows 31
   * through 212 — a hundred and eighty-two refusals with one remedy between them, none of
   * them news after the first. `songHeadroom` reads through the same `entitlementsOf` and
   * `countRepertoire` the refusal itself will, so the number cannot promise room the save
   * then denies.
   */
  useEffect(() => {
    let live = true
    void songHeadroom().then((found) => {
      if (live) setHeadroom(found)
    })
    return () => {
      live = false
    }
  }, [])

  /** The rows worth looking at individually, whatever the size of the run. */
  const exceptions = rows.filter(
    (row) => row.include && !settled(row) && (row.title.trim() === '' || row.format === 'lyrics-only'),
  )
  const long = rows.length > SUMMARY_THRESHOLD
  const listed = !long || showAll ? rows : exceptions

  const noChords = attempts.filter((row) => row.format === 'lyrics-only').length

  /**
   * How many of this run the plan will actually take.
   *
   * Null whenever there is nothing to warn about — no cap, or room enough — so the
   * caller can branch on the fact rather than re-deriving the comparison.
   */
  const overCap =
    headroom === null || headroom.fits === null || headroom.frozen || headroom.fits >= attempts.length
      ? null
      : headroom.fits

  const patch = (id: number, change: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)))
  }

  const run = async () => {
    setBusy(true)
    setRan(true)

    /*
     * Tracked locally rather than read back off `rows` state after the loop: `patch`
     * only queues a `setRows`, so the state this closure captured at the top of `run`
     * would still show every row as it was before this run started. A row settles the
     * moment its own outcome is anything but `'failed'`; only a failure among the rows
     * actually attempted this run means there is still something a retry could fix.
     */
    let anyUnresolved = false
    let attempted = 0
    const total = rows.filter((row) => row.include && !settled(row)).length
    setProgress({ done: 0, total })

    for (const row of rows) {
      if (!row.include || settled(row)) continue

      patch(row.id, { outcome: { state: 'saving' } })
      setProgress({ done: ++attempted, total })

      // `undefined` is what asks the server to stop at a twin instead of writing.
      const decision: Decision | undefined = policy === 'skip' ? undefined : policy

      // A row's own `{division: ...}` wins over the section chosen above it,
      // now that there is no explicit per-row pick for it to override — see
      // `resolveSection`'s own comment on why an id always outranks a name.
      const declaredSection = row.declaresSection?.trim() || null

      try {
        const result = await saveSong(
          {
            title: row.title,
            artist: row.artist,
            tags: row.tags.split(',').map((tag) => tag.trim()).filter((tag) => tag !== ''),
            link1: row.link1,
            link2: row.link2,
            link3: row.link3,
            songbookSlug,
            sectionId: declaredSection !== null ? null : sectionId,
            sectionName: declaredSection,
            body: row.body,
          },
          decision,
        )

        if (result.ok) {
          patch(row.id, { outcome: { state: 'saved' } })
        } else if (result.reason === 'duplicate') {
          patch(row.id, {
            outcome: { state: 'skipped', existing: result.existing.title },
          })
        } else if (Object.hasOwn(LIMIT_MESSAGE, result.reason)) {
          /*
           * Membership in `LIMIT_MESSAGE` rather than a hand-written list of reasons: a
           * fifth `LimitReason` added later is refused here automatically, where a pair of
           * string comparisons would quietly start calling it a failure and re-offering
           * Retry. Each row is its own `saveSong` call from this browser — the server never
           * sees a batch — so one refusal does not stop the rest of the paste.
           *
           * `LIMIT_MESSAGE` is still the membership test even though the *message* now comes
           * from `saveMessage`: the map is the list of plan reasons, and what separates a
           * refused row from a failed one is which kind of reason arrived, not what it ends
           * up saying. `saveMessage` prints the cap when the refusal carries one, so the
           * rows of a paste that ran into the song limit all read «This plan goes up to 30
           * songs in all.» instead of thirty copies of a sentence with no number in it.
           */
          patch(row.id, { outcome: { state: 'refused', message: saveMessage(result) } })
        } else {
          patch(row.id, { outcome: { state: 'failed', message: saveMessage(result) } })
          anyUnresolved = true
        }
      } catch {
        patch(row.id, { outcome: { state: 'failed', message: saveMessage({ reason: 'failed' }) } })
        anyUnresolved = true
      }
    }

    setBusy(false)
    await onDone(!anyUnresolved)
  }

  const counted = (state: Outcome['state']) =>
    rows.filter((row) => row.outcome.state === state).length

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">{songs.length} songs in this text</h2>
        <button type="button" className="text-sm underline underline-offset-2" onClick={onReset}>
          paste more
        </button>
      </div>

      <p className="mt-1 text-sm text-muted">
        {long
          ? 'Too many to read one by one, so what follows is what stands out. They all go into '
          : 'Check each one’s title and artist: they’re pulled from the first lines, and some songs will have them wrong. They all go into '}
        <strong className="font-medium">
          {songbookName}
          {sectionName !== null && ` · ${sectionName}`}
        </strong>
        {' '}— except a song whose own text names a section, which is used instead (created
        first, if this songbook doesn&apos;t have it yet).
      </p>

      {/*
        * Past the threshold the counts lead. Only the two that a person can still do
        * something about are listed — a missing title blocks the run, and «no chords
        * found» is the guess most worth a second look — plus how many raised nothing at
        * all, which is the reassuring number and the one that makes the rest legible.
        */}
      {long && (
        <ul className="mt-3 grid gap-1 text-sm">
          {untitled > 0 && (
            <li className="text-muted">
              <strong className="font-medium text-ink">{untitled}</strong> without a title
            </li>
          )}
          {noChords > 0 && (
            <li className="text-muted">
              <strong className="font-medium text-ink">{noChords}</strong> with no chords found
            </li>
          )}
          <li className="text-muted">
            <strong className="font-medium text-ink">{attempts.length - exceptions.length}</strong>{' '}
            with nothing to flag
          </li>
          <li>
            <button
              type="button"
              className="text-sm underline underline-offset-2"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? 'show only the ones to check' : `show all ${rows.length}`}
            </button>
          </li>
        </ul>
      )}

      <ol className="mt-4 grid gap-3">
        {listed.map((row) => (
          <BatchRow
            key={row.id}
            row={row}
            index={rows.indexOf(row)}
            songbookName={songbookName}
            sectionName={sectionName}
            busy={busy}
            onPatch={patch}
          />
        ))}
      </ol>

      <label className="mt-4 block">
        <span className="field-label">If a song is already in the archive</span>
        <select
          value={policy}
          onChange={(event) => setPolicy(event.target.value as Policy)}
          disabled={busy}
          className="form-field"
        >
          {(Object.keys(POLICY_LABEL) as Policy[]).map((entry) => (
            <option key={entry} value={entry}>
              {POLICY_LABEL[entry]}
            </option>
          ))}
        </select>
      </label>

      {untitled > 0 && (
        <p className="notice notice-accent mt-4" role="status">
          <IconInfo />
          {untitled === 1
            ? 'One song has no title: give it one, or exclude it.'
            : `${untitled} songs have no title: give them one, or exclude them.`}
        </p>
      )}

      {/*
        * Said once, before anything is written, instead of once per refused row. The
        * remedy is the same for every one of them, so a hundred and eighty copies of it
        * would be a hundred and seventy-nine repetitions — and this one arrives while
        * there is still a choice to make, which none of those would.
        */}
      {!ran && overCap !== null && (
        <p className="notice notice-accent mt-4" role="status">
          <IconInfo />
          <span>
            Your plan holds {headroom?.max} songs in all, and you have {headroom?.held}.{' '}
            {overCap === 0
              ? 'There is no room for any of these.'
              : `Of these ${attempts.length}, the first ${overCap} will fit.`}{' '}
            <Link href="/pricing" className="underline underline-offset-2">
              See the plans
            </Link>
            .
          </span>
        </p>
      )}

      {/* A repertoire already over its caps cannot take a song at all, and the answer is
          a deletion rather than a purchase — a different sentence with a different remedy,
          which is why `frozen` is its own branch and not a headroom of zero. */}
      {!ran && headroom?.frozen === true && (
        <p className="notice notice-accent mt-4" role="status">
          <IconInfo />
          Your repertoire is over your plan&apos;s limits, so nothing can be added until some
          songs are deleted.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* Once everything chosen is written, the only thing left to do is paste more. */}
        {done ? (
          <button type="button" className="btn btn-primary" onClick={onReset}>
            Paste more songs
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!online || busy || attempts.length === 0 || untitled > 0}
            onClick={() => void run()}
          >
            {busy
              ? // The count is what makes a long run legible: a bare «Importing…» beside a
                // two-hundred-song archive says nothing about whether to keep waiting.
                `Importing ${progress.done} of ${progress.total}…`
              : attempts.length === 1
                ? `${ran ? 'Retry with' : 'Import'} 1 song`
                : `${ran ? 'Retry with' : 'Import'} ${attempts.length} songs`}
          </button>
        )}

        {ran && !busy && (
          <span className="text-sm text-muted" role="status">
            {counted('saved')} saved
            {counted('skipped') > 0 && `, ${counted('skipped')} already present`}
            {counted('refused') > 0 && `, ${counted('refused')} not allowed by your plan`}
            {counted('failed') > 0 && `, ${counted('failed')} failed`}.
          </span>
        )}
      </div>

      {/*
        * One notice for the whole batch rather than repeating this on every refused row —
        * each row already prints its own numbered `saveMessage` (see `run`, above), so this
        * adds the one thing none of them could: a way to actually see the plans, the same
        * `/pricing` link `SongbookSongs`' own "Create" button opens as a dialog for the
        * identical refusal. A dialog per row would be excessive for a paste that can refuse
        * several at once; one line here says it for all of them.
        */}
      {ran && !busy && counted('refused') > 0 && (
        <p className="notice notice-accent mt-3" role="status">
          <IconInfo />
          <span>
            {counted('refused') === 1 ? "One song wasn't" : `${counted('refused')} songs weren't`} allowed by
            your plan.{' '}
            <Link href="/pricing" className="underline">
              See plans
            </Link>
          </span>
        </p>
      )}
    </div>
  )
}

/**
 * One song of the paste: what was read out of it, and what became of it.
 *
 * The title carries the weight and the artist sits under it in small type, which is
 * how a song is written everywhere else in the app — with two bare boxes of the same
 * size, the second one reads as a second title.
 */
function BatchRow({
  row,
  index,
  songbookName,
  sectionName,
  busy,
  onPatch,
}: {
  row: Row
  index: number
  songbookName: string
  sectionName: string | null
  busy: boolean
  onPatch: (id: number, change: Partial<Row>) => void
}) {
  const locked = busy || settled(row)
  const number = index + 1

  return (
    <li className={`panel p-3 ${row.include ? '' : 'opacity-60'}`}>
      <div className="flex items-start gap-3">
        <span className="meta-chip mt-1.5" aria-hidden>
          {number}
        </span>

        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="sr-only">Title of song {number}</span>
            <input
              value={row.title}
              onChange={(event) => onPatch(row.id, { title: event.target.value })}
              placeholder="Title"
              disabled={locked}
              className="form-field font-medium"
            />
          </label>
          <label className="block">
            <span className="sr-only">Artist of song {number}</span>
            <input
              value={row.artist}
              onChange={(event) => onPatch(row.id, { artist: event.target.value })}
              placeholder="Artist"
              disabled={locked}
              className="form-field text-sm"
            />
          </label>
        </div>

        {!settled(row) && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={() => onPatch(row.id, { include: !row.include })}
            aria-label={row.include ? `Don't import song ${number}` : `Import song ${number}`}
          >
            {row.include ? <IconClose size={15} /> : <IconPlus size={15} />}
          </button>
        )}
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>{FORMAT_LABEL[row.format] ?? row.format}</span>
        {/* Said, not obeyed: which songbook a row names is never honoured — see `resolveSection`'s own comment on why. */}
        {row.declares !== null && row.declares !== songbookName && (
          <span>the text says «{row.declares}»</span>
        )}
        {/* Said, and obeyed: this row's own section wins over the one chosen above. */}
        {row.declaresSection !== null && row.declaresSection !== sectionName && (
          <span>will use its own section «{row.declaresSection}»</span>
        )}
        <Status outcome={row.outcome} include={row.include} />
      </p>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted">Lyrics and chords</summary>
        <textarea
          value={row.body}
          onChange={(event) => onPatch(row.id, { body: event.target.value })}
          rows={8}
          spellCheck={false}
          disabled={locked}
          aria-label={`ChordPro body of song ${number}`}
          className="form-field mt-2 font-mono text-xs"
        />
      </details>
    </li>
  )
}

/** What became of one song, in the row's own line of small print. */
function Status({ outcome, include }: { outcome: Outcome; include: boolean }) {
  if (!include) return <span>excluded</span>

  switch (outcome.state) {
    case 'waiting':
      return null
    case 'saving':
      return <span>saving…</span>
    case 'saved':
      return (
        <span className="inline-flex items-center gap-1 text-accent">
          <IconCheck size={12} />
          saved
        </span>
      )
    case 'skipped':
      return <span>already in the archive as «{outcome.existing}»</span>
    case 'refused':
      return <span className="text-danger">{outcome.message}</span>
    case 'failed':
      return <span className="text-danger">{outcome.message}</span>
  }
}
