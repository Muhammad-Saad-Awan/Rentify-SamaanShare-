import { z } from "zod";

/**
 * Zod schemas for the authentication forms.
 *
 * These run in two places: in the browser via `zodResolver`, and again on the
 * server inside `registerUser` / the Credentials `authorize()`. Client-side
 * validation is a UX affordance only - a hand-rolled POST bypasses it entirely,
 * so the server never trusts input that has merely "already been validated".
 *
 * DELIBERATELY TRANSFORM-FREE
 * ---------------------------
 * No `.trim()` or `.toLowerCase()` in these schemas. A transform makes a
 * schema's input and output types differ, which forces React Hook Form's
 * generics apart and gets noisy under `exactOptionalPropertyTypes`.
 * Normalisation happens instead in `normalizeEmail` / `normalizeName` at the
 * point of use, which is also where it actually matters: immediately before a
 * database read or write.
 *
 * The consequence, which cost a bug: validation runs BEFORE that normalisation,
 * so a rule applied to the raw string rejects input that normalising would have
 * made valid. `z.email()` on "  ali@example.com " fails, and the user is told
 * their address is invalid because they pasted a trailing space.
 *
 * So anything whitespace-sensitive is checked against the TRIMMED value inside
 * `.refine()`. A refinement leaves the inferred type alone, unlike a transform,
 * which keeps both properties: forgiving input, and identical client/server
 * verdicts.
 */

/** Below this, a password is trivially brute-forced. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * bcrypt silently truncates input past 72 bytes, so anything longer would make
 * the extra characters decorative. Rejecting is honest; truncating is not.
 */
export const PASSWORD_MAX_LENGTH = 72;

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 80;

/** Hoisted so the refinement below does not rebuild it on every check. */
const emailCheck = z.email();

const emailField = z
  .string()
  .max(254, { error: "That email address is too long." })
  .refine((value) => emailCheck.safeParse(value.trim()).success, {
    error: "Enter a valid email address.",
  });

/**
 * Applied on registration only. Login deliberately does NOT reuse this - see
 * {@link loginSchema}.
 */
const newPasswordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`,
  })
  .regex(/[a-zA-Z]/, { error: "Password must contain at least one letter." })
  .regex(/[0-9]/, { error: "Password must contain at least one number." });

export const loginSchema = z.object({
  email: emailField,

  /**
   * Only checked for presence. Applying the registration policy here would
   * reject a legacy password that no longer meets it, and would leak the
   * current policy to anyone probing the login form.
   */
  password: z.string().min(1, { error: "Password is required." }),
});

export const registerSchema = z
  .object({
    name: z
      .string()
      .max(NAME_MAX_LENGTH, {
        error: `Name must be at most ${NAME_MAX_LENGTH} characters.`,
      })
      /**
       * Length is measured after trimming, so "  A  " is rejected for being one
       * character rather than accepted for being five. A bare `.min(2)` would
       * also let "  " through.
       */
      .refine((value) => value.trim().length >= NAME_MIN_LENGTH, {
        error: `Name must be at least ${NAME_MIN_LENGTH} characters.`,
      }),
    email: emailField,
    password: newPasswordField,
    confirmPassword: z.string().min(1, { error: "Confirm your password." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Canonical form of an email for storage and lookup.
 *
 * `User.email` is `@unique`, so "Ali@Example.com" and "ali@example.com" would
 * otherwise become two accounts. Every read and write of that column must go
 * through this.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Collapses surrounding and repeated whitespace in a display name. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
