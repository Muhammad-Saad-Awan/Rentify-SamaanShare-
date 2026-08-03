"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import type { MouseEvent, ReactNode } from "react";

interface ListingsFiltersSheetProps {
  /** The same `ListingsFilters` form the desktop sidebar renders. */
  children: ReactNode;
  /** Drives the count badge on the trigger. */
  activeCount: number;
}

/**
 * Drawer housing the filter form below `lg`.
 *
 * Takes the form as `children` rather than rendering it: the form is a Server
 * Component, and passing it in keeps it server-rendered inside this client
 * boundary instead of dragging the whole category list into the bundle.
 *
 * The trigger shows how many filters are active, which is the only feedback a
 * mobile user gets that the collapsed sidebar is doing something.
 */
function ListingsFiltersSheet({
  children,
  activeCount,
}: ListingsFiltersSheetProps) {
  const [open, setOpen] = useState(false);

  /**
   * Closes the drawer once the form inside has been submitted.
   *
   * Needed only because of the client-side enhancement: `FilterForm` calls
   * `router.push`, which is a soft navigation, so this component is never
   * unmounted and the drawer would stay open over the newly filtered results.
   * (A native submit reloads the document and would close it for free.)
   *
   * Caught on a wrapper rather than passed into the form as a callback - the form
   * is a Server Component and cannot receive a function prop. Submit events
   * bubble, and `preventDefault` inside the form does not stop propagation.
   */
  function handleSubmit() {
    setOpen(false);
  }

  /**
   * Same closing behaviour for the "Clear all" link inside the form.
   *
   * A link click is also a soft navigation, so it needs the same treatment as a
   * submit. Checking for an anchor keeps a click anywhere else in the drawer -
   * on a label, a checkbox - from dismissing it.
   */
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLElement && event.target.closest("a")) {
      setOpen(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => setOpen(nextOpen)}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" className="shrink-0 lg:hidden" />
        }
      >
        <SlidersHorizontalIcon />
        Filters
        {activeCount > 0 && (
          <Badge variant="secondary" className="ml-0.5">
            {activeCount}
          </Badge>
        )}
      </SheetTrigger>

      <SheetContent side="left" className="w-80 gap-0 overflow-y-auto">
        <SheetHeader className="h-14 shrink-0 justify-center border-b p-0 px-4">
          {/*
            The form renders its own visible "Filters" heading, so the dialog's
            accessible name is supplied here and hidden to avoid announcing the
            word twice.
          */}
          <SheetTitle className="sr-only">Filter listings</SheetTitle>
          <span className="font-heading text-sm font-semibold">Filters</span>
        </SheetHeader>

        {/*
          Not a control: this wrapper only observes bubbling submit and link
          events so the drawer can close after a soft navigation. It adds no
          keyboard handler because it is not itself operable - everything inside
          it is already a button, link or field.
        */}
        <div
          className="px-4 py-4"
          onSubmit={handleSubmit}
          onClick={handleClick}
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export { ListingsFiltersSheet };
