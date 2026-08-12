import { siteConfig } from "@/config/site";

/**
 * JSON-LD builders for the public marketplace.
 *
 * Kept as plain object factories rather than inline JSX so the shapes are
 * reviewable in one place and reusable across routes. Absolute URLs throughout -
 * a relative `url` in structured data is not resolved by crawlers the way an
 * `href` is, so a path alone would describe a page that does not exist.
 */

function absoluteUrl(path: string): string {
  return new URL(path, siteConfig.url).toString();
}

/**
 * Site identity plus the search action.
 *
 * `SearchAction` is what lets a search engine offer a search box for the site
 * directly in its results. The target has to be a real, GET-addressable search
 * URL - which `/listings?q=` is, precisely because browse state lives in the
 * query string rather than in client state.
 */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    inLanguage: "en-PK",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: absoluteUrl("/listings?q={search_term_string}"),
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    email: siteConfig.supportEmail,
    areaServed: {
      "@type": "Country",
      name: "Pakistan",
    },
  };
}

interface ListingJsonLdInput {
  id: string;
  title: string;
  description: string;
  pricePerDay: number;
  imageUrls: readonly string[];
  category: { name: string; slug: string };
  ownerName: string;
}

/**
 * A listing as a `Product` with a rental offer.
 *
 * `Product` rather than `Offer` alone, because that is what search engines render a
 * rich result from - price, availability and image all hang off it.
 *
 * The price is the *daily* rate, and `priceCurrency` is PKR. There is no schema.org
 * vocabulary for "per day" on a plain Offer, so the unit lives in the name and
 * description instead; quoting the daily figure is still the honest choice, since
 * it is the number the page leads with.
 *
 * `availability: InStock` reflects that only ACTIVE, non-deleted listings ever reach
 * this function - a paused listing 404s before any metadata is built.
 */
export function listingJsonLd(listing: ListingJsonLdInput) {
  const url = absoluteUrl(`/listings/${listing.id}`);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: listing.title,
        description: listing.description,
        url,
        category: listing.category.name,
        // Absolute URLs only: these are Cloudinary links already, so they pass
        // through unchanged rather than being resolved against the site.
        image: [...listing.imageUrls],
        offers: {
          "@type": "Offer",
          url,
          priceCurrency: "PKR",
          price: listing.pricePerDay,
          availability: "https://schema.org/InStock",
          // A rental, not a sale - stated so the offer is not read as transfer of
          // ownership.
          businessFunction: "https://schema.org/LeaseOut",
          seller: { "@type": "Person", name: listing.ownerName },
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Browse Listings",
            item: absoluteUrl("/listings"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: listing.category.name,
            item: absoluteUrl(`/categories/${listing.category.slug}`),
          },
          { "@type": "ListItem", position: 3, name: listing.title, item: url },
        ],
      },
    ],
  };
}

interface CategoryJsonLdInput {
  name: string;
  slug: string;
  description: string | null;
  /** Total matching listings, not just the current page. */
  listingCount: number;
}

/**
 * A category page as a collection, with its trail.
 *
 * `BreadcrumbList` is emitted here rather than mirrored from the visible
 * breadcrumb: the category route has no visual breadcrumb, and the crawler still
 * benefits from knowing the page sits under browse.
 *
 * The item count describes the whole collection, so it must be the total rather
 * than the twelve rendered on the current page - otherwise every category would
 * claim to hold exactly one page of items.
 */
export function categoryJsonLd(category: CategoryJsonLdInput) {
  const url = absoluteUrl(`/categories/${category.slug}`);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: `${category.name} for rent`,
        description:
          category.description ??
          `Rent ${category.name.toLowerCase()} across Pakistan.`,
        url,
        isPartOf: {
          "@type": "WebSite",
          name: siteConfig.name,
          url: siteConfig.url,
        },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: category.listingCount,
          name: `${category.name} listings`,
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: siteConfig.url,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Browse Listings",
            item: absoluteUrl("/listings"),
          },
          {
            "@type": "ListItem",
            position: 3,
            name: category.name,
            item: url,
          },
        ],
      },
    ],
  };
}
