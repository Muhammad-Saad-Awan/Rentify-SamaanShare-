import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Multi-line text input.
 *
 * A plain `<textarea>` rather than a Base UI primitive, because there is not one - `@base-ui/react`
 * ships `input`, `field` and `number-field` but no textarea, and shadcn's own Textarea is an
 * unwrapped element for the same reason. The classes mirror `Input` so the two look like siblings;
 * only the height rules differ, since a textarea has to grow.
 *
 * `field-sizing-content` lets the box grow with what is typed, on browsers that support it, with
 * `min-h` as the floor everywhere else. No JavaScript auto-resize: it fights the user's own drag
 * handle and reflows the page on every keystroke.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:ring-foreground/10 disabled:bg-muted hover:border-foreground/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 bg-background field-sizing-content min-h-20 w-full rounded-lg border px-3 py-2 text-base transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
