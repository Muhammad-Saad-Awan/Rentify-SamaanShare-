"use client";

import { HandshakeIcon, Loader2Icon, LockIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { proposeOffer } from "@/actions/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { calculateRentalPrice, countRentalDays } from "@/lib/bookings/pricing";
import { toCalendarDay } from "@/lib/chat/offers";
import { formatPKR } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

import type { RateCard } from "@/lib/bookings/pricing";

export interface AmendableBooking {
  id: string;
  startDate: Date;
  endDate: Date;
  totalPrice: number;
  securityDeposit: number;
}

export interface OfferFormProps {
  conversationId: string;
  rates: RateCard;
  listingDeposit: number;
  /** Bookings whose terms can still change. Usually none, sometimes one. */
  amendableBookings: AmendableBooking[];
  today: string;
}

const NEW_DATES = "new";

/**
 * "Make an offer", in a side sheet: the structured way to negotiate.
 *
 * Two kinds of offer, chosen by "Applies to":
 *   - new dates, before any booking - the dates are free to choose;
 *   - an existing booking whose terms can still change - the dates are the booking's and fixed,
 *     because moving them is a cancel and rebook.
 *
 * The summary shows the listing's own price for the same dates as a reference, never as a limit.
 * The server validates everything again.
 */
function OfferSheet({
  open,
  onOpenChange,
  ...props
}: OfferFormProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-heading text-lg font-semibold tracking-tight">
            Make an offer
          </SheetTitle>
          <SheetDescription>
            Propose the rent, deposit and dates. If the other side accepts,
            these become the booking&apos;s terms - nothing typed in chat does.
          </SheetDescription>
        </SheetHeader>
        {/* Keyed on open, so a reopened sheet starts clean rather than with a half-typed offer. */}
        {open && <OfferForm {...props} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function OfferForm({
  conversationId,
  rates,
  listingDeposit,
  amendableBookings,
  today,
  onDone,
}: OfferFormProps & { onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const ids = {
    target: useId(),
    start: useId(),
    end: useId(),
    rent: useId(),
    deposit: useId(),
  };

  // An open booking is by far the likelier subject when there is one.
  const [target, setTarget] = useState(amendableBookings[0]?.id ?? NEW_DATES);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rent, setRent] = useState(
    amendableBookings[0] ? String(amendableBookings[0].totalPrice) : ""
  );
  const [deposit, setDeposit] = useState(
    String(amendableBookings[0]?.securityDeposit ?? listingDeposit)
  );

  const booking = amendableBookings.find((item) => item.id === target) ?? null;
  const effectiveStart = booking ? toCalendarDay(booking.startDate) : startDate;
  const effectiveEnd = booking ? toCalendarDay(booking.endDate) : endDate;
  const days = countRentalDays(effectiveStart, effectiveEnd);
  const quote = days > 0 ? calculateRentalPrice(days, rates) : null;
  const rentValue = Number(rent);
  const difference =
    quote && rentValue > 0
      ? Math.round(((rentValue - quote.total) / quote.total) * 100)
      : null;

  function chooseTarget(value: string) {
    setTarget(value);

    const chosen = amendableBookings.find((item) => item.id === value);

    // Start from the booking's current terms, so the change being proposed is the only change.
    setRent(chosen ? String(chosen.totalPrice) : "");
    setDeposit(String(chosen?.securityDeposit ?? listingDeposit));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();

    startTransition(async () => {
      const result = await proposeOffer({
        conversationId,
        ...(booking ? { bookingId: booking.id } : {}),
        startDate: effectiveStart,
        endDate: effectiveEnd,
        totalPrice: rentValue,
        securityDeposit: Number(deposit),
      });

      if (!result.success) {
        toast.error(result.error);

        return;
      }

      toast.success("Offer sent.");
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-6 px-4 pb-6">
      {amendableBookings.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.target}>Applies to</Label>
          <NativeSelect
            id={ids.target}
            value={target}
            onChange={(event) => chooseTarget(event.target.value)}
          >
            {amendableBookings.map((item) => (
              <option key={item.id} value={item.id}>
                Your booking, {formatDate(item.startDate)} to{" "}
                {formatDate(item.endDate)}
              </option>
            ))}
            <option value={NEW_DATES}>New dates (before booking)</option>
          </NativeSelect>
        </div>
      )}

      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-2 text-sm font-medium">Dates</legend>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={ids.start} className="text-muted-foreground text-xs">
            From
          </label>
          <Input
            id={ids.start}
            type="date"
            min={today}
            value={effectiveStart}
            onChange={(event) => setStartDate(event.target.value)}
            disabled={booking !== null}
            required
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={ids.end} className="text-muted-foreground text-xs">
            Until
          </label>
          <Input
            id={ids.end}
            type="date"
            min={effectiveStart || today}
            value={effectiveEnd}
            onChange={(event) => setEndDate(event.target.value)}
            disabled={booking !== null}
            required
          />
        </div>
        {booking && (
          <p className="text-muted-foreground col-span-2 flex items-center gap-1.5 text-xs">
            <LockIcon className="size-3" aria-hidden="true" />A booking keeps
            its dates. To change them, cancel and request again.
          </p>
        )}
      </fieldset>

      {/* Stacked on the narrowest phones: "Security deposit (Rs.)" does not fit half of 360px. */}
      <div className="grid gap-4 min-[400px]:grid-cols-2 min-[400px]:gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={ids.rent}>Total rent (Rs.)</Label>
          <Input
            id={ids.rent}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={rent}
            onChange={(event) => setRent(event.target.value)}
            required
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={ids.deposit}>Security deposit (Rs.)</Label>
          <Input
            id={ids.deposit}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={deposit}
            onChange={(event) => setDeposit(event.target.value)}
            required
          />
        </div>
      </div>

      {/* A live summary, so the number being proposed is read in context before it is sent. */}
      <div
        className="bg-muted/60 flex flex-col gap-2.5 rounded-xl border p-4 text-sm"
        aria-live="polite"
      >
        {quote ? (
          <>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                Listing price, {quote.label}
              </span>
              <span className="tabular-nums">{formatPKR(quote.total)}</span>
            </div>
            {rentValue > 0 && (
              <>
                <div className="flex items-baseline justify-between gap-2 border-t pt-2.5">
                  <span className="font-medium">Your offer</span>
                  <span className="font-heading text-base font-bold tracking-tight tabular-nums">
                    {formatPKR(rentValue)}
                  </span>
                </div>
                <div className="text-muted-foreground flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-xs">
                  <span>{formatPKR(Math.round(rentValue / days))} per day</span>
                  {difference !== null && difference !== 0 && (
                    <span>
                      {Math.abs(difference)}%{" "}
                      {difference < 0 ? "below" : "above"} listing price
                    </span>
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">
            Choose dates to compare with the listing&apos;s own price.
          </span>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        className="mt-auto w-full"
        aria-busy={isPending}
        disabled={isPending}
      >
        {isPending ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <HandshakeIcon />
        )}
        Send offer
      </Button>
    </form>
  );
}

export { OfferSheet };
