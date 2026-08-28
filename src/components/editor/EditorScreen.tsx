'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { ControlBar } from '@/components/ControlBar'
import { SongFields, type SongFieldValues } from '@/components/SongFields'
import { SongSheet } from '@/components/SongSheet'
import { useSongbooks } from '@/components/SongbookProvider'
import { PlanUpgradeModal, type PlanNotice } from '@/components/PlanUpgradeModal'
import { type Caret, GraphicEditor } from '@/components/editor/GraphicEditor'
import { UnsavedGuard } from '@/components/editor/UnsavedGuard'
import {
  IconBridge,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconChorus,
  IconCode,
  IconComment,
  IconEye,
  IconInfo,
  IconPencil,
  IconPlus,
  IconRemoveLine,
  IconTab,
  IconTrash,
  IconUndo,
} from '@/components/icons'
import { chordTokens, parseChordPro } from '@/lib/chordpro'
import type { Song } from '@/lib/data/types'
import { type SongDocument, fromSource, readLyricLine, toSource } from '@/lib/editor/document'
import { addChord, insertTab, removeLine, toggleComment, toggleSection } from '@/lib/editor/edits'
import { deleteSong, saveSong } from '@/lib/import/actions'
import { saveMessage, type SaveRefusal } from '@/lib/import/types'
import { LIMIT_MESSAGE, type LimitReason } from '@/lib/plans/types'
import { dropEdit, writeEdit } from '@/lib/library/store'

type Mode = 'graphic' | 'source' | 'preview'

const MODES: { mode: Mode; label: string; icon: typeof IconPencil }[] = [
  { mode: 'graphic', label: 'Graphic', icon: IconPencil },
  { mode: 'source', label: 'Source', icon: IconCode },
  { mode: 'preview', label: 'Preview', icon: IconEye },
]

/**
 * The commands that act on the line the cursor is in, in the order they are used:
 * mark a chorus, mark a bridge, turn the line into a comment, drop in a tab, take
 * the line out.
 *
 * A table rather than six buttons written out, because they now differ only in an
 * icon, a name and one call — and six copies of the same markup is where a label
 * and an action drift apart.
 *
 * Tab is the one insertion in the row rather than a transform of the line the
 * cursor is on — turning existing lyrics into a tab makes no sense the way turning
 * them into a comment does, so it adds a fresh block after the cursor instead, the
 * same as the "+ line" button at the foot of the graphic editor.
 */
const COMMANDS: {
  label: string
  icon: typeof IconPencil
  act: (line: number) => (document: SongDocument) => SongDocument
}[] = [
  {
    label: 'Chorus',
    icon: IconChorus,
    act: (line) => (document) => toggleSection(document, line, 'chorus'),
  },
  {
    label: 'Bridge',
    icon: IconBridge,
    act: (line) => (document) => toggleSection(document, line, 'bridge'),
  },
  { label: 'Comment', icon: IconComment, act: (line) => (document) => toggleComment(document, line) },
  {
    label: 'Tab',
    icon: IconTab,
    act: (line) => (document) => insertTab(document, line),
  },
  {
    label: 'Delete line',
    icon: IconRemoveLine,
    act: (line) => (document) => removeLine(document, line),
  },
]

/** Where a raw offset in the source falls, in line-and-letter terms. */
function caretFromRaw(source: string, rawAt: number): Caret {
  const before = source.slice(0, rawAt)
  const lineStart = before.lastIndexOf('\n') + 1

  return {
    line: before.split('\n').length - 1,
    // The chords written before the cursor are not letters of the line.
    at: readLyricLine(before.slice(lineStart)).text.length,
  }
}

/**
 * The editor, on its own page.
 *
 * One song, three ways of looking at it, and a single source string underneath —
 * so switching modes can never lose an edit or show two different songs. The
 * commands act on the line the cursor is in, whichever mode is open, because they
 * are the same operations on the same document.
 *
 * Saving writes the row into the local overlay before leaving, which is what makes
 * the reading page show the new words the moment it opens rather than after its own
 * round trip.
 */
export function EditorScreen({ song }: { song: Song }) {
  const router = useRouter()
  const { songbooks, sections, refresh: refreshSongbooks } = useSongbooks()

  const [mode, setMode] = useState<Mode>('graphic')
  const [source, setSource] = useState(song.body)
  const [fields, setFields] = useState<SongFieldValues>({
    title: song.title,
    artist: song.artist ?? '',
    tags: song.tags.join(', '),
    link1: song.link1 ?? '',
    link2: song.link2 ?? '',
    link3: song.link3 ?? '',
    songbookSlug: song.songbookSlug,
    sectionId: song.sectionId === null ? '' : String(song.sectionId),
  })

  const [caret, setCaret] = useState<Caret>({ line: 0, at: 0 })
  const [editing, setEditing] = useState<{ line: number; chord: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Kept apart from `error` so an unrelated failure cannot overwrite it, same as `SongForm`.
  const [planNotice, setPlanNotice] = useState<PlanNotice | null>(null)
  const [confirming, setConfirming] = useState(false)

  const [history, setHistory] = useState<string[]>([])
  const [future, setFuture] = useState<string[]>([])
  const raw = useRef<HTMLTextAreaElement | null>(null)
  /** Where the caret goes after a command rewrote the source. */
  const rawCaret = useRef<number | null>(null)
  /** What produced the last change, so a burst of typing is one step and not thirty. */
  const lastKind = useRef<string | null>(null)

  const saved = useRef({ source: song.body, fields })
  const dirty =
    source !== saved.current.source ||
    JSON.stringify(fields) !== JSON.stringify(saved.current.fields)

  const parsed = useMemo(() => parseChordPro(source), [source])
  const doc = useMemo(() => fromSource(source), [source])

  /**
   * Whether the Chord command has anywhere to put one: the line the caret is in.
   * Lyrics take a chord, and a still-blank line is promoted by it (`addChord`);
   * a marker, a directive, a comment or a tab have no syllable to hang one from,
   * and a disabled button says so where a silent no-op just looked broken. In
   * Source mode the command types brackets instead, which works anywhere.
   */
  const caretKind = doc.blocks[caret.line]?.kind
  const canChord = mode === 'source' || caretKind === 'lyrics' || caretKind === 'blank'

  useEffect(() => {
    const at = rawCaret.current
    if (at === null || raw.current === null) return

    rawCaret.current = null
    raw.current.focus()
    raw.current.setSelectionRange(at, at)
  }, [source])

  /**
   * Every change to the source goes through here, so a step back is always possible.
   *
   * Typing on one line is one step, however many letters it took: the kind stays the
   * same and nothing new is pushed, so the entry already on the stack is the state
   * from before the burst began. A command is always its own step — those are the
   * changes worth undoing, and two of them throw something away.
   */
  const change = (next: string, kind: string | null) => {
    if (kind === null || kind !== lastKind.current) {
      setHistory((entries) => [...entries, source].slice(-40))
    }

    // A new edit is a fork: what was undone is no longer where Redo can go.
    setFuture((entries) => (entries.length === 0 ? entries : []))
    lastKind.current = kind
    setSource(next)
  }

  const undo = () => {
    const previous = history[history.length - 1]
    if (previous === undefined) return

    setHistory((entries) => entries.slice(0, -1))
    setFuture((entries) => [...entries, source])
    lastKind.current = null
    setSource(previous)
    // The chord it pointed at may not exist in the state coming back.
    setEditing(null)
    setNotice(null)
  }

  const redo = () => {
    const next = future[future.length - 1]
    if (next === undefined) return

    setFuture((entries) => entries.slice(0, -1))
    setHistory((entries) => [...entries, source])
    lastKind.current = null
    setSource(next)
    setEditing(null)
    setNotice(null)
  }

  /**
   * Ctrl/Cmd+Z and its two spellings of redo, everywhere on the screen — the
   * words live in controlled inputs whose own undo history is not this one, so
   * the shortcut must be claimed before the browser spends it there. Registered
   * once, reading the latest closures through a ref, because `source` changes on
   * every keystroke and re-subscribing at that rate says the wrong thing.
   */
  const keys = useRef({ undo, redo })
  useEffect(() => {
    keys.current = { undo, redo }
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return

      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) keys.current.redo()
        else keys.current.undo()
      } else if (key === 'y') {
        event.preventDefault()
        keys.current.redo()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const command = (edit: (document: SongDocument) => SongDocument) => {
    change(toSource(edit(fromSource(source))), null)
    setNotice(null)
  }

  /**
   * A chord where the cursor is.
   *
   * In the graphic mode it is added to the document and opened for typing; in the
   * source mode the brackets are typed into the text, which is what someone reading
   * ChordPro expects to see happen.
   */
  const insertChord = () => {
    if (mode === 'source' && raw.current !== null) {
      const at = raw.current.selectionStart
      change(`${source.slice(0, at)}[]${source.slice(at)}`, null)
      rawCaret.current = at + 1
      return
    }

    const block = doc.blocks[caret.line]
    if (block === undefined || (block.kind !== 'lyrics' && block.kind !== 'blank')) return

    // Where the new chord lands once the chords are back in order. On a blank
    // line there is nothing yet: `addChord` promotes it, and the chord is first.
    const at = block.kind === 'lyrics' ? caret.at : 0
    const chord = block.kind === 'lyrics' ? block.chords.filter((entry) => entry.at <= caret.at).length : 0
    change(toSource(addChord(doc, caret.line, at)), null)
    setEditing({ line: caret.line, chord })
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      const result = await saveSong({
        slug: song.slug,
        title: fields.title,
        artist: fields.artist,
        tags: fields.tags.split(',').map((tag) => tag.trim()).filter((tag) => tag !== ''),
        link1: fields.link1,
        link2: fields.link2,
        link3: fields.link3,
        songbookSlug: fields.songbookSlug,
        sectionId: fields.sectionId === '' ? null : Number(fields.sectionId),
        body: source,
      })

      if (!result.ok) {
        /*
         * A plan limit gets the dialog with a way out, not a red line of text — the same
         * treatment `SongForm` and `SongbookSongs` already give the identical `SaveResult`.
         * This screen reaches the very same `saveSong`, so it can be refused for the very same
         * reasons: a frozen account (over the caps after a downgrade) refused every edit here,
         * and a stale `songbookSlug` can still come back as a numbered songbook limit — a
         * refusal with a real remedy on `/pricing` that used to be dropped on the floor.
         */
        if (Object.hasOwn(LIMIT_MESSAGE, result.reason)) {
          // Guarded by the membership check above, same cast as the other two call sites:
          // `duplicate` is not a key of `LIMIT_MESSAGE`, so this is the `SaveRefusal` branch.
          const refusal = result as SaveRefusal
          setPlanNotice({ reason: refusal.reason as LimitReason, limit: refusal.limit })
          return
        }
        setError(saveMessage(result))
        return
      }

      // The reading page reads this before it asks the server anything.
      writeEdit(result.song)
      saved.current = { source, fields }
      setNotice('Saved. It shows right away in the song; publish it to have it offline too.')
      await refreshSongbooks()
    } catch {
      setError(saveMessage({ reason: 'failed' }))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    const result = await deleteSong(song.slug)
    setBusy(false)

    if (!result.ok) {
      setError(saveMessage(result))
      return
    }

    dropEdit(song.slug)
    router.push('/')
  }

  return (
    <div>
      {/* Covers the header's links too, which no unload event would catch. */}
      <UnsavedGuard when={dirty} />

      {planNotice !== null && <PlanUpgradeModal notice={planNotice} onClose={() => setPlanNotice(null)} />}

      <div className="editor-head">
        {/*
          * Where you are, and the two things you do to what you changed.
          *
          * The title is here because the header above says the app's own name and
          * nothing else on this screen says which song is open — in the graphic mode
          * the words are the song, and its name is not among them.
          */}
        <div className="editor-bar">
          <Link
            href={`/songs/${song.slug}`}
            className="icon-button"
            title="Back to song"
            aria-label="Back to song"
          >
            <IconChevronLeft size={20} />
          </Link>

          <span className="editor-title">{fields.title.trim() === '' ? 'untitled' : fields.title}</span>

          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={history.length === 0}
            onClick={undo}
            title="Undo last edit"
            aria-label="Undo last edit"
          >
            <IconUndo size={15} />
            Undo
          </button>

          {/* Enabled means there is something unsaved: no second label for it. */}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !dirty || fields.title.trim() === ''}
            onClick={() => void save()}
          >
            <IconCheck size={14} />
            Save
          </button>
        </div>

        {/*
          * Three ways of looking at the same song, as icons.
          *
          * Words here cost the row: "Graphic · Source · Preview" filled it on its
          * own, which is what pushed the title and the commands onto lines of their
          * own and made the whole block too tall to keep in place. Each still carries
          * its name for a pointer and for a screen reader.
          */}
        <div className="editor-modes" role="tablist" aria-label="Edit mode">
          <div className="segment">
            {MODES.map((entry) => (
              <button
                key={entry.mode}
                type="button"
                role="tab"
                aria-selected={mode === entry.mode}
                title={entry.label}
                aria-label={entry.label}
                className={`segment-button segment-wide ${mode === entry.mode ? 'is-on' : ''}`}
                onClick={() => setMode(entry.mode)}
              >
                <entry.icon size={17} />
              </button>
            ))}
          </div>
        </div>

        {mode !== 'preview' && (
          <div className="editor-tools">
            <div className="editor-tools-scroll">
              {/*
                * Only this one keeps its word. It is the command reached for most, it
                * is the one whose icon — a plus — says least on its own, and one label
                * in the row is what tells you the rest are commands too.
                */}
              <button
                type="button"
                className="btn btn-inset btn-sm"
                disabled={!canChord}
                onClick={insertChord}
                title={canChord ? undefined : 'Put the cursor on a line of words first'}
              >
                <IconPlus size={15} />
                Chord
              </button>

              {COMMANDS.map((entry) => (
                <button
                  key={entry.label}
                  type="button"
                  className="btn btn-inset btn-sm btn-square"
                  title={entry.label}
                  aria-label={entry.label}
                  onClick={() => command(entry.act(caret.line))}
                >
                  <entry.icon size={16} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error !== null && (
        <p className="notice notice-error mt-4" role="alert">
          {error}
        </p>
      )}

      {notice !== null && (
        <p className="notice mt-4" role="status">
          <IconInfo />
          {notice}
        </p>
      )}

      {/*
        * The chevron replaces the triangle the browser draws, which was the one thing
        * on this screen not in the app's own hand. It turns when the card opens.
        */}
      <details className="card editor-data mt-4 p-4">
        <summary>
          <IconChevronRight size={14} className="editor-data-arrow" />
          <span className="text-sm font-medium">
            Song data
            <span className="text-muted">
              {' — '}
              {fields.title || 'untitled'}
              {fields.artist !== '' && ` · ${fields.artist}`}
            </span>
          </span>
        </summary>

        <div className="mt-4">
          <SongFields
            values={fields}
            songbooks={songbooks}
            sections={sections}
            onChange={(field, value) => setFields((current) => ({ ...current, [field]: value }))}
          />
        </div>
      </details>

      {mode === 'graphic' && (
        <GraphicEditor
          source={source}
          caret={caret}
          editing={editing}
          onChange={change}
          onCaret={setCaret}
          onEditing={setEditing}
        />
      )}

      {mode === 'source' && (
        <textarea
          ref={raw}
          className="editor-raw"
          value={source}
          spellCheck={false}
          onChange={(event) => {
            change(event.target.value, 'raw')
            setCaret(caretFromRaw(event.target.value, event.target.selectionStart))
          }}
          onSelect={(event) =>
            setCaret(caretFromRaw(source, event.currentTarget.selectionStart))
          }
          aria-label="ChordPro source"
        />
      )}

      {mode === 'preview' && (
        <>
          <SongSheet song={parsed} />
          {/*
            * The reader's own bar, not a copy of it: the point of this mode is to
            * see the song the way it will be read, transposition included.
            */}
          <div className="bar-spacer" />
          <ControlBar songSlug={song.slug} chords={chordTokens(parsed)} />
        </>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: 'var(--surface-2)' }}>
        {confirming ? (
          <>
            <span className="text-sm text-muted">Delete this song?</span>
            <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => void remove()}>
              Delete
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          /*
           * Ink rather than quiet. It deletes the song, and the design says so by
           * making it the one solid dark thing on the screen — with the confirmation
           * still between it and the deletion.
           */
          <button type="button" className="btn btn-ink btn-sm" onClick={() => setConfirming(true)}>
            <IconTrash size={16} />
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
