import { z } from "zod";

import { listingIdSchema } from "@/lib/validations/listing";

/**
 * Notification input rules.
 *
 * `listingIdSchema` is the shared cuid check, reused rather than redeclared - the name is about
 * where it was first needed, not what it validates, and every id in this schema is a cuid.
 */

/**
 * Marking notifications read.
 *
 * The id is optional and its absence is meaningful: no id means "all of mine". That is a real
 * affordance ("Mark all read"), not a missing argument, so it is modelled here rather than
 * being a second action that would duplicate the authorization.
 */
export const markNotificationsReadSchema = z.object({
  notificationId: listingIdSchema.optional(),
});

export type MarkNotificationsReadInput = z.infer<
  typeof markNotificationsReadSchema
>;
