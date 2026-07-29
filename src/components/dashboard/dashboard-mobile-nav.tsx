"use client";

import { MenuIcon } from "lucide-react";
import { useState } from "react";

import { DashboardBrand } from "@/components/dashboard/dashboard-brand";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import type { UserRole } from "@/generated/prisma/enums";

interface DashboardMobileNavProps {
  role: UserRole;
}

/**
 * Drawer navigation for viewports below `lg`.
 *
 * Controlled rather than uncontrolled for one reason: the drawer must close when
 * a link is followed. App Router navigation does not unmount the layout, so an
 * uncontrolled Sheet would stay open over the newly rendered page. `onNavigate`
 * closes it explicitly.
 */
function DashboardMobileNav({ role }: DashboardMobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => setOpen(nextOpen)}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon-sm" className="lg:hidden" />}
      >
        <MenuIcon />
        <span className="sr-only">Open navigation menu</span>
      </SheetTrigger>

      <SheetContent side="left" className="bg-sidebar gap-0">
        <SheetHeader className="h-14 shrink-0 justify-center border-b p-0 px-4">
          {/*
            The drawer is a modal dialog and needs an accessible name. The
            wordmark below is a link, not a heading, so the name is supplied
            separately and visually hidden.
          */}
          <SheetTitle className="sr-only">Dashboard navigation</SheetTitle>
          <DashboardBrand />
        </SheetHeader>

        <DashboardNav role={role} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

export { DashboardMobileNav };
