"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { NOTIFICATION_EVENT } from "@/lib/realtime/channels";

import type { Channel } from "pusher-js";

/**
 * The browser end of realtime notification delivery.
 *
 * Renders nothing a person can see. It subscribes to this member's own private channel and, when
 * something arrives, does two things: raises a toast, and asks the router to refresh.
 *
 * THE EVENT IS A NUDGE, NOT DATA. Nothing here is rendered from the payload except the toast's
 * one line. The badge, the panel and the feed are all Server Components, and `router.refresh()`
 * re-runs them against Postgres - so the numbers on screen are always what the database says,
 * never what a message claimed. That is what makes a dropped event cost a delay instead of a
 * wrong count, and a duplicated one cost nothing at all.
 *
 * It also means one mechanism covers every surface. A settled booking updates the bell, the
 * notification list AND the booking card, because all three are re-rendered - no per-feature
 * wiring, and nothing to forget when a new screen is added.
 *
 * PUSHER-JS IS IMPORTED INSIDE THE EFFECT, not at module scope. It is around 30 kB, it is needed
 * only by signed-in members, and a static import would put it in the chunk the dashboard layout
 * loads before first paint. This way it arrives after the page is interactive and never at all
 * for a visitor who does not reach a dashboard.
 *
 * THE CHANNEL NAME IS A PROP, NOT BUILT HERE, and it is not trusted either. The server that
 * rendered this page derived it from the session, and `/api/realtime/auth` derives it again and
 * compares before signing. A tampered prop gets a 403 and no subscription - the client's claim
 * about who it is never reaches Pusher.
 */

interface RealtimeNotificationsProps {
  /** `private-user-{id}`, built by the layout from the session. */
  channel: string;
  pusherKey: string;
  cluster: string;
}

/**
 * How long to wait before refreshing, so a burst becomes one render.
 *
 * Several notifications commonly land together - a settlement writes two - and each one
 * triggering its own refresh would re-render the route twice for one event. Short enough that
 * nobody perceives it as lag.
 */
const REFRESH_DEBOUNCE_MS = 400;

/**
 * How many ids to remember for deduplication.
 *
 * Pusher can redeliver on reconnect, and a refresh can race an event. Bounded because this is a
 * long-lived page in a browser tab; past the cap the whole set is dropped, which at worst allows
 * one duplicate toast for a very old notification and cannot affect any count.
 */
const SEEN_LIMIT = 200;

interface IncomingNotification {
  id: string;
  title: string;
}

function RealtimeNotifications({
  channel,
  pusherKey,
  cluster,
}: RealtimeNotificationsProps) {
  const router = useRouter();

  /** Exposed for the end-to-end tests, which must not act before the socket is up. */
  const [state, setState] = useState("initializing");

  const seen = useRef<Set<string>>(new Set());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasConnected = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let channelRef: Channel | null = null;
    let clientRef: InstanceType<typeof import("pusher-js").default> | null =
      null;

    function scheduleRefresh() {
      if (refreshTimer.current !== null) {
        clearTimeout(refreshTimer.current);
      }

      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        router.refresh();
      }, REFRESH_DEBOUNCE_MS);
    }

    void (async () => {
      const { default: Pusher } = await import("pusher-js");

      /**
       * The effect can be torn down while this import is in flight - React runs effects twice in
       * development, and a fast navigation does the same in production. Without this the second
       * run would leave an orphaned connection nobody unsubscribes.
       */
      if (cancelled) {
        return;
      }

      const client = new Pusher(pusherKey, {
        cluster,
        // Signed by `/api/realtime/auth`, which checks the session before it signs anything.
        channelAuthorization: {
          endpoint: "/api/realtime/auth",
          transport: "ajax",
        },
        forceTLS: true,
      });

      clientRef = client;

      client.connection.bind("state_change", (change: { current: string }) => {
        setState(change.current);

        if (change.current !== "connected") {
          return;
        }

        /**
         * RECONNECTS REFRESH; the first connection does not.
         *
         * Anything that happened while the socket was down was still written to the database, so
         * one refresh recovers all of it - no cursor, no replay, no missed-event endpoint. The
         * first connection is skipped because the page was server-rendered moments ago and is
         * already current.
         */
        if (hasConnected.current) {
          scheduleRefresh();

          return;
        }

        hasConnected.current = true;
      });

      const subscription = client.subscribe(channel);

      channelRef = subscription;

      subscription.bind(
        NOTIFICATION_EVENT,
        (payload: IncomingNotification | undefined) => {
          if (!payload?.id || seen.current.has(payload.id)) {
            return;
          }

          if (seen.current.size >= SEEN_LIMIT) {
            seen.current.clear();
          }

          seen.current.add(payload.id);

          if (payload.title) {
            toast(payload.title);
          }

          scheduleRefresh();
        }
      );
    })();

    return () => {
      cancelled = true;

      if (refreshTimer.current !== null) {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }

      channelRef?.unbind_all();
      clientRef?.unsubscribe(channel);
      clientRef?.disconnect();
    };
  }, [channel, pusherKey, cluster, router]);

  /**
   * Hidden, and present only so a test can wait for the socket before acting.
   *
   * A two-browser test that clicks before the second browser has subscribed proves nothing and
   * fails intermittently. `hidden` keeps it out of the layout and out of the accessibility tree.
   */
  return <span hidden data-realtime-state={state} />;
}

export { RealtimeNotifications };
