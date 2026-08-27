import { FlagIcon, HistoryIcon, PackageIcon } from "lucide-react";
import Link from "next/link";

import { ADMIN_ACTION_LABELS } from "@/lib/admin/rules";
import { formatDate } from "@/lib/utils/date";

import type { AdminActionEntry } from "@/lib/queries/admin-users";

interface AdminActionLogProps {
  history: AdminActionEntry[];
  /**
   * What to say when there is nothing recorded.
   *
   * A prop because the same log now renders on two screens whose subject differs - an account and a
   * listing - and "no administrator has acted on this account" is simply false on the second one.
   */
  emptyMessage?: string;
}

/**
 * Everything staff have done to one account.
 *
 * A Server Component: this is a record, with nothing to interact with, and nothing here is ever
 * editable. The log is append-only by design - a history its author can revise is not a history, and
 * the moment it would matter is exactly the moment somebody would want to revise it.
 *
 * SHOWS THE TRANSITION, NOT JUST THE VERB. "Suspended" alone leaves an administrator working out
 * what the account was before; "ACTIVE to SUSPENDED" is the fact. It matters most on role changes,
 * where the direction is the whole content of the entry.
 *
 * A NULL ACTOR IS RENDERED AS THE BOOTSTRAP, not as "unknown". Exactly one thing writes one -
 * `scripts/grant-admin.ts`, because no administrator existed to attribute the first grant to - and
 * calling that "unknown" would suggest a record had been lost.
 */
function AdminActionLog({
  history,
  emptyMessage = "No administrator has acted on this account.",
}: AdminActionLogProps) {
  if (history.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {history.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-sm"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <HistoryIcon
              className="text-muted-foreground size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span className="font-medium">
              {ADMIN_ACTION_LABELS[entry.type]}
            </span>

            {/*
              The transition, inline - but only when it is a pair of short values, which is what a
              status or role change is. An EDIT_LISTING entry carries the whole previous title and
              description, and rendering that inline turned this row into a wall of somebody else's
              listing copy. Long values move into the collapsed block below instead.
            */}
            {entry.previousValue &&
              entry.newValue &&
              !isLongTransition(entry) && (
                <span className="text-muted-foreground text-xs">
                  {entry.previousValue} → {entry.newValue}
                </span>
              )}

            <span className="text-muted-foreground text-xs">
              {formatDate(entry.createdAt)}
            </span>

            <span className="text-muted-foreground text-xs">
              by {entry.actor?.name?.trim() ?? "the bootstrap script"}
            </span>

            {/*
              The report this answered. Links back to the queue, so a suspension and the complaint
              that caused it can be read together rather than as two unrelated records.
            */}
            {entry.reportId && (
              <Link
                href="/admin/reports?status=resolved"
                className="text-primary flex items-center gap-1 text-xs underline-offset-4 hover:underline"
              >
                <FlagIcon className="size-3" aria-hidden="true" />
                from a report
              </Link>
            )}

            {/*
              The listing this was about. The audit subject is the OWNER, so on an account's history
              this entry would otherwise read "Listing removed" with no way to find out which one.
            */}
            {entry.listingId && (
              <Link
                href={`/admin/listings/${entry.listingId}`}
                className="text-primary flex items-center gap-1 text-xs underline-offset-4 hover:underline"
              >
                <PackageIcon className="size-3" aria-hidden="true" />
                the listing
              </Link>
            )}
          </div>

          {/* A string, never HTML - an administrator typed it. */}
          <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
            {entry.reason}
          </p>

          {/*
            The before and after in full, collapsed. Only reached for a long transition - in practice
            an edit to a listing's copy, where this row is the ONLY remaining record of what the owner
            originally wrote. Collapsed rather than omitted: it has to be readable, and it must not
            bury the twenty other entries around it.
          */}
          {entry.previousValue && entry.newValue && isLongTransition(entry) && (
            <details className="text-xs">
              <summary className="text-muted-foreground cursor-pointer">
                What changed
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                <div>
                  <p className="font-medium">Before</p>
                  <p className="text-muted-foreground whitespace-pre-line">
                    {entry.previousValue}
                  </p>
                </div>
                <div>
                  <p className="font-medium">After</p>
                  <p className="text-muted-foreground whitespace-pre-line">
                    {entry.newValue}
                  </p>
                </div>
              </div>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Whether this entry's before/after is too big to sit on one line.
 *
 * A status or role change is a single enum name; an edit to a listing's copy is a title plus up to
 * 5,000 characters of description. Decided by shape rather than by action type, so a future action
 * recording something long is handled without a second list to keep in step.
 */
function isLongTransition(entry: AdminActionEntry): boolean {
  const longest = Math.max(
    entry.previousValue?.length ?? 0,
    entry.newValue?.length ?? 0
  );

  const multiline = (value: string | null): boolean =>
    value !== null && /[\r\n]/.test(value);

  return (
    longest > 60 || multiline(entry.previousValue) || multiline(entry.newValue)
  );
}

export { AdminActionLog };
