"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";
import { isNavItemActive, visibleNavSections } from "@/lib/utils/navigation";

import type { UserRole } from "@/generated/prisma/enums";

interface DashboardNavProps {
  role: UserRole;
  /**
   * Called after a link is activated. The mobile drawer passes a closer here;
   * the desktop sidebar omits it entirely.
   */
  onNavigate?: () => void;
}

/**
 * The section list rendered inside both the desktop sidebar and the mobile
 * drawer.
 *
 * A Client Component only because active state needs `usePathname()`. Keeping
 * the nav itself client-side and the surrounding shell on the server means a
 * section change re-renders this list without a round trip, while the layout
 * above it stays static.
 */
function DashboardNav({ role, onNavigate }: DashboardNavProps) {
  const pathname = usePathname();
  const sections = visibleNavSections(role);

  return (
    <nav
      aria-label="Dashboard"
      className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4"
    >
      {sections.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          <h2 className="text-muted-foreground px-2 text-xs font-medium tracking-wide uppercase">
            {section.title}
          </h2>

          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const isActive = isNavItemActive(pathname, item);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    // Spread rather than `onClick={onNavigate}`: under
                    // `exactOptionalPropertyTypes` an explicit `undefined` is not
                    // assignable to Link's non-optional handler type.
                    {...(onNavigate ? { onClick: onNavigate } : {})}
                    // Communicates the active section to assistive tech, which
                    // cannot infer it from the background colour alone.
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "focus-visible:ring-sidebar-ring flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export { DashboardNav };
