"use server";

import { revalidatePath } from "next/cache";

import { getActiveUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { updatePreferencesSchema } from "@/lib/validations/preferences";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * The member's browsing and notification preferences.
 *
 * `getActiveUser()` and an id taken from the session, like every other action here - this
 * accepts no user id, so there is nothing for a caller to point at somebody else.
 */

/** Preference saves per user per hour. Generous; nothing here is expensive or risky. */
const UPDATE_RATE_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

/**
 * Replaces all three preferences.
 *
 * Takes the whole set rather than a patch, for the reason `updateProfileSchema` gives: a
 * patch cannot express "clear my default city", and `null` is exactly what that means.
 *
 * REVALIDATES `/listings` AS WELL AS `/settings`. The default city decides where a bare
 * `/listings` redirects to, and that decision is made in the page - so a member who
 * changes it and navigates back to a browse page they have already visited would otherwise
 * be sent to their old city by the client-side Router Cache, and reasonably conclude the
 * setting had not saved.
 */
export async function updatePreferences(input: unknown): Promise<ActionResult> {
  const parsed = updatePreferencesSchema.safeParse(input);

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

  const rate = checkRateLimit(
    `update-preferences:${user.id}`,
    UPDATE_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        defaultCity: parsed.data.defaultCity,
        notifyReviewReminders: parsed.data.notifyReviewReminders,
        notifyReviewPublished: parsed.data.notifyReviewPublished,
      },
    });
  } catch (error) {
    console.error("updatePreferences failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

  revalidatePath("/settings");
  revalidatePath("/listings");

  return { success: true, data: undefined };
}
