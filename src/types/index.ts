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
  | { success: true; data: T }
  | { success: false; error: string };

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
