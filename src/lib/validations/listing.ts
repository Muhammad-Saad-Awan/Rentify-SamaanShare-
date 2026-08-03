import { z } from "zod";

import { PAKISTANI_CITIES } from "@/config/cities";
import { ItemCondition } from "@/generated/prisma/enums";

/**
 * Listing creation rules.
 *
 * Limits come from docs/DATABASE.md section "Listing" and docs/API.md's
 * `createListingSchema`, which agree on 5-100 for the title, 20-5000 for the
 * description and a 10,000,000 PKR ceiling. (docs/ENGINEERING_GUIDELINES.md says
 * 2000 for the description - it is the outlier of the three, so the two that agree
 * win. Worth reconciling in the docs.)
 *
 * TWO SCHEMAS, ON PURPOSE
 * -----------------------
 * `createListingSchema` is the server contract: prices are real numbers, and it is
 * the only thing the Server Action trusts. `listingFormSchema` is the browser's,
 * where every input yields a string and an empty optional field is `""` rather than
 * `undefined`.
 *
 * A single coercing schema is possible but pushes `unknown` through React Hook
 * Form's generics, which loses type safety on exactly the fields most likely to be
 * mistyped. Both schemas are built from the same constants below, so the *limits*
 * cannot drift - only the shape differs, and `toCreateListingInput` is the one place
 * that converts.
 */

export const TITLE_MIN = 5;
export const TITLE_MAX = 100;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 5000;
export const AREA_MAX = 100;

/** Postgres `Int` caps at 2,147,483,647; the product ceiling is far lower. */
export const PRICE_MAX = 10_000_000;

export const MIN_IMAGES_PER_LISTING = 1;
export const MAX_IMAGES_PER_LISTING = 10;

/**
 * Largest file the browser will accept before compression.
 *
 * Checked against the *original* file, so a 40MB camera JPEG is rejected up front
 * rather than after the browser has spent time decoding it into a canvas. Post-
 * compression output is far smaller, which is why this can be generous.
 */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/**
 * Formats the picker offers and the code will compress.
 *
 * HEIC is deliberately absent: iPhones hand it over happily and no browser canvas can
 * decode it, so accepting it would produce a silent failure on the most common phone.
 * iOS Safari converts to JPEG when the accept list excludes HEIC.
 */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/**
 * The same allow-list as Cloudinary reports it.
 *
 * Cloudinary's `format` is a bare extension (`"jpg"`), not a MIME type, so the server
 * check cannot reuse `ACCEPTED_IMAGE_TYPES`. `jpeg` is listed alongside `jpg` because
 * which one is returned depends on how the file was encoded.
 */
export const ACCEPTED_IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp"] as const;

/** Cities a listing may be placed in, as stored: lowercase slugs (decision D1). */
// Widened to `string[]`: `PAKISTANI_CITIES` is `as const`, so the mapped array would
// be a union of literals and `.includes()` would refuse an arbitrary string - which is
// exactly what this needs to test.
const CITY_VALUES: readonly string[] = PAKISTANI_CITIES.map(
  (city) => city.value
);

/** A category or subcategory slug, matching what the taxonomy seed writes. */
const slug = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9-]+$/, { error: "That selection is not valid." });

/**
 * A Cloudinary public id, as the *action* accepts it.
 *
 * NOTE WHAT IS ABSENT: the URL. An earlier version took `{ publicId, url }` from the
 * client and wrote both, checking only that the URL was on the Cloudinary host. That
 * is not enough - the two were never cross-checked, so a crafted submission could
 * pair its own folder-prefixed id with *any* Cloudinary URL, including another user's
 * photo. The card would then display an image the submitter does not own, and deleting
 * the listing would not remove what was on screen.
 *
 * The URL is now derived server-side from Cloudinary's Admin API, so there is nothing
 * for a caller to assert.
 */
export const listingImagePublicIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9/_-]+$/, { error: "That image reference is not valid." });

/**
 * One image as the *form* holds it.
 *
 * The browser keeps the URL for previews - it has just uploaded the file and has the
 * response in hand - but only the public id is submitted.
 */
export interface ListingImageInput {
  publicId: string;
  url: string;
}

/** Whole rupees, required. */
const requiredPkr = z
  .number()
  .int({ error: "Enter a whole number of rupees." })
  .max(PRICE_MAX, { error: "That price is too high." });

/**
 * The Server Action's contract.
 *
 * Cross-field rules live in `superRefine` at the bottom rather than on individual
 * fields, because each compares two values.
 */
export const createListingSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(TITLE_MIN, {
        error: `Title must be at least ${TITLE_MIN} characters.`,
      })
      .max(TITLE_MAX, {
        error: `Title must be ${TITLE_MAX} characters or fewer.`,
      }),

    description: z
      .string()
      .trim()
      .min(DESCRIPTION_MIN, {
        error: `Description must be at least ${DESCRIPTION_MIN} characters.`,
      })
      .max(DESCRIPTION_MAX, {
        error: `Description must be ${DESCRIPTION_MAX} characters or fewer.`,
      }),

    // Slugs, not ids. The form never sees an internal id, and the action resolves
    // these against the taxonomy - which also verifies the subcategory belongs to
    // the chosen category, a pairing an id-based schema cannot check.
    categorySlug: slug,
    subcategorySlug: slug.optional(),

    condition: z.enum(ItemCondition, {
      error: "Choose the item's condition.",
    }),

    pricePerDay: requiredPkr.positive({
      error: "Daily price must be greater than zero.",
    }),
    pricePerWeek: requiredPkr
      .positive({ error: "Weekly price must be greater than zero." })
      .optional(),
    pricePerMonth: requiredPkr
      .positive({ error: "Monthly price must be greater than zero." })
      .optional(),
    securityDeposit: requiredPkr.nonnegative({
      error: "Deposit cannot be negative.",
    }),

    city: z.string().refine((value) => CITY_VALUES.includes(value), {
      error: "Choose one of the launch cities.",
    }),
    area: z.string().trim().max(AREA_MAX).optional(),

    images: z
      .array(listingImagePublicIdSchema)
      .min(MIN_IMAGES_PER_LISTING, { error: "Add at least one photo." })
      .max(MAX_IMAGES_PER_LISTING, {
        error: `A listing can have at most ${MAX_IMAGES_PER_LISTING} photos.`,
      })
      // Without this the same asset could be attached twice, producing a gallery with
      // duplicate slides and two rows that a single delete would half-orphan.
      .refine((ids) => new Set(ids).size === ids.length, {
        error: "The same photo was added more than once.",
      }),
  })
  .superRefine((value, ctx) => {
    /**
     * A longer-term rate must beat the daily one, or it is a trap.
     *
     * Renting for a week at 7x the daily rate is not a discount, and a weekly price
     * *above* that is strictly worse than booking seven days - which no owner
     * intends and every renter would notice. Almost always a missing or extra zero.
     */
    if (
      value.pricePerWeek !== undefined &&
      value.pricePerWeek >= value.pricePerDay * 7
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["pricePerWeek"],
        message:
          "A weekly rate should cost less than 7 days at the daily rate. Check for a typo.",
      });
    }

    if (
      value.pricePerMonth !== undefined &&
      value.pricePerMonth >= value.pricePerDay * 30
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["pricePerMonth"],
        message:
          "A monthly rate should cost less than 30 days at the daily rate. Check for a typo.",
      });
    }

    // A subcategory without a category cannot be resolved: subcategory slugs are
    // unique only within their parent.
    if (value.subcategorySlug && !value.categorySlug) {
      ctx.addIssue({
        code: "custom",
        path: ["subcategorySlug"],
        message: "Choose a category first.",
      });
    }
  });

export type CreateListingInput = z.infer<typeof createListingSchema>;

/**
 * The browser's shape: text inputs, so every numeric field arrives as a string.
 *
 * Numbers are validated here as strings rather than coerced, so an empty optional
 * price stays `""` and never becomes `0` - which a coercing schema would happily
 * accept as a valid "free weekly rate".
 */
export const listingFormSchema = z.object({
  title: z.string().trim().min(TITLE_MIN).max(TITLE_MAX),
  description: z.string().trim().min(DESCRIPTION_MIN).max(DESCRIPTION_MAX),
  categorySlug: slug,
  subcategorySlug: z.string(),
  condition: z.enum(ItemCondition),
  pricePerDay: pkrString({ required: true, allowZero: false }),
  pricePerWeek: pkrString({ required: false, allowZero: false }),
  pricePerMonth: pkrString({ required: false, allowZero: false }),
  securityDeposit: pkrString({ required: true, allowZero: true }),
  city: z.string().refine((value) => CITY_VALUES.includes(value), {
    error: "Choose one of the launch cities.",
  }),
  area: z.string().trim().max(AREA_MAX),
  images: z
    .array(z.object({ publicId: listingImagePublicIdSchema, url: z.string() }))
    .min(MIN_IMAGES_PER_LISTING, { error: "Add at least one photo." })
    .max(MAX_IMAGES_PER_LISTING),
});

export type ListingFormValues = z.infer<typeof listingFormSchema>;

interface PkrStringOptions {
  required: boolean;
  allowZero: boolean;
}

/**
 * A rupee amount typed into a text field.
 *
 * Rejects decimals explicitly rather than rounding them: PKR has no fractional
 * unit, and silently turning "1500.75" into 1501 changes what the owner asked for.
 */
function pkrString({ required, allowZero }: PkrStringOptions) {
  return z.string().superRefine((raw, ctx) => {
    const trimmed = raw.trim();

    if (trimmed === "") {
      if (required) {
        ctx.addIssue({ code: "custom", message: "This is required." });
      }

      return;
    }

    if (!/^\d+$/.test(trimmed)) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a whole number of rupees, digits only.",
      });

      return;
    }

    const parsed = Number(trimmed);

    if (!allowZero && parsed <= 0) {
      ctx.addIssue({ code: "custom", message: "Must be greater than zero." });

      return;
    }

    if (parsed > PRICE_MAX) {
      ctx.addIssue({ code: "custom", message: "That amount is too high." });
    }
  });
}

/**
 * Converts validated form values into the Server Action's input.
 *
 * The single conversion point between the two schemas. Empty strings become
 * `undefined` rather than `0` or `""`, which is what lets the action's optional
 * fields mean "not offered" instead of "free".
 */
export function toCreateListingInput(
  values: ListingFormValues
): CreateListingInput {
  const optionalNumber = (raw: string): number | undefined => {
    const trimmed = raw.trim();

    return trimmed === "" ? undefined : Number(trimmed);
  };

  const week = optionalNumber(values.pricePerWeek);
  const month = optionalNumber(values.pricePerMonth);
  const area = values.area.trim();
  const subcategory = values.subcategorySlug.trim();

  return {
    title: values.title.trim(),
    description: values.description.trim(),
    categorySlug: values.categorySlug,
    // Spread rather than an explicit `undefined`: under
    // `exactOptionalPropertyTypes`, assigning `undefined` to an optional property
    // is an error, so absent fields must be genuinely absent.
    ...(subcategory ? { subcategorySlug: subcategory } : {}),
    condition: values.condition,
    pricePerDay: Number(values.pricePerDay.trim()),
    ...(week !== undefined ? { pricePerWeek: week } : {}),
    ...(month !== undefined ? { pricePerMonth: month } : {}),
    securityDeposit: Number(values.securityDeposit.trim()),
    city: values.city,
    ...(area ? { area } : {}),
    // Only the ids cross the wire; the server resolves each to a canonical URL.
    images: values.images.map((image) => image.publicId),
  };
}
