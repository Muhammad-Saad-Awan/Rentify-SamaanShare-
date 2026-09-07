-- Stage A2 follow-up: session invalidation on password change.
--
-- Under the JWT session strategy there is no server-side session row to delete, so a
-- stolen cookie stays valid until it expires - up to 30 days. This column is the
-- generation counter that fixes that: a token carries the value this column had when it
-- was minted, and the session helpers refuse any token whose copy has fallen behind.
-- `changePassword` and `resetPassword` increment it; both then re-authenticate the
-- member, so the person who just changed their password is not signed out along with
-- whoever else was holding a session.
--
-- DEFAULT 0 rather than nullable, so every existing row is immediately comparable and
-- tokens already in the wild - which carry no version at all - are treated as 0 and stay
-- valid. A deploy that signed the entire userbase out would be a worse bug than the one
-- being fixed.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;
