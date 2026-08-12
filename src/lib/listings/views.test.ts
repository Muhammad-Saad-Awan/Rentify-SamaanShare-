import { describe, expect, it } from "vitest";

import {
  VIEW_ABUSE_LIMIT,
  VIEW_ABUSE_WINDOW_MS,
  VIEW_DEDUPE_WINDOW_MS,
  viewAbuseKey,
  viewDedupeKey,
  viewSessionKey,
} from "@/lib/listings/views";

/**
 * View counting keys and windows.
 *
 * The keys matter more than they look. The rate limiter's contract is that a key must include the
 * action name as well as the identity - a key of just the identity would share one budget with
 * unrelated endpoints, so a user who browsed a lot of listings would find they could no longer sign
 * in. That is the property most of these assert.
 */

describe("viewDedupeKey", () => {
  it("scopes to one viewer and one listing", () => {
    expect(viewDedupeKey("listing-1", "user-1")).toBe(
      "listing-view:listing-1:user-1"
    );
  });

  it("gives different listings different keys for the same viewer", () => {
    expect(viewDedupeKey("a", "user-1")).not.toBe(viewDedupeKey("b", "user-1"));
  });

  it("gives different viewers different keys for the same listing", () => {
    expect(viewDedupeKey("a", "user-1")).not.toBe(viewDedupeKey("a", "user-2"));
  });

  /** The rate limiter's documented requirement. */
  it("is namespaced by the action", () => {
    expect(viewDedupeKey("a", "b").startsWith("listing-view:")).toBe(true);
  });
});

describe("viewAbuseKey", () => {
  it("scopes to the viewer across all listings", () => {
    expect(viewAbuseKey("user-1")).toBe("listing-view-total:user-1");
  });

  /**
   * Must not collide with the per-listing key, or one budget would consume the other and a viewer
   * would be cut off after a single listing.
   */
  it("occupies a different namespace to the per-listing key", () => {
    expect(viewAbuseKey("user-1")).not.toBe(viewDedupeKey("user-1", "user-1"));
  });

  it("separates an anonymous viewer from a signed-in one with a matching id", () => {
    // The action prefixes addresses with `ip:` for exactly this reason.
    expect(viewAbuseKey("ip:1.2.3.4")).not.toBe(viewAbuseKey("1.2.3.4"));
  });
});

describe("viewSessionKey", () => {
  it("is per listing", () => {
    expect(viewSessionKey("a")).not.toBe(viewSessionKey("b"));
    expect(viewSessionKey("a")).toBe("ss:viewed:a");
  });
});

describe("windows", () => {
  it("dedupes a viewer for six hours", () => {
    // Long enough that a refresh or a return within the day does not inflate the number, short
    // enough that a genuine visit tomorrow still counts.
    expect(VIEW_DEDUPE_WINDOW_MS).toBe(6 * 60 * 60 * 1000);
  });

  it("keeps the abuse window shorter than the dedupe window", () => {
    // The two measure different things and must not be conflated: one bounds a script's reach per
    // hour, the other decides when one person's view counts again.
    expect(VIEW_ABUSE_WINDOW_MS).toBeLessThan(VIEW_DEDUPE_WINDOW_MS);
  });

  it("sets an abuse ceiling well above real browsing", () => {
    expect(VIEW_ABUSE_LIMIT).toBeGreaterThan(50);
  });
});
