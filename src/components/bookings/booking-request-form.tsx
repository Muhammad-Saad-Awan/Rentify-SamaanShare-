"use client";

import { CalendarPlusIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { createBookingRequest } from "@/actions/bookings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CALLBACK_URL_PARAM, LOGIN_ROUTE } from "@/config/routes";
import {
  calculateRentalPrice,
  countRentalDays,
  MAX_BOOKING_DAYS,
} from "@/lib/bookings/pricing";
import { formatPKR } from "@/lib/utils/currency";
import { NOTES_MAX } from "@/lib/validations/booking";
import { UNAUTHENTICATED_ERROR } from "@/types";

interface BookingRequestFormProps {
  listingId: string;
  pricePerDay: number;
  pricePerWeek: number | null;
  pricePerMonth: number | null;
  securityDeposit: number;
  /** Today in Asia/Karachi, from the server - see the note on the `min` attribute. */
  today: string;
  isAuthenticated: boolean;
  /** True when the viewer owns this listing; renting from yourself is refused. */
  isOwnListing: boolean;
}

/**
 * Request-to-book panel on the listing detail page.
 *
 * The quote shown here is computed with `calculateRentalPrice` - the SAME pure module the
 * action uses - so the number on screen and the number written to the booking cannot
 * disagree. The server still recomputes it from the listing's own rates and ignores anything
 * sent from here; this is for the renter's benefit, not the server's.
 *
 * Signed out, the submit becomes a login link carrying a `callbackUrl` back to this listing:
 * a visitor picking dates is expressing intent, and the useful response is to let them sign in
 * and land back where they were.
 */
function BookingRequestForm({
  listingId,
  pricePerDay,
  pricePerWeek,
  pricePerMonth,
  securityDeposit,
  today,
  isAuthenticated,
  isOwnListing,
}: BookingRequestFormProps) {
  const router = useRouter();
  const startId = useId();
  const endId = useId();
  const notesId = useId();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const days = countRentalDays(startDate, endDate);
  const tooLong = days > MAX_BOOKING_DAYS;
  const quote =
    days > 0 && !tooLong
      ? calculateRentalPrice(days, {
          pricePerDay,
          pricePerWeek,
          pricePerMonth,
        })
      : null;

  if (isOwnListing) {
    return (
      <Card>
        <p className="text-muted-foreground px-(--card-spacing) text-sm">
          This is your own listing. Use{" "}
          <Link
            href={`/dashboard/listings/${listingId}/availability`}
            className="text-primary underline underline-offset-4"
          >
            availability
          </Link>{" "}
          to block dates, or{" "}
          <Link
            href="/dashboard/requests"
            className="text-primary underline underline-offset-4"
          >
            requests
          </Link>{" "}
          to review bookings.
        </p>
      </Card>
    );
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await createBookingRequest({
        listingId,
        startDate,
        endDate,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });

      if (!result.success) {
        // A session that lapsed between page render and submit. Say so rather than showing a
        // generic failure - the fix is to sign in again.
        toast.error(
          result.error === UNAUTHENTICATED_ERROR
            ? "Your session has expired. Sign in again to request a booking."
            : result.error
        );

        return;
      }

      toast.success("Request sent. The owner has 48 hours to respond.");
      router.push("/dashboard/bookings");
    });
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 px-(--card-spacing)">
        <h2 className="font-heading text-base font-medium">Request to book</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={startId}>From</FieldLabel>
            <Input
              id={startId}
              type="date"
              value={startDate}
              /**
               * `min` comes from the server's Asia/Karachi today, not the browser's.
               *
               * A device with a skewed clock or a different timezone would otherwise offer a
               * date the action rejects. This is a convenience only - the action re-checks it.
               */
              min={today}
              onChange={(event) => setStartDate(event.target.value)}
              disabled={isPending}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={endId}>Until</FieldLabel>
            <Input
              id={endId}
              type="date"
              value={endDate}
              // Never before the start date, so the invalid range is hard to enter at all.
              min={startDate || today}
              onChange={(event) => setEndDate(event.target.value)}
              disabled={isPending}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor={notesId}>
            Note to the owner (optional)
          </FieldLabel>
          <textarea
            id={notesId}
            rows={3}
            maxLength={NOTES_MAX}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={isPending}
            placeholder="When you would collect, what you need it for."
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm transition-colors outline-none focus-visible:ring-3"
          />
        </Field>

        {tooLong && (
          <p className="text-destructive text-sm" role="alert">
            A single booking cannot exceed {MAX_BOOKING_DAYS} days.
          </p>
        )}

        {quote && (
          // `aria-live` so the total is announced as the dates change - otherwise a screen
          // reader user changes a date and hears nothing.
          <dl
            className="divide-border divide-y rounded-lg border px-3 text-sm"
            aria-live="polite"
          >
            <Row label={quote.label} value={formatPKR(quote.total)} />
            <Row
              label="Security deposit"
              value={formatPKR(securityDeposit)}
              hint="Refunded on return"
            />
            <Row
              label="Total due at pickup"
              value={formatPKR(quote.total + securityDeposit)}
              emphasis
            />
          </dl>
        )}

        {isAuthenticated ? (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !quote}
          >
            {isPending ? (
              <>
                <Loader2Icon className="animate-spin" />
                Sending request...
              </>
            ) : (
              <>
                <CalendarPlusIcon />
                Request to book
              </>
            )}
          </Button>
        ) : (
          <Button
            render={
              <Link
                href={`${LOGIN_ROUTE}?${CALLBACK_URL_PARAM}=${encodeURIComponent(`/listings/${listingId}`)}`}
              />
            }
          >
            Sign in to request
          </Button>
        )}

        <p className="text-muted-foreground text-xs">
          Requesting holds these dates while the owner decides. Payment is
          arranged directly with them at pickup.
        </p>
      </div>
    </Card>
  );
}

interface RowProps {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}

function Row({ label, value, hint, emphasis = false }: RowProps) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="text-muted-foreground">
        {label}
        {hint && <span className="block text-xs">{hint}</span>}
      </dt>
      <dd className={emphasis ? "font-heading font-semibold" : "font-medium"}>
        {value}
      </dd>
    </div>
  );
}

export { BookingRequestForm };
