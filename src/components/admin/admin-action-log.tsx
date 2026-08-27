import { FlagIcon, HistoryIcon } from "lucide-react";
import Link from "next/link";

import { ADMIN_ACTION_LABELS } from "@/lib/admin/rules";
import { formatDate } from "@/lib/utils/date";

import type { AdminActionEntry } from "@/lib/queries/admin-users";

interface AdminActionLogProps {
  history: AdminActionEntry[];
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
function AdminActionLog({ history }: AdminActionLogProps) {
  if (history.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No administrator has acted on this account.
      </p>
    );
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

            {entry.previousValue && entry.newValue && (
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
          </div>

          {/* A string, never HTML - an administrator typed it. */}
          <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
            {entry.reason}
          </p>
        </li>
      ))}
    </ul>
  );
}

export { AdminActionLog };
