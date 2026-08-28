/**
 * Where a chord naturally lands on a line: the start of a syllable.
 *
 * A tap on the chord row aims at a syllable, not a letter — nobody hangs a chord
 * off the second `l` of "castello" on purpose, and a finger is a letter wide on a
 * phone anyway. Snapping the tap to these points is what turns "missed by one
 * letter" from the normal case into a non-event. Dragging stays letter-precise;
 * only the tap snaps.
 *
 * The split rule is a deliberately small approximation of Italian syllabification
 * (the repertoire's language), stated on the consonant cluster between two vowel
 * nuclei: a double letter or a liquid/nasal coda (l, m, n, r) keeps its first
 * consonant with the syllable before it, everything else — single consonants,
 * digraphs like `ch`/`gn`/`gl`, s-impura clusters — opens the next one. Runs of
 * vowels are one nucleus: splitting a diphthong would offer two snap points a
 * finger apart, which is the problem this exists to remove.
 */

const VOWELS = new Set('aeiouyàáâäèéêëìíîïòóôöùúûü')

const isLetter = (ch: string) => ch.toLowerCase() !== ch.toUpperCase()
const isVowel = (ch: string) => VOWELS.has(ch.toLowerCase())

/** The coda consonants that close a syllable when they lead a cluster. */
const CODAS = new Set(['l', 'm', 'n', 'r'])

/**
 * The positions a chord snaps to, in order: the start of every syllable of every
 * word, and `text.length` — the seat of a chord that plays after the last word.
 */
export function snapPoints(text: string): number[] {
  const points = new Set<number>([text.length])

  let at = 0
  while (at < text.length) {
    if (!isLetter(text[at])) {
      at += 1
      continue
    }

    const start = at
    while (at < text.length && isLetter(text[at])) at += 1
    points.add(start)

    // Inside the word: a boundary in each consonant cluster between two nuclei.
    let nucleusEnd: number | null = null
    for (let i = start; i < at; i += 1) {
      if (!isVowel(text[i])) continue

      const vowelStart = i
      while (i + 1 < at && isVowel(text[i + 1])) i += 1

      if (nucleusEnd !== null && vowelStart > nucleusEnd) {
        const cluster = text.slice(nucleusEnd, vowelStart).toLowerCase()
        const closes =
          cluster.length >= 2 && (cluster[0] === cluster[1] || CODAS.has(cluster[0]))
        points.add(nucleusEnd + (closes ? 1 : 0))
      }
      nucleusEnd = i + 1
    }
  }

  return [...points].sort((a, b) => a - b)
}

/**
 * The start of every space-separated word.
 *
 * Coarser than `snapPoints` on purpose: this answers "where do the chords of a
 * chord-only line land once words are written under it" (see `setLineText`),
 * and a chord per word — not per syllable — is what `[re] [la] [re] [sol]`
 * over a line of words means.
 */
export function wordStarts(text: string): number[] {
  const starts: number[] = []

  for (let at = 0; at < text.length; at += 1) {
    if (!/\s/.test(text[at]) && (at === 0 || /\s/.test(text[at - 1]))) starts.push(at)
  }

  return starts
}

/** The snap point closest to `at`; ties go to the earlier one. */
export function nearestSnap(text: string, at: number): number {
  let best = at
  let smallest = Infinity

  for (const point of snapPoints(text)) {
    const gap = Math.abs(point - at)
    if (gap < smallest) {
      smallest = gap
      best = point
    }
  }

  return best
}
