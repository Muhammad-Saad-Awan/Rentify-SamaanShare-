-- An append-only record of what administrators do to accounts. Phase 6.
--
-- Suspension already existed, through the moderation queue, and left the Report
-- row as its only evidence: the User row said nothing but SUSPENDED, with no
-- indication of who decided it or why. A suspension applied by hand from the
-- members screen would have left no trace at all.
--
-- WHY A LOG RATHER THAN COLUMNS ON users. `verifiedAt`/`verifiedById` record the
-- current state of one flag, which is all the trust score needs. Suspension is
-- different: "was this account ever suspended" stays a real question after a
-- reinstatement, and a column pair would have the second suspension overwrite the
-- first. One row per action keeps the history, and one shape covers suspension,
-- ban, reinstatement and role changes rather than three columns each.

CREATE TYPE "AdminActionType" AS ENUM (
  'SUSPEND_USER', 'BAN_USER', 'REINSTATE_USER', 'CHANGE_ROLE',
  'VERIFY_IDENTITY', 'WITHDRAW_VERIFICATION'
);

CREATE TABLE "admin_actions" (
    "id" TEXT NOT NULL,
    -- NULL only for the bootstrap grant: there is no administrator to attribute
    -- the first one to, and recording a fiction would be worse than the gap.
    "actorId" TEXT,
    "subjectId" TEXT NOT NULL,
    "type" "AdminActionType" NOT NULL,
    -- Required. This changes somebody's access to the platform, and a decision
    -- nobody can read the reasoning for is one nobody can review or appeal.
    "reason" TEXT NOT NULL,
    -- Plain strings, because one model covers both a UserStatus change and a
    -- UserRole change; two typed pairs would be half-null on every row.
    "previousValue" TEXT,
    "newValue" TEXT,
    -- Set when the action answered a report, which is what keeps the moderation
    -- queue and the members screen from producing different kinds of evidence.
    "reportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- The history on one account's detail screen, newest first.
CREATE INDEX "admin_actions_subjectId_createdAt_idx" ON "admin_actions" ("subjectId", "createdAt");
CREATE INDEX "admin_actions_actorId_idx" ON "admin_actions" ("actorId");
CREATE INDEX "admin_actions_reportId_idx" ON "admin_actions" ("reportId");

-- Restrict on the subject and SET NULL on the actor: this is an audit record and
-- must outlive tidying up, the same reasoning as Payment.confirmedById. Users are
-- soft-deleted in practice, so neither fires in normal operation.
ALTER TABLE "admin_actions"
  ADD CONSTRAINT "admin_actions_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "admin_actions"
  ADD CONSTRAINT "admin_actions_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "admin_actions"
  ADD CONSTRAINT "admin_actions_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "reports"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
