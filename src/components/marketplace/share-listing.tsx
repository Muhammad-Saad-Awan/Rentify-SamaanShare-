import { MessageCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { formatPKRPerDay } from "@/lib/utils/currency";

interface ShareListingProps {
  listingId: string;
  title: string;
  pricePerDay: number;
}

/**
 * Share to WhatsApp.
 *
 * WhatsApp first because it is where this audience actually shares links; the
 * `wa.me` scheme opens the app on mobile and WhatsApp Web on desktop, so one URL
 * covers both.
 *
 * A plain `<a>`, which means no JavaScript and no client component: the entire
 * message is known at render time. `navigator.share` would be the richer option on
 * mobile, but it needs a client bundle and a fallback for every desktop browser
 * that lacks it - not worth it for a link that already works everywhere.
 *
 * `target="_blank"` carries `rel="noopener noreferrer"`: without `noopener` the
 * opened tab can reach back through `window.opener` and navigate this page.
 */
function ShareListing({ listingId, title, pricePerDay }: ShareListingProps) {
  const url = new URL(`/listings/${listingId}`, siteConfig.url).toString();

  // The price is included because a shared link is usually answering "how much?".
  // encodeURIComponent, not a template alone - a title with & or # would otherwise
  // truncate the message at that character.
  const message = encodeURIComponent(
    `${title} - ${formatPKRPerDay(pricePerDay)} on ${siteConfig.name}\n${url}`
  );

  return (
    <Button
      variant="outline"
      size="sm"
      render={
        <a
          href={`https://wa.me/?text=${message}`}
          target="_blank"
          rel="noopener noreferrer"
        />
      }
    >
      <MessageCircleIcon />
      Share on WhatsApp
    </Button>
  );
}

export { ShareListing };
