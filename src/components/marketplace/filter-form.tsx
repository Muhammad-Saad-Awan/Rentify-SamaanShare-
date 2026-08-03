"use client";

import { useRouter } from "next/navigation";

import type { FormEvent, ReactNode } from "react";

interface FilterFormProps {
  children: ReactNode;
  className?: string;
  /** `"search"` on the keyword form, so it becomes a search landmark. */
  role?: "search";
  /** Id of the heading naming this form. */
  ariaLabelledBy?: string;
}

/**
 * A GET form that upgrades itself to a client-side navigation.
 *
 * The baseline is a real `<form action="/listings" method="get">`: with
 * JavaScript disabled or still loading, the browser submits it natively and
 * browse filtering works. Nothing here is required for the feature to function.
 *
 * With JavaScript, two things about the native submit are worth improving:
 *
 * 1. It is a full document navigation, so the shell, header and footer are
 *    re-rendered and re-downloaded on every filter change. `router.push` makes
 *    it a soft navigation that swaps only what changed.
 * 2. It submits *every* field, including the empty ones, producing
 *    `?category=&city=&minPrice=` after any Apply. The parser ignores empty
 *    values so the page is correct either way, but the URL is not the canonical
 *    one the serializer would produce - which matters for sharing and caching.
 *    Skipping blanks here keeps the enhanced path's URLs clean.
 *
 * `page` is absent by construction: no control emits it, so every submit lands
 * on page 1.
 */
function FilterForm({
  children,
  className,
  role,
  ariaLabelledBy,
}: FilterFormProps) {
  const router = useRouter();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const search = new URLSearchParams();

    for (const [name, value] of new FormData(event.currentTarget).entries()) {
      // FormData yields File for file inputs; this form has none, but the type
      // is a union and narrowing it is cheaper than asserting.
      if (typeof value !== "string") {
        continue;
      }

      const trimmed = value.trim();

      if (trimmed === "") {
        continue;
      }

      search.append(name, trimmed);
    }

    const query = search.toString();

    router.push(query ? `/listings?${query}` : "/listings");
  }

  return (
    <form
      action="/listings"
      method="get"
      onSubmit={handleSubmit}
      role={role}
      aria-labelledby={ariaLabelledBy}
      className={className}
    >
      {children}
    </form>
  );
}

export { FilterForm };
