import {
  CalendarCheckIcon,
  FlagIcon,
  PackageIcon,
  ScaleIcon,
  ShieldIcon,
  UserPlusIcon,
} from "lucide-react";
import Link from "next/link";

import { ADMIN_ACTION_LABELS } from "@/lib/admin/rules";
import { BOOKING_STATUS_LABELS } from "@/lib/bookings/timeline";
import { CLAIM_STATUS_LABELS } from "@/lib/claims/rules";
import { REPORT_REASON_LABELS } from "@/lib/reports/rules";
import { formatPKR } from "@/lib/utils/currency";
import { formatRelativeTime } from "@/lib/utils/date";

import type { LucideIcon } from "lucide-react";
import type {
  ActivityEvent,
  RecentActivity,
} from "@/lib/queries/admin-analytics";

interface ActivityFeedProps {
  activity: RecentActivity;
  /** One instant for the whole list, so two events seconds apart cannot contradict their order. */
  now: Date;
}

/**
 * The newest activity across the platform.
 *
 * A Server Component. The copy lives here rather than in the query, which returns a discriminated
 * union - a query module that writes sentences ends up owning the wording for screens it has never
 * seen.
 *
 * EVERY ROW LINKS SOMEWHERE AN ADMINISTRATOR CAN ACT. A feed that only narrates is a feed that gets
 * read once; the point of seeing a claim filed is to be one click from deciding it.
 *
 * NO EMAIL ADDRESSES HERE, unlike the members and bookings screens. Those are lookups an
 * administrator arrived at with a person in mind; this is a window that opens itself, and an address
 * on it would be a directory entry nobody asked for. Names link to the admin screen where the
 * address is, if that is where they were going.
 */
function ActivityFeed({ activity, now }: ActivityFeedProps) {
  if (activity.events.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing has happened on the platform yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {activity.events.map((event) => {
          const { icon: Icon, href, text } = describe(event);

          return (
            <li
              key={`${event.kind}-${event.id}`}
              className="flex items-baseline gap-2 text-sm"
            >
              <Icon
                className="text-muted-foreground size-3.5 shrink-0 translate-y-0.5"
                aria-hidden="true"
              />
              <Link
                href={href}
                className="min-w-0 flex-1 underline-offset-4 hover:underline"
              >
                {text}
              </Link>
              <span className="text-muted-foreground shrink-0 text-xs">
                {formatRelativeTime(event.at, now)}
              </span>
            </li>
          );
        })}
      </ul>

      {/*
        Said out loud when it applies. The feed is the newest few of EACH kind merged, not a global
        log - there is no global event log to read - so a burst of one kind can push the others out of
        the window. A feed that looked complete while quietly truncating would have somebody conclude
        that nothing else happened.
      */}
      {activity.truncated && (
        <p className="text-muted-foreground text-xs italic">
          Showing the newest few of each kind, merged. At least one kind filled
          its window, so older events of other kinds may be missing — the queues
          themselves are the complete lists.
        </p>
      )}
    </div>
  );
}

interface Described {
  icon: LucideIcon;
  href: string;
  text: string;
}

/** One event as an icon, a destination and a sentence. */
function describe(event: ActivityEvent): Described {
  switch (event.kind) {
    case "member":
      return {
        icon: UserPlusIcon,
        href: `/admin/users/${event.id}`,
        text: `${event.name?.trim() || "An unnamed member"} registered`,
      };

    case "listing":
      return {
        icon: PackageIcon,
        href: `/admin/listings/${event.id}`,
        text: `${event.ownerName?.trim() || "A member"} listed "${event.title}"`,
      };

    case "booking":
      return {
        icon: CalendarCheckIcon,
        href: `/admin/bookings/${event.id}`,
        // The status is the current one, not the status at the time of the request - there is no
        // per-transition record to read, so this says what the booking is now.
        text: `"${event.listingTitle}" requested — now ${BOOKING_STATUS_LABELS[event.status].toLowerCase()}`,
      };

    case "report":
      return {
        icon: FlagIcon,
        // The queue rather than the target: a report is decided there, and the polymorphic target
        // cannot be linked without knowing which table it names.
        href: "/admin/reports",
        text: `A ${event.type.toLowerCase()} was reported for ${REPORT_REASON_LABELS[event.reason].toLowerCase()}`,
      };

    case "claim":
      return {
        icon: ScaleIcon,
        href: "/admin/claims",
        text: `${formatPKR(event.amountClaimed)} claimed on "${event.listingTitle}" — ${CLAIM_STATUS_LABELS[event.status].toLowerCase()}`,
      };

    case "admin":
      return {
        icon: ShieldIcon,
        // The subject's screen, where the audit row is shown in context alongside everything else
        // done to that account.
        href: `/admin/users/${event.subjectId}`,
        text: `${ADMIN_ACTION_LABELS[event.type]} by ${event.actorName?.trim() ?? "the bootstrap script"}`,
      };
  }
}

export { ActivityFeed };
