/**
 * Notification display constants.
 *
 * WHY THESE ARE NOT IN THE QUERY MODULE. They were, and it broke the production build. The header
 * panel is a Client Component and needs the badge cap to render "9+"; importing it from
 * `@/lib/queries/notifications` pulled that module's `prisma` import along, which dragged the
 * `pg` driver into the browser bundle and failed on `net` and `tls`.
 *
 * A value shared between a Server Component and a Client Component has to live somewhere with no
 * server-only imports at all. `src/config/` is exactly that - the same reason the cities and
 * locale config sit there rather than beside the queries that use them.
 */

/** How many notifications the header dropdown shows before "View all". */
export const NOTIFICATION_PREVIEW_COUNT = 6;

/** Page size for the full feed. */
export const NOTIFICATIONS_PAGE_SIZE = 20;

/**
 * Where the unread badge stops counting.
 *
 * Past this the exact number tells the reader nothing they will act on, and an unbounded count is
 * an unbounded `COUNT(*)`. The query reads `UNREAD_BADGE_CAP + 1` rows and stops.
 */
export const UNREAD_BADGE_CAP = 9;
