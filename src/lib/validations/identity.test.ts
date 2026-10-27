import { describe, expect, it } from "vitest";

import {
  maskCnic,
  normalizeCnic,
  reviewIdentityDocumentSchema,
  submitIdentityDocumentSchema,
} from "@/lib/validations/identity";

describe("normalizeCnic", () => {
  it("formats every way people type the same number into one shape", () => {
    for (const raw of [
      "42101-1234567-1",
      "4210112345671",
      " 42101 1234567 1 ",
    ]) {
      expect(normalizeCnic(raw)).toBe("42101-1234567-1");
    }
  });

  it("refuses anything that is not thirteen digits", () => {
    for (const raw of [
      "",
      "42101-123456-1",
      "42101-12345678-1",
      "ABCDE-1234567-1",
    ]) {
      expect(normalizeCnic(raw)).toBeNull();
    }
  });
});

describe("maskCnic", () => {
  it("keeps only the check digit", () => {
    expect(maskCnic("42101-1234567-8")).toBe("*****-*******-8");
  });
});

describe("submitIdentityDocumentSchema", () => {
  it("requires both sides", () => {
    const result = submitIdentityDocumentSchema.safeParse({
      cnicNumber: "42101-1234567-1",
      frontPublicId: "a",
      backPublicId: "",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a valid submission", () => {
    const result = submitIdentityDocumentSchema.safeParse({
      cnicNumber: "4210112345671",
      frontPublicId: "samaanshare/identity/u/front",
      backPublicId: "samaanshare/identity/u/back",
    });

    expect(result.success).toBe(true);
  });
});

describe("reviewIdentityDocumentSchema", () => {
  const userId = "cm0000000000000000000000a";

  it("approves without a reason", () => {
    expect(
      reviewIdentityDocumentSchema.safeParse({ userId, decision: "approve" })
        .success
    ).toBe(true);
  });

  it("refuses a rejection the member could not act on", () => {
    expect(
      reviewIdentityDocumentSchema.safeParse({
        userId,
        decision: "reject",
        reason: "blurry",
      }).success
    ).toBe(false);
  });
});
