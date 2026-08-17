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
  const { q: rawQuery, page: rawPage } = await searchParams;

  return (
    // In-page Suspense rather than a route-level loading.tsx - see the invariant in AGENTS.md.
    <Suspense
      key={`${String(rawQuery ?? "")}:${String(rawPage ?? 1)}`}
      fallback={<DashboardPageSkeleton cards={3} />}
    >
      <MemberSearch rawQuery={rawQuery} rawPage={rawPage} />
    </Suspense>
  );
}

interface MemberSearchProps {
  rawQuery: string | string[] | undefined;
  rawPage: string | string[] | undefined;
}

async function MemberSearch({ rawQuery, rawPage }: MemberSearchProps) {
  const admin = await requireAdmin();

  const query =
    (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery)?.trim() ?? "";

  const { items, total, page, totalPages } = await searchUsers({
    query,
    page: parsePageParam(rawPage),
  });

  return (
    <>
      <PageHeader
        title="Members"
        description="Find a member to grant or withdraw identity verification. Suspension and roles remain Phase 6."
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
