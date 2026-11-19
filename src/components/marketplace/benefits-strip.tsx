import {
  HandshakeIcon,
  LeafIcon,
  PiggyBankIcon,
  ShieldCheckIcon,
} from "lucide-react";

/**
 * Why rent here, in four lines. Each one is true of the product today: payment is held by the
 * platform until the item is back, members verify their identity, renting by the day costs less
 * than buying, and an item used by many people is an item fewer people buy.
 */
const BENEFITS = [
  {
    icon: ShieldCheckIcon,
    title: "Secure Payments",
    description: "Your payment is held until the item is back",
  },
  {
    icon: HandshakeIcon,
    title: "Build Community",
    description: "Rent and lend with verified members",
  },
  {
    icon: PiggyBankIcon,
    title: "Save Money",
    description: "Rent for a day instead of buying",
  },
  {
    icon: LeafIcon,
    title: "Eco-Friendly",
    description: "Share resources, reduce waste",
  },
];

/**
 * The mint band beneath the hero.
 *
 * A list, not four headings: these are short claims, and promoting each to an `h3` would put
 * four entries into the heading outline between the `h1` and the first real section.
 */
function BenefitsStrip() {
  return (
    <ul className="bg-brand-soft grid gap-6 rounded-2xl px-6 py-6 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:gap-0 lg:py-7">
      {BENEFITS.map((benefit) => (
        <li
          key={benefit.title}
          className="group border-brand/15 flex items-center gap-4 lg:justify-center lg:border-l lg:px-6 lg:first:border-l-0"
        >
          <span
            className="bg-card text-brand flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-[-4deg]"
            aria-hidden="true"
          >
            <benefit.icon className="size-7" strokeWidth={1.75} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="font-heading text-base font-bold tracking-tight">
              {benefit.title}
            </p>
            <p className="text-muted-foreground text-sm leading-snug">
              {benefit.description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export { BenefitsStrip };
