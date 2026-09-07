/**
 * `pdfjs-dist` ships types for its API entry and none for its worker entry, because that
 * file is normally handed to a `Worker` as a URL rather than imported by anything.
 * `src/lib/import/formats/pdf.ts` imports it on purpose — it is how the engine is asked
 * to parse on the main thread, and the module's whole contribution is the
 * `globalThis.pdfjsWorker` it assigns on the way in.
 *
 * So: no shape to describe, only a module to admit exists.
 */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs'
