import { JsonLd } from './JsonLd'
import { type FaqItem, faqJsonLd } from '@/lib/blog/jsonLd'

/**
 * The questions at the foot of an article or a tool page — and the structured data for them,
 * from the same array.
 *
 * **One source, deliberately.** A page could print its questions as prose and declare them
 * again in a schema block, and that is how structured data usually goes wrong: the block
 * describes the page as it was two edits ago. Here the array is the only copy, so a question
 * that is not on the page cannot be in the schema and vice versa.
 *
 * **What earns a place in one.** A question somebody actually types into a search box, whose
 * honest answer is short and specific. Not a restatement of the article's own headings, and
 * not a question invented to fill a third slot — an FAQ of manufactured questions is exactly
 * the decoration-without-a-reason this project's brand notes rule out, and it reads as
 * padding to a person even when it works on a crawler.
 *
 * Plain `<h2>`/`<p>` rather than `<details>`: these are answers to be read, not drawers to
 * be opened, and a collapsed answer is one a reader has to work for and a screen reader has
 * to be told about.
 */
export function Faq({ items, heading = 'Questions people ask' }: { items: readonly FaqItem[]; heading?: string }) {
  if (items.length === 0) return null

  return (
    <section className="faq" aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="faq-heading">
        {heading}
      </h2>

      <dl className="faq-list">
        {items.map((item) => (
          <div key={item.question} className="faq-item">
            <dt className="faq-question">{item.question}</dt>
            <dd className="faq-answer">{item.answer}</dd>
          </div>
        ))}
      </dl>

      <JsonLd data={faqJsonLd(items)} />
    </section>
  )
}
