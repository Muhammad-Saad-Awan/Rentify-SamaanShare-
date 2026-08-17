-- Split the denormalised review aggregate by direction.
--
-- `ratingAverage` mixed both directions, so a listing page could show one number
-- above a list of owner reviews averaging something else - the figure and the
-- evidence under it disagreeing - as soon as that person had also rented.
--
-- The old columns are dropped rather than kept: they are derived data with no
-- remaining reader, and a denormalised column nothing reads is one that drifts
-- silently. Nothing is lost, since both new pairs are backfilled below from the
-- reviews themselves.

-- 1. Add the two directional pairs.
ALTER TABLE "users" ADD COLUMN "ownerRatingAverage" DOUBLE PRECISION;
ALTER TABLE "users" ADD COLUMN "ownerRatingCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "renterRatingAverage" DOUBLE PRECISION;
ALTER TABLE "users" ADD COLUMN "renterRatingCount" INTEGER NOT NULL DEFAULT 0;

-- 2. Backfill from RELEASED reviews only.
--
-- `publishedAt IS NOT NULL` is the same predicate `recomputeUserRating` uses and
-- is not an optimisation: a withheld review counted here would leak its content
-- through the aggregate, which is exactly what publication exists to prevent.
--
-- AVG() FILTER yields NULL for a direction with no reviews, which is what we
-- want stored - "not yet rated" is not "rated 0", and 0 would sort below every
-- real rating on the sort-by-rating ordering. COUNT() FILTER yields 0.
--
-- Rounded to 2 places to match `ratingAggregate` in src/lib/reviews/rules.ts;
-- unrounded this stores 4.333333333333333 and renders differently in different
-- places. Both round half away from zero, and every value here is positive.
UPDATE "users" AS u
SET "ownerRatingAverage"   = agg."ownerAverage",
    "ownerRatingCount"     = agg."ownerCount",
    "renterRatingAverage"  = agg."renterAverage",
    "renterRatingCount"    = agg."renterCount"
FROM (
  SELECT
    "revieweeId",
    ROUND(AVG("rating") FILTER (WHERE "type" = 'RENTER_TO_OWNER'), 2)::double precision AS "ownerAverage",
    COUNT(*) FILTER (WHERE "type" = 'RENTER_TO_OWNER')                                  AS "ownerCount",
    ROUND(AVG("rating") FILTER (WHERE "type" = 'OWNER_TO_RENTER'), 2)::double precision AS "renterAverage",
    COUNT(*) FILTER (WHERE "type" = 'OWNER_TO_RENTER')                                  AS "renterCount"
  FROM "reviews"
  WHERE "publishedAt" IS NOT NULL
  GROUP BY "revieweeId"
) AS agg
WHERE u."id" = agg."revieweeId";

-- 3. Drop the mixed aggregate.
ALTER TABLE "users" DROP COLUMN "ratingAverage";
ALTER TABLE "users" DROP COLUMN "ratingCount";
