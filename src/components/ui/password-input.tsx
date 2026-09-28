"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

/**
 * A password field with a reveal toggle.
 *
 * WHY THIS EXISTS AS A COMPONENT rather than as a `showPassword` prop on `Input`. The toggle
 * owns state, so it makes `Input` a client component for every caller that never needed one -
 * and `Input` is used on public marketplace pages that are server-rendered today. Keeping the
 * state here leaves that untouched.
 *
 * `type="button"` ON THE TOGGLE IS LOAD-BEARING. A `<button>` inside a `<form>` defaults to
 * `type="submit"`, so without it, revealing the password would submit the sign-in form instead -
 * with whatever had been typed so far.
 *
 * THE ACCESSIBLE NAME CHANGES rather than the button carrying `aria-pressed`. Both are valid
 * patterns and they do not combine well: with both, a screen reader announces "Hide password,
 * pressed", which says the same thing twice and in two directions. A name that states what the
 * next press does is the one people act on, and changing it while focus is on the button
 * re-announces it - which is the confirmation that the press worked.
 */

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type">;

function PasswordInput({ className, disabled, ...props }: PasswordInputProps) {
  const [isVisible, setIsVisible] = React.useState(false);

  const Icon = isVisible ? EyeOffIcon : EyeIcon;

  return (
    <div className="relative">
      <Input
        type={isVisible ? "text" : "password"}
        disabled={disabled}
        className={cn(
          /*
           * Room for the button, so a long password does not run underneath it.
           *
           * `::-ms-reveal` is Edge's own reveal control, which would otherwise sit next to ours
           * and show a second eye that does not match this one's state.
           */
          "pr-8 [&::-ms-reveal]:hidden",
          className
        )}
        {...props}
      />

      <button
        type="button"
        // The field this controls, for assistive technology that reports the relationship.
        {...(props.id ? { "aria-controls": props.id } : {})}
        aria-label={isVisible ? "Hide password" : "Show password"}
        disabled={disabled}
        onClick={() => setIsVisible((visible) => !visible)}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 focus-visible:border-ring absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-lg outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50"
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export { PasswordInput };
