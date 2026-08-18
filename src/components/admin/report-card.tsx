"use client";

import { AlertTriangleIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { dismissReport, resolveReport } from "@/actions/moderation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ReportAction, ReportStatus } from "@/generated/prisma/enums";
import {
  REPORT_ACTIONS_BY_TYPE,
  REPORT_ACTION_LABELS,
  REPORT_REASON_LABELS,
  RESOLUTION_NOTE_MAX,
} from "@/lib/reports/rules";
import { formatDate } from "@/lib/utils/date";

import type { ReportSummary, ReportTarget } from "@/lib/queries/reports";

interface ReportCardProps {
  report: ReportSummary;
}

/**
 * One report in the moderation queue.
 *
 * SHOWS THE TARGET, NOT JUST THE COMPLAINT. A card that says only "PROHIBITED_ITEM, listing abc123"
 * forces every decision to start in another tab, and a moderator working a queue that way ends up
 * deciding from the reason alone - which is the reporter's opinion, not evidence.
 *
 * THE ACTION LIST IS BUILT FROM THE REPORT'S TYPE. `REPORT_ACTIONS_BY_TYPE` is the same map the
 * server checks against, so the form cannot offer a choice the action will refuse. The server check
 * is still the boundary - this only keeps the two from disagreeing in front of the moderator.
 *
 * NO DEFAULT ACTION. The select opens on a deliberate "choose" placeholder rather than on `NONE`,
 * because "investigated, nothing warranted" is a real finding that is recorded permanently, and a
 * misclick should not be able to write it.
 */
function ReportCard({ report }: ReportCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [action, setAction] = useState<ReportAction | "">("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"resolve" | "dismiss" | null>(null);

  const isPending = report.status === ReportStatus.PENDING;
  const permitted = REPORT_ACTIONS_BY_TYPE[report.type];

  async function submit(kind: "resolve" | "dismiss") {
    if (kind === "resolve" && !action) {
      return;
    }

    setPending(kind);

    const payload = {
      reportId: report.id,
      ...(note.trim() ? { resolution: note.trim() } : {}),
    };

    const result =
      kind === "resolve"
        ? await resolveReport({ ...payload, action })
        : await dismissReport(payload);

    setPending(null);

    if (!result.success) {
      toast.error(result.error);

      return;
    }

    toast.success(
      kind === "resolve" ? "Report resolved." : "Report dismissed."
    );
    setIsOpen(false);
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 px-(--card-spacing)">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{report.type}</Badge>
          <span className="font-heading text-sm font-medium">
            {REPORT_REASON_LABELS[report.reason]}
          </span>

          {!isPending && (
            <Badge variant="outline">
              {report.status === ReportStatus.RESOLVED
                ? "Resolved"
                : "Dismissed"}
            </Badge>
          )}

          {/*
            The pattern signal. One complaint is a disagreement; several from several people is the
            thing a moderator is actually looking for, and it is easy to miss across pages.
          */}
          {report.otherReportsOnTarget > 0 && (
            <span className="text-destructive flex items-center gap-1 text-xs font-medium">
              <AlertTriangleIcon className="size-3.5" aria-hidden="true" />
              {report.otherReportsOnTarget} other report
              {report.otherReportsOnTarget === 1 ? "" : "s"} on this target
            </span>
          )}
        </div>

        <TargetPreview target={report.target} />

        {report.description && (
          <p className="text-muted-foreground border-muted border-l-2 pl-3 text-sm leading-relaxed">
            {report.description}
          </p>
        )}

        <p className="text-muted-foreground text-xs">
          Reported by {report.reporter.name?.trim() || "a member"} on{" "}
          {formatDate(report.createdAt)}
        </p>

        {!isPending && (
          <div className="text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 text-xs leading-relaxed">
            <p>
              {report.action && report.action !== ReportAction.NONE
                ? REPORT_ACTION_LABELS[report.action]
                : "No action taken"}
              {report.resolver?.name ? ` by ${report.resolver.name}` : ""}
              {report.resolvedAt ? ` on ${formatDate(report.resolvedAt)}` : ""}
            </p>
            {/*
              An absent note is shown as absent rather than hidden. A suspension with no reasoning
              recorded is exactly the decision someone will need to review later.
            */}
            <p className="mt-1 italic">
              {report.resolution || "No note was recorded."}
            </p>
          </div>
        )}

        {isPending && !isOpen && (
          <div>
            <Button size="sm" variant="outline" onClick={() => setIsOpen(true)}>
              Decide
            </Button>
          </div>
        )}

        {isPending && isOpen && (
          <div className="bg-muted/50 flex flex-col gap-3 rounded-lg px-3 py-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`action-${report.id}`}
                className="text-xs font-medium"
              >
                Action to take
              </label>
              <select
                id={`action-${report.id}`}
                value={action}
                onChange={(event) =>
                  setAction(event.target.value as ReportAction | "")
                }
                disabled={pending !== null}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:ring-3 disabled:opacity-50"
              >
                <option value="">Choose an action…</option>
                {permitted.map((value) => (
                  <option key={value} value={value}>
                    {REPORT_ACTION_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={RESOLUTION_NOTE_MAX}
              rows={2}
              placeholder="Optional — why this decision?"
              disabled={pending !== null}
              aria-label="Resolution note"
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => submit("resolve")}
                disabled={pending !== null || !action}
                aria-busy={pending === "resolve"}
              >
                {pending === "resolve" && (
                  <Loader2Icon className="animate-spin" />
                )}
                Resolve
              </Button>

              {/*
                Dismiss is separate from "resolve with no action", and says something different:
                the complaint did not hold, rather than it held and warranted nothing.
              */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => submit("dismiss")}
                disabled={pending !== null}
                aria-busy={pending === "dismiss"}
              >
                {pending === "dismiss" && (
                  <Loader2Icon className="animate-spin" />
                )}
                Dismiss
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                disabled={pending !== null}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/** What was reported, rendered per kind. Declared at module scope - see the note in `EditPanel`. */
function TargetPreview({ target }: { target: ReportTarget }) {
  switch (target.kind) {
    case "listing":
      return (
        <div className="text-sm">
          <Link
            href={`/listings/${target.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {target.title}
          </Link>
          <span className="text-muted-foreground">
            {" "}
            — listed by {target.ownerName?.trim() || "a member"}
          </span>
        </div>
      );

    case "user":
      return (
        <div className="text-sm">
          <span className="font-medium">
            {target.name?.trim() || "A member"}
          </span>
          <span className="text-muted-foreground">
            {" "}
            — account {target.status.toLowerCase()}
            {target.isDeleted ? ", deleted" : ""}
          </span>
        </div>
      );

    case "review":
      return (
        <div className="text-sm">
          <p className="font-medium">
            {target.rating} of 5 by {target.authorName?.trim() || "a member"}
            {target.isRemoved && (
              <span className="text-muted-foreground font-normal">
                {" "}
                — already removed
              </span>
            )}
          </p>
          {target.comment && (
            <p className="text-muted-foreground mt-1 leading-relaxed italic">
              “{target.comment}”
            </p>
          )}
        </div>
      );

    /**
     * The target is gone - deleted by its owner, or an id that never resolved.
     *
     * Shown rather than hidden. The report is still a record that someone complained, and a
     * moderator can still dismiss it; silently dropping these would leave rows in the queue that
     * appear to render nothing.
     */
    case "missing":
      return (
        <p className="text-muted-foreground text-sm italic">
          The reported item no longer exists.
        </p>
      );
  }
}

export { ReportCard };
