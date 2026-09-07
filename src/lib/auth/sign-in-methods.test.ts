import { describe, expect, it } from "vitest";

import {
  isLastSignInMethod,
  signInMethodCount,
} from "@/lib/auth/sign-in-methods";

/**
 * The rule that keeps a member from locking themselves out.
 *
 * These exist because the arithmetic was, briefly, written twice - once in the action and
 * once in the page - and the second copy had the ternary inverted. `npm run verify:security`
 * caught it against a running app; these catch it in a second, and they are the reason the
 * two callers now share one function.
 *
 * Read the table below as the four account shapes that actually exist.
 */

describe("signInMethodCount", () => {
  it("counts a password as one method", () => {
    expect(signInMethodCount(true, 0)).toBe(1);
  });

  it("counts each linked account as one more", () => {
    expect(signInMethodCount(false, 1)).toBe(1);
    expect(signInMethodCount(true, 1)).toBe(2);
    expect(signInMethodCount(true, 2)).toBe(3);
  });

  it("returns zero for an account with neither", () => {
    // Should be unreachable - registration sets a password and OAuth creates an account -
    // but the honest answer is zero, not one.
    expect(signInMethodCount(false, 0)).toBe(0);
  });
});

describe("isLastSignInMethod", () => {
  it("blocks a Google-only account from disconnecting Google", () => {
    // The case the inverted copy got wrong, and the one that matters: disconnecting here
    // locks the member out of an account they are still looking at.
    expect(isLastSignInMethod(false, 1)).toBe(true);
  });

  it("allows it once a password has been set", () => {
    // The other direction of the same bug: this member could safely disconnect, and was
    // being told they could not.
    expect(isLastSignInMethod(true, 1)).toBe(false);
  });

  it("allows disconnecting one of two providers with no password", () => {
    expect(isLastSignInMethod(false, 2)).toBe(false);
  });

  it("treats a password-only account as having nothing to disconnect", () => {
    expect(isLastSignInMethod(true, 0)).toBe(true);
  });
});
