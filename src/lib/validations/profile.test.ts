import { describe, expect, it } from "vitest";

import {
  BIO_MAX,
  formatPhone,
  normalizePhone,
  profileFormSchema,
  toUpdateProfileInput,
  updateProfileSchema,
} from "@/lib/validations/profile";

/**
 * The profile contract.
 *
 * Two things are actually load-bearing here and both are tested hardest:
 *
 * 1. `normalizePhone`, because it decides what a number *is*. Every accepted spelling has
 *    to collapse to one stored value, or the same person ends up with two numbers depending
 *    on how they typed it - and the near-misses have to be refused, because a nine-digit
 *    number that gets stored looks fine and cannot be dialled.
 * 2. The form/action schema pair, for the reason the listing tests give: an empty optional
 *    field must survive the round trip as `null` and not as `""`. `""` in `User.city` would
 *    be a city that matches nothing and renders as an empty line on the public profile.
 */

const validProfile = {
  name: "Muhammad Saad",
  bio: "I rent out camera gear in DHA.",
  city: "karachi",
  phone: "0300 1234567",
};

describe("normalizePhone", () => {
  it("collapses every spelling of one number to the same E.164 value", () => {
    const spellings = [
      "03001234567",
      "0300 1234567",
      "0300-1234567",
      "(0300) 123 4567",
      "3001234567",
      "+923001234567",
      "+92 300 1234567",
      "0092 300 1234567",
      "923001234567",
      "  0300 1234567  ",
    ];

    for (const spelling of spellings) {
      expect(normalizePhone(spelling)).toBe("+923001234567");
    }
  });

  it("refuses numbers that are the wrong length", () => {
    // Nine digits and eleven. Both look plausible and neither can be dialled.
    expect(normalizePhone("030012345")).toBeNull();
    expect(normalizePhone("030012345678")).toBeNull();
  });

  it("refuses landlines and other non-mobile prefixes", () => {
    // Pakistani mobile numbers are `3` followed by nine digits in national form. A
    // Karachi landline (021...) reaches a building, not the person in a booking.
    expect(normalizePhone("02135678901")).toBeNull();
    expect(normalizePhone("0421234567")).toBeNull();
  });

  it("refuses another country's number", () => {
    expect(normalizePhone("+441234567890")).toBeNull();
    expect(normalizePhone("+13001234567")).toBeNull();
  });

  it("does not let a stray plus pass as an international prefix", () => {
    // The `+` survives stripping only at position zero, so this cannot be read as
    // "+923001234567" with punctuation.
    expect(normalizePhone("3+923001234567")).toBeNull();
  });

  it("refuses an empty or non-numeric string", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone("call me")).toBeNull();
  });
});

describe("formatPhone", () => {
  it("groups a stored number for display", () => {
    expect(formatPhone("+923001234567")).toBe("+92 300 1234567");
  });

  it("round-trips: what it displays, `normalizePhone` accepts back unchanged", () => {
    // This is the property the profile page depends on. It seeds the input with the
    // formatted value, so if these two disagreed, opening the form and pressing Save
    // without touching anything would fail validation.
    const stored = "+923001234567";

    expect(normalizePhone(formatPhone(stored))).toBe(stored);
  });

  it("returns anything it does not recognise untouched", () => {
    // Defensive: a row written before this validation existed must still render.
    expect(formatPhone("0300-1234567")).toBe("0300-1234567");
  });
});

describe("updateProfileSchema", () => {
  it("accepts a complete profile", () => {
    expect(updateProfileSchema.safeParse(validProfile).success).toBe(true);
  });

  it("accepts null for every optional field", () => {
    const parsed = updateProfileSchema.safeParse({
      name: "Muhammad Saad",
      bio: null,
      city: null,
      phone: null,
    });

    expect(parsed.success).toBe(true);
  });

  it("does not accept an omitted field", () => {
    // The action takes the whole profile rather than a patch, because a patch cannot
    // express "clear my bio". An absent key must therefore be an error, not a no-op.
    expect(
      updateProfileSchema.safeParse({
        name: validProfile.name,
        city: validProfile.city,
        phone: validProfile.phone,
      }).success
    ).toBe(false);
  });

  it("rejects a name that is only whitespace", () => {
    // Measured after trimming, so "  " is one character short rather than two long.
    expect(
      updateProfileSchema.safeParse({ ...validProfile, name: "   " }).success
    ).toBe(false);
  });

  it("rejects a bio past the limit", () => {
    const parsed = updateProfileSchema.safeParse({
      ...validProfile,
      bio: "a".repeat(BIO_MAX + 1),
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a city outside the launch list", () => {
    expect(
      updateProfileSchema.safeParse({ ...validProfile, city: "quetta" }).success
    ).toBe(false);
  });

  it("rejects an unusable phone number", () => {
    expect(
      updateProfileSchema.safeParse({ ...validProfile, phone: "021 3567890" })
        .success
    ).toBe(false);
  });
});

describe("profileFormSchema", () => {
  it("treats an empty optional field as unset rather than invalid", () => {
    // A member who has never entered a phone number still has to be able to save a
    // change to their bio.
    const parsed = profileFormSchema.safeParse({
      name: "Muhammad Saad",
      bio: "",
      city: "",
      phone: "",
    });

    expect(parsed.success).toBe(true);
  });

  it("still validates an optional field once it has content", () => {
    expect(
      profileFormSchema.safeParse({
        name: "Muhammad Saad",
        bio: "",
        city: "",
        phone: "021 3567890",
      }).success
    ).toBe(false);
  });
});

describe("toUpdateProfileInput", () => {
  it("turns every empty optional field into an explicit null", () => {
    expect(
      toUpdateProfileInput({
        name: "Muhammad Saad",
        bio: "   ",
        city: "",
        phone: "  ",
      })
    ).toEqual({
      name: "Muhammad Saad",
      bio: null,
      city: null,
      phone: null,
    });
  });

  it("keeps what was filled in", () => {
    expect(toUpdateProfileInput(validProfile)).toEqual({
      name: "Muhammad Saad",
      bio: "I rent out camera gear in DHA.",
      city: "karachi",
      phone: "0300 1234567",
    });
  });

  it("produces something the action's own schema accepts", () => {
    // The round trip that keeps the two schemas honest: anything the form accepts must
    // survive conversion into something `updateProfile` will not reject.
    const converted = toUpdateProfileInput({
      name: "Muhammad Saad",
      bio: "",
      city: "",
      phone: "",
    });

    expect(updateProfileSchema.safeParse(converted).success).toBe(true);
  });
});
