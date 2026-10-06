import { describe, expect, it } from "vitest";

import { BookingStatus } from "@/generated/prisma/enums";
import { quickRepliesFor, rentalStage } from "@/lib/chat/quick-replies";

describe("rentalStage", () => {
  it("is an inquiry with no booking, or when the latest one fell through", () => {
    expect(rentalStage([])).toBe("inquiry");

    for (const status of [
      BookingStatus.DECLINED,
      BookingStatus.CANCELLED,
      BookingStatus.EXPIRED,
    ]) {
      expect(rentalStage([{ status }])).toBe("inquiry");
    }
  });

  it("follows the newest booking through the rental", () => {
    expect(rentalStage([{ status: BookingStatus.PENDING }])).toBe("booked");
    expect(rentalStage([{ status: BookingStatus.PAYMENT_PENDING }])).toBe(
      "booked"
    );
    expect(rentalStage([{ status: BookingStatus.ACTIVE }])).toBe("active");
    expect(rentalStage([{ status: BookingStatus.REVIEWED }])).toBe("returned");
  });

  it("uses the newest booking, not an older finished one", () => {
    expect(
      rentalStage([
        { status: BookingStatus.APPROVED },
        { status: BookingStatus.COMPLETED },
      ])
    ).toBe("booked");
  });
});

describe("quickRepliesFor", () => {
  it("offers something for every role and stage, and never names a price", () => {
    for (const role of ["renter", "owner"] as const) {
      for (const stage of [
        "inquiry",
        "booked",
        "active",
        "returned",
      ] as const) {
        const replies = quickRepliesFor(role, stage);

        expect(replies.length).toBeGreaterThan(0);
        expect(replies.join(" ")).not.toMatch(/rs\.?\s?\d|\d{3,}/i);
      }
    }
  });
});
