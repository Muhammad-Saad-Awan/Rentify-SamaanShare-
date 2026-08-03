/**
 * Central type exports
 * Add feature-specific types as the project grows
 */

// Re-export all types from feature files
// export * from './auth';
// export * from './listing';
// export * from './booking';
// export * from './payment';
// export * from './api';

/**
 * Common API response type
 */
export type ActionResult<T = void> =
  { success: true; data: T } | { success: false; error: string };

/**
 * The `error` value an action returns when there is no usable session.
 *
 * A sentinel rather than a sentence, because the caller has to *branch* on it: a
 * signed-out click is not a failure to report, it is a prompt to sign in, and the
 * component decides whether that means a redirect or a message. Comparing against
 * display copy would break the moment the wording changed.
 *
 * Lives here, next to `ActionResult`, and not in an action module: a `"use server"`
 * file may only export async functions, so a shared constant cannot sit alongside
 * the actions that return it.
 */
export const UNAUTHENTICATED_ERROR = "UNAUTHENTICATED";

/**
 * Pagination type
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
