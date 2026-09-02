import { EditorDemo } from '@/components/EditorDemo'
import { PhoneFrame } from '@/components/PhoneFrame'
import {
  IconBridge,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconChorus,
  IconCode,
  IconComment,
  IconEye,
  IconPencil,
  IconPlus,
  IconRemoveLine,
  IconTab,
  IconTrash,
  IconUndo,
} from '@/components/icons'

/**
 * The editor, whole, in a phone: the head a musician actually presses — the way back,
 * the song's name, Undo and Save, the three ways of looking at it, the line commands —
 * with the living demo (`EditorDemo`) standing where the song itself would be.
 *
 * The chrome is drawn with the editor's **own classes** (`.editor-head`, `.editor-bar`,
 * `.segment`, `.editor-tools`, `.btn`), not with values copied out of the design board.
 * That is the same bargain `EditorDemo` already strikes and for the same reason: a
 * screenshot of the editor goes stale the first time a button moves, and this cannot.
 * It also means the phone shows the editor at the size the editor really is — the board
 * draws several of these controls smaller than the app ships them, deliberately (see
 * `.song-chip`'s own note in globals.css for the one place that reasoning is written
 * down).
 *
 * Nothing here is a button, an anchor or a `<details>`, and the whole block is
 * `aria-hidden`: it is a picture of controls, and a picture whose parts can be tabbed
 * into is a trap. What a screen reader gets is `EditorDemo`'s own `role="img"` label,
 * exactly as it did when the demo stood on the page by itself.
 */
export function EditorPhone() {
  return (
    <PhoneFrame>
      <div className="editor-phone">
        <div className="editor-head" aria-hidden>
          <div className="editor-bar">
            <span className="icon-button">
              <IconChevronLeft size={20} />
            </span>

            <span className="editor-title">Never Lose The Chord</span>

            <span className="btn btn-quiet btn-sm">
              <IconUndo size={15} />
              Undo
            </span>

            <span className="btn btn-primary btn-sm">
              <IconCheck size={14} />
              Save
            </span>
          </div>

          <div className="editor-modes">
            <div className="segment">
              <span className="segment-button segment-wide is-on">
                <IconPencil size={17} />
              </span>
              <span className="segment-button segment-wide">
                <IconCode size={17} />
              </span>
              <span className="segment-button segment-wide">
                <IconEye size={17} />
              </span>
            </div>
          </div>

          <div className="editor-tools">
            <div className="editor-tools-scroll">
              <span className="btn is-inset btn-sm">
                <IconPlus size={15} />
                Chord
              </span>
              <span className="btn is-inset btn-sm btn-square">
                <IconChorus size={16} />
              </span>
              <span className="btn is-inset btn-sm btn-square">
                <IconBridge size={16} />
              </span>
              <span className="btn is-inset btn-sm btn-square">
                <IconComment size={16} />
              </span>
              <span className="btn is-inset btn-sm btn-square">
                <IconTab size={16} />
              </span>
              <span className="btn is-inset btn-sm btn-square">
                <IconRemoveLine size={16} />
              </span>
            </div>
          </div>
        </div>

        <div className="editor-phone-body">
          {/* The real screen opens this card to fill in title, artist and songbook;
              closed is how it spends the rest of its life, and how it is drawn here. */}
          <div className="card editor-data mt-4 p-4" aria-hidden>
            <div className="editor-data-summary">
              <IconChevronRight size={14} className="editor-data-arrow" />
              <span className="text-sm font-medium">
                Song data
                <span className="text-muted"> — Never Lose The Chord · The Strumfolio Sessions</span>
              </span>
            </div>
          </div>

          <EditorDemo />

          {/* The one solid dark control in the app, and the last thing on this screen:
              it deletes the song, with a confirmation still between it and doing so. */}
          <div
            className="mt-10 flex flex-wrap items-center gap-2 border-t pt-4"
            style={{ borderColor: 'var(--surface-2)' }}
            aria-hidden
          >
            <span className="btn btn-ink btn-sm">
              <IconTrash size={16} />
              Delete
            </span>
          </div>
        </div>
      </div>
    </PhoneFrame>
  )
}
