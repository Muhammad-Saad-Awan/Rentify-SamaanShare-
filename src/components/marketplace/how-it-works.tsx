import { CalendarCheckIcon, HandshakeIcon, SearchIcon } from "lucide-react";

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
      "Pick the days you need. The owner confirms, and the listing is blocked for that window.",
  },
  {
    icon: HandshakeIcon,
    title: "Collect and return",
    description:
      "Meet the owner, pay in cash on handover, and return the item on the agreed date.",
  },
];

/**
 * Three-step explanation of the rental flow.
 *
 * An ordered list, because the steps happen in sequence - a screen reader
 * announces "1 of 3" and the order survives with styles off, which numbered
 * `<div>`s would not.
 *
 * The wording describes cash on handover deliberately: that is the payment model
 * the schema is built around, and promising in-app payment here would set an
 * expectation the product does not meet.
 */
function HowItWorks() {
  return (
    <ol className="grid gap-4 sm:grid-cols-3">
      {STEPS.map((step, index) => (
        <li key={step.title} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span
              className="bg-primary text-primary-foreground font-heading flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              // The number is decorative: the list already conveys order, and
              // announcing "1" before "1 of 3" is redundant.
              aria-hidden="true"
            >
              {index + 1}
            </span>

            <h3 className="font-heading text-sm font-medium">{step.title}</h3>

            <step.icon
              className="text-muted-foreground ml-auto size-4 shrink-0"
              aria-hidden="true"
            />
          </div>

          <p className="text-muted-foreground text-sm">{step.description}</p>
        </li>
      ))}
    </ol>
  );
}

export { HowItWorks };
