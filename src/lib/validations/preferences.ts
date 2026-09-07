import { z } from "zod";

import { CITY_VALUES } from "@/config/cities";

/**
 * Rules for the member's browsing and notification preferences.
 *
 * Transform-free and split into a form schema and an action schema, for the same reasons
 * `validations/profile.ts` sets out: a transform forces React Hook Form's generics apart
 * under `exactOptionalPropertyTypes`, and `""` in a `<select>` has to survive as an
 * explicit `null` rather than as an empty string in the database. A `defaultCity` of `""`
 * would be a city that matches nothing and would redirect browse to `?city=`.
 *
 * ONLY TWO NOTIFICATION SWITCHES, and that is a product decision rather than a first
 * instalment - `lib/notifications/preferences.ts` holds the reasoning. Everything else the
 * platform sends is written inside the transaction that changes a booking or a deposit,
 * so it is a guarantee and not a preference.
 */

export const updatePreferencesSchema = z.object({
  /** A launch city, or `null` for "no preference - show me everywhere". */
  defaultCity: z
    .string()
    .refine((value) => CITY_VALUES.includes(value), {
      error: "Choose one of the launch cities.",
    })
    .nullable(),
  notifyReviewReminders: z.boolean(),
  notifyReviewPublished: z.boolean(),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

/**
 * The preferences form's own shape.
 *
 * The two switches are already booleans, so only the city differs: `""` here means "no
 * preference", because that is what a `<select>` can hold and `null` is not.
 */
export const preferencesFormSchema = z.object({
  defaultCity: z
    .string()
    .refine((value) => value === "" || CITY_VALUES.includes(value), {
      error: "Choose one of the launch cities.",
    }),
  notifyReviewReminders: z.boolean(),
  notifyReviewPublished: z.boolean(),
});

export type PreferencesFormValues = z.infer<typeof preferencesFormSchema>;

/** The single conversion point between the two schemas. */
export function toUpdatePreferencesInput(
  values: PreferencesFormValues
): UpdatePreferencesInput {
  return {
    defaultCity: values.defaultCity === "" ? null : values.defaultCity,
    notifyReviewReminders: values.notifyReviewReminders,
    notifyReviewPublished: values.notifyReviewPublished,
  };
}
