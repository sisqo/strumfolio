/**
 * The fields the graphic editor offers to add, and the line each one writes.
 *
 * **Only what lives in the body.** Title, artist, tags and the three links are not here and
 * must not be: a column holds each of them, the form has an input for each of them, and a
 * `{title: …}` line typed into the body is stripped the next time the song is saved. A menu
 * entry that quietly disappears is the kind of surprise that costs somebody their trust in
 * an editor, which is worth more than the completeness of a list.
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
 * Grouped the way somebody reaching for one would look: what the song *is*, how it is
 * *played*, how it is *built*, and — last, because it is the least often wanted — how it
 * would be *printed* by a program that prints.
 */
export const FIELD_GROUPS: FieldGroup[] = [
  {
    title: 'About the song',
    options: [
      value('subtitle', 'Subtitle'),
      value('composer', 'Composer'),
      value('lyricist', 'Lyricist'),
      value('album', 'Album'),
      value('year', 'Year'),
      value('copyright', 'Copyright'),
      value('duration', 'Duration'),
      value('ccli', 'CCLI number'),
      value('sorttitle', 'Sorts as'),
      value('sortartist', 'Artist sorts as'),
    ],
  },
  {
    title: 'Playing it',
    options: [
      value('key', 'Key'),
      value('capo', 'Capo'),
      value('tempo', 'Tempo'),
      value('time', 'Time signature'),
      value('transpose', 'Transpose'),
      value('define', 'Chord fingering'),
    ],
  },
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
