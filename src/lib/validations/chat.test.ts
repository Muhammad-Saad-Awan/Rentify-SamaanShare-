import { describe, expect, it } from "vitest";

import { MESSAGE_BODY_MAX } from "@/lib/chat/rules";
import { PRICE_MAX } from "@/lib/validations/listing";
import {
  adminViewConversationSchema,
  messageBodySchema,
  proposeOfferSchema,
} from "@/lib/validations/chat";

describe("messageBodySchema", () => {
  it("trims and normalizes line endings", () => {
    expect(messageBodySchema.parse("  hello\r\nthere\r  ")).toBe(
      "hello\nthere"
    );
  });

  it("refuses a message that is only whitespace", () => {
    expect(messageBodySchema.safeParse(" \n\t ").success).toBe(false);
  });

  it("measures length after normalizing", () => {
    const body = "a\r\n".repeat(MESSAGE_BODY_MAX / 2).trim();

    expect(messageBodySchema.safeParse(body).success).toBe(true);
    expect(
      messageBodySchema.safeParse("a".repeat(MESSAGE_BODY_MAX + 1)).success
    ).toBe(false);
  });
});

describe("proposeOfferSchema", () => {
  const valid = {
    conversationId: "conv1",
    startDate: "2026-10-10",
    endDate: "2026-10-12",
    totalPrice: 4500,
    securityDeposit: 0,
  };

  it("accepts whole-rupee terms, including a waived deposit", () => {
    expect(proposeOfferSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["a zero rent", { totalPrice: 0 }],
    ["a fractional rent", { totalPrice: 10.5 }],
    ["a negative deposit", { securityDeposit: -1 }],
    ["a rent over the ceiling", { totalPrice: PRICE_MAX + 1 }],
    ["a rent sent as a string", { totalPrice: "4500" }],
    ["an end before the start", { endDate: "2026-10-09" }],
    ["an impossible date", { startDate: "2026-02-31" }],
  ])("refuses %s", (_label, override) => {
    expect(
      proposeOfferSchema.safeParse({ ...valid, ...override }).success
    ).toBe(false);
  });
});

describe("adminViewConversationSchema", () => {
  it("requires a stated reason", () => {
    const base = {
      conversationId: "conv1",
      ground: { kind: "claim", id: "claim1" },
    };

    expect(
      adminViewConversationSchema.safeParse({ ...base, reason: "look" }).success
    ).toBe(false);
    expect(
      adminViewConversationSchema.safeParse({
        ...base,
        reason: "Reviewing the damage claim on this rental.",
      }).success
    ).toBe(true);
  });
});
