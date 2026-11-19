import type { StaticImageData } from "next/image";

import electronics from "../../public/images/categories/electronics.webp";
import events from "../../public/images/categories/events.webp";
import fashion from "../../public/images/categories/fashion.webp";
import home from "../../public/images/categories/home.webp";
import sports from "../../public/images/categories/sports.webp";
import tools from "../../public/images/categories/tools.webp";
import vehicles from "../../public/images/categories/vehicles.webp";

/**
 * A representative product photograph per top-level category, keyed by slug.
 *
 * Kept in config rather than the database: the photos are part of the site's design, not
 * marketplace data, and a static import gives each one a build-time blur placeholder and
 * intrinsic size. A category missing from this map (a new one added to the seed) falls back
 * to its Lucide icon, so the grid never breaks.
 *
 * All photographs are from Unsplash under the Unsplash License (free for commercial use, no
 * attribution required); the source pages are recorded so they can be traced or replaced.
 * Each was cropped to 4:3 and re-encoded as WebP (10-75 KB).
 */
const CATEGORY_IMAGES: Readonly<
  Record<string, { image: StaticImageData; source: string }>
> = {
  electronics: {
    image: electronics,
    source: "https://unsplash.com/photos/i5UV2HpITYA",
  },
  tools: { image: tools, source: "https://unsplash.com/photos/MXeDE_yCdHQ" },
  sports: { image: sports, source: "https://unsplash.com/photos/dRJR64sIf68" },
  events: { image: events, source: "https://unsplash.com/photos/SYfH2bqf1yk" },
  fashion: {
    image: fashion,
    source: "https://unsplash.com/photos/zxPo13geJ5U",
  },
  home: { image: home, source: "https://unsplash.com/photos/4Co4l84sJWg" },
  vehicles: {
    image: vehicles,
    source: "https://unsplash.com/photos/EDY1KzDP0a4",
  },
};

function categoryImage(slug: string): StaticImageData | null {
  return CATEGORY_IMAGES[slug]?.image ?? null;
}

export { CATEGORY_IMAGES, categoryImage };
