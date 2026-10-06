/**
 * Where chat lives. One place, so the inbox, the toasts and every "Message" button agree.
 *
 * Under `/dashboard`, which middleware already protects - no new entry in `PROTECTED_PREFIXES`.
 */

export const MESSAGES_ROUTE = "/dashboard/messages";

export const ADMIN_CONVERSATIONS_ROUTE = "/admin/conversations";

export function conversationHref(conversationId: string): string {
  return `${MESSAGES_ROUTE}/${conversationId}`;
}

export function adminConversationHref(conversationId: string): string {
  return `${ADMIN_CONVERSATIONS_ROUTE}/${conversationId}`;
}
