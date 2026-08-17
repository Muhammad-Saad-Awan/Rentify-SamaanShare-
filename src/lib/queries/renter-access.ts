import { cache } from "react";

import { BookingStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

import type { RenterAccessSignals } from "@/lib/trust/access";

/**
 * What is known about a prospective renter, for value-gated access.
 *
 * READ FROM THE DATABASE, NEVER FROM THE SESSION. `emailVerified` and `isVerified` are both in the
 * JWT's blast radius: the token is minted at sign-in, so a user who confirms their address would be
 * refused for up to 24 hours, and - the direction that matters - an account whose verification was
 * *withdrawn* would keep clearing high-value gates until their token refreshed. This is the same
 * staleness that made `requireUser` re-read `status`.
 *
 * Wrapped in React's `cache()` so the listing page and its booking panel share one read per request.
 * The Server Action calls it again on its own request, which is correct: the action is the boundary
 * and must not trust anything the page decided.
 */
export const getRenterAccessSignals = cache(
  async (userId: string): Promise<RenterAccessSignals> => {
    const [user, completedRentals] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { emailVerified: true, isVerified: true },
      }),
      /**
       * Finished rentals on either side.
       *
       * `REVIEWED` counts as well as `COMPLETED` - the same finished rental with both reviews
       * written - matching `getPublicProfile`. Counting only `COMPLETED` would make the most engaged
       * members look the least experienced and quietly lock them out of the tier their history has
       * earned.
       *
       * Either side on purpose: someone who has let ten items out and never borrowed one has shown
       * exactly the accountability this gate is looking for.
       */
      prisma.booking.count({
        where: {
          OR: [{ renterId: userId }, { ownerId: userId }],
          status: { in: [BookingStatus.COMPLETED, BookingStatus.REVIEWED] },
        },
      }),
    ]);

    return {
      emailVerified:
        user?.emailVerified !== null && user?.emailVerified !== undefined,
      isVerified: user?.isVerified ?? false,
      completedRentals,
    };
  }
);
