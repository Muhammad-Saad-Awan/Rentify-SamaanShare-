"use client";

import {
  CheckCircle2Icon,
  ClockIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

import { confirmHandover } from "@/actions/handover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { HandoverConfirmation, HandoverType } from "@/generated/prisma/enums";
import {
  HANDOVER_CONDITION_LABELS,
  HANDOVER_REPLY_MAX,
  reportsDamage,
} from "@/lib/handover/rules";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/date";

import type { HandoverSnapshot } from "@/lib/queries/bookings";

interface HandoverRecordListProps {
  handovers: HandoverSnapshot[];
}

/**
 * The condition records for a rental, and the counterparty's answer to them.
 *
 * SHOWS THE STANDING, NOT JUST THE GRADE. "Damaged, agreed by both" and "damaged, disputed" are
 * different facts and the second is not a worse version of the first - it is a live disagreement
 * with two accounts attached. Unanswered is a third thing again, and rendering it as though the
 * other party had declined to agree would misrepresent the many people who simply never open the app
 * after handing a drill back.
 *
 * THE RECORD IS NEVER EDITABLE HERE, by anyone, including its author. There is no update path in the
 * action either; this component simply has no control to offer.
 */
function HandoverRecordList({ handovers }: HandoverRecordListProps) {
  if (handovers.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-2">
      {handovers.map((handover) => (
        <li key={handover.id}>
          <HandoverRecordCard handover={handover} />
        </li>
      ))}
    </ul>
  );
}

/** Declared at module scope, not inside the list - see the `EditPanel` note in `BookingActions`. */
function HandoverRecordCard({ handover }: { handover: HandoverSnapshot }) {
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"agree" | "dispute" | null>(null);

  const moment =
    handover.type === HandoverType.PICKUP ? "At collection" : "On return";
  const flagged = reportsDamage(handover.condition);

  async function answer(agreed: boolean) {
    setPending(agreed ? "agree" : "dispute");

    const result = await confirmHandover({
      handoverId: handover.id,
      agreed,
      ...(note.trim() ? { note: note.trim() } : {}),
    });

    setPending(null);

    if (!result.success) {
      toast.error(result.error);

      return;
    }

    toast.success(
      agreed
        ? "Recorded that you agree."
        : "Recorded that you disagree, with your note."
    );
    setIsOpen(false);
  }

  return (
    <div className="rounded-lg border px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{moment}</span>
        <span
          className={cn(
            "text-xs",
            flagged ? "text-destructive font-medium" : "text-muted-foreground"
          )}
        >
          {HANDOVER_CONDITION_LABELS[handover.condition]}
        </span>
        <span className="text-muted-foreground text-xs">
          {formatDate(handover.recordedAt)}
        </span>
        <Standing confirmation={handover.confirmation} />
      </div>

      {handover.notes && (
        // A string, never HTML - it is user input.
        <p className="text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-line">
          {handover.notes}
        </p>
      )}

      {handover.photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {handover.photos.map((photo) => (
            <a
              key={photo.id}
              href={photo.url}
              target="_blank"
              rel="noreferrer"
              className="focus-visible:ring-ring relative size-16 overflow-hidden rounded-md outline-none focus-visible:ring-2"
            >
              <Image
                src={photo.url}
                alt="Condition photo"
                fill
                sizes="64px"
                className="object-cover"
              />
            </a>
          ))}
        </div>
      )}

      {handover.confirmationNote && (
        <p className="text-muted-foreground border-muted mt-2 border-l-2 pl-2.5 text-xs leading-relaxed whitespace-pre-line">
          {handover.confirmationNote}
        </p>
      )}

      {handover.canConfirm && !isOpen && (
        <div className="mt-2">
          <Button size="sm" variant="outline" onClick={() => setIsOpen(true)}>
            Confirm or dispute
          </Button>
        </div>
      )}

      {handover.canConfirm && isOpen && (
        <div className="mt-2 flex flex-col gap-2">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={HANDOVER_REPLY_MAX}
            rows={2}
            placeholder="Optional — your own account of the item's condition"
            disabled={pending !== null}
            aria-label="Your reply"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => answer(true)}
              disabled={pending !== null}
              aria-busy={pending === "agree"}
            >
              {pending === "agree" && <Loader2Icon className="animate-spin" />}I
              agree
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => answer(false)}
              disabled={pending !== null}
              aria-busy={pending === "dispute"}
            >
              {pending === "dispute" && (
                <Loader2Icon className="animate-spin" />
              )}
              I disagree
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsOpen(false)}
              disabled={pending !== null}
            >
              Not now
            </Button>
          </div>

          {/*
            Says the answer is final before it is given. Someone who discovers afterwards that they
            cannot change it has been misled by silence, and this is the field a later claim reads.
          */}
          <p className="text-muted-foreground text-xs leading-relaxed">
            You can answer once, and it cannot be changed afterwards.
          </p>
        </div>
      )}
    </div>
  );
}

/** The three standings, each said in its own words rather than as a shade of one scale. */
function Standing({ confirmation }: { confirmation: HandoverConfirmation }) {
  if (confirmation === HandoverConfirmation.AGREED) {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600">
        <CheckCircle2Icon className="size-3.5" aria-hidden="true" />
        Both parties agreed
      </span>
    );
  }

  if (confirmation === HandoverConfirmation.DISPUTED) {
    return (
      <span className="text-destructive flex items-center gap-1 text-xs font-medium">
        <TriangleAlertIcon className="size-3.5" aria-hidden="true" />
        Disputed
      </span>
    );
  }

  return (
    <span className="text-muted-foreground flex items-center gap-1 text-xs">
      <ClockIcon className="size-3.5" aria-hidden="true" />
      Awaiting the other party
    </span>
  );
}

export { HandoverRecordList };
