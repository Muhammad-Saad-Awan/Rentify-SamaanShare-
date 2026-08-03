import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import {
  MAIN_CONTENT_ID,
  SkipToContent,
} from "@/components/shared/skip-to-content";

import type { ReactNode } from "react";

interface MarketplaceLayoutProps {
  children: ReactNode;
}

/**
 * Shell for the public, signed-out-friendly side of the app.
 *
 * The counterpart to `(dashboard)`: same route-group trick - the parentheses keep
 * it out of the URL - but no `requireUser()`. Nothing under here may redirect an
 * anonymous visitor, which is what makes the homepage and browse crawlable.
 *
 * The root layout already sets `flex min-h-full flex-col` on `<body>`, so
 * `flex-1` on `<main>` plus `mt-auto` on the footer is what pins the footer to
 * the bottom on a short page without resorting to a fixed position.
 */
export default function MarketplaceLayout({
  children,
}: MarketplaceLayoutProps) {
  return (
    <>
      {/* First tab stop on the page, so it must precede the header in the DOM. */}
      <SkipToContent />

      <SiteHeader />

      {/*
        `tabIndex={-1}` makes the skip link's target focusable. Following a
        fragment link moves the browser's scroll position but not keyboard focus
        unless the target can hold it, which would leave the next Tab press
        continuing from the header the user just skipped.
      */}
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <SiteFooter />
    </>
  );
}
