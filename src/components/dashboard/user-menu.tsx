"use client";

import { LogOutIcon, SettingsIcon, UserIcon } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserRole } from "@/generated/prisma/enums";
import { getDisplayName, getInitials } from "@/lib/utils/user";

import type { Session } from "next-auth";

interface UserMenuProps {
  user: Session["user"];
}

/**
 * Avatar trigger with the account menu, anchored to the right of the header.
 *
 * Hosts sign-out, which is why this is a Client Component: `signOut()` from
 * `next-auth/react` must clear the cookie from the browser and notify every
 * mounted `useSession`. `redirectTo` - not the deprecated `callbackUrl` - sends
 * the user to the public home page afterwards rather than to `/login`, so
 * signing out does not look like being locked out.
 */
function UserMenu({ user }: UserMenuProps) {
  const displayName = getDisplayName(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" className="rounded-full" />
        }
      >
        <Avatar size="sm">
          {user.image && <AvatarImage src={user.image} alt="" />}
          <AvatarFallback>{getInitials(user)}</AvatarFallback>
        </Avatar>
        <span className="sr-only">Open account menu</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <div className="flex flex-col gap-1 px-1.5 py-1.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{displayName}</span>
            {user.role === UserRole.ADMIN && (
              <Badge variant="secondary" className="shrink-0">
                Admin
              </Badge>
            )}
          </div>
          {user.email && (
            <span className="text-muted-foreground truncate text-xs">
              {user.email}
            </span>
          )}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem render={<Link href="/profile" />}>
          <UserIcon />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings" />}>
          <SettingsIcon />
          Settings
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          onClick={() => signOut({ redirectTo: "/" })}
        >
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { UserMenu };
