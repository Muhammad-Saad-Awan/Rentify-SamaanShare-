/**
 * Display helpers for user identity.
 *
 * A SamaanShare account can reach the dashboard with `name` still null - the
 * credentials registration form does not require it, and a Google profile can
 * omit it. Every helper here therefore degrades to the email, and finally to a
 * neutral placeholder, rather than rendering "undefined".
 */

interface DisplayUser {
  name?: string | null;
  email?: string | null;
}

/** Best available human name for a user. */
export function getDisplayName(user: DisplayUser): string {
  const name = user.name?.trim();

  if (name) {
    return name;
  }

  // The local part only: the full address is already shown beneath the name in
  // the user menu, so repeating the domain adds nothing.
  const email = user.email?.trim();

  return email?.split("@")[0] ?? "Account";
}

/**
 * One or two uppercase letters for an avatar fallback.
 *
 * Two initials from a multi-word name ("Muhammad Saad" to "MS"), otherwise the
 * first character of whatever {@link getDisplayName} resolved to.
 */
export function getInitials(user: DisplayUser): string {
  const words = getDisplayName(user).split(/\s+/).filter(Boolean);

  // `.at()` rather than `[0]`, so `noUncheckedIndexedAccess` is satisfied by
  // optional chaining instead of a non-null assertion.
  const first = words.at(0)?.at(0) ?? "";
  const last = words.length >= 2 ? (words.at(-1)?.at(0) ?? "") : "";

  return `${first}${last}`.toUpperCase() || "?";
}
