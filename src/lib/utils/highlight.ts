/**
 * Text helpers for presenting search matches.
 *
 * React-free and query-free, so both Server and Client Components can call them.
 *
 * Nothing here builds a regular expression. The term comes straight from `?q=`,
 * so it can contain `(`, `[`, `*` or `\` - characters that would either throw
 * when compiled or, worse, silently match something other than what the user
 * typed. Plain `indexOf` scanning has neither failure mode and needs no escaping
 * layer to keep correct.
 */

/** One run of text, flagged as a match or not. */
export interface HighlightSegment {
  text: string;
  isMatch: boolean;
}

/**
 * Splits `text` into alternating matched and unmatched runs.
 *
 * Case-insensitive, and the returned segments carry the *original* casing rather
 * than the term's - highlighting "Camera" for a search of "camera" must not
 * rewrite the title to lowercase.
 *
 * Returns a single unmatched segment when there is nothing to highlight, so
 * callers can render the result unconditionally.
 */
export function splitHighlightSegments(
  text: string,
  term: string | null
): HighlightSegment[] {
  if (!term) {
    return [{ text, isMatch: false }];
  }

  const haystack = text.toLowerCase();
  const needle = term.toLowerCase();

  // An empty needle would make `indexOf` return 0 forever and never advance.
  if (needle === "") {
    return [{ text, isMatch: false }];
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (;;) {
    const index = haystack.indexOf(needle, cursor);

    if (index === -1) {
      break;
    }

    if (index > cursor) {
      segments.push({ text: text.slice(cursor, index), isMatch: false });
    }

    segments.push({
      text: text.slice(index, index + needle.length),
      isMatch: true,
    });

    cursor = index + needle.length;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isMatch: false });
  }

  return segments.length > 0 ? segments : [{ text, isMatch: false }];
}

/** Longest excerpt handed to a card. Two lines at card width. */
const SNIPPET_LENGTH = 140;

/** Characters of context kept before the match, so it does not start mid-word. */
const SNIPPET_LEAD = 40;

/**
 * An excerpt of `text` centred on the first match of `term`.
 *
 * Why an excerpt rather than the whole description: a listing body runs to
 * several hundred characters, and the point is to show *why* a result matched -
 * which is one phrase, not the full prose. Trimming here also means the browser
 * never receives the untruncated text for twelve cards at once.
 *
 * Returns `null` when there is no term or no match, which is the signal to render
 * no excerpt at all. A listing that matched only on its title has nothing useful
 * to quote from its description.
 */
export function buildMatchSnippet(
  text: string,
  term: string | null
): string | null {
  if (!term) {
    return null;
  }

  const index = text.toLowerCase().indexOf(term.toLowerCase());

  if (index === -1) {
    return null;
  }

  // Start a little before the match so it reads as a sentence fragment rather
  // than beginning abruptly on the search term.
  const start = Math.max(0, index - SNIPPET_LEAD);
  const end = Math.min(text.length, start + SNIPPET_LENGTH);

  const excerpt = text.slice(start, end).trim();

  // Ellipses only where text was actually removed, so a short description that
  // fits entirely is not made to look truncated.
  return `${start > 0 ? "…" : ""}${excerpt}${end < text.length ? "…" : ""}`;
}
