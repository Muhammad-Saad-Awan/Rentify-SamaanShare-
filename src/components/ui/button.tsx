import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cloneElement, isValidElement } from "react";

import type { MouseEvent, ReactElement } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * `aria-disabled` IS STYLED THE SAME AS `disabled`, DELIBERATELY.
 *
 * A `disabled` button is removed from the tab order and skipped by screen readers, which is
 * right for a control that is meaningless in the current state and wrong for one that is
 * momentarily unavailable but still part of the picture - a "move earlier" arrow on the first
 * photo, say. Worse, a `disabled` element **cannot hold focus**: disabling the control a
 * keyboard user has just operated drops focus to `<body>` at the exact moment their action
 * succeeded.
 *
 * `aria-disabled` keeps the control focusable and announced as unavailable, so the call site can
 * choose per case. The handler must then guard, since an `aria-disabled` button still fires.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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
/** The props this component reads off a `render` element that turns out to be a link. */
interface LinkLikeProps {
  href?: unknown;
  className?: string | undefined;
  children?: React.ReactNode;
}

/**
 * Whether `render` will produce a link - an element carrying an `href`.
 *
 * Duck-typed on the prop rather than compared against `next/link`, so a plain `<a>`, a `<Link>`
 * and anything else that navigates are all treated alike, and this primitive stays free of a
 * framework import.
 */
function isLinkElement(
  render: ButtonPrimitive.Props["render"]
): render is ReactElement<LinkLikeProps> {
  return (
    isValidElement<LinkLikeProps>(render) && render.props.href !== undefined
  );
}

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
  const classes = cn(buttonVariants({ variant, size, className }));

  /**
   * A LINK IS STYLED, NOT WRAPPED.
   *
   * Base UI applies `role="button"` and `tabindex="0"` whenever `nativeButton` is false. That is
   * right for a `<div>` or a `<label>` being taught to behave like a button, and wrong for an
   * `<a href>`, which is not behaving like anything - it navigates. Left to the primitive it
   * produced `<a role="button" tabindex="0" href="/listings?page=2">`, so every link styled as a
   * button in this codebase - 42 modules of them - announced as a button. `Pagination`'s promise
   * of being "shareable and linkable" was invisible to exactly the people who most need telling
   * that a control leaves the page.
   *
   * PASSING `role` TO THE PRIMITIVE DOES NOT WORK; it computes its own and wins. So links skip it
   * entirely and take the classes directly. Nothing is lost: an `<a href>` already activates on
   * Enter natively, and it should NOT activate on Space - which is the behaviour the primitive was
   * adding.
   *
   * Fixed here rather than at 42 call sites because there is one right answer for every link, and
   * a rule applied once cannot be forgotten by the forty-third.
   */
  if (isLinkElement(props.render)) {
    const { render, children, disabled, ...rest } = props;

    const linkProps: Record<string, unknown> = {
      "data-slot": "button",
      ...rest,
      className: cn(classes, render.props.className),
      children: children ?? render.props.children,
    };

    /**
     * `type` belongs to buttons. On an anchor it means something else entirely - a hint about the
     * MIME type of what is being linked - so it is dropped rather than passed through.
     */
    delete linkProps["type"];

    /**
     * THREE CALL SITES PASS `disabled` TO A LINK, and an anchor has no such attribute.
     *
     * The primitive used to absorb that; skipping it means handling the case here or silently
     * turning an inert control live while something is saving. `aria-disabled` announces it and,
     * via the variants above, removes pointer events - but a keyboard Enter still fires a click on
     * a link, so navigation is refused explicitly too. The href stays, so the control keeps its
     * place in the tab order and can still say what it is.
     */
    if (disabled === true) {
      linkProps["aria-disabled"] = true;
      linkProps["onClick"] = (event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
      };
    }

    return cloneElement(render, linkProps);
  }

  return (
    <ButtonPrimitive
      data-slot="button"
      // `??` rather than a default parameter: an explicitly passed `false` must survive,
      // and under `exactOptionalPropertyTypes` an explicit `undefined` is not assignable.
      nativeButton={nativeButton ?? rendersNativeButton(props.render)}
      className={classes}
      {...props}
    />
  );
}

export { Button, buttonVariants };
