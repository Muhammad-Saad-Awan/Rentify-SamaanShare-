import {
  BikeIcon,
  CarIcon,
  HomeIcon,
  LaptopIcon,
  PackageIcon,
  PartyPopperIcon,
  ShirtIcon,
  WrenchIcon,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

/**
 * Resolves `Category.icon` to a component.
 *
 * The column stores a Lucide icon *name* as a string, because the taxonomy is
 * database reference data and cannot hold a React component. Something has to
 * turn that name back into one, and this is it - the "resolved at render time by
 * the category UI" the seed's comment refers to.
 *
 * An explicit map rather than a dynamic import or an index into the whole Lucide
 * namespace. Two reasons: the bundle then contains these eight icons instead of
 * the entire library, and an unrecognised name is a visible fallback rather than
 * a runtime crash on `undefined` as a JSX tag.
 *
 * Keys must match the `icon` values in prisma/seed.ts. Adding a category means
 * adding its icon here too - otherwise the tile renders the generic fallback.
 */
const CATEGORY_ICONS: Readonly<Record<string, LucideIcon>> = {
  Laptop: LaptopIcon,
  Wrench: WrenchIcon,
  Bike: BikeIcon,
  PartyPopper: PartyPopperIcon,
  Car: CarIcon,
  Home: HomeIcon,
  Shirt: ShirtIcon,
};

/** Neutral stand-in for a missing or unmapped icon name. */
const FALLBACK_ICON = PackageIcon;

export function categoryIcon(name: string | null): LucideIcon {
  if (!name) {
    return FALLBACK_ICON;
  }

  return CATEGORY_ICONS[name] ?? FALLBACK_ICON;
}
