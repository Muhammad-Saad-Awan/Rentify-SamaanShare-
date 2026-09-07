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

/** Asking for a reset link. Email only - nothing else is needed or trusted. */
export const forgotPasswordSchema = z.object({
  email: emailField,
});

/**
 * Choosing a new password from a reset link.
 *
 * Reuses `newPasswordField`, so a reset cannot set a password that registration would have refused -
 * otherwise the reset flow becomes a way around the policy.
 *
 * The token is validated only for shape here. It is 32 random bytes as base64url, so 43 characters
 * of the URL-safe alphabet; anything else cannot match a stored hash and is rejected without a
 * database round trip.
 */
export const resetPasswordSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{20,200}$/, {
      error: "That reset link is not valid.",
    }),
    password: newPasswordField,
    confirmPassword: z.string().min(1, { error: "Confirm your password." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords do not match.",
    path: ["confirmPassword"],
  });

/**
 * Changing a password from inside the app.
 *
 * REUSES `newPasswordField`, like the reset flow, so no route into the account can set a
 * password that registration would have refused - otherwise whichever route is laxest
 * becomes the policy.
 *
 * The current password is only checked for presence here, for the reason
 * {@link loginSchema} gives: applying the policy to it would reject a legacy password
 * that predates the current rules, and would tell anyone probing the form what those
 * rules are. Whether it is *correct* is the server's business, and cannot be the
 * browser's.
 *
 * The "must differ" rule is not security theatre in this one case: someone reaches this
 * form because they believe the old password is known to somebody else, and re-entering
 * it would leave them believing they had fixed that.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, {
      error: "Enter your current password.",
    }),
    newPassword: newPasswordField,
    confirmPassword: z.string().min(1, { error: "Confirm your new password." }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    error: "Passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    error: "Choose a password different from your current one.",
    path: ["newPassword"],
  });

/**
 * Adding a password to an account that has never had one.
 *
 * A Google-only account has `User.password` of `null`, so there is no current password to
 * ask for and the live session is the proof of control - the same standing the reset link
 * has, arrived at differently. Setting one is what lets that member sign in when Google is
 * unavailable, and it is the precondition for disconnecting Google at all: see
 * `disconnectAccount`, which refuses to leave an account with no way in.
 *
 * Deliberately NOT `changePasswordSchema.partial()`. That would make `currentPassword`
 * optional on the change path too, and an optional check is not a check.
 */
export const setPasswordSchema = z
  .object({
    newPassword: newPasswordField,
    confirmPassword: z.string().min(1, { error: "Confirm your password." }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    error: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

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
