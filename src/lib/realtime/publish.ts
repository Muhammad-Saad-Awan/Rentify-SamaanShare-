import { after } from "next/server";

import { notificationEvents } from "@/lib/realtime/channels";
import { publishNotifications } from "@/lib/realtime/server";

import type { CreatedNotification } from "@/lib/notifications/create";

/**
 * The bridge from a written notification to a published event.
 *
 * SEPARATE FROM `notifications/create.ts` ON PURPOSE. That module runs inside database
 * transactions and is imported by `verify:*` scripts and the expiry sweep; giving it a Pusher
 * import and a `next/server` dependency would make it unusable in all three. Notifications do not
 * need to know they are delivered, and delivery does not need to know how they are written.
 *
 * AFTER THE COMMIT, WHICH IS THE WHOLE POINT OF THIS FILE EXISTING. A notification is written
 * inside the transaction that caused it, so publishing from there would announce a booking
 * transition that a later statement could still roll back - a renter told their payment was
 * verified, refreshing, and finding it was not. So the rows travel out of the transaction as
 * return values and are published only once `$transaction` has resolved.
 *
 * WHY NOT AsyncLocalStorage, which was the plan. A store has to be entered by someone, and
 * `AsyncLocalStorage.run()` needs an enclosing call - Next gives no per-request hook around a
 * Server Action to put one in. The alternative was wrapping every action, which is the invasive
 * change the buffer was meant to avoid. Threading the rows out as return values is a line or two
 * per action and, unlike a hidden buffer, it is visible at the call site that publishing is
 * happening and what is being published.
 */

/**
 * Publishes once the response has been sent.
 *
 * `after()` rather than awaiting inline, so an outbound HTTPS round trip to Pusher is not added
 * to the latency of the click that caused it. Vercel keeps the invocation alive for the callback,
 * which is the part that would not work with a bare floating promise - a serverless function may
 * be frozen the moment it returns, and a fire-and-forget publish would simply never be sent.
 *
 * NOTHING IS AWAITED AND NOTHING CAN FAIL UPWARDS. `publishNotifications` swallows its own
 * errors; this adds no error path of its own. A caller cannot be made to care whether delivery
 * worked, because the row is committed either way and the recipient sees it on their next page
 * load - which is precisely how the product behaved before any of this existed.
 */
export function publishAfterCommit(
  created: readonly CreatedNotification[]
): void {
  if (created.length === 0) {
    return;
  }

  const events = notificationEvents(created);

  after(() => publishNotifications(events));
}
