import { SearchIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { UserVerificationCard } from "@/components/admin/user-verification-card";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserRole, UserStatus } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/auth/session";
import { searchUsers } from "@/lib/queries/admin-users";
import { parsePageParam } from "@/lib/utils/pagination";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Members",
  description: "Identity verification.",
  robots: { index: false, follow: false },
};

interface AdminUsersPageProps {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    role?: string | string[];
    verified?: string | string[];
    page?: string | string[];
  }>;
}

/**
 * Identity verification for members.
 *
 * SCOPED TO VERIFICATION ONLY. Suspension, banning and role changes are Phase 6 user management and
 * are deliberately not here: they are the platform's most consequential controls, and attaching them
 * to a search box built for a different task is how one gets used by accident.
 *
 * SEARCH-FIRST. Nothing renders until a query is entered - see the note in `searchUsers`. A default
 * listing of every account would turn this into a browsable directory of the user base, email
 * addresses included.
 */
export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  const {
    q: rawQuery,
    page: rawPage,
    status: rawStatus,
    role: rawRole,
    verified: rawVerified,
  } = await searchParams;

  return (
    // In-page Suspense rather than a route-level loading.tsx - see the invariant in AGENTS.md.
    <Suspense
      key={`${String(rawQuery ?? "")}:${String(rawStatus ?? "")}:${String(rawRole ?? "")}:${String(rawVerified ?? "")}:${String(rawPage ?? 1)}`}
      fallback={<DashboardPageSkeleton cards={3} />}
    >
      <MemberSearch
        rawQuery={rawQuery}
        rawPage={rawPage}
        rawStatus={rawStatus}
        rawRole={rawRole}
        rawVerified={rawVerified}
      />
    </Suspense>
  );
}

interface MemberSearchProps {
  rawQuery: string | string[] | undefined;
  rawPage: string | string[] | undefined;
  rawStatus: string | string[] | undefined;
  rawRole: string | string[] | undefined;
  rawVerified: string | string[] | undefined;
}

async function MemberSearch({
  rawQuery,
  rawPage,
  rawStatus,
  rawRole,
  rawVerified,
}: MemberSearchProps) {
  const admin = await requireAdmin();

  const query =
    (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery)?.trim() ?? "";

  const status = parseEnumParam(rawStatus, UserStatus);
  const role = parseEnumParam(rawRole, UserRole);
  const verified = parseBoolParam(rawVerified);

  const { items, total, page, totalPages } = await searchUsers({
    query,
    ...(status ? { status } : {}),
    ...(role ? { role } : {}),
    ...(verified !== undefined ? { verified } : {}),
    page: parsePageParam(rawPage),
  });

  /**
   * The filters, as links carrying the current query.
   *
   * Links rather than a client-side control, matching the reports and claims queues: a filtered view
   * stays shareable and survives the back button, which for a moderation screen means one
   * administrator can hand a view to another.
   */
  const filterHref = (patch: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();

    if (query) next.set("q", query);
    if (status) next.set("status", status.toLowerCase());
    if (role) next.set("role", role.toLowerCase());
    if (verified !== undefined) next.set("verified", String(verified));

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }

    // Page is deliberately dropped: changing a filter changes the result set, and staying on page
    // four of a different list is how someone concludes the filter returned nothing.
    next.delete("page");

    const qs = next.toString();

    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  const anyFilter =
    status !== undefined || role !== undefined || verified !== undefined;

  return (
    <>
      <PageHeader
        title="Members"
        description="Find a member to verify, suspend, ban or change the role of. Open one to act on it."
      />

      {/*
        A plain GET form, not a client-side filter. The query lands in the URL, so a search is
        shareable and survives the back button - the same reasoning as the listings sort control.
      */}
      <form action="/admin/users" className="flex flex-wrap gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by name or email"
          aria-label="Search members by name or email"
          className="max-w-xs"
        />
        <Button type="submit" size="sm">
          <SearchIcon aria-hidden="true" />
          Search
        </Button>
      </form>

      {/*
        Filters. A listing is allowed when one is applied even with no search term - see the note in
        `searchUsers`. "Show me the suspended accounts" is an operational question with a bounded
        answer; "show me everyone" is a dossier, and that is what the search-first rule refuses.
      */}
      <nav aria-label="Filter members" className="flex flex-wrap gap-2">
        <FilterLink
          href={filterHref({
            status: undefined,
            role: undefined,
            verified: undefined,
          })}
          active={!anyFilter}
        >
          All
        </FilterLink>
        <FilterLink
          href={filterHref({ status: "suspended" })}
          active={status === UserStatus.SUSPENDED}
        >
          Suspended
        </FilterLink>
        <FilterLink
          href={filterHref({ status: "banned" })}
          active={status === UserStatus.BANNED}
        >
          Banned
        </FilterLink>
        <FilterLink
          href={filterHref({ role: "admin" })}
          active={role === UserRole.ADMIN}
        >
          Administrators
        </FilterLink>
        <FilterLink
          href={filterHref({ verified: "true" })}
          active={verified === true}
        >
          Verified
        </FilterLink>
        <FilterLink
          href={filterHref({ verified: "false" })}
          active={verified === false}
        >
          Unverified
        </FilterLink>
      </nav>

      {items.length > 0 && (
        <ul className="flex flex-col gap-4">
          {items.map((user) => (
            <li key={user.id}>
              <UserVerificationCard user={user} adminId={admin.id} />
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && (
        <EmptyState
          icon={UsersIcon}
          title={
            query.length === 0
              ? "Search for a member"
              : total === 0
                ? "No members match that"
                : "No members on this page"
          }
          description={
            query.length === 0
              ? "Enter a name or an email address. Nothing is listed until you search, so this screen is not a directory of everyone on the platform."
              : total === 0
                ? "Try a fragment of the name as it was given to you, or part of the email domain."
                : `There ${totalPages === 1 ? "is only 1 page" : `are only ${totalPages} pages`} of results.`
          }
          {...(total > 0 && items.length === 0
            ? {
                action: (
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <Link
                        href={`/admin/users?q=${encodeURIComponent(query)}`}
                      />
                    }
                  >
                    Back to first page
                  </Button>
                ),
              }
            : {})}
        />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={(target) =>
          target > 1
            ? `/admin/users?q=${encodeURIComponent(query)}&page=${target}`
            : `/admin/users?q=${encodeURIComponent(query)}`
        }
      />
    </>
  );
}

/** One filter as a link, so every view stays shareable and survives the back button. */
function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant={active ? "default" : "outline"}
      render={<Link href={href} />}
      {...(active ? { "aria-current": "page" as const } : {})}
    >
      {children}
    </Button>
  );
}

/**
 * One enum value from a query parameter, or `undefined`.
 *
 * Falls back rather than 404s on an unrecognised value: these are filters on a list, not
 * identifiers, and a mistyped one should show the unfiltered view rather than an error page.
 */
function parseEnumParam<T extends Record<string, string>>(
  raw: string | string[] | undefined,
  values: T
): T[keyof T] | undefined {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.toUpperCase();

  return value && value in values ? (values[value] as T[keyof T]) : undefined;
}

/** `verified=true` / `verified=false`. Anything else means "do not filter on it". */
function parseBoolParam(
  raw: string | string[] | undefined
): boolean | undefined {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.toLowerCase();

  if (value === "true") return true;
  if (value === "false") return false;

  return undefined;
}
