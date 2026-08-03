import { PAKISTANI_CITIES } from "@/config/cities";

import type { ItemCondition } from "@/generated/prisma/enums";

/**
 * Display helpers for listing fields whose stored form is not readable.
 *
 * React-free and query-free, like the other modules here, so a Server Component
 * and a Client Component can both call them.
 */

/**
 * Human labels for `ItemCondition`.
 *
 * Typed as a total `Record`, not a lookup with a fallback: adding a variant to
 * the enum should fail `tsc` here rather than silently render `LIKE_NEW` to a
 * user. The wording matches the filter labels in the PRD so the browse filter
 * and the card badge cannot drift apart.
 */
export const CONDITION_LABELS: Readonly<Record<ItemCondition, string>> = {
  NEW: "New",
  LIKE_NEW: "Like New",
  GOOD: "Good",
  FAIR: "Fair",
};

/**
 * Turns a stored city slug into its display name, e.g. `karachi` → `Karachi`.
 *
 * `Listing.city` holds a lowercase slug by schema decision D1, so it is never
 * shown raw. An unrecognised slug is title-cased rather than dropped: a listing
 * from a city added to the database ahead of `PAKISTANI_CITIES` should still
 * render a sensible label instead of disappearing from its own card.
 */
export function formatCity(slug: string): string {
  const city = PAKISTANI_CITIES.find((entry) => entry.value === slug);

  if (city) {
    return city.label;
  }

  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
