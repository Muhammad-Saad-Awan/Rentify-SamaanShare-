import { ClipboardCheckIcon, LockIcon, RotateCcwIcon } from "lucide-react";

/**
 * What protects a rental, stated beside the booking form.
 *
 * Shown where the decision is made rather than only on the homepage: someone about to send a
 * stranger a request for their camera wants to know, at that moment, where the money goes and
 * what happens if something breaks. Every line restates how the product already works - the
 * platform holds payment and deposit (`PaymentInstructions`), and handovers record the item's
 * condition (`HandoverForm`) - so it promises nothing the code does not do.
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
    <section
      aria-labelledby="rental-protection"
      className="bg-muted/60 flex flex-col gap-4 rounded-xl p-5"
    >
      <h2 id="rental-protection" className="font-heading text-sm font-semibold">
        How your rental is protected
      </h2>

      <ul className="flex flex-col gap-3.5">
        {PROTECTIONS.map((item) => (
          <li key={item.title} className="flex gap-3">
            <span
              className="bg-background flex size-8 shrink-0 items-center justify-center rounded-lg border"
              aria-hidden="true"
            >
              <item.icon className="size-4" strokeWidth={1.75} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm leading-snug font-medium">
                {item.title}
              </span>
              <span className="text-muted-foreground text-xs leading-relaxed">
                {item.description}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { RentalProtection };
