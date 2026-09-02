import type { MDXComponents } from 'mdx/types'

import { BlogChord } from '@/components/BlogChord'

/**
 * What an `.mdx` article can use without importing it, and how its plain markdown renders.
 *
 * Required to exist by `@next/mdx` — it is how the MDX compiler is handed the component map.
 * This file must sit at the root of the app directory's parent (here `src/`), found by name
 * rather than by import, which is why nothing in this repo references it.
 *
 * **Deliberately almost empty.** Headings, paragraphs, lists and quotes are not mapped to
 * components here: they are styled by CSS under `.article` in `globals.css`, hand-written
 * against `DESIGN.md`'s tokens like every other surface in this app. Mapping them would move
 * the design of the blog's prose out of the stylesheet and into a component map, where it
 * would be the only piece of this app's typography not living beside the rest of it.
 *
 * What does belong here is the one thing an article cannot express in markdown: a chord that
 * must survive a browser translating the page around it.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    Chord: BlogChord,
  }
}
