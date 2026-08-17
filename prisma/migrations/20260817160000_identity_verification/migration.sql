-- Identity verification. Trust & Safety.
--
-- Two separate claims, and the migration adds one column set for each.
--
-- `emailVerified` (already present, from the Auth.js adapter) proves control of
-- an inbox. `isVerified` is meant to mean a human checked a document against a
-- person - a far stronger claim, which is why it now records WHO decided it.
-- The trust score weights them 1.0 against 0.4 and gates its top band on the
-- second, so the two must never be set by the same code path.

-- 1. Make identity verification attributable.
--
-- `isVerified` has existed since the initial migration and nothing has ever
-- written it, so the badge on the owner card was unreachable. These two columns
-- are what let it be granted without the platform asserting something no one is
-- accountable for.
ALTER TABLE "users" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "verifiedById" TEXT;

ALTER TABLE "users"
  ADD CONSTRAINT "users_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "users_verifiedById_idx" ON "users" ("verifiedById");

-- 2. Email confirmation links.
--
-- A table of its own rather than sharing PasswordResetToken or Auth.js's
-- VerificationToken: neither has a type discriminator, so a token minted to
-- confirm an address could be redeemed to reset a password. That is a privilege
-- escalation between two credentials of very different strength.
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    -- The address the link was sent to, bound at mint time. Without it, an old
    -- link would confirm whatever address the account carries when clicked.
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- Unique, so redemption is a single indexed probe on the hash rather than a scan.
CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key"
  ON "email_verification_tokens" ("tokenHash");

CREATE INDEX "email_verification_tokens_userId_idx"
  ON "email_verification_tokens" ("userId");

CREATE INDEX "email_verification_tokens_expiresAt_idx"
  ON "email_verification_tokens" ("expiresAt");

ALTER TABLE "email_verification_tokens"
  ADD CONSTRAINT "email_verification_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
