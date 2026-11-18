import { ChevronDownIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * A styled native `<select>`.
 *
 * NATIVE ON PURPOSE. Every select in the app is a short, plain list - a category, a city, a
 * condition - and the platform control gives the mobile picker, type-to-select and form
 * submission without JavaScript for free. The filters on the browse page post as an ordinary GET
 * form; a custom listbox would have needed client state just to do what this already does.
 *
 * It replaces a `SELECT_CLASS` string that had been copied into four files and was drifting. The
 * classes match `Input`, so a select and a text field in the same form are visibly siblings.
 * `appearance-none` drops the browser's own arrow, which differs per platform, for one chevron
 * that matches the icon set; the chevron is decorative, the control is still the real `<select>`.
 *
 * Accepts every `<select>` prop and forwards its ref, so `react-hook-form`'s `register()` spreads
 * onto it exactly as it did onto the bare element.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative w-full">
      <select
        data-slot="native-select"
        className={cn(
          "border-input focus-visible:border-ring focus-visible:ring-ring/20 hover:border-foreground/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 bg-card h-10 w-full appearance-none rounded-lg border py-1 pr-9 pl-3 text-base transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm",
          className
        )}
        {...props}
      />
      <ChevronDownIcon
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
    </div>
  );
}

export { NativeSelect };
