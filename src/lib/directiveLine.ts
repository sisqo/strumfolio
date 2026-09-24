/**
 * Takes a directive line apart: `{name}`, `{name: value}`, `{name value}`. **The one copy both
 * parsers read** — `chordpro.ts` (the reader) and `editor/document.ts` (the editor) — so a name
 * one of them accepts is a name the other accepts, which used to be a promise between two
 * identical regular expressions written in two files.
 *
 * **A scan, not a regular expression, since 2026-09-24.** The expression it replaces,
 * `/^\{\s*(name)\s*(?:[:\s]\s*(.*?)\s*)?\}$/`, had four whitespace quantifiers that could each
 * take the same run of spaces, so a line that opened with `{` and never closed made the
 * engine try every way of sharing them out: 85 ms at 100 spaces, 5 s at 400, 83 s at 800. One
 * such line in one song hung the account's home screen on the server — every song is parsed
 * there to build the index — and froze the reader, the editor and the import preview in the
 * browser. This answers the same groups in one pass, and `directiveLine.test.ts` checks it
 * against the old expression on inputs short enough for that to finish.
 *
 * The name: a letter or `_`, then letters, digits and `_`; then optionally a dash and a
 * conditional's selector, which may start with `!` («everybody except») and may carry more
 * dashes. `!` is admitted only after the dash, so a bare `{!foo}` is words.
 *
 * The value: after the name, optional whitespace, then either the closing brace (no value), a
 * colon, or — when at least one space was skipped — the value itself. It runs to the final
 * `}` and is trimmed, so `{name: }` has an empty value and `{name }` has none.
 */

/** `[whole line, name, value | undefined]`, shaped like the `exec` result it replaces. */
export type DirectiveMatch = [string, string, string | undefined]

const LINE_TERMINATOR = /[\n\r\u2028\u2029]/
const WHITESPACE = /\s/

function isNameStart(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'
}

function isNameChar(c: string): boolean {
  return isNameStart(c) || (c >= '0' && c <= '9')
}

export function matchDirective(line: string): DirectiveMatch | null {
  const end = line.length - 1
  if (end < 1 || line[0] !== '{' || line[end] !== '}') return null

  let i = 1
  while (i < end && WHITESPACE.test(line[i])) i++

  const nameStart = i
  if (i >= end || !isNameStart(line[i])) return null
  i++
  while (i < end && isNameChar(line[i])) i++
  if (line[i] === '-') {
    i++
    if (line[i] === '!') i++
    while (i < end && (isNameChar(line[i]) || line[i] === '-')) i++
  }
  const name = line.slice(nameStart, i)

  const afterName = i
  while (i < end && WHITESPACE.test(line[i])) i++
  if (i === end) return [line, name, undefined]

  let valueStart: number
  if (line[i] === ':') valueStart = i + 1
  else if (i > afterName) valueStart = afterName + 1
  else return null

  const value = line.slice(valueStart, end).trim()
  if (LINE_TERMINATOR.test(value)) return null
  return [line, name, value]
}
