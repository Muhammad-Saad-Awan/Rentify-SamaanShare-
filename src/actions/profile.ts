"use server";

import { revalidatePath } from "next/cache";

import { getActiveUser } from "@/lib/auth/session";
import {
  avatarUploadFolder,
  destroyImage,
  getUploadedImages,
  listUploadsByPrefix,
} from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  avatarPublicIdSchema,
  normalizePhone,
  updateProfileSchema,
} from "@/lib/validations/profile";
import { normalizeName } from "@/lib/validations/auth";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * The member editing their own profile.
 *
 * `getActiveUser()` rather than `requireUser()`, per the project rule: these are invoked
 * from buttons and a form that has to render the outcome, and a redirect out of a
 * Server Action would discard whatever the person had typed. The id is taken from the
 * session in every case - nothing here accepts a user id, so there is no target for a
 * caller to change.
 *
 * All three revalidate `"/"` as a LAYOUT rather than a page. The dashboard header
 * renders the name and avatar out of the shell, and the shell is not re-executed by a
 * page-level revalidation - so without this a member would save a new photo and go on
 * looking at the old one in the corner of every screen until the next hard reload.
 */

/** Profile saves per user per hour. Generous: correcting a typo should never throttle. */
const UPDATE_RATE_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };

/** Photo changes per user per hour. Each one costs Cloudinary calls, so tighter. */
const PHOTO_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

const PHOTO_ERROR = "That photo could not be attached. Please try again.";

/**
 * Refreshes every surface that renders a member's own identity.
 *
 * `/users/[id]` as a route pattern rather than this member's own slug: the public
 * profile is the page most obviously wrong after a change, and revalidating the
 * pattern costs nothing extra.
 */
function revalidateProfilePaths(): void {
  revalidatePath("/", "layout");
  revalidatePath("/profile");
  revalidatePath("/users/[id]", "page");
}

/**
 * Replaces the member's name, bio, city and phone number.
 *
 * Takes all four rather than a patch - see `updateProfileSchema`. `null` is how the
 * form says "cleared", and a partial update could not express it.
 *
 * CHANGING THE NUMBER CLEARS `phoneVerified`. Nothing sets that flag yet (phone OTP is
 * Phase 2), but the invariant has to hold from the first write or the first thing that
 * *does* set it inherits a lie: a verified number, edited to a different one, would
 * stay marked as verified. Left untouched when the normalised value is unchanged, so
 * re-saving the form with different punctuation does not revoke anything.
 */
export async function updateProfile(input: unknown): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`update-profile:${user.id}`, UPDATE_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  const { name, bio, city } = parsed.data;

  // Re-normalised here rather than trusted from the client. The schema only proved the
  // raw string *can* become a number; this is the value that gets stored, and storing
  // the typed form would make "0300 1234567" and "+923001234567" two different numbers.
  const phone =
    parsed.data.phone === null ? null : normalizePhone(parsed.data.phone);

  if (parsed.data.phone !== null && phone === null) {
    // Unreachable through the schema, which ran the same function. Handled rather than
    // asserted because the alternative is writing `null` and silently clearing a number
    // the member believed they had just set.
    return {
      success: false,
      error: "Enter a Pakistani mobile number, like 0300 1234567.",
    };
  }

  try {
    const current = await prisma.user.findUnique({
      where: { id: user.id },
      select: { phone: true },
    });

    if (!current) {
      return { success: false, error: UNAUTHENTICATED_ERROR };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: normalizeName(name),
        bio,
        city,
        phone,
        ...(current.phone === phone ? {} : { phoneVerified: false }),
      },
    });
  } catch (error) {
    console.error("updateProfile failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

  revalidateProfilePaths();

  return { success: true, data: undefined };
}

/**
 * Attaches an uploaded photo as the member's avatar.
 *
 * Writes `avatarUrl`, never `image`. The two are distinct on purpose and
 * `auth.ts` resolves them as `avatarUrl ?? image`: `image` is what the OAuth provider
 * supplied, so keeping it means removing a SamaanShare photo falls back to the Google
 * picture rather than to a blank circle.
 *
 * Two checks before the write, both borrowed from `resolveOwnedPhotos`, which this
 * deliberately does not call - that helper returns an ordered array for a gallery, and
 * bending a one-photo case through it reads worse than the eight lines here:
 *
 * 1. OWNERSHIP, from the folder prefix plus a separator. A signed upload can only write
 *    into the caller's own avatar folder, so an id outside it was not uploaded by this
 *    person - and matching on the separator too stops a crafted
 *    `samaanshare/avatars/{victimId}extra` sharing a prefix with a real folder.
 * 2. EXISTENCE, from the Admin API, whose `secure_url` is what gets stored. The client
 *    never gets to say which URL an id resolves to.
 */
export async function updateProfileImage(
  publicId: unknown
): Promise<ActionResult<{ url: string }>> {
  const parsed = avatarPublicIdSchema.safeParse(publicId);

  if (!parsed.success) {
    return { success: false, error: PHOTO_ERROR };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`profile-photo:${user.id}`, PHOTO_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many photo changes just now. Please try again shortly.",
    };
  }

  const folder = avatarUploadFolder(user.id);

  if (!parsed.data.startsWith(`${folder}/`)) {
    return { success: false, error: PHOTO_ERROR };
  }

  let url: string;

  try {
    const found = await getUploadedImages([parsed.data]);
    const image = found.get(parsed.data);

    if (!image) {
      return { success: false, error: PHOTO_ERROR };
    }

    url = image.secureUrl;

    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: url },
    });
  } catch (error) {
    console.error("updateProfileImage failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

  // AFTER the write, and its failure is not the member's problem. The new photo is
  // already theirs; a leftover asset costs storage and nothing else, whereas pruning
  // first would destroy the old photo and then leave them with none if the write failed.
  await pruneAvatarFolder(user.id, parsed.data);

  revalidateProfilePaths();

  return { success: true, data: { url } };
}

/**
 * Clears the member's SamaanShare photo.
 *
 * Falls back to the OAuth `image` where there is one, and to initials otherwise - which
 * is why this clears one column rather than both.
 */
export async function removeProfileImage(): Promise<ActionResult> {
  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`profile-photo:${user.id}`, PHOTO_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many photo changes just now. Please try again shortly.",
    };
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: null },
    });
  } catch (error) {
    console.error("removeProfileImage failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

  await pruneAvatarFolder(user.id, null);

  revalidateProfilePaths();

  return { success: true, data: undefined };
}

/**
 * Destroys everything in a member's avatar folder except the asset named.
 *
 * The folder is the record of what is live, so this is what keeps it to one file. It
 * also reclaims uploads that were never attached - someone who picks three photos before
 * settling on one leaves two behind, and unlike the pending tree there is no sweeper
 * job coming for them.
 *
 * NEVER THROWS. Every caller has already written the database, and a Cloudinary failure
 * at this point must not turn a successful save into a reported error.
 */
async function pruneAvatarFolder(
  userId: string,
  keepPublicId: string | null
): Promise<void> {
  try {
    const folder = avatarUploadFolder(userId);

    // No cursor loop. A member's own avatar folder holds a handful of files at most,
    // and Cloudinary's first page is 500 - a second request would only ever fetch
    // nothing. The cleanup job pages because it scans every user's uploads at once.
    const { uploads } = await listUploadsByPrefix(`${folder}/`);

    for (const upload of uploads) {
      if (upload.publicId === keepPublicId) {
        continue;
      }

      await destroyImage(upload.publicId);
    }
  } catch (error) {
    console.error("pruneAvatarFolder failed", error);
  }
}
