-- A payment can only be attached to a booking whose terms it matches.
--
-- THE RACE THIS CLOSES. `selectPaymentMethod` copies the booking's rent and deposit into the new
-- payment row from a read taken before its transaction. Chat made those terms renegotiable while a
-- booking is APPROVED, so an offer accepted between that read and the write would leave the payment
-- asking the renter for the old amount while the booking records the new one. The action now
-- re-checks inside its transaction; this makes the database refuse the mismatch regardless.
--
-- Replaces the function from 20261006120000_chat_and_offers. Everything it did before is unchanged;
-- the payment check is added ahead of the early return, because attaching a payment changes no
-- term and would otherwise skip it.

CREATE OR REPLACE FUNCTION "bookings_terms_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  terms_changed boolean := false;
  agreed record;
  attached record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    terms_changed :=
         NEW."totalPrice"      IS DISTINCT FROM OLD."totalPrice"
      OR NEW."securityDeposit" IS DISTINCT FROM OLD."securityDeposit"
      OR NEW."startDate"       IS DISTINCT FROM OLD."startDate"
      OR NEW."endDate"         IS DISTINCT FROM OLD."endDate"
      OR NEW."listingId"       IS DISTINCT FROM OLD."listingId"
      OR NEW."renterId"        IS DISTINCT FROM OLD."renterId"
      OR NEW."ownerId"         IS DISTINCT FROM OLD."ownerId"
      OR NEW."agreedOfferId"   IS DISTINCT FROM OLD."agreedOfferId";

    IF OLD."paymentId" IS NOT NULL AND (
         terms_changed OR NEW."paymentId" IS DISTINCT FROM OLD."paymentId") THEN
      RAISE EXCEPTION 'TERMS_LOCKED: booking % has a payment; its terms are final', OLD."id"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD."agreedOfferId" IS NOT NULL AND NEW."agreedOfferId" IS NULL THEN
      RAISE EXCEPTION 'TERMS_LOCKED: booking % cannot drop its agreed offer', OLD."id"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF terms_changed AND NEW."agreedOfferId" IS NOT DISTINCT FROM OLD."agreedOfferId" THEN
      RAISE EXCEPTION 'TERMS_LOCKED: the terms of booking % change only through an accepted offer', OLD."id"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  -- New: the payment being attached must carry this booking's rent and deposit.
  IF NEW."paymentId" IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD."paymentId" IS NULL) THEN
    SELECT p."amount", p."securityDeposit" INTO attached
      FROM "payments" p
     WHERE p."id" = NEW."paymentId";

    IF FOUND AND (attached."amount" <> NEW."totalPrice"
               OR attached."securityDeposit" <> NEW."securityDeposit") THEN
      RAISE EXCEPTION 'TERMS_LOCKED: payment % does not match the terms of booking %', NEW."paymentId", NEW."id"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT terms_changed THEN
    RETURN NEW;
  END IF;

  IF NEW."agreedOfferId" IS NOT NULL THEN
    SELECT o."status", o."bookingId", o."startDate", o."endDate", o."totalPrice",
           o."securityDeposit", c."listingId", c."renterId", c."ownerId"
      INTO agreed
      FROM "offers" o
      JOIN "conversations" c ON c."id" = o."conversationId"
     WHERE o."id" = NEW."agreedOfferId";

    IF NOT FOUND OR agreed."status" <> 'ACCEPTED' THEN
      RAISE EXCEPTION 'TERMS_LOCKED: offer % is not an accepted offer', NEW."agreedOfferId"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF agreed."listingId" <> NEW."listingId"
    OR agreed."renterId"  <> NEW."renterId"
    OR agreed."ownerId"   <> NEW."ownerId"
    OR (agreed."bookingId" IS NOT NULL AND agreed."bookingId" <> NEW."id") THEN
      RAISE EXCEPTION 'TERMS_LOCKED: offer % belongs to a different rental', NEW."agreedOfferId"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF agreed."totalPrice"      <> NEW."totalPrice"
    OR agreed."securityDeposit" <> NEW."securityDeposit"
    OR agreed."startDate"       <> NEW."startDate"
    OR agreed."endDate"         <> NEW."endDate" THEN
      RAISE EXCEPTION 'TERMS_LOCKED: booking % does not carry the terms of offer %', NEW."id", NEW."agreedOfferId"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
