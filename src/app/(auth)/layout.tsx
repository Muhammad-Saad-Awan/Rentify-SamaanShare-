import { Brand } from "@/components/shared/brand";

import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

const PROMISES = [
  "You pay SamaanShare, not a stranger. The owner is paid once the item is back.",
  "Deposits are held by the platform and returned after the rental.",
  "The item's condition is recorded at pickup and at return.",
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
 * From `lg` up the form sits beside a black panel that says, briefly, why the
 * account is worth making. Below that the panel is dropped entirely: on a phone
 * the form is the task, and anything above it pushes the first field off screen.
 */
export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-svh flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="bg-foreground text-background hidden flex-col justify-between p-12 lg:flex">
        <Brand href="/" tone="inverted" className="w-fit" />

        <div className="flex max-w-md flex-col gap-8">
          <p className="font-heading text-4xl leading-[1.05] font-extrabold tracking-[-0.03em]">
            Rent from people nearby. Lend what you own.
          </p>

          <ul className="border-background/20 flex flex-col border-t">
            {PROMISES.map((promise) => (
              <li
                key={promise}
                className="border-background/20 text-background/75 border-b py-4 text-sm leading-relaxed"
              >
                {promise}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-background/50 text-xs">
          Karachi, Lahore and Islamabad
        </p>
      </aside>

      <main className="flex flex-col items-center justify-center gap-8 px-4 py-10 sm:px-6">
        <Brand href="/" className="lg:hidden" />

        {/*
          The pages render their own Card. On a wide screen the panel beside it
          already frames the page, so the card's border and padding give way to
          plain type at a larger size.
        */}
        <div className="w-full max-w-sm sm:[&_[data-slot=card-title]]:text-2xl lg:[&>[data-slot=card]]:border-transparent lg:[&>[data-slot=card]]:py-0 lg:[&>[data-slot=card]>*]:px-0">
          {children}
        </div>
      </main>
    </div>
  );
}
