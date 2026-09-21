/**
 * The directives the toolbar offers to drop where the caret is.
 *
 * **Only the ones whose position is their meaning**, since 2026-09-21. A `{start_of_verse}`
 * says where a verse begins and a `{column_break}` says where a column ends: put either
 * somewhere else and it means something else, so the place to add them is the line somebody
 * is looking at. Everything about the song *itself* — subtitle, key, capo, tempo, tag,
 * fingering and the rest — left this menu the day `SongDataForm` grew an «Add a field» of
 * its own, because a `{key: …}` dropped between two verses is the same field the form shows
 * at the top and there is no reason to offer it twice, in two places, one of which writes it
 * somewhere nobody would look for it.
 *
 * What stays out for a different reason: title and artist. A column holds each of them, and
 * a `{title: …}` typed into the body is stripped at the next save — a menu entry that
 * quietly disappears costs somebody their trust in an editor. The guard is
 * `fields.test.ts` against `METADATA_DIRECTIVE` rather than a list written out twice.
 *
 * Nor is it the whole format — the raw editor takes any directive at all, and the reader
 * keeps every one it does not act on. This is the short list worth a tap.
 */

export interface FieldOption {
  /** The directive's name, exactly as it is written into the file. */
  name: string
  /** What it is called in the menu. */
  label: string
  /** False for the handful that are a bare `{directive}` with nothing to fill in. */
  takesValue: boolean
}

export interface FieldGroup {
  title: string
  options: FieldOption[]
}

const value = (name: string, label: string): FieldOption => ({ name, label, takesValue: true })
const bare = (name: string, label: string): FieldOption => ({ name, label, takesValue: false })

/**
 * Two groups: how the song is *built*, and — last, because it is the least often wanted —
 * how it would be *printed* by a program that prints. Both are about a place in the file.
 */
export const FIELD_GROUPS: FieldGroup[] = [
  {
    title: 'Structure',
    options: [
      value('start_of_verse', 'Verse start'),
      bare('end_of_verse', 'Verse end'),
      value('start_of_grid', 'Grid start'),
      bare('end_of_grid', 'Grid end'),
      value('comment_box', 'Comment in a box'),
      value('highlight', 'Highlighted comment'),
      bare('chorus', 'Repeat the chorus'),
    ],
  },
  {
    title: 'For printing',
    options: [
      bare('new_page', 'Page break'),
      bare('column_break', 'Column break'),
      value('columns', 'Columns'),
      value('pagetype', 'Page size'),
      value('textsize', 'Text size'),
      value('chordsize', 'Chord size'),
      value('textcolour', 'Text colour'),
      value('chordcolour', 'Chord colour'),
    ],
  },
]

/** Every option, flat — for the menu's own lookup and for the test that guards the list. */
export const FIELD_OPTIONS: FieldOption[] = FIELD_GROUPS.flatMap((group) => group.options)

/**
 * The line a chosen field writes.
 *
 * A field that takes a value is written with the colon and nothing after it, so the caret
 * lands where the value goes and the reader types straight into it. A bare one is complete
 * the moment it is added.
 */
export function fieldLine(option: FieldOption): string {
  return option.takesValue ? `{${option.name}: }` : `{${option.name}}`
}

/** Where the caret belongs once the line is written: just before the closing brace. */
export function fieldCaret(option: FieldOption): number {
  return fieldLine(option).length - 1
}
