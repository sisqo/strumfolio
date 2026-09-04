import { jsonLdText } from '@/lib/blog/jsonLd'

/**
 * One block of structured data, in the page.
 *
 * A server component with no state and no styling: it renders a `<script>` that no reader
 * ever sees and that every crawler reads. The escaping is not here but in `jsonLdText`,
 * where a test can hold it — see that function on why an unescaped `</script>` inside a
 * string would end the tag early.
 *
 * `dangerouslySetInnerHTML` is the only way to put JSON inside a script tag from JSX, and it
 * is safe here for the one reason that matters: everything reaching it is built by
 * `lib/blog/jsonLd.ts` out of our own content, and it has been through `JSON.stringify`.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(data) }} />
}
