"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { toggleListingAvailability } from "@/actions/availability";
import { cn } from "@/lib/utils/cn";
import { WEEKDAY_LABELS } from "@/lib/utils/calendar";

import type { MonthGrid } from "@/lib/utils/calendar";

interface AvailabilityCalendarProps {
  listingId: string;
  grid: MonthGrid;
  /** `YYYY-MM-DD` days the owner has blocked, and can release. */
  ownerBlocked: readonly string[];
  /** `YYYY-MM-DD` days a booking holds. Shown, never editable here. */
  bookingHeld: readonly string[];
  /** Today in Asia/Karachi, `YYYY-MM-DD`. Days before this are not selectable. */
  today: string;
}

/**
 * Month view for blocking and releasing days.
 *
 * Each day is a button that toggles immediately - there is no Save. A month-wide "save
 * selection" would have to define what happens to days outside the visible window, and
 * getting that wrong silently deletes blocks the owner cannot see. One call per day is
 * idempotent and has no such ambiguity.
 *
 * Month navigation is NOT here: it is server-rendered links on the page, so each month has
 * its own URL and its data is fetched on the server. This component only owns the toggle.
 *
 * `useOptimistic` derives from the server's `ownerBlocked`, so a rejected write reverts on
 * its own when the transition settles - there is no rollback branch to get wrong.
 */
function AvailabilityCalendar({
  listingId,
  grid,
  ownerBlocked,
  bookingHeld,
  today,
}: AvailabilityCalendarProps) {
  const [isPending, startTransition] = useTransition();

  const [optimisticBlocked, applyOptimistic] = useOptimistic(
    new Set(ownerBlocked),
    (current, change: { date: string; blocked: boolean }) => {
      // A new Set, not a mutation: React compares by reference to decide whether to
      // re-render, and mutating the existing one would show nothing.
      const next = new Set(current);

      if (change.blocked) {
        next.add(change.date);
      } else {
        next.delete(change.date);
      }

      return next;
    }
  );

  const held = new Set(bookingHeld);

  function toggle(date: string, blocked: boolean) {
    startTransition(async () => {
      applyOptimistic({ date, blocked });

      const result = await toggleListingAvailability({
        listingId,
        date,
        blocked,
      });

      if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/*
        A real table, because this is tabular data: seven weekday columns with a header row.
        A grid of divs would leave a screen reader with 30 unrelated buttons and no way to
        know which weekday any of them falls on.
      */}
      <table className="w-full table-fixed border-separate border-spacing-1">
        <caption className="sr-only">
          Availability for {grid.label}. Select a day to block or release it.
        </caption>

        <thead>
          <tr>
            {WEEKDAY_LABELS.map((label) => (
              <th
                key={label}
                scope="col"
                className="text-muted-foreground pb-1 text-xs font-medium"
              >
                {/* Full name for assistive tech, abbreviation on screen. */}
                <span aria-hidden="true">{label}</span>
                <span className="sr-only">{label}</span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {chunkIntoWeeks(grid).map((week, weekIndex) => (
            <tr key={weekIndex}>
              {week.map((cell, dayIndex) =>
                cell === null ? (
                  // Padding before the 1st. Empty rather than a disabled button, so it is
                  // not announced as a control at all.
                  <td key={`blank-${dayIndex}`} aria-hidden="true" />
                ) : (
                  <td key={cell.date}>
                    <DayButton
                      date={cell.date}
                      dayOfMonth={cell.dayOfMonth}
                      isBlocked={optimisticBlocked.has(cell.date)}
                      isHeldByBooking={held.has(cell.date)}
                      isPast={cell.date < today}
                      isToday={cell.date === today}
                      isPending={isPending}
                      onToggle={toggle}
                    />
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <Legend className="bg-background ring-foreground/15 ring-1">
          Available
        </Legend>
        <Legend className="bg-destructive/15 text-destructive ring-destructive/30 ring-1">
          Blocked by you
        </Legend>
        <Legend className="bg-muted text-muted-foreground ring-border ring-1">
          Booked
        </Legend>
      </ul>
    </div>
  );
}

interface DayButtonProps {
  date: string;
  dayOfMonth: number;
  isBlocked: boolean;
  isHeldByBooking: boolean;
  isPast: boolean;
  isToday: boolean;
  isPending: boolean;
  onToggle: (date: string, blocked: boolean) => void;
}

function DayButton({
  date,
  dayOfMonth,
  isBlocked,
  isHeldByBooking,
  isPast,
  isToday,
  isPending,
  onToggle,
}: DayButtonProps) {
  // A booked day is not the owner's to release - only cancelling the booking frees it - and
  // a past day cannot usefully be blocked. Both are disabled rather than hidden, so the
  // month still reads as a calendar.
  const disabled = isHeldByBooking || isPast;

  const state = isHeldByBooking
    ? "Booked"
    : isBlocked
      ? "Blocked"
      : "Available";

  return (
    <button
      type="button"
      disabled={disabled}
      // `aria-pressed` rather than a colour: it is what tells a screen reader the day is
      // currently blocked, and it flips with the optimistic state.
      aria-pressed={isBlocked}
      aria-label={`${date} - ${state}${isPast ? ", in the past" : ""}`}
      aria-busy={isPending}
      onClick={() => onToggle(date, !isBlocked)}
      className={cn(
        "focus-visible:ring-ring flex aspect-square w-full items-center justify-center rounded-md text-sm transition-colors outline-none focus-visible:ring-2",
        isHeldByBooking && "bg-muted text-muted-foreground ring-border ring-1",
        !isHeldByBooking &&
          isBlocked &&
          "bg-destructive/15 text-destructive ring-destructive/30 ring-1",
        !isHeldByBooking &&
          !isBlocked &&
          "bg-background ring-foreground/15 hover:bg-muted/60 ring-1",
        isPast && "opacity-40",
        // Today gets a ring in the brand colour so the month has an anchor.
        isToday && "ring-primary ring-2",
        disabled && "cursor-not-allowed"
      )}
    >
      {dayOfMonth}
    </button>
  );
}

interface LegendProps {
  className: string;
  children: React.ReactNode;
}

function Legend({ className, children }: LegendProps) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded", className)} aria-hidden="true" />
      {children}
    </li>
  );
}

/**
 * Splits the month into rows of seven, padding the first week.
 *
 * Done here rather than in the pure calendar module because it is a rendering concern - the
 * grid data itself is a flat list of days, which is the useful shape for everything else.
 */
function chunkIntoWeeks(
  grid: MonthGrid
): (MonthGrid["cells"][number] | null)[][] {
  const slots: (MonthGrid["cells"][number] | null)[] = [
    ...Array.from({ length: grid.leadingBlanks }, () => null),
    ...grid.cells,
  ];

  const weeks: (MonthGrid["cells"][number] | null)[][] = [];

  for (let index = 0; index < slots.length; index += 7) {
    const week = slots.slice(index, index + 7);

    // Trailing padding, so every row has seven cells and the table stays rectangular.
    while (week.length < 7) {
      week.push(null);
    }

    weeks.push(week);
  }

  return weeks;
}

export { AvailabilityCalendar };
