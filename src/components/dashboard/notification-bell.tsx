"use client";

import { BellIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Notification affordance in the header. Placeholder for Phase 4.
 *
 * Renders no unread count and no dot. The `Notification` model exists in the
 * Prisma schema, but nothing writes to it yet - a badge here would either be a
 * hardcoded number that never changes or a query against an empty table. Both
 * read as broken. The trigger and the panel shell are real; only the data is
 * pending.
 */
function NotificationBell() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <BellIcon />
        <span className="sr-only">Notifications</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <p className="text-muted-foreground px-1.5 py-6 text-center text-sm">
          No notifications yet.
        </p>

        <DropdownMenuSeparator />

        <DropdownMenuItem render={<Link href="/dashboard/notifications" />}>
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { NotificationBell };
