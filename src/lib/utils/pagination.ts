/**
 * Shared `?page=` parsing.
 *
 * Three pages had their own copy of this - browse, saved listings and owner listings - which
 * is three chances for one of them to stop clamping. The value comes from a URL anyone can
 * edit, so every caller needs the same answer: anything unusable is page 1, never an error
 * and never a negative offset reaching Prisma's `skip`.
 *
 * The browse page's filter module has its own equivalent, because `page` there is one field
 * of a larger parsed state rather than a standalone parameter.
 */
export function parsePageParam(value: string | string[] | undefined): number {
  // Repeated parameters arrive as an array; the first entry wins.
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) {
    return 1;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}
