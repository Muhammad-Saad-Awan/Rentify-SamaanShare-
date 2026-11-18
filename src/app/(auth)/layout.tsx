import { ClipboardCheckIcon, ShieldCheckIcon, WalletIcon } from "lucide-react";

import { Brand } from "@/components/shared/brand";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

const PROMISES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ShieldCheckIcon,
    title: "You pay SamaanShare, not a stranger",
    body: "The owner is paid once the item is back.",
  },
  {
    icon: WalletIcon,
    title: "Deposits are held by the platform",
    body: "And returned to you after the rental.",
  },
  {
    icon: ClipboardCheckIcon,
    title: "Condition is recorded both ways",
    body: "At pickup and again at return.",
  },
];

/**
 * Shared frame for the sign-in and sign-up pages.
 *
 * `(auth)` is a route group: the parentheses keep it out of the URL, so this
 * layout wraps `/login` and `/register` without nesting them under `/auth`.
 *
 * Stays a Server Component and reads no session - middleware already bounces
 * signed-in visitors away from these routes, so doing it again here would only
 * make the pages dynamic for no benefit.
 *
 * From `lg` up the form sits beside a navy panel that says, briefly, why the
 * account is worth making. Below that the panel is dropped entirely: on a phone
 * the form is the task, and anything above it pushes the first field off screen.
 * The one promise that matters most - the money is held, not handed over - comes
 * back as a single line under the card instead.
 *
 * THE PANEL STAYS DARK IN DARK MODE. `bg-primary` inverts to a light surface under
 * `.dark`, which turned the panel into a pale slab beside a dark form; there it
 * becomes a card-coloured column with a border instead, and its text switches to
 * the theme's own foregrounds rather than translucent white.
 */
export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-svh flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="bg-primary text-primary-foreground dark:bg-card dark:text-card-foreground hidden flex-col justify-between gap-12 p-12 lg:flex dark:border-r">
        <Brand href="/" tone="inverted" className="w-fit" />

        <div className="flex max-w-md flex-col gap-10">
          <p className="font-heading text-4xl leading-[1.05] font-extrabold tracking-[-0.03em] text-balance">
            Rent from people nearby. Lend what you own.
          </p>

          <ul className="flex flex-col gap-6">
            {PROMISES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-4">
                <span
                  className="border-primary-foreground/15 dark:border-border flex size-10 shrink-0 items-center justify-center rounded-lg border"
                  aria-hidden="true"
                >
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <div className="flex flex-col gap-0.5 pt-0.5">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-primary-foreground/75 dark:text-muted-foreground text-sm leading-relaxed">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-primary-foreground/65 dark:text-muted-foreground border-primary-foreground/15 dark:border-border border-t pt-6 text-xs">
          Renting and lending in Karachi, Lahore and Islamabad
        </p>
      </aside>

      <main className="flex flex-col items-center justify-center gap-8 px-4 py-10 sm:px-6 lg:py-16">
        <Brand href="/" className="lg:hidden" />

        {/*
          The pages render their own Card. It stays a bordered white card at every
          width - on a wide screen it used to dissolve into plain type, which left
          a white slab with no padding sitting on the page colour. The spacing is
          raised from the card default so a short form does not feel cramped.
        */}
        <div className="flex w-full max-w-[26rem] flex-col gap-6 [&>[data-slot=card]]:[--card-spacing:--spacing(6)] sm:[&>[data-slot=card]]:[--card-spacing:--spacing(8)]">
          {children}

          <p className="text-muted-foreground flex items-start justify-center gap-2 px-2 text-center text-xs leading-relaxed lg:hidden">
            <ShieldCheckIcon
              className="text-success mt-px size-3.5 shrink-0"
              aria-hidden="true"
            />
            Payments and deposits are held by SamaanShare until the item is
            back.
          </p>
        </div>
      </main>
    </div>
  );
}
