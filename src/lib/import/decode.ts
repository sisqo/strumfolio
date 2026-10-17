/**
 * The bytes of a song file as text, whatever its encoding (2026-10-16).
 *
 * Every import used to read UTF-8 alone. An old Windows `.txt` or `.cho` from an Italian chord
 * site is Windows-1252, and «Perché è così» arrived as «Perch� � cos�», saved like that for
 * good; a Notepad «Unicode» file is UTF-16 with a BOM, and arrived as letters interleaved with
 * NUL, which Postgres refuses outright. So: a BOM decides; otherwise UTF-8 if the bytes are
 * valid UTF-8, which plain ASCII always is; otherwise Windows-1252, the encoding nearly every
 * non-UTF-8 song file in the wild is in. NUL never survives, whatever the source.
 */
export function decodeSongBytes(bytes: Uint8Array): string {
  return decode(bytes).replace(/\u0000/g, '')
}

function decode(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3))
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}
