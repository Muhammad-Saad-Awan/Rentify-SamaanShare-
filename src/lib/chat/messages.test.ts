import { describe, expect, it } from "vitest";

import {
  bookingEventText,
  bookingRequestedText,
  describeTerms,
  offerEventText,
} from "@/lib/chat/messages";

const terms = {
  startDate: new Date("2027-03-10T00:00:00.000Z"),
  endDate: new Date("2027-03-12T00:00:00.000Z"),
  totalPrice: 4500,
  securityDeposit: 0,
};

describe("SYSTEM message wording", () => {
  it("states rent, dates and a waived deposit in words", () => {
    const text = describeTerms(terms);

    expect(text).toContain("4,500");
    expect(text).toContain("no deposit");
  });

  it("says whether an acceptance changed a booking or still has to be booked", () => {
    expect(
      offerEventText("accepted", terms, { appliedToBooking: true })
    ).toContain("The booking now carries these terms.");
    expect(
      offerEventText("accepted", terms, { appliedToBooking: false })
    ).toContain("Book these dates within");
  });

  it("names declined and withdrawn offers", () => {
    expect(
      offerEventText("declined", terms, { appliedToBooking: false })
    ).toMatch(/^Offer declined/);
    expect(
      offerEventText("withdrawn", terms, { appliedToBooking: false })
    ).toMatch(/^Offer withdrawn/);
  });

  it("says where a booking's terms came from", () => {
    expect(bookingRequestedText(terms, { fromOffer: true })).toContain(
      "agreed terms"
    );
    expect(bookingRequestedText(terms, { fromOffer: false })).toContain(
      "listing's rates"
    );
  });
});

describe("booking event lines", () => {
  const dates = {
    startDate: new Date("2027-03-10T00:00:00.000Z"),
    endDate: new Date("2027-03-12T00:00:00.000Z"),
  };

  it("names the booking by its dates, so a thread with two bookings stays clear", () => {
    expect(bookingEventText({ event: "approved" }, dates)).toMatch(
      /^Booking for .+ to .+ was approved by the owner\.$/
    );
  });

  it("quotes a reason when one was given, and says nothing when not", () => {
    expect(
      bookingEventText(
        { event: "declined", reason: "  Away that week " },
        dates
      )
    ).toContain('Reason: "Away that week"');
    expect(
      bookingEventText(
        { event: "cancelled", by: "renter", reason: null },
        dates
      )
    ).not.toContain("Reason");
  });

  it("states each step in neutral words both sides can read", () => {
    expect(
      bookingEventText(
        { event: "payment-selected", methodLabel: "cash" },
        dates
      )
    ).toContain("chose to pay by cash");
    expect(
      bookingEventText({ event: "claim-filed", reasonLabel: "Damaged" }, dates)
    ).toContain("deposit claim (Damaged)");
  });
});
