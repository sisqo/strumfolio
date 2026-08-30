/**
 * Decides what a dropped file *is*, before anything tries to read it.
 *
 * Two separate questions live in this directory and they must not collapse into one:
 * this file answers «which parser opens this», `dialect.ts` answers «what do this
 * file's directives mean». They are independent — a `.chopro` exported by OnSong is
 * opened by the plain text parser and read with OnSong's directive table — so an
 * extension must never short-circuit the dialect sniff.
 *
 * Routing is by extension, not by content, and that is deliberate: a `.pdf` and a
 * `.docx` are both zip-ish binaries whose first bytes say nothing useful about which
 * one a person meant, and the cost of guessing wrong is a parser failing on material
 * it was never given. Content only decides the two questions an extension genuinely
 * cannot answer — whether a text file is XML (OpenSong's song files carry no extension
 * at all) and whether it is ChordPro or chords-above-lyrics, which `convert.ts` has
 * always decided for itself.
 *
 * The `refused` kind is the reason this file exists at all rather than a widened
 * regex. Four real formats — OnSong's own backup and archive, MobileSheets' backup,
 * Guitar Pro — are files a person is *more* likely to try first than the one that
 * works, because they are what the other app's own «export everything» button
 * produces. Answering those with «that doesn't look like a .txt» is answering the
 * wrong question. Each carries the sentence that says what to do instead.
 */

/** What opens this file. */
export type Source =
  /** Straight into `prepareSongs`: ChordPro, chords-above, or plain lyrics. */
  | { kind: 'text' }
  /** OpenSong or OpenLyrics — decided between by `xmlFlavour`, on content. */
  | { kind: 'xml' }
  /** A zip of song files, whose folders become sections. */
  | { kind: 'zip' }
  /** SongbookPro's `.sbpbackup`: a zip holding one line of JSON. */
  | { kind: 'songbookpro' }
  | { kind: 'docx' }
  | { kind: 'pdf' }
  /**
   * A real songbook file we deliberately do not open, with the sentence that says
   * what to do instead. Never a dead end — every one of these has a route in.
   */
  | { kind: 'refused'; advice: string }
  /** Nothing we recognise. */
  | { kind: 'unknown' }

/**
 * Every extension that holds ChordPro or chords-above text.
 *
 * The spec's own five (`.cho` `.crd` `.chopro` `.chord` `.pro`), plus `.chordpro`
 * and `.cpm` — which OnSong accepts and the spec's list does not mention — plus
 * `.onsong` and `.tab`. `.pro` is claimed by ChordPro, LinkeSoft SongBook *and*
 * Setlist Helper, and needs no special case for any of them: all three write the
 * same brackets, and whatever they disagree about is a directive question, which is
 * `dialect.ts`'s to answer and not this one's.
 */
const TEXT = /\.(txt|text|cho|crd|chopro|chord|chordpro|cpm|pro|onsong|tab|lyrics)$/i

const XML = /\.(xml|opensong|openlyrics)$/i

/**
 * Files we refuse on purpose, and what to say instead.
 *
 * OnSong's `.backup` is the one that matters most, and refusing it is the *better*
 * answer rather than a shortfall: it is a zip around an `OnSong.sqlite3`, so reading
 * it in the browser would mean about a megabyte of WebAssembly and an undocumented
 * schema that can change with any release of an app we do not control — all to
 * recover songs that OnSong's own ChordPro export hands over already, losslessly and
 * for free. `.onsongarchive` is worse still: no public parser for it exists anywhere.
 *
 * Guitar Pro is refused for a reason no amount of work would fix. Its chords are
 * stored per beat, but its lyrics anchor only to a starting bar and the syllable-to-
 * beat mapping is re-derived at load time by splitting on spaces — one rest shifts
 * everything after it. The file never records «this syllable sits under this chord»,
 * which is the only fact this app actually needs from it.
 */
const REFUSED: { pattern: RegExp; advice: string }[] = [
  {
    pattern: /\.(backup|onsongarchive|archive)$/i,
    advice:
      'This is OnSong’s own backup, which only OnSong can read. To bring the songs here: ' +
      'in OnSong, Songs → select all → Share → ChordPro, then drop that zip here instead.',
  },
  {
    pattern: /\.(msb|msf|mss)$/i,
    advice:
      'This is a MobileSheets backup, which only MobileSheets can read. To bring the songs ' +
      'here: in MobileSheets, select the songs → Share → Export as ChordPro, then drop those ' +
      'files here. Songs it holds as PDFs will need to be exported as PDF and dropped here separately.',
  },
  {
    pattern: /\.(gp|gpx|gp3|gp4|gp5|gtp)$/i,
    advice:
      'Guitar Pro files record chords and lyrics separately, without ever saying which ' +
      'syllable sits under which chord — so there is nothing here to line up. Export the song ' +
      'as text or PDF from Guitar Pro and drop that instead.',
  },
  {
    pattern: /\.(html?|irealb|irealbook)$/i,
    advice:
      'iReal Pro files hold a chord grid and no lyrics at all, so there is nothing to line the ' +
      'chords up against. Type or paste the words in, and the chords with them.',
  },
]

/** The extension, lowercased, or the empty string — OpenSong's song files have none. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot <= 0 ? '' : fileName.slice(dot).toLowerCase()
}

export function detectSource(fileName: string): Source {
  const name = fileName.trim()

  for (const { pattern, advice } of REFUSED) {
    if (pattern.test(name)) return { kind: 'refused', advice }
  }

  if (/\.sbpbackup$/i.test(name)) return { kind: 'songbookpro' }
  if (/\.docx$/i.test(name)) return { kind: 'docx' }
  if (/\.pdf$/i.test(name)) return { kind: 'pdf' }
  if (/\.zip$/i.test(name)) return { kind: 'zip' }
  if (XML.test(name)) return { kind: 'xml' }
  if (TEXT.test(name)) return { kind: 'text' }

  /*
   * No extension at all is OpenSong's own convention for a song file — genuinely
   * extensionless, not merely undocumented — and it is the only format in the survey
   * that has one. Read as text; `looksLikeXml` below sends it on to the XML parser if
   * that is what it turns out to hold.
   */
  if (extensionOf(name) === '') return { kind: 'text' }

  return { kind: 'unknown' }
}

/**
 * Whether text that arrived through the `text` route is actually XML.
 *
 * Checked on content because the two cases that need it have no extension to check:
 * an OpenSong song file, and a `.txt` somebody renamed. A leading `<?xml` or a root
 * element we know by name is enough — `<` alone is not, since a lyric line may
 * legitimately open with one.
 */
export function looksLikeXml(text: string): boolean {
  const head = text.trimStart().slice(0, 200)
  return /^<\?xml[\s?]/i.test(head) || /^<\s*(song|songs|lyrics|properties)[\s>]/i.test(head)
}

/** Which XML dialect, once `looksLikeXml` has said it is one. */
export type XmlFlavour = 'opensong' | 'openlyrics' | 'unknown'

/**
 * OpenLyrics announces itself by namespace and by its `<lyrics>` root; OpenSong is
 * recognised by its own `<song>` root together with the `<lyrics>` *element* that
 * holds its dot-prefixed chord lines. Neither is guessed from the file name: OnSong
 * exports OpenSong XML as `.xml`, and so does OpenLP.
 */
export function xmlFlavour(text: string): XmlFlavour {
  if (/openlyrics/i.test(text) || /<\s*song[^>]*\bxmlns\s*=/i.test(text)) return 'openlyrics'
  if (/<\s*song[\s>]/i.test(text) && /<\s*lyrics\s*>/i.test(text)) return 'opensong'
  return 'unknown'
}
