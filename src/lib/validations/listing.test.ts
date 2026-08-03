import { describe, expect, it } from "vitest";

import {
  ALLOWED_STATUS_TRANSITIONS,
  availabilityToggleSchema,
  calendarDateSchema,
  createListingSchema,
  listingFormSchema,
  OWNER_ASSIGNABLE_STATUSES,
  toCreateListingInput,
  updateListingStatusSchema,
} from "@/lib/validations/listing";

/**
 * The listing contract.
 *
 * `createListingSchema` is what the Server Action trusts, so these tests are about what it
 * must refuse. The form schema and `toCreateListingInput` are the browser half; the pair
 * exists because an empty optional price has to stay empty rather than becoming zero, and the
 * round-trip test at the bottom is what keeps them honest.
 */

const validListing = {
  title: "Canon EOS R6 with lens",
  description:
    "A full frame mirrorless camera with the kit lens and two batteries included.",
  categorySlug: "electronics",
  condition: "GOOD" as const,
  pricePerDay: 5000,
  securityDeposit: 20000,
  city: "karachi",
  images: ["samaanshare/pending/u1/abc"],
};

describe("createListingSchema", () => {
  it("accepts a well-formed listing", () => {
    expect(createListingSchema.safeParse(validListing).success).toBe(true);
  });

  it("enforces the documented length limits", () => {
    // 5-100 and 20-5000, per docs/DATABASE.md and docs/API.md.
    expect(
      createListingSchema.safeParse({ ...validListing, title: "Cam" }).success
    ).toBe(false);
    expect(
      createListingSchema.safeParse({ ...validListing, description: "Short" })
        .success
    ).toBe(false);
    expect(
      createListingSchema.safeParse({
        ...validListing,
        title: "x".repeat(101),
      }).success
    ).toBe(false);
  });

  it("requires whole rupees within the ceiling", () => {
    // PKR has no fractional unit, so a decimal is a bug upstream rather than something to
    // round away.
    expect(
      createListingSchema.safeParse({ ...validListing, pricePerDay: 1500.5 })
        .success
    ).toBe(false);
    expect(
      createListingSchema.safeParse({ ...validListing, pricePerDay: 0 }).success
    ).toBe(false);
    expect(
      createListingSchema.safeParse({
        ...validListing,
        pricePerDay: 10_000_001,
      }).success
    ).toBe(false);
    expect(
      createListingSchema.safeParse({ ...validListing, securityDeposit: 0 })
        .success
    ).toBe(true);
  });

  it("rejects a longer-term rate that is not actually cheaper", () => {
    // A week at 7x the daily rate is strictly worse than booking seven days - almost always
    // a missing or extra zero.
    expect(
      createListingSchema.safeParse({
        ...validListing,
        pricePerWeek: 35_000,
      }).success
    ).toBe(false);
    expect(
      createListingSchema.safeParse({
        ...validListing,
        pricePerWeek: 34_999,
      }).success
    ).toBe(true);
    expect(
      createListingSchema.safeParse({
        ...validListing,
        pricePerMonth: 150_000,
      }).success
    ).toBe(false);
  });

  it("only accepts a launch city", () => {
    expect(
      createListingSchema.safeParse({ ...validListing, city: "quetta" }).success
    ).toBe(false);
  });

  it("requires between one and ten distinct photos", () => {
    expect(
      createListingSchema.safeParse({ ...validListing, images: [] }).success
    ).toBe(false);
    expect(
      createListingSchema.safeParse({
        ...validListing,
        images: Array.from({ length: 11 }, (_, i) => `p/${i}`),
      }).success
    ).toBe(false);
    // The same asset twice would give a gallery duplicate slides and two rows that one
    // delete would half-orphan.
    expect(
      createListingSchema.safeParse({
        ...validListing,
        images: ["p/a", "p/a"],
      }).success
    ).toBe(false);
  });
});

describe("toCreateListingInput", () => {
  const formValues = {
    title: "  Trimmed title here  ",
    description: "  A description that is definitely long enough to pass.  ",
    categorySlug: "tools",
    subcategorySlug: "",
    condition: "NEW" as const,
    pricePerDay: "1200",
    pricePerWeek: "",
    pricePerMonth: "   ",
    securityDeposit: "0",
    city: "lahore",
    area: "  ",
    images: [{ publicId: "samaanshare/pending/u1/x", url: "https://x/y.jpg" }],
  };

  it("omits blank optionals entirely rather than sending zero or empty string", () => {
    // Under exactOptionalPropertyTypes an explicit `undefined` is an error, and a coercing
    // schema would have turned "" into 0 - advertising a free weekly rate.
    const input = toCreateListingInput(formValues);

    expect("pricePerWeek" in input).toBe(false);
    expect("pricePerMonth" in input).toBe(false);
    expect("area" in input).toBe(false);
    expect("subcategorySlug" in input).toBe(false);
  });

  it("trims text and converts prices to numbers", () => {
    const input = toCreateListingInput(formValues);

    expect(input.title).toBe("Trimmed title here");
    expect(input.pricePerDay).toBe(1200);
    expect(input.securityDeposit).toBe(0);
  });

  it("produces output the server schema accepts", () => {
    // The whole reason two schemas are tolerable: this is the seam between them.
    expect(
      createListingSchema.safeParse(toCreateListingInput(formValues)).success
    ).toBe(true);
  });

  it("submits only public ids, never a client-supplied URL", () => {
    // The URL is derived server-side from Cloudinary; nothing the client claims is stored.
    expect(toCreateListingInput(formValues).images).toEqual([
      "samaanshare/pending/u1/x",
    ]);
  });
});

describe("listingFormSchema", () => {
  it("rejects a non-numeric or decimal price string", () => {
    const base = {
      title: "A valid title",
      description: "A description that is definitely long enough to pass here.",
      categorySlug: "tools",
      subcategorySlug: "",
      condition: "NEW" as const,
      pricePerDay: "1200",
      pricePerWeek: "",
      pricePerMonth: "",
      securityDeposit: "0",
      city: "lahore",
      area: "",
      images: [{ publicId: "p/a", url: "https://x/y.jpg" }],
    };

    expect(listingFormSchema.safeParse(base).success).toBe(true);
    expect(
      listingFormSchema.safeParse({ ...base, pricePerDay: "12.5" }).success
    ).toBe(false);
    expect(
      listingFormSchema.safeParse({ ...base, pricePerDay: "1e5" }).success
    ).toBe(false);
    expect(
      listingFormSchema.safeParse({ ...base, pricePerDay: "" }).success
    ).toBe(false);
    // Optional ones may be blank.
    expect(
      listingFormSchema.safeParse({ ...base, pricePerWeek: "" }).success
    ).toBe(true);
  });
});

describe("status transitions", () => {
  it("never lets an owner assign a moderation status", () => {
    expect(OWNER_ASSIGNABLE_STATUSES).toEqual(["ACTIVE", "PAUSED"]);
    expect(
      updateListingStatusSchema.safeParse({ id: "abc", status: "REJECTED" })
        .success
    ).toBe(false);
    expect(
      updateListingStatusSchema.safeParse({ id: "abc", status: "DELETED" })
        .success
    ).toBe(false);
  });

  it("allows pause and resume but not self-releasing a rejection", () => {
    expect(ALLOWED_STATUS_TRANSITIONS.ACTIVE).toContain("PAUSED");
    expect(ALLOWED_STATUS_TRANSITIONS.PAUSED).toContain("ACTIVE");
    expect(ALLOWED_STATUS_TRANSITIONS.REJECTED).toEqual([]);
    expect(ALLOWED_STATUS_TRANSITIONS.DELETED).toEqual([]);
  });
});

describe("calendarDateSchema", () => {
  it("accepts real dates and rejects impossible ones", () => {
    expect(calendarDateSchema.safeParse("2026-08-15").success).toBe(true);
    expect(calendarDateSchema.safeParse("2028-02-29").success).toBe(true);
    expect(calendarDateSchema.safeParse("2027-02-29").success).toBe(false);
    expect(calendarDateSchema.safeParse("2026-02-31").success).toBe(false);
    expect(calendarDateSchema.safeParse("2026-13-01").success).toBe(false);
    // Unpadded, so it would not compare correctly as a string.
    expect(calendarDateSchema.safeParse("2026-8-1").success).toBe(false);
  });

  it("requires a real boolean on the availability toggle", () => {
    expect(
      availabilityToggleSchema.safeParse({
        listingId: "a",
        date: "2026-08-15",
        blocked: "yes",
      }).success
    ).toBe(false);
  });
});
