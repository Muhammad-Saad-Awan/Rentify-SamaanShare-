import { describe, expect, it } from "vitest";

import {
  CLAIM_REUSE_COPY,
  HANDOVER_REUSE_COPY,
  photoReuseError,
} from "@/lib/uploads/photo-reuse";

/**
 * Photo reuse.
 *
 * The negative cases are the ones worth having. A check like this earns its place by refusing the
 * right things, and loses it the moment it refuses a handover somebody was recording honestly -
 * two people in a doorway with a blocked form will not debug it, they will give up on the record.
 */

const A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("photoReuseError", () => {
  it("accepts photos nothing has seen before", () => {
    expect(
      photoReuseError(
        [{ hash: A }, { hash: B }],
        [{ hash: "cccc", sameBooking: false }],
        HANDOVER_REUSE_COPY
      )
    ).toBeNull();
  });

  it("accepts an empty submission", () => {
    expect(photoReuseError([], [], HANDOVER_REUSE_COPY)).toBeNull();
  });

  it("refuses the same file attached twice under two ids", () => {
    const error = photoReuseError(
      [{ hash: A }, { hash: A }],
      [],
      HANDOVER_REUSE_COPY
    );

    expect(error).toMatch(/more than once/i);
  });

  /** The common case: this rental's pickup photo, offered again at return. */
  it("refuses a photo already used on the same rental, and says so", () => {
    const error = photoReuseError(
      [{ hash: A }],
      [{ hash: A, sameBooking: true }],
      HANDOVER_REUSE_COPY
    );

    expect(error).toMatch(/this rental's other handover/i);
  });

  it("refuses a photo used on some other rental, without saying whose", () => {
    const error = photoReuseError(
      [{ hash: A }],
      [{ hash: A, sameBooking: false }],
      HANDOVER_REUSE_COPY
    );

    expect(error).toMatch(/submitted as evidence before/i);
    expect(error).not.toMatch(/rental's other handover/i);
  });

  /** Both readings apply; the actionable one wins. */
  it("prefers the same-rental message when a photo matches both", () => {
    const error = photoReuseError(
      [{ hash: A }],
      [
        { hash: A, sameBooking: false },
        { hash: A, sameBooking: true },
      ],
      HANDOVER_REUSE_COPY
    );

    expect(error).toMatch(/this rental's other handover/i);
  });

  /**
   * A photo Cloudinary gave no checksum for is unverifiable, not suspect. Refusing it would make
   * a provider's omission into somebody's inability to record a handover at all.
   */
  it("lets unhashed photos through rather than blocking the record", () => {
    expect(
      photoReuseError([{ hash: null }, { hash: null }], [], HANDOVER_REUSE_COPY)
    ).toBeNull();
  });

  it("still checks the hashed photos alongside an unhashed one", () => {
    const error = photoReuseError(
      [{ hash: null }, { hash: A }],
      [{ hash: A, sameBooking: true }],
      HANDOVER_REUSE_COPY
    );

    expect(error).toMatch(/this rental's other handover/i);
  });

  /** Prior uses that match nothing in this submission are simply other people's photos. */
  it("ignores prior uses that do not match", () => {
    expect(
      photoReuseError(
        [{ hash: A }],
        [{ hash: B, sameBooking: true }],
        HANDOVER_REUSE_COPY
      )
    ).toBeNull();
  });
});

/**
 * The claim wording.
 *
 * Same rule, different sentences - which is the reason `copy` is a required argument rather than
 * a default. These assert only that the claim caller gets claim words, because a person refused
 * mid-claim being told about "this rental's other handover" would be reading about something
 * they are not doing.
 */
describe("photoReuseError with the claim copy", () => {
  it("speaks about the claim, not about a handover", () => {
    const error = photoReuseError(
      [{ hash: A }],
      [{ hash: A, sameBooking: true }],
      CLAIM_REUSE_COPY
    );

    expect(error).toMatch(/already attached to this claim/i);
    expect(error).not.toMatch(/handover/i);
  });

  it("tells a repeat claimant to photograph the damage", () => {
    const error = photoReuseError(
      [{ hash: A }],
      [{ hash: A, sameBooking: false }],
      CLAIM_REUSE_COPY
    );

    expect(error).toMatch(/submitted as evidence before/i);
    expect(error).toMatch(/photo of the damage/i);
  });

  it("still accepts photos nothing has seen", () => {
    expect(photoReuseError([{ hash: B }], [], CLAIM_REUSE_COPY)).toBeNull();
  });
});
