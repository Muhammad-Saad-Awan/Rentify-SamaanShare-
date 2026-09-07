-- Phase 2.2: member preferences.
--
-- `defaultCity` chooses which URL a bare `/listings` redirects to, not which listings a
-- query returns - browse state stays entirely in the query string, which is what keeps a
-- browse URL shareable. Nullable, because "no preference" is the default and is different
-- from any particular city.
--
-- The two notify flags cover the ONLY advisory notifications this app sends: the nudge to
-- write a review, and the notice that one went public. Every other type describes a
-- booking, payment or deposit-claim change and is written inside the transaction that
-- makes that change, so that a member cannot fail to hear about it - those are guarantees,
-- not preferences, and there is deliberately no column to switch them off.
--
-- DEFAULT true on both: an existing member has not opted out of anything, and a migration
-- that silently muted notifications for the whole userbase would be indistinguishable from
-- the notification system breaking.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "defaultCity" TEXT,
ADD COLUMN     "notifyReviewPublished" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyReviewReminders" BOOLEAN NOT NULL DEFAULT true;
