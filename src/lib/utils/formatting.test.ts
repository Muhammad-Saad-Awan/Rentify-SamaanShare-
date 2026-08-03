import { describe, expect, it } from "vitest";

import {
  buildMatchSnippet,
  splitHighlightSegments,
} from "@/lib/utils/highlight";
import { formatPKR, formatPKRPerDay } from "@/lib/utils/currency";
import { formatDate, todayInKarachi } from "@/lib/utils/date";
import { CONDITION_LABELS, formatCity } from "@/lib/utils/listing";
import { parsePageParam } from "@/lib/utils/pagination";

/**
 * Display helpers.
 *
 * Grouped into one file because each is small; the invariants that matter are that the
 * highlighter never breaks on a term containing regex metacharacters, and that dates are
 * pinned to Asia/Karachi rather than the machine running the code.
 */

describe("splitHighlightSegments", () => {
  it("returns one unmatched run when there is no term", () => {
    expect(splitHighlightSegments("Canon camera", null)).toEqual([
      { text: "Canon camera", isMatch: false },
    ]);
  });

  it("matches case-insensitively but preserves the original casing", () => {
    // Highlighting "Camera" for a search of "camera" must not rewrite the title.
    const segments = splitHighlightSegments("Canon Camera", "camera");

    expect(segments).toEqual([
      { text: "Canon ", isMatch: false },
      { text: "Camera", isMatch: true },
    ]);
  });

  it("marks every occurrence", () => {
    const segments = splitHighlightSegments("a b a b a", "a");

    expect(segments.filter((s) => s.isMatch)).toHaveLength(3);
  });

  it("treats regex metacharacters literally", () => {
    // The term comes from ?q=, so a regex-based implementation would either throw here or
    // match something other than what was typed. This is the case that forced indexOf.
    for (const term of ["(", "[a-z]", "*", "\\", ".", "$", "+?"]) {
      expect(() => splitHighlightSegments("plain text", term)).not.toThrow();
      expect(splitHighlightSegments("plain text", term)).toEqual([
        { text: "plain text", isMatch: false },
      ]);
    }

    // And a literal bracket in the text IS found.
    expect(
      splitHighlightSegments("size [a-z] chart", "[a-z]").some((s) => s.isMatch)
    ).toBe(true);
  });

  it("does not loop forever on an empty term", () => {
    expect(splitHighlightSegments("text", "")).toEqual([
      { text: "text", isMatch: false },
    ]);
  });
});

describe("buildMatchSnippet", () => {
  it("returns null when there is no term or no match", () => {
    expect(buildMatchSnippet("some description", null)).toBeNull();
    expect(buildMatchSnippet("some description", "absent")).toBeNull();
  });

  it("quotes around the match and marks where text was trimmed", () => {
    const long = `${"x".repeat(300)} FairyMeadows ${"y".repeat(300)}`;
    const snippet = buildMatchSnippet(long, "fairymeadows");

    expect(snippet).toContain("FairyMeadows");
    expect(snippet?.startsWith("…")).toBe(true);
    expect(snippet?.endsWith("…")).toBe(true);
    expect(snippet?.length).toBeLessThan(200);
  });

  it("adds no ellipsis to a short description that fits whole", () => {
    const snippet = buildMatchSnippet("A camera for rent", "camera");

    expect(snippet).toBe("A camera for rent");
  });
});

describe("formatPKR", () => {
  it("prefixes the symbol and groups the digits", () => {
    expect(formatPKR(1500)).toBe("Rs. 1,500");
    expect(formatPKR(0)).toBe("Rs. 0");
    expect(formatPKRPerDay(6500)).toBe("Rs. 6,500 / day");
  });

  it("uses Western grouping, not lakhs", () => {
    // Documented explicitly because a comment here once claimed the opposite. Changing this
    // would shift every price on the site, so it is pinned by a test.
    expect(formatPKR(1_500_000)).toBe("Rs. 1,500,000");
  });
});

describe("formatDate and todayInKarachi", () => {
  it("formats a calendar day without shifting it", () => {
    // Hyphens, not spaces: `en-PK` renders a short-month date as `03-Aug-2026`. Pinned here
    // because it is surprising - LOCALE_CONFIG.dateFormat documents "dd MMM yyyy", which
    // reads like spaces - and because changing the separator would move every date on the
    // site, so it should be a deliberate decision rather than a drift.
    expect(formatDate(new Date("2026-08-03T00:00:00.000Z"))).toBe(
      "03-Aug-2026"
    );
  });

  it("returns today in Asia/Karachi as a sortable ISO day", () => {
    // The market's today, not the server's: on a UTC host, 00:30 in Karachi is still
    // yesterday by UTC, which would let a past day be blocked.
    expect(todayInKarachi()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("resolves the Karachi day ahead of UTC late in the UTC evening", () => {
    // Karachi is UTC+5, so 21:00 UTC is already the next calendar day there. This is the
    // boundary the availability rules depend on.
    const karachiDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date("2026-08-03T21:00:00.000Z"));

    expect(karachiDay).toBe("2026-08-04");
  });
});

describe("formatCity", () => {
  it("maps a known slug to its label", () => {
    expect(formatCity("karachi")).toBe("Karachi");
  });

  it("title-cases an unknown slug rather than dropping it", () => {
    // A city added to the database ahead of the config should still render readably.
    expect(formatCity("dera-ismail-khan")).toBe("Dera Ismail Khan");
  });
});

describe("CONDITION_LABELS", () => {
  it("covers every enum member", () => {
    expect(CONDITION_LABELS).toEqual({
      NEW: "New",
      LIKE_NEW: "Like New",
      GOOD: "Good",
      FAIR: "Fair",
    });
  });
});

describe("parsePageParam", () => {
  it("clamps anything unusable to page 1", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-4")).toBe(1);
    expect(parsePageParam("3")).toBe(3);
    expect(parsePageParam(["2", "9"])).toBe(2);
  });
});
