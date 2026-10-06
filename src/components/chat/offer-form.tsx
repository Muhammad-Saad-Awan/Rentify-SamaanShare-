"use client";

import { HandshakeIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { proposeOffer } from "@/actions/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface OfferFormProps {
  conversationId: string;
  rates: RateCard;
  listingDeposit: number;
  /** Bookings whose terms can still change. Usually none, sometimes one. */
  amendableBookings: AmendableBooking[];
  today: string;
}

const NEW_DATES = "new";

/**
 * Proposing terms: the structured way to negotiate.
 *
 * Two kinds of offer, chosen by "Applies to":
 *   - new dates, before any booking - the dates are free to choose;
 *   - an existing booking whose terms can still change - the dates are the booking's and are fixed,
 *     because moving them is a cancel and rebook.
 *
 * The listing's own quote is shown beside the rent as a reference, never as a limit. The server
 * validates everything again.
 */
function OfferForm({
  conversationId,
  rates,
  listingDeposit,
  amendableBookings,
  today,
}: OfferFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const ids = {
    target: useId(),
    start: useId(),
    end: useId(),
    rent: useId(),
    deposit: useId(),
    quote: useId(),
  };

  const [target, setTarget] = useState(NEW_DATES);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState(String(listingDeposit));

  const booking = amendableBookings.find((item) => item.id === target) ?? null;
  const effectiveStart = booking ? toCalendarDay(booking.startDate) : startDate;
  const effectiveEnd = booking ? toCalendarDay(booking.endDate) : endDate;
  const days = countRentalDays(effectiveStart, effectiveEnd);
  const quote = days > 0 ? calculateRentalPrice(days, rates) : null;

  function chooseTarget(value: string) {
    setTarget(value);

    const chosen = amendableBookings.find((item) => item.id === value);

    // Start from the booking's current terms, so the change being proposed is the only change.
    if (chosen) {
      setRent(String(chosen.totalPrice));
      setDeposit(String(chosen.securityDeposit));
    } else {
      setRent("");
      setDeposit(String(listingDeposit));
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();

    startTransition(async () => {
      const result = await proposeOffer({
        conversationId,
        ...(booking ? { bookingId: booking.id } : {}),
        startDate: effectiveStart,
        endDate: effectiveEnd,
        totalPrice: Number(rent),
        securityDeposit: Number(deposit),
      });

      if (!result.success) {
        toast.error(result.error);

        return;
      }

      toast.success("Offer sent.");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        <HandshakeIcon />
        Propose terms
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="bg-card flex flex-col gap-3 rounded-xl border px-4 py-4"
      aria-labelledby={`${ids.target}-heading`}
    >
      <div className="flex flex-col gap-1">
        <h2
          id={`${ids.target}-heading`}
          className="font-heading text-sm font-medium"
        >
          Propose terms
        </h2>
        <p className="text-muted-foreground text-xs leading-relaxed">
          The other side can accept or decline. Accepted terms are fixed, and
          are what the booking carries. Sending a new offer replaces any open
          one.
        </p>
      </div>

      {amendableBookings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.target} className="text-xs font-medium">
            Applies to
          </label>
          <select
            id={ids.target}
            value={target}
            onChange={(event) => chooseTarget(event.target.value)}
            className="border-input bg-background h-8 rounded-lg border px-2 text-sm"
          >
            <option value={NEW_DATES}>New dates (before booking)</option>
            {amendableBookings.map((item) => (
              <option key={item.id} value={item.id}>
                Booking {formatDate(item.startDate)} to{" "}
                {formatDate(item.endDate)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.start} className="text-xs font-medium">
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
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.end} className="text-xs font-medium">
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
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.rent} className="text-xs font-medium">
            Total rent (Rs.)
          </label>
          <Input
            id={ids.rent}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={rent}
            onChange={(event) => setRent(event.target.value)}
            aria-describedby={quote ? ids.quote : undefined}
            required
          />
          {quote && (
            <p id={ids.quote} className="text-muted-foreground text-xs">
              Listing rate for {quote.label}: {formatPKR(quote.total)}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.deposit} className="text-xs font-medium">
            Security deposit (Rs.)
          </label>
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

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          aria-busy={isPending}
          disabled={isPending}
        >
          {isPending && <Loader2Icon className="animate-spin" />}
          Send offer
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

export { OfferForm };
