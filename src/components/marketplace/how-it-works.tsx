const STEPS = [
  {
    title: "Find it nearby",
    description:
      "Search or filter by city, category and price to see what is available around you.",
  },
  {
    title: "Request your dates",
    description:
      "Pick the days you need. Once the owner approves, pay SamaanShare by card or bank transfer.",
  },
  {
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
    <ol className="grid gap-x-8 sm:grid-cols-3">
      {STEPS.map((step, index) => (
        <li
          key={step.title}
          className="border-foreground flex flex-col gap-3 border-t-2 pt-5 pb-8 sm:pb-0"
        >
          <span
            className="font-heading text-muted-foreground text-sm font-semibold"
            // Decorative: the list already conveys order, and announcing "1"
            // before "1 of 3" is redundant.
            aria-hidden="true"
          >
            Step {index + 1}
          </span>

          <h3 className="font-heading text-xl font-bold tracking-[-0.02em]">
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
