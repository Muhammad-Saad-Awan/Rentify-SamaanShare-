import { prisma } from "@/lib/prisma";

/**
 * Slug-to-id resolution for listing writes, shared by create and update.
 */

export type TaxonomyResult =
  | { ok: true; categoryId: string; subcategoryId: string | null }
  | { ok: false; error: string };

interface TaxonomySelection {
  categorySlug: string;
  subcategorySlug?: string | undefined;
}

/**
 * Turns submitted slugs into foreign keys, verifying the pair exists.
 *
 * One query against the category, filtering its subcategories - not two independent
 * lookups. A subcategory slug is unique only within its parent, so checking each in
 * isolation would happily accept `category=vehicles` with `subcategory=cameras`, and
 * write a listing whose subcategory belongs to a different branch of the taxonomy.
 * "bicycles" existing under both sports and vehicles is the case that makes this real.
 */
export async function resolveListingTaxonomy(
  selection: TaxonomySelection
): Promise<TaxonomyResult> {
  const category = await prisma.category.findUnique({
    where: { slug: selection.categorySlug },
    select: {
      id: true,
      subcategories: selection.subcategorySlug
        ? { where: { slug: selection.subcategorySlug }, select: { id: true } }
        : false,
    },
  });

  if (!category) {
    return { ok: false, error: "That category no longer exists." };
  }

  if (!selection.subcategorySlug) {
    return { ok: true, categoryId: category.id, subcategoryId: null };
  }

  const subcategory = category.subcategories?.[0];

  if (!subcategory) {
    return {
      ok: false,
      error: "That subcategory does not belong to the chosen category.",
    };
  }

  return { ok: true, categoryId: category.id, subcategoryId: subcategory.id };
}
