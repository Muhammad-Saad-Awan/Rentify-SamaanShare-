import { getActiveUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeUserChannel } from "@/lib/realtime/channels";
import { authorizeChannel } from "@/lib/realtime/server";

/**
 * Pusher channel authorization.
 *
 * Pusher refuses a subscription to any `private-` channel unless the browser can present a
 * signature made with our app secret. The browser cannot make one, so it posts here with the
 * socket id Pusher gave it and the channel it wants, and this endpoint decides.
 *
 * THIS IS THE AUTHORIZATION BOUNDARY OF THE WHOLE REALTIME LAYER. Everything else is delivery.
 * If this signs the wrong channel, a member receives another member's notifications, and no
 * amount of care elsewhere recovers from it - so the decision itself lives in
 * `authorizeUserChannel`, pure and unit-tested, and this file does nothing but session, rate
 * limit, decide, sign.
 *
 * THE CLIENT'S CLAIM IS NEVER THE ANSWER. The request body carries a channel name, and it is used
 * only as something to compare against a channel built from the session. No user id is read out
 * of it, and there is no path by which a caller's assertion about who they are reaches Pusher.
 *
 * SESSION IS `getActiveUser()`, NOT THE RAW TOKEN. It re-reads the database, so a suspended or
 * deleted account cannot open a new subscription on the strength of a cookie that is up to 24h
 * stale. A subscription outlives the request that authorized it, which makes that staleness
 * matter more here than on a page: the page is re-rendered on the next navigation, the socket is
 * not.
 *
 * NOT COVERED BY MIDDLEWARE, and it does not need to be. `/api/realtime` is outside
 * `PROTECTED_PREFIXES`, so middleware passes it through - which is correct, because a route
 * handler must do its own check anyway and a middleware redirect would answer a POST with HTML.
 */

/** Pusher posts form-encoded, so the body is read as form data rather than JSON. */
export async function POST(request: Request): Promise<Response> {
  const user = await getActiveUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  /**
   * Rate limited per user, generously.
   *
   * A browser authorizes once per connection, and reconnects after a network drop - so a handful
   * a minute is normal and a hundred is a loop. This bounds a client bug that would otherwise
   * spend the Pusher quota, rather than defending against an attacker, who would need a valid
   * session to get this far.
   */
  const rate = checkRateLimit(`realtime-auth:${user.id}`, {
    limit: 60,
    windowMs: 60_000,
  });

  if (!rate.allowed) {
    return new Response("Too many requests", { status: 429 });
  }

  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const socketId = form.get("socket_id");

  if (typeof socketId !== "string" || socketId.length === 0) {
    return new Response("Bad request", { status: 400 });
  }

  const decision = authorizeUserChannel({
    sessionUserId: user.id,
    requestedChannel: form.get("channel_name"),
  });

  if (!decision.ok) {
    /**
     * 403, and the reason is not returned.
     *
     * A caller probing channel names learns only that they may not have this one - never whether
     * it belongs to somebody real. The same reasoning as the shared not-found message the payment
     * actions use for an admin-only booking.
     */
    return new Response("Forbidden", { status: 403 });
  }

  try {
    return Response.json(authorizeChannel(socketId, decision.channel));
  } catch (error) {
    /**
     * Only reachable when the keys are absent, which means a subscriber was rendered that should
     * not have been. Logged as a configuration fault rather than reported to the browser, where
     * it would read as a permission problem.
     */
    console.error("Realtime authorization failed", error);

    return new Response("Realtime unavailable", { status: 503 });
  }
}
