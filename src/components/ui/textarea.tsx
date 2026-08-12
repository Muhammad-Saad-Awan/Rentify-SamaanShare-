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
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 field-sizing-content min-h-16 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
