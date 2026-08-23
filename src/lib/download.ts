/**
 * Handing a file to the reader — the three lines every download in this app ends with.
 *
 * Its own module because there are two callers now and they live on two different screens:
 * `ExportPanel` zips a repertoire on `/export`, `BookletPanel` renders a PDF on `/booklet`.
 * It used to be a local helper inside `ExportPanel`, back when that panel held both, and the
 * booklet moving out is what turned "a local helper" into "the same three lines twice".
 *
 * Not a hook and not a component: it touches `document` and `URL` directly, so it only ever
 * runs from a `'use client'` module, but it holds no state and renders nothing, which is what
 * keeps it a plain function.
 *
 * `revokeObjectURL` immediately after `click()`, which looks too early and is not: the click
 * has already started the navigation the browser turns into a download by the time this line
 * runs, and holding the URL for a timeout instead only leaves the blob alive in memory for a
 * file that is already on its way. The `<a>` is never put in the document either — it does not
 * need to be, and appending it would leave a stray element behind on every download.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
