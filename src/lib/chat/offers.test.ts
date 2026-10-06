import { describe, expect, it } from "vitest";

import { BookingStatus, OfferStatus } from "@/generated/prisma/enums";
import { MAX_BOOKING_DAYS } from "@/lib/bookings/pricing";
import {
  ACCEPTED_OFFER_VALID_HOURS,
  accessDepositFor,
  bookingTermsAmendable,
  bookingTermsFromOffer,
  canProposeOffer,
  canRespondToOffer,
  canWithdrawOffer,
  checkOfferForBooking,
  effectiveOfferStatus,
  OFFER_EXPIRY_HOURS,
  OFFER_NOT_FOUND_ERROR,
  offerExpiresAt,
  TERMS_LOCKED_ERROR,
  toCalendarDay,
} from "@/lib/chat/offers";

/**
 * Structured offers.
 *
 * The load-bearing assertions:
 *   - only the recipient can accept;
 *   - nothing can be accepted or proposed against a booking once payment has begun;
 *   - a booking can only be made from an offer whose terms it matches exactly;
 *   - a negotiated deposit never lowers the renter's access tier.
 */

const HOUR_MS = 3_600_000;
const NOW = new Date("2026-10-06T12:00:00Z");
const TODAY = "2026-10-06";
const OPEN = { allowed: true } as const;

const terms = {
  startDate: "2026-10-10",
  endDate: "2026-10-12",
  totalPrice: 4500,
  securityDeposit: 10_000,
};

const pendingOffer = {
  status: OfferStatus.PENDING,
  expiresAt: offerExpiresAt(NOW),
  proposedById: "renter",
  recipientId: "owner",
  startDate: terms.startDate,
};

describe("expiry", () => {
  it("gives the other party OFFER_EXPIRY_HOURS to answer", () => {
    expect(offerExpiresAt(NOW).getTime() - NOW.getTime()).toBe(
      OFFER_EXPIRY_HOURS * HOUR_MS
    );
  });

  it("treats a PENDING offer past its deadline as expired without a write", () => {
    const later = new Date(NOW.getTime() + OFFER_EXPIRY_HOURS * HOUR_MS);

    expect(effectiveOfferStatus(pendingOffer, NOW)).toBe(OfferStatus.PENDING);
    expect(effectiveOfferStatus(pendingOffer, later)).toBe(OfferStatus.EXPIRED);
  });

  it("never re-labels a closed offer", () => {
    const later = new Date(NOW.getTime() + 1000 * HOUR_MS);

    expect(
      effectiveOfferStatus(
        { ...pendingOffer, status: OfferStatus.ACCEPTED },
        later
      )
    ).toBe(OfferStatus.ACCEPTED);
  });

  it("reads a stored calendar day back as the same day", () => {
    expect(toCalendarDay(new Date("2026-10-10T00:00:00.000Z"))).toBe(
      "2026-10-10"
    );
  });
});

describe("bookingTermsAmendable", () => {
  it.each(Object.values(BookingStatus))("for %s", (status) => {
    const expected =
      status === BookingStatus.PENDING || status === BookingStatus.APPROVED;

    expect(bookingTermsAmendable({ status, paymentId: null })).toBe(expected);
  });

  it("is false once a payment row exists, whatever the status says", () => {
    expect(
      bookingTermsAmendable({
        status: BookingStatus.APPROVED,
        paymentId: "payment",
      })
    ).toBe(false);
  });
});

describe("canProposeOffer", () => {
  const base = {
    role: "renter" as const,
    writable: OPEN,
    terms,
    today: TODAY,
    booking: null,
  };

  it("allows either side to propose before a booking", () => {
    expect(canProposeOffer(base)).toEqual(OPEN);
    expect(canProposeOffer({ ...base, role: "owner" })).toEqual(OPEN);
  });

  it("passes through a closed conversation's reason", () => {
    const closed = { allowed: false as const, reason: "closed" };

    expect(canProposeOffer({ ...base, writable: closed })).toBe(closed);
  });

  it("refuses a non-participant", () => {
    expect(canProposeOffer({ ...base, role: null })).toEqual({
      allowed: false,
      reason: OFFER_NOT_FOUND_ERROR,
    });
  });

  it("refuses dates that have started, or ranges that are invalid or too long", () => {
    expect(
      canProposeOffer({
        ...base,
        terms: { ...terms, startDate: "2026-10-05" },
      }).allowed
    ).toBe(false);
    expect(
      canProposeOffer({
        ...base,
        terms: { ...terms, endDate: "2026-10-09" },
      }).allowed
    ).toBe(false);

    const start = Date.parse(`${terms.startDate}T00:00:00Z`);
    const tooLong = new Date(start + MAX_BOOKING_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);

    expect(
      canProposeOffer({ ...base, terms: { ...terms, endDate: tooLong } })
        .allowed
    ).toBe(false);
  });

  describe("against an existing booking", () => {
    const booking = {
      status: BookingStatus.APPROVED,
      paymentId: null,
      startDate: terms.startDate,
      endDate: terms.endDate,
    };

    it("allows a new price while terms are amendable", () => {
      expect(canProposeOffer({ ...base, booking })).toEqual(OPEN);
    });

    it("refuses once payment has begun", () => {
      expect(
        canProposeOffer({
          ...base,
          booking: {
            ...booking,
            status: BookingStatus.PAYMENT_PENDING,
            paymentId: "p",
          },
        })
      ).toEqual({ allowed: false, reason: TERMS_LOCKED_ERROR });
    });

    it("refuses different dates", () => {
      expect(
        canProposeOffer({
          ...base,
          booking,
          terms: { ...terms, endDate: "2026-10-13" },
        }).allowed
      ).toBe(false);
    });
  });
});

describe("canRespondToOffer", () => {
  const base = {
    offer: pendingOffer,
    userId: "owner",
    response: "accept" as const,
    now: NOW,
    today: TODAY,
    booking: null,
  };

  it("lets the recipient accept or decline", () => {
    expect(canRespondToOffer(base)).toEqual(OPEN);
    expect(canRespondToOffer({ ...base, response: "decline" })).toEqual(OPEN);
  });

  it("never lets the proposer accept their own offer", () => {
    expect(canRespondToOffer({ ...base, userId: "renter" })).toEqual({
      allowed: false,
      reason: "You cannot answer your own offer.",
    });
  });

  it("tells a stranger the offer does not exist", () => {
    expect(canRespondToOffer({ ...base, userId: "stranger" })).toEqual({
      allowed: false,
      reason: OFFER_NOT_FOUND_ERROR,
    });
  });

  it.each([
    OfferStatus.ACCEPTED,
    OfferStatus.DECLINED,
    OfferStatus.WITHDRAWN,
    OfferStatus.SUPERSEDED,
    OfferStatus.EXPIRED,
  ])("refuses an offer that is already %s", (status) => {
    expect(
      canRespondToOffer({ ...base, offer: { ...pendingOffer, status } }).allowed
    ).toBe(false);
  });

  it("refuses an offer past its deadline that nothing has marked expired", () => {
    expect(
      canRespondToOffer({
        ...base,
        now: new Date(NOW.getTime() + OFFER_EXPIRY_HOURS * HOUR_MS + 1),
      })
    ).toEqual({ allowed: false, reason: "This offer has expired." });
  });

  it("refuses to accept a booking offer once payment has begun, but allows declining it", () => {
    const locked = { status: BookingStatus.PAYMENT_PENDING, paymentId: "p" };

    expect(canRespondToOffer({ ...base, booking: locked })).toEqual({
      allowed: false,
      reason: TERMS_LOCKED_ERROR,
    });
    expect(
      canRespondToOffer({ ...base, booking: locked, response: "decline" })
    ).toEqual(OPEN);
  });

  it("refuses to accept a pre-booking offer whose dates have started", () => {
    expect(canRespondToOffer({ ...base, today: "2026-10-11" }).allowed).toBe(
      false
    );
  });
});

describe("canWithdrawOffer", () => {
  it("lets only the proposer withdraw, only while open", () => {
    expect(
      canWithdrawOffer({ offer: pendingOffer, userId: "renter", now: NOW })
    ).toEqual(OPEN);
    expect(
      canWithdrawOffer({ offer: pendingOffer, userId: "owner", now: NOW })
        .allowed
    ).toBe(false);
    expect(
      canWithdrawOffer({
        offer: { ...pendingOffer, status: OfferStatus.ACCEPTED },
        userId: "renter",
        now: NOW,
      }).allowed
    ).toBe(false);
  });
});

describe("checkOfferForBooking", () => {
  const acceptedAt = new Date(NOW.getTime() - HOUR_MS);
  const base = {
    offer: {
      status: OfferStatus.ACCEPTED,
      bookingId: null,
      startDate: terms.startDate,
      endDate: terms.endDate,
      respondedAt: acceptedAt,
      conversation: { listingId: "listing", renterId: "renter" },
    },
    alreadyUsed: false,
    renterId: "renter",
    listingId: "listing",
    startDate: terms.startDate,
    endDate: terms.endDate,
    now: NOW,
    today: TODAY,
  };

  it("accepts a request that matches the agreement exactly", () => {
    expect(checkOfferForBooking(base)).toEqual(OPEN);
  });

  it("refuses someone else's offer, or one for another listing, as not found", () => {
    expect(checkOfferForBooking({ ...base, renterId: "other" })).toEqual({
      allowed: false,
      reason: OFFER_NOT_FOUND_ERROR,
    });
    expect(checkOfferForBooking({ ...base, listingId: "other" })).toEqual({
      allowed: false,
      reason: OFFER_NOT_FOUND_ERROR,
    });
  });

  it("refuses an offer made against another booking", () => {
    expect(
      checkOfferForBooking({
        ...base,
        offer: { ...base.offer, bookingId: "booking" },
      }).allowed
    ).toBe(false);
  });

  it("refuses an offer that was not accepted", () => {
    expect(
      checkOfferForBooking({
        ...base,
        offer: {
          ...base.offer,
          status: OfferStatus.PENDING,
          respondedAt: null,
        },
      }).allowed
    ).toBe(false);
  });

  it("refuses an offer already used", () => {
    expect(checkOfferForBooking({ ...base, alreadyUsed: true }).allowed).toBe(
      false
    );
  });

  it("refuses dates that differ from the offer", () => {
    expect(
      checkOfferForBooking({ ...base, endDate: "2026-10-13" }).allowed
    ).toBe(false);
  });

  it("refuses an acceptance older than the validity window", () => {
    expect(
      checkOfferForBooking({
        ...base,
        now: new Date(
          acceptedAt.getTime() + ACCEPTED_OFFER_VALID_HOURS * HOUR_MS
        ),
      }).allowed
    ).toBe(false);
  });

  it("refuses dates that have started", () => {
    expect(checkOfferForBooking({ ...base, today: "2026-10-11" }).allowed).toBe(
      false
    );
  });
});

describe("bookingTermsFromOffer", () => {
  it("copies exactly the stored offer's terms and names it", () => {
    const offer = {
      id: "offer",
      startDate: new Date("2026-10-10T00:00:00Z"),
      endDate: new Date("2026-10-12T00:00:00Z"),
      totalPrice: 4500,
      securityDeposit: 0,
    };

    expect(bookingTermsFromOffer(offer)).toEqual({
      agreedOfferId: "offer",
      startDate: offer.startDate,
      endDate: offer.endDate,
      totalPrice: 4500,
      securityDeposit: 0,
    });
  });
});

describe("accessDepositFor", () => {
  it("uses the listing's deposit when nothing was negotiated", () => {
    expect(accessDepositFor(50_000, null)).toBe(50_000);
  });

  it("never lets a negotiated lower deposit lower the access tier", () => {
    expect(accessDepositFor(150_000, 0)).toBe(150_000);
  });

  it("lets a negotiated higher deposit raise it", () => {
    expect(accessDepositFor(10_000, 30_000)).toBe(30_000);
  });
});
