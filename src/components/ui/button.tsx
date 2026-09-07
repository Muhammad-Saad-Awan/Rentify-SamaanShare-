import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

/**
 * Whether a `render` prop will produce a real `<button>`.
 *
 * Base UI needs to be told. Its `nativeButton` defaults to `true`, and when that is
 * wrong it keeps the native button behaviour it cannot actually have - so it warns, once
 * per element, on every render. That warning was firing ten-plus times on the public
 * pages, because the header, the CTA and the pagination all render Buttons as links.
 *
 * Absent `render` means the primitive renders its own `<button>`. Otherwise the answer is
 * the element's own type: `"button"` is a real one; `<Link>`, `<a>` and `<label>` are not.
 * A component type (`Link`) can never be a native button, so anything that is not the
 * literal string `"button"` is treated as not one - which is the safe direction, since
 * `nativeButton={false}` makes Base UI supply the keyboard and ARIA behaviour a
 * non-button needs rather than assume it is already there.
 */
function rendersNativeButton(render: ButtonPrimitive.Props["render"]): boolean {
  if (render === undefined) {
    return true;
  }

  // A function render could return anything, so its author has to say. Defaulting such a
  // case to `false` would be a guess in the other direction; there are none in this
  // codebase, and an explicit `nativeButton` still overrides whatever this returns.
  if (typeof render === "function") {
    return true;
  }

  return render.type === "button";
}

/**
 * The project's button.
 *
 * `nativeButton` IS DERIVED, NOT LEFT TO CALL SITES. Every `render={<Link />}` would
 * otherwise have to remember to pass `nativeButton={false}`, and forgetting is invisible
 * until someone opens a browser console - which is exactly how eleven of them accumulated.
 * Deriving it here means the rule is applied once, and an explicit prop still wins for the
 * cases this cannot know about.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  nativeButton,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      // `??` rather than a default parameter: an explicitly passed `false` must survive,
      // and under `exactOptionalPropertyTypes` an explicit `undefined` is not assignable.
      nativeButton={nativeButton ?? rendersNativeButton(props.render)}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
