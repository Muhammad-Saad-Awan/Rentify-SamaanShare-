import { z } from "zod";

import { CITY_VALUES } from "@/config/cities";
import { NAME_MAX_LENGTH, NAME_MIN_LENGTH } from "@/lib/validations/auth";

/**
 * Rules for the member's own profile.
 *
 * Two audiences, and the split matters when reading the fields below: `name`, `bio`,
 * `city` and the photo are PUBLIC - `/users/[id]` renders all four to anyone - while
 * `phone` is not selected by any public query and exists so the platform can reach the
 * person. The form says so at each field, because a member deciding what to type needs
 * to know which of the two they are filling in.
 *
 * TRANSFORM-FREE, for the reason `validations/auth.ts` sets out at length: a transform
 * makes a schema's input and output types differ, which forces React Hook Form's
 * generics apart under `exactOptionalPropertyTypes`. Whitespace-sensitive rules are
 * therefore expressed as `.refine()` against the trimmed value, and the normalising
 * happens in {@link toUpdateProfileInput} - one conversion point, immediately before
 * the write.
 */

/**
 * Bio ceiling.
 *
 * `User.bio` is `@db.Text` so the database imposes nothing; this is an editorial limit.
 * The public profile renders the bio as a paragraph beside the trust score, and beyond
 * roughly this length it stops being an introduction and starts being a listing
 * description - which has its own field, on its own page.
 */
export const BIO_MAX = 500;

/**
 * A Cloudinary public id for an avatar, as the action accepts it.
 *
 * Same shape and the same omission as `listingImagePublicIdSchema`: NO URL. The URL
 * written to `User.avatarUrl` is the one Cloudinary's Admin API returns for this id,
 * never one the client asserts, so there is nothing for a caller to pair a stolen URL
 * with.
 */
export const avatarPublicIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9/_-]+$/, { error: "That image reference is not valid." });

/**
 * A Pakistani mobile number, in any of the forms people actually type it.
 *
 * Accepted: `0300 1234567`, `03001234567`, `3001234567`, `+92 300 1234567`,
 * `0092-300-1234567`. Spaces, dashes and brackets are ignored, because a number copied
 * out of a contacts app carries whatever separators that app chose and rejecting it for
 * punctuation is the kind of validation people rightly hate.
 *
 * MOBILE ONLY, which is deliberate rather than an oversight. The number is here so a
 * counterparty or an administrator can reach the person about a booking in progress,
 * and a landline reaches a house rather than a person. Pakistani mobile numbers are
 * `3` followed by nine digits in national significant form - there is no other prefix
 * to allow.
 *
 * Returns the E.164 form, or `null` when the input cannot be one of these. Callers
 * distinguish "empty" from "invalid" before calling: `""` is a cleared field, not a
 * malformed number.
 */
export function normalizePhone(raw: string): string | null {
  // Everything that is not a digit or a leading plus. `+` survives only at position
  // zero, so "3+00" cannot masquerade as an international prefix.
  const cleaned = raw.trim().replace(/(?!^\+)[^\d]/g, "");

  // Longest prefix first: "0092..." also starts with "00", and stripping the shorter
  // one would leave "92300..." to be read as a national number.
  const national = cleaned.startsWith("+92")
    ? cleaned.slice(3)
    : cleaned.startsWith("0092")
      ? cleaned.slice(4)
      : cleaned.startsWith("92") && cleaned.length === 12
        ? cleaned.slice(2)
        : cleaned.startsWith("0")
          ? cleaned.slice(1)
          : cleaned;

  return /^3\d{9}$/.test(national) ? `+92${national}` : null;
}

/** Display form of a stored number: `+92 300 1234567`. */
export function formatPhone(stored: string): string {
  const match = /^\+92(\d{3})(\d{7})$/.exec(stored);

  return match ? `+92 ${match[1]} ${match[2]}` : stored;
}

/**
 * What `updateProfile` accepts.
 *
 * The whole profile rather than a patch, for the reason `updateListingSchema` gives:
 * a partial update cannot express "clear my bio". `null` is the cleared value and
 * `undefined` is not accepted, so every save states all four fields.
 */
export const updateProfileSchema = z.object({
  name: z
    .string()
    .max(NAME_MAX_LENGTH, {
      error: `Name must be at most ${NAME_MAX_LENGTH} characters.`,
    })
    .refine((value) => value.trim().length >= NAME_MIN_LENGTH, {
      error: `Name must be at least ${NAME_MIN_LENGTH} characters.`,
    }),
  bio: z
    .string()
    .max(BIO_MAX, { error: `Bio must be at most ${BIO_MAX} characters.` })
    .nullable(),
  city: z
    .string()
    .refine((value) => CITY_VALUES.includes(value), {
      error: "Choose one of the launch cities.",
    })
    .nullable(),
  phone: z
    .string()
    .refine((value) => normalizePhone(value) !== null, {
      error: "Enter a Pakistani mobile number, like 0300 1234567.",
    })
    .nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * The profile form's own shape.
 *
 * Strings throughout, including for the two fields the action takes as nullable: an
 * `undefined` default makes React Hook Form treat an input as uncontrolled and warn the
 * first time a value arrives, and `null` in a `<select>` is not a value the DOM has.
 * `""` means "not set" here and becomes `null` in {@link toUpdateProfileInput}.
 *
 * Optional fields are checked ONLY when non-empty. A member who has never entered a
 * phone number must still be able to save a change to their bio.
 */
export const profileFormSchema = z.object({
  name: updateProfileSchema.shape.name,
  bio: z
    .string()
    .max(BIO_MAX, { error: `Bio must be at most ${BIO_MAX} characters.` }),
  city: z
    .string()
    .refine((value) => value === "" || CITY_VALUES.includes(value), {
      error: "Choose one of the launch cities.",
    }),
  phone: z
    .string()
    .refine((value) => value.trim() === "" || normalizePhone(value) !== null, {
      error: "Enter a Pakistani mobile number, like 0300 1234567.",
    }),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

/**
 * Converts validated form values into the Server Action's input.
 *
 * The single conversion point between the two schemas, and where normalising happens:
 * the name loses its repeated whitespace, the phone becomes E.164, and an empty
 * optional field becomes an explicit `null` rather than being omitted - which is what
 * lets the action tell "clear this" apart from "leave it alone".
 */
export function toUpdateProfileInput(
  values: ProfileFormValues
): UpdateProfileInput {
  const bio = values.bio.trim();

  return {
    name: values.name,
    bio: bio === "" ? null : bio,
    city: values.city === "" ? null : values.city,
    phone: values.phone.trim() === "" ? null : values.phone,
  };
}
