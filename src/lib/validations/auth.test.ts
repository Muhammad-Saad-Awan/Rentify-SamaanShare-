import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  registerSchema,
  resetPasswordSchema,
  setPasswordSchema,
} from "@/lib/validations/auth";

/**
 * The password policy, and the two in-app routes that must not undercut it.
 *
 * THE POINT OF THESE TESTS IS THE PARITY, not the individual rules. There are now four
 * ways a password reaches `User.password` - registration, a reset link, a change from
 * settings, and a first password set on a Google-only account - and the moment one of
 * them accepts something the others refuse, that one becomes the policy. The parity
 * block at the bottom is what would catch a fifth route added with its own rules.
 */

const VALID = "correct-horse7";

const changeInput = {
  currentPassword: "old-password1",
  newPassword: VALID,
  confirmPassword: VALID,
};

describe("changePasswordSchema", () => {
  it("accepts a well-formed change", () => {
    expect(changePasswordSchema.safeParse(changeInput).success).toBe(true);
  });

  it("requires the current password to be present", () => {
    // Only presence. Whether it is *correct* is the server's business, and applying the
    // policy to it would reject a legacy password that predates the current rules.
    expect(
      changePasswordSchema.safeParse({ ...changeInput, currentPassword: "" })
        .success
    ).toBe(false);
  });

  it("does not apply the policy to the current password", () => {
    // "abc" would never be accepted as a *new* password, but someone may genuinely have
    // it as their current one.
    expect(
      changePasswordSchema.safeParse({ ...changeInput, currentPassword: "abc" })
        .success
    ).toBe(true);
  });

  it("rejects a mismatched confirmation, against the confirm field", () => {
    const parsed = changePasswordSchema.safeParse({
      ...changeInput,
      confirmPassword: "something-else9",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it("refuses to 'change' a password to the same value", () => {
    // Someone reaches this form because they believe the old password is known to
    // somebody else. Accepting it unchanged would leave them believing they had fixed
    // that.
    const parsed = changePasswordSchema.safeParse({
      currentPassword: VALID,
      newPassword: VALID,
      confirmPassword: VALID,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["newPassword"]);
  });
});

describe("setPasswordSchema", () => {
  it("accepts a first password with no current one", () => {
    expect(
      setPasswordSchema.safeParse({
        newPassword: VALID,
        confirmPassword: VALID,
      }).success
    ).toBe(true);
  });

  it("still requires the confirmation to match", () => {
    expect(
      setPasswordSchema.safeParse({
        newPassword: VALID,
        confirmPassword: "different1",
      }).success
    ).toBe(false);
  });

  it("does not accept a current password it would then ignore", () => {
    // Zod strips unknown keys rather than failing, so this documents the shape rather
    // than a refusal: what matters is that `currentPassword` is not part of the contract
    // and cannot be mistaken for one that is checked.
    const parsed = setPasswordSchema.safeParse({
      currentPassword: "anything",
      newPassword: VALID,
      confirmPassword: VALID,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty("currentPassword");
  });
});

describe("password policy parity across every route that sets one", () => {
  // One character under the floor, and otherwise compliant - a letter and a digit - so
  // length is the only reason any route could refuse it.
  const tooShort = "a1".padEnd(PASSWORD_MIN_LENGTH - 1, "b");
  const tooLong = "a1".repeat(PASSWORD_MAX_LENGTH);
  const noDigit = "no-digits-here";
  const noLetter = "12345678";

  /** Each route, reduced to "does this password get through?". */
  const routes: { name: string; accepts: (password: string) => boolean }[] = [
    {
      name: "registration",
      accepts: (password) =>
        registerSchema.safeParse({
          name: "Muhammad Saad",
          email: "saad@example.com",
          password,
          confirmPassword: password,
        }).success,
    },
    {
      name: "reset link",
      accepts: (password) =>
        resetPasswordSchema.safeParse({
          token: "a".repeat(43),
          password,
          confirmPassword: password,
        }).success,
    },
    {
      name: "change from settings",
      accepts: (password) =>
        changePasswordSchema.safeParse({
          currentPassword: "something-else-entirely2",
          newPassword: password,
          confirmPassword: password,
        }).success,
    },
    {
      name: "first password on a Google account",
      accepts: (password) =>
        setPasswordSchema.safeParse({
          newPassword: password,
          confirmPassword: password,
        }).success,
    },
  ];

  for (const route of routes) {
    it(`${route.name} accepts a compliant password`, () => {
      expect(route.accepts(VALID)).toBe(true);
    });

    it(`${route.name} refuses one that is too short`, () => {
      expect(route.accepts(tooShort)).toBe(false);
    });

    it(`${route.name} refuses one past the bcrypt truncation limit`, () => {
      // bcrypt silently ignores bytes past 72, so anything longer would make the extra
      // characters decorative. Every route has to reject rather than truncate.
      expect(route.accepts(tooLong)).toBe(false);
    });

    it(`${route.name} refuses one with no digit`, () => {
      expect(route.accepts(noDigit)).toBe(false);
    });

    it(`${route.name} refuses one with no letter`, () => {
      expect(route.accepts(noLetter)).toBe(false);
    });
  }
});
