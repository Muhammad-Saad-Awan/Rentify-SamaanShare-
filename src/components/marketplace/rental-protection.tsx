import { ClipboardCheckIcon, LockIcon, RotateCcwIcon } from "lucide-react";

import { Card } from "@/components/ui/card";

/**
 * What protects a rental, stated on the listing page.
 *
 * Shown where the decision is made rather than only on the homepage: someone about to send a
 * stranger a request for their camera wants to know, at that moment, where the money goes and
 * what happens if something breaks. Every line restates how the product already works - the
 * platform holds payment and deposit (`PaymentInstructions`), and handovers record the item's
 * condition (`HandoverForm`) - so it promises nothing the code does not do.
 *
 * This is one of the few places emerald is spent on this page: the three tiles are the trust
 * promise itself. Everything else around them stays navy and neutral so the colour keeps its
 * meaning.
 */
const PROTECTIONS = [
  {
    icon: LockIcon,
    title: "Payment held by SamaanShare",
    description: "The owner is paid only after the item is returned.",
  },
  {
    icon: RotateCcwIcon,
    title: "Refundable deposit",
    description:
      "Returned to you unless an upheld damage claim takes part of it.",
  },
  {
    icon: ClipboardCheckIcon,
    title: "Condition on record",
    description: "Recorded at pickup and again at return.",
  },
];

function RentalProtection() {
  return (
    <section aria-labelledby="rental-protection">
      <Card>
        <div className="flex flex-col gap-5 px-(--card-spacing)">
          <h2
            id="rental-protection"
            className="font-heading text-xl font-bold tracking-tight"
          >
            How your rental is protected
          </h2>

          <ul className="grid gap-5 sm:grid-cols-3 sm:gap-6">
            {PROTECTIONS.map((item) => (
              <li key={item.title} className="flex gap-3 sm:flex-col">
                <span
                  className="bg-success-soft text-success flex size-9 shrink-0 items-center justify-center rounded-lg"
                  aria-hidden="true"
                >
                  <item.icon className="size-4" strokeWidth={1.75} />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="font-heading text-sm leading-snug font-semibold">
                    {item.title}
                  </span>
                  <span className="text-muted-foreground text-sm leading-relaxed">
                    {item.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </section>
  );
}

export { RentalProtection };
