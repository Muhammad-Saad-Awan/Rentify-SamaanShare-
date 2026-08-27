import type { Prisma } from "@/generated/prisma/client";
import type { AdminActionType } from "@/generated/prisma/enums";

/**
 * Writing the administrator audit record.
 *
 * ONE FUNCTION, CALLED FROM EVERY PATH. The moderation queue, the members screen and the bootstrap
 * script all go through this, which is the point: before it, suspending someone through
 * `resolveReport` left the Report row as the only evidence and a suspension applied by hand would
 * have left none at all. Two ways of recording the same act is how one of them stops recording it.
 *
 * ALWAYS IN THE CALLER'S TRANSACTION. The log and the change it describes must land together. A
 * status change without its record is the state this exists to end, and a record without the change
 * is a claim that something happened when it did not - and nothing would ever detect either.
 *
 * APPEND ONLY. There is no update or delete path here, deliberately. A log its author can revise is
 * not a log, and the moment it would matter is exactly the moment somebody would want to revise it.
 */

/** The subset of the client this needs, so both `prisma` and a `$transaction` callback satisfy it. */
export type AdminActionWriter = Pick<Prisma.TransactionClient, "adminAction">;

export interface AdminActionInput {
  /**
   * The administrator responsible, or `null` for the bootstrap grant only.
   *
   * There is no administrator to attribute the first grant to - that is the problem it solves - and
   * recording a fiction would be worse than recording the gap.
   */
  actorId: string | null;
  subjectId: string;
  type: AdminActionType;
  reason: string;
  /** What the field held before and after, as plain strings - see the column note. */
  previousValue?: string | undefined;
  newValue?: string | undefined;
  /** The report this answered, when it came from the moderation queue. */
  reportId?: string | undefined;
}

export async function writeAdminAction(
  client: AdminActionWriter,
  {
    actorId,
    subjectId,
    type,
    reason,
    previousValue,
    newValue,
    reportId,
  }: AdminActionInput
): Promise<void> {
  await client.adminAction.create({
    data: {
      ...(actorId ? { actorId } : {}),
      subjectId,
      type,
      reason,
      ...(previousValue ? { previousValue } : {}),
      ...(newValue ? { newValue } : {}),
      ...(reportId ? { reportId } : {}),
    },
    select: { id: true },
  });
}
