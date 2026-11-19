import { CalendarCheckIcon, RepeatIcon, SearchIcon } from "lucide-react";

const STEPS = [
  {
    icon: SearchIcon,
    title: "Find it nearby",
    description:
      "Search or filter by city, category and price to see what is available around you.",
  },
  {
    icon: CalendarCheckIcon,
    title: "Request your dates",
    description:
      "Pick the days you need. Once the owner approves, pay SamaanShare by card or bank transfer.",
  },
  {
    icon: RepeatIcon,
    title: "Collect and return",
    description:
      "Meet the owner, check the item together, and return it on the agreed date. Your deposit comes back after.",
  },
];

/**
 * Three-step explanation of the rental flow.
 *
 * An ordered list, because the steps happen in sequence - a screen reader
 * announces "1 of 3" and the order survives with styles off, which numbered
 * `<div>`s would not. This is the one place on the page where numbering is
 * content rather than ornament.
 *
 * The wording describes payment through the platform, matching `PaymentInstructions`:
 * the renter pays SamaanShare, which holds the deposit until the item is back. It
 * used to promise cash on handover, which the product no longer does.
 */
function HowItWorks() {
  return (
    <ol className="grid gap-4 sm:grid-cols-3 sm:gap-5">
      {STEPS.map((step, index) => (
        <li
          key={step.title}
          className="bg-card relative flex flex-col gap-4 rounded-2xl border p-6"
        >
          <div className="flex items-center justify-between">
            <span
              className="bg-brand-soft text-brand flex size-12 items-center justify-center rounded-xl"
              aria-hidden="true"
            >
              <step.icon className="size-6" strokeWidth={1.75} />
            </span>
            <span
              className="font-heading text-border text-5xl leading-none font-extrabold"
              // Decorative: the list already conveys order.
              aria-hidden="true"
            >
              {index + 1}
            </span>
          </div>

          <h3 className="font-heading text-xl font-bold tracking-[-0.025em]">
            {step.title}
          </h3>

          <p className="text-muted-foreground max-w-[38ch] text-sm leading-relaxed">
            {step.description}
          </p>
        </li>
      ))}
    </ol>
  );
}

export { HowItWorks };
