"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils/cn";

/**
 * An on/off control.
 *
 * A switch rather than a checkbox because these settings take effect on save and describe
 * a state ("review reminders are on"), not a selection within a form. There was no
 * primitive for either in this project - `ui/` had no checkbox and no switch - so this is
 * the first, added the same way `Textarea` was in Stage A1.
 *
 * Base UI renders a `<span>` plus a hidden `<input>`, so it participates in a form and is
 * operable by keyboard and screen reader without any of that being hand-rolled. The
 * classes follow the tokens the rest of `ui/` uses, so it sits beside an `Input`.
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "focus-visible:border-ring focus-visible:ring-ring/50 data-[checked]:bg-primary bg-input dark:bg-input/60 relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="bg-background pointer-events-none block size-4 translate-x-0.5 rounded-full shadow-sm ring-1 ring-black/5 transition-transform data-[checked]:translate-x-[1.125rem]"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
