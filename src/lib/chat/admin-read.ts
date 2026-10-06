import { AdminActionType } from "@/generated/prisma/enums";
import { writeAdminAction } from "@/lib/admin/log";
import {
  adminConversationGrounds,
  describeAdminViewGround,
  findAdminViewGround,
} from "@/lib/chat/admin-access";
import { CONVERSATION_NOT_FOUND_ERROR } from "@/lib/chat/rules";
import { prisma } from "@/lib/prisma";
import {
  getAdminGroundInputs,
  getConversationOffers,
  getMessagesPage,
} from "@/lib/queries/chat";

import type {
  AdminViewGround,
  AdminViewGroundKind,
} from "@/lib/chat/admin-access";
import type { MessagePage, OfferView } from "@/lib/queries/chat";

/**
 * An administrator reading a conversation. See `admin-access.ts` for when that is allowed.
 *
 * THE AUDIT ROW IS WRITTEN BEFORE ANY MESSAGE IS READ, and every page is a separate read with its
 * own row. If the write fails, nothing is returned. A log that can miss a read is not an audit.
 */

export type AdminReadResult =
  | {
      ok: true;
      page: MessagePage;
      /** The structured terms the OFFER messages refer to - part of the same logged read. */
      offers: OfferView[];
      ground: AdminViewGround;
    }
  | { ok: false; error: string; grounds?: AdminViewGround[] };

/**
 * The grounds an administrator could cite for this conversation, without reading anything.
 *
 * For the screen that asks them to choose one. Reveals nothing but ids the administrator can already
 * see in the claims and reports queues.
 */
export async function listAdminGrounds(
  conversationId: string
): Promise<AdminViewGround[] | null> {
  const inputs = await getAdminGroundInputs(conversationId);

  if (!inputs) {
    return null;
  }

  return adminConversationGrounds({
    renterId: inputs.conversation.renterId,
    ownerId: inputs.conversation.ownerId,
    claims: inputs.claims,
    handovers: inputs.handovers,
    reports: inputs.reports,
  });
}

export async function readConversationAsAdmin({
  adminId,
  conversationId,
  ground: requested,
  reason,
  beforeId,
}: {
  adminId: string;
  conversationId: string;
  ground: { kind: AdminViewGroundKind; id: string };
  reason: string;
  beforeId?: string | undefined;
}): Promise<AdminReadResult> {
  const grounds = await listAdminGrounds(conversationId);

  if (!grounds) {
    return { ok: false, error: CONVERSATION_NOT_FOUND_ERROR };
  }

  const ground = findAdminViewGround(grounds, requested);

  if (!ground) {
    return {
      ok: false,
      error:
        grounds.length === 0
          ? "There is no claim, dispute or report that would justify reading this conversation."
          : "That is not a ground for reading this conversation.",
      grounds,
    };
  }

  await writeAdminAction(prisma, {
    actorId: adminId,
    subjectId: ground.subjectId,
    type: AdminActionType.VIEW_CONVERSATION,
    reason,
    newValue: describeAdminViewGround(ground),
    conversationId,
    ...(ground.kind === "report" ? { reportId: ground.id } : {}),
  });

  const [page, offers] = await Promise.all([
    getMessagesPage(conversationId, beforeId),
    getConversationOffers(conversationId),
  ]);

  return { ok: true, page, offers, ground };
}
