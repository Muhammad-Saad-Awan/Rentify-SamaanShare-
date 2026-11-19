import { ClipboardCheckIcon, ShieldCheckIcon, WalletIcon } from "lucide-react";
import Image from "next/image";

import { Brand } from "@/components/shared/brand";

import heroImage from "../../../public/images/hero-camera.jpg";

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
 * From `lg` up the form sits beside a mint panel that says, briefly, why the
 * account is worth making. Below that the panel is dropped entirely: on a phone
 * the form is the task, and anything above it pushes the first field off screen.
 * The one promise that matters most - the money is held, not handed over - comes
 * back as a single line under the card instead.
 *
 * The panel uses the mint brand surface and the homepage hero photograph, so signing in feels
 * like the same product as the page the visitor just left. `mix-blend-multiply` lets the
 * photo's white background take on the mint, so it has no visible rectangle. In dark mode the
 * surface token turns deep green and the light text tokens follow it.
 */
export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-svh flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="bg-brand-soft hidden flex-col justify-between gap-8 overflow-hidden p-12 lg:flex">
        <Brand href="/" className="w-fit" />

        <div className="flex max-w-lg flex-col gap-6">
          <p className="font-heading text-4xl leading-[1.1] font-extrabold tracking-[-0.03em] text-balance">
            <span className="text-brand">Rent</span> what you need,{" "}
            <span className="text-brand">share</span> what you have.
          </p>

          <Image
            src={heroImage}
            alt=""
            // The largest paint on a wide screen, so it loads eagerly; below `lg` the panel is
            // not rendered and the browser never requests it.
            priority
            sizes="(min-width: 1024px) 40vw, 1px"
            className="-my-2 h-auto w-full max-w-md mix-blend-multiply dark:hidden"
          />

          <ul className="flex flex-col gap-5">
            {PROMISES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-4">
                <span
                  className="bg-card text-brand flex size-10 shrink-0 items-center justify-center rounded-xl"
                  aria-hidden="true"
                >
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <div className="flex flex-col gap-0.5 pt-0.5">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-muted-foreground border-brand/15 border-t pt-6 text-xs">
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
