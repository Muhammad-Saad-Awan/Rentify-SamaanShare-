import { splitHighlightSegments } from "@/lib/utils/highlight";

interface HighlightTextProps {
  text: string;
  /** The active search term, or `null` to render `text` unchanged. */
  term: string | null;
}

/**
 * Renders `text` with every occurrence of `term` marked.
 *
 * `<mark>` rather than a styled `<span>`: it is the element that means "relevant
 * to the user's current activity", which is exactly what a search hit is. That
 * carries semantics a span cannot, and it is what a user agent's own find-in-page
 * styling expects.
 *
 * The default `<mark>` presentation is black on bright yellow, which is unreadable
 * against a dark background - so the colours come from design tokens instead and
 * work in both themes.
 *
 * No `aria-label` or screen-reader announcement per hit. The page already states
 * the query above the results, and a per-word announcement would make a matched
 * title unlistenable - "Canon [highlight] camera [end highlight] with lens".
 */
function HighlightText({ text, term }: HighlightTextProps) {
  const segments = splitHighlightSegments(text, term);

  return (
    <>
      {segments.map((segment, index) =>
        segment.isMatch ? (
          // Index keys are safe here: the list is derived purely from `text` and
          // `term`, so a re-render with the same inputs produces the same order.
          <mark
            key={index}
            className="bg-primary/20 text-foreground rounded-[2px] px-0.5"
          >
            {segment.text}
          </mark>
        ) : (
          segment.text
        )
      )}
    </>
  );
}

export { HighlightText };
