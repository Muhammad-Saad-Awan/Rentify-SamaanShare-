import {
  CircleAlertIcon,
  CircleCheckIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { cn } from "@/lib/utils/cn";

import type { ReactNode } from "react";

interface FormAlertProps {
  /**
   * - `error`: the submission failed - `role="alert"`, so it is announced at once.
   * - `success`: something the member did has worked - `role="status"`.
   * - `warning`: needs their action, nothing has failed - `role="status"`.
   */
  tone: "error" | "success" | "warning";
  /** Optional bold first line; the children are the explanation. */
  title?: string;
  children: ReactNode;
  className?: string;
}

const TONES = {
  error: {
    icon: CircleAlertIcon,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    role: "alert",
  },
  success: {
    icon: CircleCheckIcon,
    className: "border-success/25 bg-success-soft text-success-soft-foreground",
    role: "status",
  },
  warning: {
    icon: TriangleAlertIcon,
    className: "border-warning/40 bg-warning-soft text-warning-soft-foreground",
    role: "status",
  },
} as const;

/**
 * The inline banner used by the sign-in, account and settings forms.
 *
 * Previously each form carried its own copy of the destructive block, and the "it worked" states
 * borrowed `bg-accent/40` - the menu hover surface - which read as neutral grey. One component means
 * the three outcomes look the same on every one of those screens, and each carries an icon so the
 * tone is not conveyed by colour alone. The text colours are the soft-surface foregrounds measured
 * in `design-tokens.md` (6.85:1 and 7.28:1); amber and emerald-600 never carry text here.
 */
function FormAlert({ tone, title, children, className }: FormAlertProps) {
  const { icon: Icon, className: toneClassName, role } = TONES[tone];

  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm leading-relaxed",
        toneClassName,
        className
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-0.5">
        {title && <p className="font-medium">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export { FormAlert };
