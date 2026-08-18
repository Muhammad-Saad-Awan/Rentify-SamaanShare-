import {
  BadgeCheckIcon,
  CalendarCheckIcon,
  ShieldCheckIcon,
  SproutIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { TRUST_BAND_DESCRIPTIONS, TRUST_BAND_LABELS } from "@/lib/trust/score";

import type { TrustAssessment } from "@/lib/trust/score";

interface TrustPanelProps {
  trust: TrustAssessment;
  isVerified: boolean;
  completedRentals: number;
  memberSince: Date;
}

/**
 * What this platform is willing to say about a member.
 *
 * SHOWS EVIDENCE, NOT A NUMBER. The score exists to decide the badge and is never printed: "73 out
 * of 100" implies a precision that four weighted proxies cannot support, and a reader who cannot see
 * what produced it has no way to judge whether it means anything. Completed rentals, verification
 * status and time on the platform are all checkable claims, so those are what appear.
 *
 * NO NEGATIVE STATE. A member who has earned no badge gets no badge - never a warning. See
 * `trustBandFor`: an algorithmic accusation on a public page is a much heavier thing than a missing
 * commendation, and the ratings below are the evidence a reader should be using anyway.
 *
 * "NEW" IS SAID PLAINLY. An account with no completed rentals is described as new rather than left
 * blank, because a blank space invites the reader to assume something was withheld.
 */
function TrustPanel({
  trust,
  isVerified,
  completedRentals,
  memberSince,
}: TrustPanelProps) {
  const isNew = trust.score === null;
  const yearsOn = yearsSince(memberSince);

  return (
    <Card>
      <div className="flex flex-col gap-3 px-(--card-spacing)">
        {trust.band ? (
          <div className="flex items-start gap-2.5">
            <ShieldCheckIcon
              className="text-primary mt-0.5 size-5 shrink-0"
              aria-hidden="true"
            />
            <div className="flex flex-col gap-0.5">
              <span className="font-heading text-sm font-medium">
                {TRUST_BAND_LABELS[trust.band]}
              </span>
              <span className="text-muted-foreground text-xs leading-relaxed">
                {TRUST_BAND_DESCRIPTIONS[trust.band]}
              </span>
            </div>
          </div>
        ) : isNew ? (
          <div className="flex items-start gap-2.5">
            <SproutIcon
              className="text-muted-foreground mt-0.5 size-5 shrink-0"
              aria-hidden="true"
            />
            <div className="flex flex-col gap-0.5">
              <span className="font-heading text-sm font-medium">
                New to SamaanShare
              </span>
              <span className="text-muted-foreground text-xs leading-relaxed">
                No completed rentals yet. Everyone starts here.
              </span>
            </div>
          </div>
        ) : null}

        <ul className="text-muted-foreground flex flex-col gap-1.5 text-xs">
          <li className="flex items-center gap-2">
            <CalendarCheckIcon
              className="size-3.5 shrink-0"
              aria-hidden="true"
            />
            {completedRentals === 0
              ? "No completed rentals yet"
              : `${completedRentals} completed rental${completedRentals === 1 ? "" : "s"}`}
          </li>

          {/*
            Stated either way. "Identity not verified" is a fact about a step not taken, not a
            judgement - and leaving it out entirely would let a reader assume the badge above
            covers it.
          */}
          <li className="flex items-center gap-2">
            <BadgeCheckIcon
              className={
                isVerified
                  ? "text-primary size-3.5 shrink-0"
                  : "size-3.5 shrink-0"
              }
              aria-hidden="true"
            />
            {isVerified ? "Identity verified" : "Identity not verified"}
          </li>

          <li className="flex items-center gap-2">
            <span className="size-3.5 shrink-0" aria-hidden="true" />
            {yearsOn >= 1
              ? `On SamaanShare for ${yearsOn} year${yearsOn === 1 ? "" : "s"}`
              : "Joined within the last year"}
          </li>
        </ul>

        {/*
          The disclaimer is not boilerplate. SamaanShare holds no deposit and settles no dispute, so
          a trust badge that a reader treated as a guarantee would be a promise the platform cannot
          keep - the same line every piece of payment copy draws.
        */}
        <p className="text-muted-foreground border-t pt-2.5 text-xs leading-relaxed">
          These are signals from past rentals, not a guarantee. Meet in a public
          place and check the item before you pay.
        </p>
      </div>
    </Card>
  );
}

/** Whole years between then and now. Floors, so eleven months does not read as a year. */
function yearsSince(date: Date): number {
  const ms = Date.now() - date.getTime();

  return Math.max(0, Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000)));
}

export { TrustPanel };
