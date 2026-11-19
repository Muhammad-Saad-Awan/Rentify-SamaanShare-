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
import { Badge } from "@/components/ui/badge";
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
    <div
      className={cn(
        "bg-card flex flex-col gap-2 rounded-xl border px-3 py-3 text-sm",
        // An answer is owed by this viewer: the record's edge says so before its button does.
        handover.canConfirm && "border-warning/60"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="font-medium">{moment}</span>
        <span className="text-muted-foreground text-xs">
          {formatDate(handover.recordedAt)}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
          {/*
            The grade as a pill, amber when it reports a problem. Not red: "damaged" is what
            somebody recorded, not something the platform has found - and a record can be
            disputed, which is the standing beside it.
          */}
          <Badge variant={flagged ? "warning" : "outline"}>
            {flagged && <TriangleAlertIcon aria-hidden="true" />}
            {HANDOVER_CONDITION_LABELS[handover.condition]}
          </Badge>
          <Standing confirmation={handover.confirmation} />
        </span>
      </div>

      {handover.notes && (
        // A string, never HTML - it is user input.
        <p className="text-muted-foreground leading-relaxed break-words whitespace-pre-line">
          {handover.notes}
        </p>
      )}

      {handover.photos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {handover.photos.map((photo) => (
            <a
              key={photo.id}
              href={photo.url}
              target="_blank"
              rel="noreferrer"
              className="focus-visible:ring-ring bg-muted relative size-16 overflow-hidden rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
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
        <p className="text-muted-foreground border-l-2 pl-2.5 text-xs leading-relaxed break-words whitespace-pre-line">
          {handover.confirmationNote}
        </p>
      )}

      {handover.canConfirm && !isOpen && (
        <div className="bg-warning-soft text-warning-soft-foreground flex flex-col gap-2 rounded-md px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed font-medium">
            The other party recorded this. Check it matches what you saw.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-full shrink-0 sm:w-auto"
            onClick={() => setIsOpen(true)}
          >
            Confirm or dispute
          </Button>
        </div>
      )}

      {handover.canConfirm && isOpen && (
        <div className="flex flex-col gap-2">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={HANDOVER_REPLY_MAX}
            rows={2}
            placeholder="Optional — your own account of the item's condition"
            disabled={pending !== null}
            aria-label="Your reply"
          />

          <div className="flex flex-col gap-2 *:w-full sm:flex-row sm:flex-wrap sm:items-center sm:*:w-auto">
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

/**
 * The three standings, each said in its own words rather than as a shade of one scale.
 *
 * Agreement is the one settled-in-everyone's-favour state, so it alone is emerald; a dispute is a
 * live disagreement that needs attention, not a failure, so it is amber rather than red.
 */
function Standing({ confirmation }: { confirmation: HandoverConfirmation }) {
  if (confirmation === HandoverConfirmation.AGREED) {
    return (
      <Badge variant="success">
        <CheckCircle2Icon aria-hidden="true" />
        Both parties agreed
      </Badge>
    );
  }

  if (confirmation === HandoverConfirmation.DISPUTED) {
    return (
      <Badge variant="warning">
        <TriangleAlertIcon aria-hidden="true" />
        Disputed
      </Badge>
    );
  }

  return (
    <Badge variant="secondary">
      <ClockIcon aria-hidden="true" />
      Awaiting the other party
    </Badge>
  );
}

export { HandoverRecordList };
