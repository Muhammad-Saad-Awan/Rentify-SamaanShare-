import { describe, expect, it } from "vitest";

import { NotificationType } from "@/generated/prisma/enums";
import { notificationEvents } from "@/lib/realtime/channels";

import type { CreatedNotification } from "@/lib/notifications/create";

/**
 * The wire form.
 *
 * What is asserted here is mostly what is ABSENT. Every field in this payload crosses a third
 * party's infrastructure, and the database stays authoritative only for as long as the client
 * has nothing to render from - so a field quietly added here is a field somebody will eventually
 * render, at which point a dropped event becomes a wrong number instead of a late one.
 */

const created: CreatedNotification = {
  id: "cmf0000000000000000000000",
  userId: "renter-1",
  type: NotificationType.BOOKING_SETTLED,
  title: "Your payout for a camera is ready",
  entityType: "booking-request",
  entityId: "cmf1111111111111111111111",
  createdAt: new Date("2026-09-30T10:00:00.000Z"),
};

describe("notificationEvents", () => {
  it("addresses each event to its own recipient", () => {
    const events = notificationEvents([
      created,
      { ...created, id: "second", userId: "owner-1" },
    ]);

    expect(events.map((e) => e.userId)).toEqual(["renter-1", "owner-1"]);
  });

  it("carries the id, which is what the subscriber deduplicates on", () => {
    const [event] = notificationEvents([created]);

    expect(event?.event.id).toBe(created.id);
  });

  /** The one concession to convenience: it saves a round trip purely to render a toast. */
  it("carries the title, for the toast", () => {
    const [event] = notificationEvents([created]);

    expect(event?.event.title).toBe(created.title);
  });

  /**
   * The assertion that matters. `body` is the long half of a notification and it is on the page
   * a moment after the refresh anyway - there is no reason for it to reach Pusher.
   */
  it("carries no body, and nothing else beyond the agreed shape", () => {
    const [event] = notificationEvents([created]);

    expect(Object.keys(event?.event ?? {}).sort()).toEqual([
      "createdAt",
      "entityId",
      "entityType",
      "id",
      "title",
      "type",
    ]);
  });

  /** JSON over a socket has no Date, so the conversion happens once, here. */
  it("sends the timestamp as an ISO string", () => {
    const [event] = notificationEvents([created]);

    expect(event?.event.createdAt).toBe("2026-09-30T10:00:00.000Z");
  });

  it("maps nothing to nothing", () => {
    expect(notificationEvents([])).toEqual([]);
  });
});
