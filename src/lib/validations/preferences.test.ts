import { describe, expect, it } from "vitest";

import {
  preferencesFormSchema,
  toUpdatePreferencesInput,
  updatePreferencesSchema,
} from "@/lib/validations/preferences";

/**
 * The preferences contract.
 *
 * The one thing worth guarding here is that "no preference" survives as `null` rather than
 * `""`. An empty string in `User.defaultCity` is truthy nowhere useful but is not null
 * either: it would match no city, and the browse redirect would send the member to
 * `?city=` - a URL that filters nothing and looks broken. Same class of bug as the
 * profile's empty city, tested the same way.
 */

const FILLED = {
  defaultCity: "karachi",
  notifyReviewReminders: false,
  notifyReviewPublished: true,
};

describe("updatePreferencesSchema", () => {
  it("accepts a complete set", () => {
    expect(updatePreferencesSchema.safeParse(FILLED).success).toBe(true);
  });

  it("accepts null for the city, meaning no preference", () => {
    expect(
      updatePreferencesSchema.safeParse({ ...FILLED, defaultCity: null })
        .success
    ).toBe(true);
  });

  it("rejects an empty string, which is neither a city nor null", () => {
    expect(
      updatePreferencesSchema.safeParse({ ...FILLED, defaultCity: "" }).success
    ).toBe(false);
  });

  it("rejects a city outside the launch list", () => {
    expect(
      updatePreferencesSchema.safeParse({ ...FILLED, defaultCity: "quetta" })
        .success
    ).toBe(false);
  });

  it("rejects a non-boolean switch", () => {
    // A hand-rolled POST can send anything; "false" as a string would otherwise be
    // truthy and silently turn a switch back on.
    expect(
      updatePreferencesSchema.safeParse({
        ...FILLED,
        notifyReviewReminders: "false",
      }).success
    ).toBe(false);
  });

  it("does not accept an omitted switch", () => {
    // The whole set, not a patch - so an absent key is an error rather than a silent
    // no-op that leaves the member's screen disagreeing with the database.
    expect(
      updatePreferencesSchema.safeParse({
        defaultCity: "karachi",
        notifyReviewReminders: true,
      }).success
    ).toBe(false);
  });
});

describe("preferencesFormSchema", () => {
  it("treats an empty city as unset rather than invalid", () => {
    expect(
      preferencesFormSchema.safeParse({ ...FILLED, defaultCity: "" }).success
    ).toBe(true);
  });

  it("still rejects a city that is not a launch city", () => {
    expect(
      preferencesFormSchema.safeParse({ ...FILLED, defaultCity: "quetta" })
        .success
    ).toBe(false);
  });
});

describe("toUpdatePreferencesInput", () => {
  it("turns an unset city into an explicit null", () => {
    expect(toUpdatePreferencesInput({ ...FILLED, defaultCity: "" })).toEqual({
      defaultCity: null,
      notifyReviewReminders: false,
      notifyReviewPublished: true,
    });
  });

  it("passes the switches through untouched", () => {
    expect(toUpdatePreferencesInput(FILLED)).toEqual(FILLED);
  });

  it("produces something the action's own schema accepts", () => {
    // The round trip that keeps the two schemas honest.
    const converted = toUpdatePreferencesInput({
      defaultCity: "",
      notifyReviewReminders: true,
      notifyReviewPublished: false,
    });

    expect(updatePreferencesSchema.safeParse(converted).success).toBe(true);
  });
});
