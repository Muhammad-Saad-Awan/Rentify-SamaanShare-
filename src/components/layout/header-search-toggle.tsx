"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { HeaderSearch } from "@/components/layout/header-search";
import { Button } from "@/components/ui/button";

/**
 * The header's search icon, which opens the site-wide search beneath the header.
 *
 * The reference design shows an icon rather than a field, but the field it replaces did real
 * work - it searches from any page while keeping the browse filters already applied - so the
 * icon reveals that same `HeaderSearch` instead of dropping it.
 *
 * Closes on Escape and after any navigation, so a submitted search does not leave the panel
 * hanging open over the results.
 */
function HeaderSearchToggle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUrl = `${pathname}?${searchParams.toString()}`;

  /**
   * The URL the panel was opened on, rather than a boolean. Navigating changes the URL, which
   * closes the panel by derivation - no effect resetting state after the fact.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const isOpen = openedAt === currentUrl;

  function setIsOpen(next: boolean | ((open: boolean) => boolean)) {
    const value = typeof next === "function" ? next(isOpen) : next;
    setOpenedAt(value ? currentUrl : null);
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenedAt(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-expanded={isOpen}
        aria-controls="site-search-panel"
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? <XIcon /> : <SearchIcon className="size-[1.15rem]" />}
        <span className="sr-only">
          {isOpen ? "Close search" : "Search listings"}
        </span>
      </Button>

      {isOpen && (
        <div
          id="site-search-panel"
          className="bg-background/95 absolute inset-x-0 top-full border-b backdrop-blur-sm"
        >
          <div className="mx-auto w-full max-w-2xl px-4 py-4">
            <HeaderSearch autoFocus />
          </div>
        </div>
      )}
    </>
  );
}

export { HeaderSearchToggle };
