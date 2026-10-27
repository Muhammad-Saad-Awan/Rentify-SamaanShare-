import { describe, expect, it } from "vitest";

import { planIdentityCleanup } from "@/lib/uploads/identity-cleanup";

import type { IdentityDocumentRef } from "@/lib/uploads/identity-cleanup";

const CUTOFF = new Date("2026-10-27T00:00:00Z");
const OLD = new Date("2026-10-01T00:00:00Z");
const NEW = new Date("2026-10-27T06:00:00Z");

const upload = (publicId: string, createdAt = OLD) => ({ publicId, createdAt });

const doc = (
  id: string,
  userDeleted = false,
  front = `${id}/front`,
  back = `${id}/back`
): IdentityDocumentRef => ({
  id,
  frontPublicId: front,
  backPublicId: back,
  userDeleted,
});

const ids = (uploads: { publicId: string }[]) =>
  uploads.map((item) => item.publicId).sort();

describe("planIdentityCleanup", () => {
  it("keeps an active member's images, however old", () => {
    const plan = planIdentityCleanup(
      [upload("a/front"), upload("a/back")],
      [doc("a")],
      CUTOFF
    );

    expect(ids(plan.keep)).toEqual(["a/back", "a/front"]);
    expect(plan.orphans).toEqual([]);
    expect(plan.departed).toEqual([]);
  });

  it("deletes unreferenced images older than the cutoff", () => {
    const plan = planIdentityCleanup([upload("x/1")], [], CUTOFF);

    expect(ids(plan.orphans)).toEqual(["x/1"]);
  });

  it("leaves an unreferenced image alone while it may still be uploading", () => {
    const plan = planIdentityCleanup([upload("x/1", NEW)], [], CUTOFF);

    expect(plan.orphans).toEqual([]);
    expect(ids(plan.recent)).toEqual(["x/1"]);
  });

  it("removes a deleted member's images and names the row to remove", () => {
    const plan = planIdentityCleanup(
      // Even a recent one: a departed member's document is not "still uploading".
      [upload("d/front", NEW), upload("d/back")],
      [doc("d", true)],
      CUTOFF
    );

    expect(plan.keep).toEqual([]);
    expect(plan.departed).toHaveLength(1);
    expect(plan.departed[0]?.document.id).toBe("d");
    expect(ids(plan.departed[0]?.uploads ?? [])).toEqual(["d/back", "d/front"]);
  });

  it("still lists a deleted member's row when its images are already gone", () => {
    const plan = planIdentityCleanup([], [doc("d", true)], CUTOFF);

    expect(plan.departed).toEqual([{ document: doc("d", true), uploads: [] }]);
  });

  it("never deletes an image an active member's document points at", () => {
    const uploads = [upload("a/front"), upload("a/back"), upload("x/1")];
    const plan = planIdentityCleanup(uploads, [doc("a")], CUTOFF);
    const destroyed = [
      ...plan.orphans,
      ...plan.departed.flatMap((entry) => entry.uploads),
    ];

    expect(ids(destroyed)).toEqual(["x/1"]);
  });
});
