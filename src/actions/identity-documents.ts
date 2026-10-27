"use server";

import { revalidatePath } from "next/cache";

import {
  AdminActionType,
  IdentityDocumentStatus,
  NotificationType,
  UserStatus,
} from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { writeAdminAction } from "@/lib/admin/log";
import { getActiveAdmin, getActiveUser } from "@/lib/auth/session";
import {
  destroyImage,
  getUploadedImages,
  identityUploadFolder,
  signUpload,
} from "@/lib/cloudinary";
import { createNotifications } from "@/lib/notifications/create";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { publishAfterCommit } from "@/lib/realtime/publish";
import {
  normalizeCnic,
  reviewIdentityDocumentSchema,
  submitIdentityDocumentSchema,
} from "@/lib/validations/identity";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { SignedUploadParams } from "@/lib/cloudinary";
import type { ActionResult } from "@/types";

/**
 * A member's CNIC: uploading it, and an administrator reviewing it.
 *
 * THE IMAGES NEVER TOUCH A PUBLIC URL. The browser uploads straight to Cloudinary as an
 * `authenticated` asset, into a folder named after the signed-in member, with a signature this file
 * issues. Only the public ids come back here, and they are checked against Cloudinary before anything
 * is written. An administrator sees the images through `/api/admin/identity-documents`, which is
 * admin-only and fetches each one with a link that expires in a minute.
 *
 * Every action returns an `ActionResult` and uses the non-redirecting session helpers, per AGENTS.md.
 */

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";
const CONFIG_ERROR =
  "Uploads are not configured on this server. Please contact support.";

/** Two sides, a retake or two, and a change of mind. Tighter than listing photos. */
const SIGNATURE_RATE_LIMIT = { limit: 10, windowMs: 60_000 };
const SUBMIT_RATE_LIMIT = { limit: 5, windowMs: 60_000 };

const DUPLICATE_CNIC_ERROR =
  "This CNIC number is already registered to another SamaanShare account. If you think this is a mistake, contact support.";

/** Issues a signature for one private upload into the caller's identity folder. */
export async function createIdentityUploadSignature(): Promise<
  ActionResult<SignedUploadParams>
> {
  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`identity-sign:${user.id}`, SIGNATURE_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: `Too many uploads at once. Try again in ${rate.retryAfterSeconds}s.`,
    };
  }

  try {
    // Folder and delivery type both come from the server and are both signed, so a caller can
    // neither aim the upload at someone else's folder nor make it public.
    return {
      success: true,
      data: signUpload(identityUploadFolder(user.id), "authenticated"),
    };
  } catch (error) {
    console.error("createIdentityUploadSignature failed", error);

    return { success: false, error: CONFIG_ERROR };
  }
}

/**
 * Saves the member's CNIC number and the two uploaded sides, for review.
 *
 * A re-upload after a rejection replaces the row in place and returns it to PENDING. The superseded
 * images are deleted from Cloudinary after the write commits - best effort, since a leftover private
 * image is invisible to everyone and is cheaper than a failed submission.
 */
export async function submitIdentityDocument(
  input: unknown
): Promise<ActionResult> {
  const parsed = submitIdentityDocumentSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check your CNIC.",
    };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`identity-submit:${user.id}`, SUBMIT_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: `Too many attempts. Try again in ${rate.retryAfterSeconds}s.`,
    };
  }

  const { frontPublicId, backPublicId } = parsed.data;
  // Cannot be null: the schema refined on exactly this.
  const cnicNumber = normalizeCnic(parsed.data.cnicNumber) as string;

  // Ownership by folder, as for every other upload: the prefix is the only proof at this point.
  const folder = `${identityUploadFolder(user.id)}/`;

  if (
    !frontPublicId.startsWith(folder) ||
    !backPublicId.startsWith(folder) ||
    frontPublicId === backPublicId
  ) {
    return {
      success: false,
      error: "Those images could not be used. Please upload both sides again.",
    };
  }

  try {
    const existing = await prisma.identityDocument.findUnique({
      where: { userId: user.id },
      select: {
        status: true,
        frontPublicId: true,
        backPublicId: true,
      },
    });

    // An approved document is settled. Changing it would silently withdraw a verification someone
    // granted, so it goes through support, where an administrator can do that deliberately.
    if (existing?.status === IdentityDocumentStatus.APPROVED) {
      return {
        success: false,
        error:
          "Your CNIC is already verified. Contact support if it needs to change.",
      };
    }

    // The browser says these exist; Cloudinary is asked. The format comes from Cloudinary too,
    // because the private download link has to name it.
    const uploaded = await getUploadedImages(
      [frontPublicId, backPublicId],
      "authenticated"
    );
    const front = uploaded.get(frontPublicId);
    const back = uploaded.get(backPublicId);

    if (!front || !back) {
      return {
        success: false,
        error: "Your upload did not finish. Please upload both sides again.",
      };
    }

    const owner = await prisma.identityDocument.findUnique({
      where: { cnicNumber },
      select: { userId: true },
    });

    if (owner && owner.userId !== user.id) {
      return { success: false, error: DUPLICATE_CNIC_ERROR };
    }

    const fields = {
      cnicNumber,
      frontPublicId,
      frontFormat: front.format || "jpg",
      backPublicId,
      backFormat: back.format || "jpg",
      status: IdentityDocumentStatus.PENDING,
      rejectionReason: null,
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedById: null,
    };

    await prisma.identityDocument.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...fields },
      update: fields,
    });

    if (existing) {
      const superseded = [existing.frontPublicId, existing.backPublicId].filter(
        (id) => id !== frontPublicId && id !== backPublicId
      );

      await Promise.allSettled(
        superseded.map((id) => destroyImage(id, "authenticated"))
      );
    }
  } catch (error) {
    // Two accounts racing to claim the same number: the unique index decides, and says so.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { success: false, error: DUPLICATE_CNIC_ERROR };
    }

    console.error("submitIdentityDocument failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

  revalidatePath("/profile", "page");
  revalidatePath("/admin/verifications", "page");

  return { success: true, data: undefined };
}

/**
 * Approves or rejects a pending CNIC. Admin only.
 *
 * APPROVING IS VERIFYING. It sets `User.isVerified` with the same columns and the same audit type as
 * `setIdentityVerified`, so the badge, the trust score and the history cannot tell the two paths
 * apart - there is one meaning of "verified", however it was reached.
 *
 * DECIDED ONCE, by compare-and-swap on `status`, as with reports: two administrators on the same
 * queue must not both decide, and the second one is told rather than silently overwriting.
 */
export async function reviewIdentityDocument(
  input: unknown
): Promise<ActionResult> {
  const parsed = reviewIdentityDocumentSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the decision.",
    };
  }

  const admin = await getActiveAdmin();

  if (!admin) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const { userId, decision } = parsed.data;
  const reason = parsed.data.reason?.trim() ?? "";

  // The same rule as a manual grant: nobody decides about their own identity.
  if (userId === admin.id) {
    return {
      success: false,
      error: "You cannot review your own CNIC. Ask another administrator.",
    };
  }

  try {
    const document = await prisma.identityDocument.findUnique({
      where: { userId },
      select: {
        id: true,
        status: true,
        user: { select: { status: true, isVerified: true, deletedAt: true } },
      },
    });

    if (!document || document.user.deletedAt !== null) {
      return { success: false, error: "That submission was not found." };
    }

    if (document.status !== IdentityDocumentStatus.PENDING) {
      return {
        success: false,
        error: "That CNIC has already been reviewed.",
      };
    }

    if (decision === "approve" && document.user.status !== UserStatus.ACTIVE) {
      return {
        success: false,
        error: "That account is not active, so it cannot be verified.",
      };
    }

    const now = new Date();

    const outcome = await prisma.$transaction(async (tx) => {
      const claimed = await tx.identityDocument.updateMany({
        where: { id: document.id, status: IdentityDocumentStatus.PENDING },
        data:
          decision === "approve"
            ? {
                status: IdentityDocumentStatus.APPROVED,
                rejectionReason: null,
                reviewedAt: now,
                reviewedById: admin.id,
              }
            : {
                status: IdentityDocumentStatus.REJECTED,
                rejectionReason: reason,
                reviewedAt: now,
                reviewedById: admin.id,
              },
      });

      if (claimed.count === 0) {
        return { claimed: false as const, notifications: [] };
      }

      if (decision === "approve") {
        // Re-stamped only if not already verified, matching `setIdentityVerified`: who originally
        // vouched, and when, is the thing those columns preserve.
        if (!document.user.isVerified) {
          await tx.user.update({
            where: { id: userId },
            data: { isVerified: true, verifiedAt: now, verifiedById: admin.id },
          });
        }

        await writeAdminAction(tx, {
          actorId: admin.id,
          subjectId: userId,
          type: AdminActionType.VERIFY_IDENTITY,
          reason: "CNIC reviewed and approved.",
          previousValue: String(document.user.isVerified),
          newValue: "true",
        });
      } else {
        await writeAdminAction(tx, {
          actorId: admin.id,
          subjectId: userId,
          type: AdminActionType.REJECT_IDENTITY_DOCUMENT,
          reason,
        });
      }

      const notifications = await createNotifications(tx, [
        decision === "approve"
          ? {
              userId,
              type: NotificationType.IDENTITY_VERIFIED,
              title: "Your identity is verified",
              body: "Your CNIC has been approved. A verified badge now shows on your profile and listings.",
              entityType: "identity",
              entityId: document.id,
            }
          : {
              userId,
              type: NotificationType.IDENTITY_DOCUMENT_REJECTED,
              title: "Please upload your CNIC again",
              body: reason,
              entityType: "identity",
              entityId: document.id,
            },
      ]);

      return { claimed: true as const, notifications };
    });

    publishAfterCommit(outcome.notifications);

    if (!outcome.claimed) {
      return {
        success: false,
        error: "That CNIC has already been reviewed.",
      };
    }
  } catch (error) {
    console.error("reviewIdentityDocument failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

  revalidatePath("/admin/verifications", "page");
  revalidatePath("/admin/users", "page");
  revalidatePath(`/users/${userId}`, "page");
  revalidatePath("/listings", "page");

  return { success: true, data: undefined };
}
