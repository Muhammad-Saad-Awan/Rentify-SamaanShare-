"use client";

import { CheckIcon, Loader2Icon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import {
  recordDepositReturn,
  recordOwnerPayout,
  settleBooking,
} from "@/actions/settlement";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatPKR } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { TRANSACTION_REF_MAX } from "@/lib/validations/payment";

import type { ActionResult } from "@/types";
import type { AdminSettlementRow } from "@/lib/queries/admin-settlements";
import type { TransferState } from "@/lib/payments/settlement";

interface SettlementCardProps {
  row: AdminSettlementRow;
}

/**
 * One booking's money, at whatever stage it has reached.
 *
 * THREE ACTS, ONE CARD, because they are one booking and an administrator thinks about them
 * together: decide what is owed, send the owner their share, send the renter their deposit back.
 * Splitting them across screens would mean holding a booking id in your head while navigating.
 *
 * THE BREAKDOWN IS ALWAYS FOUR NUMBERS, never a total. Commission, owner rental, damage
 * compensation and deposit returned are different kinds of money - one is revenue, one is
 * earnings, one is compensation, one is somebody's own money coming back - and the whole
 * `Settlement` model refuses to store a sum of them for the same reason this refuses to show
 * one. A screen that said "payout: 10,625" would be the first place the distinction was lost.
 *
 * A REFUSAL IS SHOWN, NOT HIDDEN. When a booking cannot be settled the reason is printed where
 * the button would be - "the damage claim on this rental is still being decided" tells somebody
 * what to go and do, and a missing button tells them nothing. The text comes from
 * `settlementReadiness`, so the screen and the action give the same answer.
 */
function SettlementCard({ row }: SettlementCardProps) {
  const [isPending, setIsPending] = useState(false);
  const [payoutRef, setPayoutRef] = useState("");
  const [returnRef, setReturnRef] = useState("");

  async function run(
    action: () => Promise<ActionResult<unknown>>,
    successMessage: string
  ) {
    setIsPending(true);

    try {
      const result = await action();

      if (!result.success) {
        toast.error(result.error);

        return;
      }

      setPayoutRef("");
      setReturnRef("");
      toast.success(successMessage);
    } finally {
      setIsPending(false);
    }
  }

  const settled = row.settlement;
  const figures =
    settled ?? (row.pending?.ready ? row.pending.breakdown : null);

  return (
    <Card className="flex flex-col gap-3 px-(--card-spacing) py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <Link
            href={`/admin/bookings/${row.bookingId}`}
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            {row.listing.title}
          </Link>
          <span className="text-muted-foreground text-xs">
            {row.renter.name} → {row.owner.name}
            {row.completedAt
              ? ` · returned ${formatDate(row.completedAt)}`
              : ""}
          </span>
        </div>

        {settled ? (
          settled.complete ? (
            <Badge>Settled and sent</Badge>
          ) : (
            <Badge variant="secondary">Sending</Badge>
          )
        ) : (
          <Badge variant="outline">To settle</Badge>
        )}
      </div>

      {/*
        Four figures, never their sum. See the note on the component.
      */}
      {figures && (
        <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
          <dt>Rental</dt>
          <dd className="text-foreground">{formatPKR(figures.rentalAmount)}</dd>

          <dt>Commission ({figures.commissionRateBps}bps)</dt>
          <dd className="text-foreground">
            {formatPKR(figures.commissionAmount)}
          </dd>

          <dt>Owner, for the rental</dt>
          <dd className="text-foreground">
            {formatPKR(figures.ownerRentalAmount)}
          </dd>

          {figures.damageCompensationAmount > 0 && (
            <>
              <dt>Owner, damage compensation</dt>
              <dd className="text-foreground">
                {formatPKR(figures.damageCompensationAmount)}
              </dd>
            </>
          )}

          <dt>Deposit back to renter</dt>
          <dd className="text-foreground">
            {formatPKR(figures.depositReturnedAmount)}
          </dd>
        </dl>
      )}

      {/* ------------------------------------------------------------ not yet settled */}
      {!settled && row.pending && !row.pending.ready && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {row.pending.reason}
        </p>
      )}

      {!settled && row.pending?.ready && (
        <div>
          <Button
            size="sm"
            disabled={isPending}
            aria-busy={isPending}
            onClick={() =>
              void run(
                () => settleBooking({ bookingId: row.bookingId }),
                "Settled. Both parties have been told what they are owed."
              )
            }
          >
            {isPending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <CheckIcon />
            )}
            Settle this booking
          </Button>
        </div>
      )}

      {/* ------------------------------------------------------------ settled, transfers pending */}
      {settled && (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-xs">
            {`Settled ${formatDate(settled.settledAt)}${settled.settledByName ? ` by ${settled.settledByName}` : ""}.`}
          </p>

          <TransferRow
            label="Owner payout"
            state={settled.ownerPayout}
            reference={settled.ownerPayoutRef}
            value={payoutRef}
            onChange={setPayoutRef}
            isPending={isPending}
            onSubmit={() =>
              void run(
                () =>
                  recordOwnerPayout({
                    bookingId: row.bookingId,
                    payoutRef,
                  }),
                "Payout recorded. The owner has been told."
              )
            }
          />

          <TransferRow
            label="Deposit return"
            state={settled.depositReturn}
            reference={settled.depositReturnRef}
            value={returnRef}
            onChange={setReturnRef}
            isPending={isPending}
            onSubmit={() =>
              void run(
                () =>
                  recordDepositReturn({
                    bookingId: row.bookingId,
                    returnRef,
                  }),
                "Deposit return recorded. The renter has been told."
              )
            }
          />

          {settled.notes && (
            <p className="text-muted-foreground text-xs leading-relaxed">
              {settled.notes}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

interface TransferRowProps {
  label: string;
  /** The real union, so the three branches below are exhaustive rather than string-matched. */
  state: TransferState;
  reference: string | null;
  value: string;
  onChange: (value: string) => void;
  isPending: boolean;
  onSubmit: () => void;
}

/**
 * One of the two transfers, in whichever of its three states it is in.
 *
 * `nothing-to-send` gets a line of its own rather than being hidden, because a settlement where
 * a claim consumed the whole deposit has no deposit return to make and an administrator looking
 * for one needs to be told that rather than left wondering where the control went.
 */
function TransferRow({
  label,
  state,
  reference,
  value,
  onChange,
  isPending,
  onSubmit,
}: TransferRowProps) {
  if (state.kind === "nothing-to-send") {
    return (
      <p className="text-muted-foreground text-xs">{label}: nothing to send.</p>
    );
  }

  if (state.kind === "sent") {
    return (
      <p className="text-muted-foreground text-xs">
        {`${label}: ${formatPKR(state.amount)} sent on ${formatDate(state.at)}${reference ? `, ref ${reference}` : ""}.`}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium">
        {`${label}: ${formatPKR(state.amount)} to send`}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={`${label} transfer reference`}
          placeholder="Transfer reference"
          className="max-w-56"
          maxLength={TRANSACTION_REF_MAX}
          value={value}
          disabled={isPending}
          onChange={(event) => onChange(event.target.value)}
        />

        <Button
          size="sm"
          variant="outline"
          disabled={isPending || value.trim().length === 0}
          aria-busy={isPending}
          onClick={onSubmit}
        >
          {isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
          Record as sent
        </Button>
      </div>
    </div>
  );
}

export { SettlementCard };
