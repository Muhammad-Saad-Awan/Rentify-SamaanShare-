import { describe, expect, it } from "vitest";

import { photoReuseError } from "@/lib/uploads/photo-reuse";

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
        [{ hash: "cccc", sameBooking: false }]
      )
    ).toBeNull();
  });

  it("accepts an empty submission", () => {
    expect(photoReuseError([], [])).toBeNull();
  });

  it("refuses the same file attached twice under two ids", () => {
    const error = photoReuseError([{ hash: A }, { hash: A }], []);

    expect(error).toMatch(/more than once/i);
  });

  /** The common case: this rental's pickup photo, offered again at return. */
  it("refuses a photo already used on the same rental, and says so", () => {
    const error = photoReuseError(
      [{ hash: A }],
      [{ hash: A, sameBooking: true }]
    );

    expect(error).toMatch(/this rental's other handover/i);
  });

  it("refuses a photo used on some other rental, without saying whose", () => {
    const error = photoReuseError(
      [{ hash: A }],
      [{ hash: A, sameBooking: false }]
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
      ]
    );

    expect(error).toMatch(/this rental's other handover/i);
  });

  /**
   * A photo Cloudinary gave no checksum for is unverifiable, not suspect. Refusing it would make
   * a provider's omission into somebody's inability to record a handover at all.
   */
  it("lets unhashed photos through rather than blocking the record", () => {
    expect(photoReuseError([{ hash: null }, { hash: null }], [])).toBeNull();
  });

  it("still checks the hashed photos alongside an unhashed one", () => {
    const error = photoReuseError(
      [{ hash: null }, { hash: A }],
      [{ hash: A, sameBooking: true }]
    );

    expect(error).toMatch(/this rental's other handover/i);
  });

  /** Prior uses that match nothing in this submission are simply other people's photos. */
  it("ignores prior uses that do not match", () => {
    expect(
      photoReuseError([{ hash: A }], [{ hash: B, sameBooking: true }])
    ).toBeNull();
  });
});
