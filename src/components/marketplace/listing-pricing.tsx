import { InfoIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { formatPKR } from "@/lib/utils/currency";

interface ListingPricingProps {
  pricePerDay: number;
  pricePerWeek: number | null;
  pricePerMonth: number | null;
  securityDeposit: number;
}

/**
 * Rate card: daily rate, any longer-term rates, and the deposit.
 *
 * Weekly and monthly rows are omitted when unset rather than shown as a dash. An
 * empty row invites the reading "a week costs nothing"; absence correctly says the
 * owner only rents by the day.
 *
 * Where a longer rate exists, the per-day equivalent is shown beside it. That is
 * the number a renter is actually comparing, and doing the division for them is the
 * whole reason to list a weekly rate at all.
 *
 * The deposit is separated by a rule and labelled as refundable, because it is not
 * a cost - conflating it with the rate overstates the price by several times on
 * cheaper items.
 */
function ListingPricing({
  pricePerDay,
  pricePerWeek,
  pricePerMonth,
  securityDeposit,
}: ListingPricingProps) {
  return (
    <Card>
      <div className="flex flex-col gap-3 px-(--card-spacing)">
        <div className="flex flex-col gap-2">
          <PriceRow label="Per day" amount={pricePerDay} />

          {pricePerWeek !== null && (
            <PriceRow
              label="Per week"
              amount={pricePerWeek}
              // 7 and 30 are the plain calendar readings of "week" and "month",
              // which is how an owner sets these rates.
              perDay={pricePerWeek / 7}
            />
          )}

          {pricePerMonth !== null && (
            <PriceRow
              label="Per month"
              amount={pricePerMonth}
              perDay={pricePerMonth / 30}
            />
          )}
        </div>

        <div className="flex items-start justify-between gap-3 border-t pt-3">
          <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
            Security deposit
            <InfoIcon className="size-3.5 shrink-0" aria-hidden="true" />
          </span>

          <div className="flex flex-col items-end">
            <span className="font-heading text-sm font-medium">
              {formatPKR(securityDeposit)}
            </span>
            <span className="text-muted-foreground text-xs">
              Refundable on return
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

interface PriceRowProps {
  label: string;
  amount: number;
  /** When given, shown as the per-day equivalent beneath the amount. */
  perDay?: number;
}

function PriceRow({ label, amount, perDay }: PriceRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground text-sm">{label}</span>

      <div className="flex flex-col items-end">
        <span className="font-heading text-base font-semibold tracking-tight">
          {formatPKR(amount)}
        </span>
        {perDay !== undefined && (
          <span className="text-muted-foreground text-xs">
            {/* Rounded to whole rupees - PKR has no fractional unit. */}
            {formatPKR(Math.round(perDay))} / day
          </span>
        )}
      </div>
    </div>
  );
}

export { ListingPricing };
